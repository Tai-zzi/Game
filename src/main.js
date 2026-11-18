import './ui/style.css';
import * as THREE from 'three';
import { EventBus } from './core/EventBus.js';
import { Input, KEYMAPS } from './core/Input.js';
import { Save } from './core/Save.js';
import { Sfx } from './core/Sfx.js';
import { GameState } from './game/GameState.js';
import { ORIGINS } from './data/origins.js';
import { SKILLS } from './data/skills.js';
import { FEEL } from './data/feel.js';
import { heightAt } from './data/zones.js';
import { Renderer } from './render/Renderer.js';
import { World } from './render/World.js';
import { VFX } from './render/VFX.js';
import { EntityViews } from './render/EntityViews.js';
import { AiAssets } from './render/AiAssets.js';
import { HUD } from './ui/HUD.js';
import { Overlay } from './ui/Overlay.js';
import { Minimap } from './ui/Minimap.js';
import { Dialog } from './ui/Dialog.js';
import { ShopUI } from './ui/ShopUI.js';
import { showTitle } from './ui/Title.js';
import { WorldMap, BondsWindow } from './ui/WorldMap.js';
import { NPCS } from './data/npcs.js';

/**
 * 진입점: 계층 조립.
 *  GameState(순수 로직) ──bus 이벤트──▶ EntityViews/VFX/HUD/Overlay/Sfx (표현)
 *  Input ──command──▶ GameState   (멀티플레이 시 send 가 WebSocket 전송으로 바뀐다)
 * 타격감 연출(히트스톱·슬로모션·흔들림·섬광)은 여기서 FEEL 값으로 조립한다.
 */
const settings = Save.loadSettings();
const quality = settings.quality || 'high';
AiAssets.enabled = quality === 'high';
const renderer = new Renderer(document.getElementById('game'), { quality });
AiAssets.renderer = renderer.renderer;
const world = new World(renderer.scene);
world.loadAiProps(AiAssets);
const vfx = new VFX(renderer.scene);
const bus = new EventBus();
const clock = new THREE.Clock();
let game = null, views, hud, overlay, minimap, dialog, input, shop, worldMap, bonds;
let elapsed = 0, hitStopT = 0, slowT = 0;
const tmp = new THREE.Vector3();

function loop() {
  const realDt = Math.min(clock.getDelta(), 0.1);
  // 히트스톱(거의 정지) · 슬로모션: 시뮬레이션과 애니메이션만 느려지고 카메라는 실시간
  let scale = 1;
  if (hitStopT > 0) { hitStopT -= realDt; scale = 0.04; }
  else if (slowT > 0) { slowT -= realDt; scale = FEEL.slowMo.scale; }
  const dt = realDt * scale;
  elapsed += dt;
  world.update(elapsed, dt);
  if (game) {
    input.update(realDt);
    game.update(dt);
    views.update(dt, elapsed);
    renderer.follow(views.positionOf(game.playerId, 0, tmp), realDt);
    hud.update();
    overlay.update(realDt);
    minimap.update(realDt);
    worldMap.update();
    renderer.setTimeOfDay(game.life.hour);
    const pl = game.player();
    const sprinting = game.sprinting(pl) && pl.moving;
    renderer.setFovKick(sprinting ? FEEL.move.fovKick : 0);
    if (sprinting && Math.random() < realDt * 18) vfx.dust(views.positionOf(pl.id));
    updateWaypointArrow(pl);
  } else {
    renderer.zoomTarget = 30;
    renderer.follow(tmp.set(Math.sin(elapsed * 0.07) * 14, 0, Math.cos(elapsed * 0.07) * 14), realDt);
  }
  vfx.update(dt);
  renderer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

showTitle().then(({ profile, save }) => startGame(profile, save));

function setQuality(q) {
  renderer.setQuality(q);
  AiAssets.enabled = q === 'high';
  Save.saveSettings({ ...Save.loadSettings(), quality: q });
  hud?.toast(q === 'high' ? '그래픽: 높음 (후처리·AI 모델)' : '그래픽: 낮음 (후처리 끔·대체 모델 — 다시 시작 시 완전 적용)');
}

const arrow = document.getElementById('waypoint-arrow');
const proj = new THREE.Vector3();
/** 화면 가장자리 목적지 화살표 */
function updateWaypointArrow(p) {
  if (!p.waypoint) { arrow.classList.add('hidden'); return; }
  const d = Math.hypot(p.waypoint.x - p.pos.x, p.waypoint.z - p.pos.z);
  if (d < 3) { game.command({ type: 'setWaypoint' }); hud.toast('목적지에 도착했습니다'); return; }
  proj.set(p.waypoint.x, heightAt(p.waypoint.x, p.waypoint.z) + 1, p.waypoint.z).project(renderer.camera);
  let x = proj.x, y = -proj.y;
  const on = Math.abs(x) < 0.85 && Math.abs(y) < 0.85 && proj.z < 1;
  if (proj.z > 1) { x = -x; y = -y; }
  const k = Math.max(Math.abs(x), Math.abs(y)) / 0.85;
  if (!on) { x /= k; y /= k; }
  arrow.classList.remove('hidden');
  arrow.style.transform = `translate(${(x * 0.5) * window.innerWidth}px, ${(y * 0.5) * window.innerHeight}px) rotate(${Math.atan2(y, x)}rad)`;
  arrow.querySelector('span').textContent = `${Math.round(d)}m`;
}

function startGame(profile, saveData) {
  game = new GameState(bus);
  views = new EntityViews(renderer.scene, game, bus, vfx);
  const send = (cmd) => game.command(cmd); // ← 멀티플레이 시 네트워크 전송으로 교체
  hud = new HUD(game, bus, {
    onSkillClick: (slot, phase) => send(phase === 'release' ? { type: 'skillRelease', slot, aim: input.aim } : { type: 'skill', slot, aim: input.aim }),
    onChat: (text) => bus.emit('log', { text: `[일반] ${game.player().name}: ${text}`, kind: 'chat' }),
  });
  overlay = new Overlay(game, bus, views, renderer.camera);
  dialog = new Dialog({ onAction: (cmd) => send(cmd), getPage: (npcId, page, opts) => game.dialog(npcId, page, opts), game });
  shop = new ShopUI(game, bus, send, AiAssets);
  worldMap = new WorldMap(game, send);
  bonds = new BondsWindow(game);

  game.init(profile, saveData);
  const pid = game.playerId;
  world.setBridgeState(game.publicState.bridge.state);
  renderer.focus.copy(views.positionOf(pid));
  renderer.zoomTarget = 24;

  input = new Input({
    canvas: renderer.canvas, camera: renderer.camera, terrain: world.terrain, views, send,
    keymap: settings.keymap,
    hooks: {
      getEntity: (id) => game.get(id),
      aimHeight: () => views.positionOf(pid).y,
      onMoveMarker: (g) => vfx.ring(tmp.set(g.x, g.y, g.z), '#ffe08a', 1.1, 0.45),
      onInteractKey: () => {
        const p = game.player();
        let best = null, bd = 6;
        for (const e of game.entities.values()) {
          if (!['npc', 'node', 'clue', 'station', 'desk', 'task'].includes(e.kind) || e.hidden) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) { if (best.kind === 'npc') send({ type: 'setTarget', targetId: best.id }); send({ type: 'interact', id: best.id }); }
        else hud.toast('주변에 상호작용할 대상이 없습니다');
      },
      onTabTarget: () => {
        const p = game.player();
        const list = game.livingMonsters().map((m) => ({ m, d: Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) }))
          .filter((o) => o.d < 22).sort((a, b) => a.d - b.d);
        if (!list.length) return;
        const i = list.findIndex((o) => o.m.id === p.targetId);
        send({ type: 'setTarget', targetId: list[(i + 1) % list.length].m.id });
      },
      onEscape: () => { if (worldMap.open) worldMap.close(); else if (bonds.open) bonds.close(); else if (shop.open) shop.close(); else send({ type: 'setTarget', targetId: null }); },
      onMap: () => worldMap.toggle(),
      onBonds: () => bonds.toggle(),
      onChat: () => hud.focusChat(),
      onInventory: () => shop.toggleInventory(),
      onQuality: () => setQuality(renderer.quality === 'high' ? 'low' : 'high'),
      onKeymapChange: (id) => {
        hud.setKeymap(KEYMAPS[id]);
        hud.toast(`키 배치: ${KEYMAPS[id].label}`);
        Save.saveSettings({ ...Save.loadSettings(), keymap: id });
      },
    },
  });
  hud.show();
  hud.setKeymap(input.keymap);
  minimap = new Minimap(document.getElementById('minimap'), game, input.fwd);

  // ───── 기술 연출 ─────
  const posOf = (id, y = 0) => views.positionOf(id, y);
  const v3 = (p, y = 0) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + y, p.z);
  const isMine = (id) => id === pid;
  bus.on('projectile', ({ skillId, from, to, targetId, speed, color }) => {
    const start = v3(from, 1.2);
    const toFn = targetId ? () => posOf(targetId, 0.8) : (() => { const t = v3(to, 0.8); return () => t; })();
    vfx.projectile(start, toFn, speed, color || '#ffe08a', skillId === 'e_ember' ? 0.18 : 0.1);
    Sfx.play(skillId.startsWith('a_') ? 'arrow' : skillId === 'e_ember' ? 'fire' : 'spell');
  });
  bus.on('skillCast', ({ id, skillId }) => {
    if (!isMine(id)) return;
    const sk = SKILLS[skillId];
    if (sk.type === 'melee' || sk.type === 'release' || sk.type === 'cone') Sfx.play(sk.weight === 'heavy' ? 'heavyWhoosh' : 'whoosh');
    if (sk.type === 'complete' || sk.type === 'circleAim' || sk.type === 'place') Sfx.play('spell');
  });
  bus.on('skillStrike', ({ id, skillId, stage, facing, weight, color, range, arc, length, width, at, radius }) => {
    if (!isMine(id)) return;
    const sk = SKILLS[skillId];
    const p = posOf(pid);
    const col = color || sk.color || '#ffe08a';
    switch (sk.type) {
      case 'melee': if (sk.arc >= 1.4 && !(skillId === 'g_chain' && stage < 2) && !(skillId === 'd_needle' && stage === 0)) vfx.slash(p, facing, range + 0.2, arc, col, stage); else vfx.thrust(p, facing, range + 0.3, col); break;
      case 'release': case 'cone': vfx.slash(p, facing, range, arc, col, 2); vfx.releaseWave(p, facing, 60, range, arc); break;
      case 'line': vfx.thrust(p, facing, length, col, width); break;
      case 'dash': vfx.thrust(p, facing, length, col, 1.6); Sfx.play('heavyWhoosh'); break;
      case 'circleSelf': vfx.burst(p, radius, col); break;
      case 'block': vfx.ring(p, '#9fd0ff', 1.6, 0.3); Sfx.play('block'); break;
      case 'parry': vfx.ring(p, '#ffffff', 1.4, 0.25); break;
      case 'taunt': vfx.ring(p, '#ffb070', radius, 0.6); Sfx.play('heavyImpact'); break;
      case 'cycle': vfx.ring(p, '#ffb070', 1.8, 0.4); break;
      case 'dodge': vfx.ring(p, '#ffffff', 1.2, 0.25, 0.5); Sfx.play('dodge'); break;
    }
    if (weight === 'heavy' && sk.type !== 'projectile') renderer.addPunch(0.3);
  });
  bus.on('placed', (o) => {
    const y = heightAt(o.x, o.z);
    if (o.kind === 'wall') vfx.wall({ ...o, now: game.time }, y); else vfx.placed({ ...o, now: game.time }, y);
  });
  bus.on('beam', ({ id, facing, length, skillId }) => vfx.beam(posOf(id), facing, length, SKILLS[skillId].color));
  bus.on('areaWarn', ({ at, radius, time, color }) => vfx.telegraphShape({ id: `warn${Math.random()}`, shape: 'circle', x: at.x, z: at.z, radius, time, counterable: false }, heightAt(at.x, at.z)));
  bus.on('areaHit', ({ at, radius, color, ult }) => { vfx.burst(v3(at, 0.1), radius, color || '#ffb070'); if (ult) vfx.pillar(v3(at), color); Sfx.play('heavyImpact'); });
  bus.on('blink', ({ from, to, allyId }) => { vfx.zap(v3(from, 1), v3(to, 1), allyId ? '#9fd0ff' : '#ffe08a'); vfx.ring(v3(to), '#ffe08a', 1.6, 0.35); Sfx.play('dodge'); });
  bus.on('link', ({ id, targetIds }) => { for (const t of targetIds) vfx.zap(posOf(id, 1.2), posOf(t, 0.8), '#ffd24a'); if (targetIds.length) { renderer.addShake(0.2); Sfx.play('arrow'); } });
  bus.on('complete', ({ mode, at, targetId, element }) => {
    if (mode === 'spread' && at) vfx.burst(v3(at, 0.1), 3.5, '#ffb070');
    else if (targetId) vfx.burst(posOf(targetId, 0.2), 1.6, element === 'frost' ? '#9fd0ff' : '#ff8a4a');
    Sfx.play(element === 'frost' ? 'frost' : 'fire');
  });
  bus.on('healCast', ({ targetId }) => { vfx.heal(() => posOf(targetId)); Sfx.play('heal'); });
  bus.on('shieldCast', ({ targetId }) => { vfx.ring(posOf(targetId), '#9fe0c0', 1.5, 0.5); Sfx.play('heal'); });
  bus.on('heal', ({ targetId, amount }) => { if (amount > 8) vfx.heal(() => posOf(targetId)); });
  bus.on('cleanse', () => { vfx.ring(posOf(pid), '#e8f4ff', 5, 0.5); vfx.heal(() => posOf(pid), '#e8f4ff'); Sfx.play('heal'); });
  bus.on('ultimate', ({ id, windup }) => {
    if (!isMine(id)) return;
    const U = FEEL.ultimate;
    slowT = Math.max(slowT, FEEL.slowMo.ultDuration);
    renderer.flashEdge(U.flashColor, U.flash);
    renderer.addPunch(U.punch);
    renderer.pulseChroma(U.chroma);
    vfx.pillar(posOf(pid), SKILLS[game.player().skills.ult].color);
    Sfx.play('levelUp');
  });

  // ───── 적 패턴 ─────
  bus.on('telegraph', (tel) => { vfx.telegraphShape(tel, heightAt(tel.x, tel.z)); if (tel.counterable) Sfx.play('telegraph'); });
  bus.on('telegraphCancel', ({ id }) => vfx.cancelTelegraph(id));
  bus.on('patternHit', ({ shape, x, z, radius, weight }) => { if (weight === 'heavy') { vfx.burst(v3({ x, z }, 0.1), radius || 3, '#ff6a4a'); renderer.addShake(0.25); Sfx.play('heavyImpact'); } });
  const alert = document.getElementById('boss-alert');
  let alertT = null;
  bus.on('bossPhase', ({ text, kind, time }) => {
    alert.classList.remove('hidden');
    alert.innerHTML = kind === 'staggerCheck' ? `${text}<span class="timer">무력화 게이지를 깨세요 (카운터·무거운 기술)</span>` : text;
    clearTimeout(alertT);
    alertT = setTimeout(() => alert.classList.add('hidden'), (time || 2.5) * 1000);
  });
  bus.on('counter', ({ id }) => { renderer.flashEdge('#5ab8ff', 0.6); renderer.pulseChroma(0.6); Sfx.play('crit'); hitStopT = Math.max(hitStopT, 0.12); vfx.ring(posOf(id), '#5ab8ff', 3, 0.4); });
  bus.on('groggy', ({ id }) => { Sfx.play('knockdown'); vfx.ring(posOf(id), '#ffe08a', 4, 0.6); renderer.addShake(0.3); });
  bus.on('parry', () => { Sfx.play('block'); Sfx.play('crit'); renderer.flashEdge('#ffffff', 0.5); hitStopT = Math.max(hitStopT, 0.1); });

  // ───── 타격감: 히트스톱 · 흔들림 · 펀치 · 섬광 · 색수차 · 슬로모션 · 소리 층 ─────
  bus.on('damage', ({ sourceId, targetId, crit, weight, hitStop, killing, knockdown, blocked }) => {
    const W = FEEL.weight[weight] || FEEL.weight.light;
    if (targetId === pid) {
      renderer.addShake(FEEL.playerHit.shake);
      if (!blocked) renderer.flashEdge(FEEL.playerHit.flashColor, FEEL.playerHit.flash);
      Sfx.play(blocked ? 'block' : 'hurt');
      return;
    }
    if (sourceId !== pid) return;
    hitStopT = Math.max(hitStopT, hitStop || 0);
    renderer.addShake(W.shake * (crit ? 1.3 : 1));
    if (W.punch) renderer.addPunch(W.punch);
    if (crit) { renderer.flashEdge(FEEL.crit.flashColor, FEEL.crit.flash); Sfx.play('crit'); }
    if (weight === 'heavy') { renderer.pulseChroma(FEEL.chroma.heavy); Sfx.play('heavyImpact'); } else Sfx.play('impact', weight === 'medium' ? 0.8 : 1);
    if (knockdown) Sfx.play('knockdown');
    if (killing) slowT = Math.max(slowT, FEEL.slowMo.killDuration);
  });

  bus.on('levelUp', () => { vfx.levelUp(() => posOf(pid)); Sfx.play('levelUp'); persist(); });
  bus.on('loot', ({ itemId, at }) => { if (at) vfx.loot(new THREE.Vector3(at.x, posOf(pid).y + 0.5, at.z), () => posOf(pid, 1), AiAssets, itemId); Sfx.play('coin'); });
  bus.on('trade', () => Sfx.play('coin'));
  bus.on('npcInteract', ({ npcId, substitute }) => { dialog.show(game.dialog(npcId, 'main', { substitute })); Sfx.play('click'); });
  // ───── 관계 · 살아 있는 NPC ─────
  bus.on('tierUp', ({ npcId, tier, line }) => { hud.banner(`${NPCS[npcId].name} · ${tier}`, line); Sfx.play('levelUp'); persist(); });
  bus.on('hiddenDiscovered', ({ npcId, text }) => { hud.toast(`✦ ${NPCS[npcId].name}이(가) 따로 할 이야기가 있는 것 같다`); hud.log(`✦ ${text}`, 'relation'); });
  bus.on('hiddenScene', ({ name, lines }) => { hud.showSummary([], `${name ? `<b>${name}</b><br>` : ''}${lines.join('<br>')}`); });
  bus.on('hiddenDone', () => { Sfx.play('levelUp'); persist(); });
  bus.on('hardLine', ({ npcId, text }) => hud.log(`[금지선] ${NPCS[npcId].name}: ${text} — 관계와 상관없이 하지 않는다`, 'warn'));
  bus.on('familyEvent', ({ kind, child, guardian }) => { if (kind === 'childHurt') hud.log(`[주민] ${NPCS[child].name}이(가) 놀다 넘어졌다. ${NPCS[guardian]?.name || '보호자'}가 진료소로 데려간다.`, 'system'); });
  bus.on('gift', ({ liked, disliked }) => hud.toast(liked ? '반가워한다' : disliked ? '표정이 굳는다' : '고맙다며 받는다'));
  bus.on('newDay', ({ day }) => hud.log(`— ${day}일째 아침 —`, 'system'));
  bus.on('staminaOut', () => hud.toast('기력이 바닥났다'));
  bus.on('waypoint', () => Sfx.play('click'));
  bus.on('shopOpen', () => { dialog.close(); shop.openShop(); });
  bus.on('clue', ({ name, text, first }) => { if (first) hud.showSummary([], `<b>${name}</b><br>${text}`); });
  bus.on('bridgeState', ({ state }) => { world.setBridgeState(state); persist(); });
  bus.on('contractUpdate', () => persist());
  bus.on('relation', () => persist());
  bus.on('equip', () => { Sfx.play('click'); persist(); });
  bus.on('classChanged', () => { vfx.levelUp(() => posOf(pid)); persist(); });

  // ───── 저장 ─────
  function persist() { Save.save(game.serialize()); }
  setInterval(persist, 15000);
  window.addEventListener('beforeunload', persist);

  input.enabled = true;
  const p = game.player();
  hud.log(`${p.name}, 하르벤 교역 거점에 도착했습니다.`, 'system');
  if (saveData?.character?.classId) {
    hud.showSummary(game.changesSinceLastSeen());
  } else {
    hud.showSummary([], `${ORIGINS[p.origin].intro}<br><br>거점에는 일을 구하는 사람이 많습니다. 원하면 하일라(조사)·벨로(호위)·상인(부품) 중 하나의 계약을 맡을 수 있고, 도중에 바꿀 수 있습니다. 맡지 않아도 됩니다.`);
    persist();
  }
  hud.log('[알림] 채팅은 현재 혼자만 볼 수 있습니다. 공공 결산은 로컬에서 서버를 흉내 냅니다.', 'system');
}
