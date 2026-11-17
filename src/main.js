import './ui/style.css';
import * as THREE from 'three';
import { EventBus } from './core/EventBus.js';
import { Input, KEYMAPS } from './core/Input.js';
import { Save } from './core/Save.js';
import { GameState } from './game/GameState.js';
import { SKILLS } from './data/skills.js';
import { Renderer } from './render/Renderer.js';
import { World } from './render/World.js';
import { VFX } from './render/VFX.js';
import { EntityViews } from './render/EntityViews.js';
import { HUD } from './ui/HUD.js';
import { Overlay } from './ui/Overlay.js';
import { Minimap } from './ui/Minimap.js';
import { Dialog } from './ui/Dialog.js';
import { showTitle } from './ui/Title.js';

/**
 * 진입점: 계층을 조립한다.
 *  GameState(순수 로직) ──bus 이벤트──▶ EntityViews/VFX/HUD/Overlay (표현)
 *  Input ──command──▶ GameState            (이후 command 는 WebSocket 으로 서버에 전송)
 */
const renderer = new Renderer(document.getElementById('game'));
const world = new World(renderer.scene);
const vfx = new VFX(renderer.scene);
const bus = new EventBus();
const clock = new THREE.Clock();
let game = null, views, hud, overlay, minimap, dialog, input;
let elapsed = 0;
const tmp = new THREE.Vector3();

function loop() {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  world.update(elapsed, dt);
  if (game) {
    input.update(dt);
    game.update(dt); // MMO: 대화 중에도 세계는 흐른다
    views.update(dt, elapsed);
    const p = game.player();
    renderer.follow(views.positionOf(p.id, 0, tmp), dt);
    hud.update();
    overlay.update(dt);
    minimap.update(dt);
  } else {
    // 타이틀 화면: 마을 위를 천천히 맴돈다
    renderer.zoomTarget = 30;
    renderer.follow(tmp.set(Math.sin(elapsed * 0.07) * 14, 0, Math.cos(elapsed * 0.07) * 14), dt);
  }
  vfx.update(dt);
  renderer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

showTitle().then(({ name, save }) => startGame(name, save));

function startGame(playerName, saveData) {
  game = new GameState(bus);
  views = new EntityViews(renderer.scene, game, bus, vfx);
  const send = (cmd) => game.command(cmd); // ← 멀티플레이 시 네트워크 전송으로 교체
  hud = new HUD(game, bus, {
    onSkillClick: (id) => send({ type: 'skill', skillId: id, aim: input.aim }),
    onChat: (text) => bus.emit('log', { text: `[일반] ${game.player().name}: ${text}`, kind: 'chat' }),
  });
  overlay = new Overlay(game, bus, views, renderer.camera);
  dialog = new Dialog((cmd) => send(cmd));

  game.init(playerName, saveData);
  const pid = game.playerId;
  renderer.focus.copy(views.positionOf(pid));
  renderer.zoomTarget = 24;

  const settings = Save.loadSettings();
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
        for (const e of game.entities.values()) if (e.kind === 'npc') { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
        if (best) { send({ type: 'setTarget', targetId: best.id }); send({ type: 'interact', id: best.id }); }
        else hud.toast('주변에 대화할 상대가 없습니다');
      },
      onTabTarget: () => {
        const p = game.player();
        const list = game.livingMonsters().map((m) => ({ m, d: Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) }))
          .filter((o) => o.d < 22).sort((a, b) => a.d - b.d);
        if (!list.length) return;
        const i = list.findIndex((o) => o.m.id === p.targetId);
        send({ type: 'setTarget', targetId: list[(i + 1) % list.length].m.id });
      },
      onEscape: () => send({ type: 'setTarget', targetId: null }),
      onChat: () => hud.focusChat(),
      onKeymapChange: (id) => {
        hud.setKeymap(KEYMAPS[id]);
        hud.toast(`키 배치: ${KEYMAPS[id].label}`);
        Save.saveSettings({ ...Save.loadSettings(), keymap: id });
      },
    },
  });
  hud.setKeymap(input.keymap);
  minimap = new Minimap(document.getElementById('minimap'), game, input.fwd);

  // ----- 이벤트 → 연출 -----
  const playerPos = (y = 0) => views.positionOf(pid, y);
  bus.on('skillCast', ({ id, skillId }) => {
    if (id !== pid) return;
    if (skillId === 'tauten') {
      vfx.ring(playerPos(), '#ffd27a', 2.2, 0.4);
      vfx.threadBurst(playerPos(1), '#ffe39a', 10, 0.9);
    }
  });
  bus.on('pulled', ({ targetId }) => {
    vfx.pullLine(() => playerPos(1.1), () => views.positionOf(targetId, 0.7));
    renderer.addShake(0.15);
  });
  bus.on('releaseHit', ({ facing, tension }) => {
    vfx.releaseWave(playerPos(), facing, tension, SKILLS.release.range, SKILLS.release.arc);
    renderer.addShake(0.2 + tension / 140);
  });
  bus.on('damage', ({ targetId, crit }) => { if (targetId === pid) renderer.addShake(0.12); else if (crit) renderer.addShake(0.1); });
  bus.on('snap', () => { vfx.snap(playerPos()); renderer.addShake(0.5); });
  bus.on('levelUp', () => { vfx.levelUp(() => playerPos()); persist(); });
  bus.on('loot', ({ at }) => { if (at) vfx.loot(new THREE.Vector3(at.x, playerPos().y + 0.5, at.z), () => playerPos(1)); });
  bus.on('npcInteract', ({ npcId }) => dialog.show(game.quests.dialog(game.player(), npcId)));
  bus.on('questUpdate', ({ status, qid }) => {
    if (status === 'accepted' || status === 'completed') persist();
    if (status === 'completed') hud.banner('퀘스트 완료', '');
    if (status === 'accepted') hud.banner('새로운 의뢰', '');
    if (status === 'progress' && game.quests.status(game.player(), qid) === 'ready') hud.toast('목표 달성! 장로에게 돌아가세요');
  });

  // ----- 저장 -----
  function persist() { Save.save(game.serializePlayer()); }
  setInterval(persist, 15000);
  window.addEventListener('beforeunload', persist);

  hud.show();
  input.enabled = true;
  hud.log(`하르벤 계곡에 오신 것을 환영합니다, ${playerName}님.`, 'system');
  hud.log(saveData ? '지난 기록을 이어서 실을 잇습니다.' : '마을 공동 베틀 곁의 장로에게 말을 걸어보세요. (좌클릭 또는 F)', 'quest');
  hud.log('[알림] 채팅은 현재 혼자만 볼 수 있습니다. 멀티플레이는 Phase 3에서 열립니다.', 'system');
}
