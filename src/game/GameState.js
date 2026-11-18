import { HARVEN, inRiver, inHub, onBridge } from '../data/zones.js';
import { MONSTERS } from '../data/monsters.js';
import { NPC_ORDER } from '../data/npcs.js';
import { ITEMS, RECIPES } from '../data/items.js';
import { ORIGINS } from '../data/origins.js';
import { CLASSES, statsFor, xpToNext, MAX_LEVEL_SLICE } from '../data/classes.js';
import { SKILLS } from '../data/skills.js';
import { BRIDGE_EVENT } from '../data/contracts.js';
import { makeRng, randInt, dist2D, angleTo, clamp } from '../core/math.js';
import { createPlayer, createMonster, createNpc, createInteractable, setClass, applyStats } from './Entity.js';
import * as Shop from './Shop.js';
import { useSkill, updateCast, updateEffects, speedMult, heal, updatePlaced } from './Combat.js';
import { updateResource } from './Resources.js';
import { MonsterAI } from './MonsterAI.js';
import { ContractSystem } from './Contracts.js';
import { PublicState, Relations, DEFAULT_FIGURES } from './WorldState.js';
import { buildDialog } from './Dialogs.js';

export const SAVE_VERSION = 2;

/**
 * 순수 게임 상태/규칙 (three.js·DOM 의존 없음 → Node 서버에서도 실행 가능).
 * 입력: command(cmd)  /  출력: bus 이벤트 (spawn, despawn, damage, heal, death, skillCast, skillStrike,
 *   projectile, telegraph, contractUpdate, bridgeState, relation, npcInteract, channel*, log ...)
 */
export class GameState {
  constructor(bus, { seed = 903 } = {}) {
    this.bus = bus;
    this.rng = makeRng(seed);
    this.zone = HARVEN;
    this.time = 0;
    this.entities = new Map();
    this.nextId = 1;
    this.playerId = null;
    this.scheduled = [];
    this.respawnQueue = [];
    this.placed = []; // 설치물: 성벽·말뚝·장막·결정·웅덩이
    this.ai = new MonsterAI(this);
    this.contracts = new ContractSystem(this);
    this.obstacles = [
      ...HARVEN.houses.map((h) => ({ x: h.x, z: h.z, hw: h.w / 2, hd: h.d / 2 })),
      { x: HARVEN.loom.x, z: HARVEN.loom.z, hw: HARVEN.loom.w / 2, hd: HARVEN.loom.d / 2 },
    ];
  }

  /**
   * @param {{name, origin, classId}} profile
   * @param {object|null} save  v2 저장 데이터 (마이그레이션은 Save.migrate)
   */
  init(profile, save = null) {
    const ch = save?.character;
    const p = createPlayer(this.nextId++, { name: profile.name, origin: profile.origin, classId: profile.classId, character: ch });
    p.relations = structuredClone(save?.personal?.relations || {});
    p.contracts = { active: null, done: { ...(save?.personal?.contracts?.done || {}) } };
    p.contribs = { ...(save?.personal?.contribs || {}) };
    p.records = { clues: [...(save?.personal?.records?.clues || [])], log: [...(save?.personal?.records?.log || [])] };
    if (!ch?.origin) { // 새 캐릭터(또는 구 저장 이관): 출신 소지품
      const o = ORIGINS[profile.origin];
      if (o) p.inventory[o.item] = 1;
    }
    const sp = ch?.pos || HARVEN.playerSpawn;
    p.pos.x = sp.x; p.pos.z = sp.z;
    this.add(p);
    this.playerId = p.id;

    // 공공 상태 + 공개 인물 처지 (서버 흉내)
    this.publicState = new PublicState(this, save?.public);
    this.figures = { ...DEFAULT_FIGURES, ...(save?.world?.figures || {}) };
    this.lastSeen = save?.personal?.lastSeen || null;
    this.offlineGain = save?.savedAt ? this.publicState.applyOffline((Date.now() - save.savedAt) / 1000) : 0;

    for (const id of NPC_ORDER) this.add(createNpc(this.nextId++, id));
    for (const n of HARVEN.nodes) this.add(createInteractable(this.nextId++, 'node', n));
    for (const c of HARVEN.clues) this.add(createInteractable(this.nextId++, 'clue', c));
    this.add(createInteractable(this.nextId++, 'station', { name: '교량 조 작업대', ...HARVEN.workbench }));
    HARVEN.spawns.forEach((s, si) => { for (let i = 0; i < s.count; i++) this.spawnMonster(si); });
  }

  add(e) { this.entities.set(e.id, e); this.bus.emit('spawn', { id: e.id }); return e; }
  remove(id) { if (this.entities.delete(id)) this.bus.emit('despawn', { id }); }
  get(id) { return id == null ? null : this.entities.get(id) || null; }
  player() { return this.get(this.playerId); }
  livingMonsters() { const r = []; for (const e of this.entities.values()) if (e.kind === 'monster' && e.alive) r.push(e); return r; }
  log(text, kind = 'system') { this.bus.emit('log', { text, kind }); }
  schedule(delay, fn) { this.scheduled.push({ at: this.time + delay, fn }); }
  dialog(npcId, page) { return buildDialog(this, this.player(), npcId, page); }

  spawnMonster(spawnIndex, at = null) {
    const s = HARVEN.spawns[spawnIndex];
    const def = MONSTERS[s.monster];
    let x = at?.x ?? s.x, z = at?.z ?? s.z;
    if (!at) for (let tries = 0; tries < 8; tries++) {
      const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * s.radius;
      x = s.x + Math.cos(a) * r; z = s.z + Math.sin(a) * r;
      if (!inRiver(x, z)) break;
    }
    const lr = s.levelRange || def.levelRange;
    const m = createMonster(this.nextId++, s.monster, randInt(this.rng, lr[0], lr[1]), { x, z }, this.rng, s.tag || null);
    m.spawnIndex = spawnIndex;
    return this.add(m);
  }

  /** 호송 중 매복: 수레 근처에 우회로 늑대 2마리 (리스폰 없음) */
  ambush(cart) {
    const si = HARVEN.spawns.findIndex((s) => s.tag === 'detour');
    for (let i = 0; i < 2; i++) {
      const a = this.rng() * Math.PI * 2;
      const m = this.spawnMonster(si, { x: cart.pos.x + Math.cos(a) * 9, z: cart.pos.z + Math.sin(a) * 9 });
      m.noRespawn = true;
      m.ai.targetId = cart.id; m.ai.state = 'chase';
    }
    this.log('우회로에서 풀린 늑대가 수레를 노립니다!', 'warn');
  }

  // ───────────── 명령 (클라이언트 → 상태) ─────────────
  command(cmd) {
    const p = this.player();
    if (!p) return;
    const fail = (r) => { if (typeof r === 'string' && r !== 'busy') this.bus.emit('actionFail', { reason: r }); return r; };
    switch (cmd.type) {
      case 'moveTo':
        if (!p.alive) return;
        p.move.target = { x: cmd.x, z: cmd.z };
        p.attackTargetId = null; p.interactId = null; p.channel = null;
        break;
      case 'moveDir':
        p.move.dir = { x: cmd.x, z: cmd.z };
        if (cmd.x || cmd.z) { p.move.target = null; p.attackTargetId = null; p.interactId = null; p.channel = null; }
        break;
      case 'stop': p.move.target = null; p.attackTargetId = null; break;
      case 'setTarget': p.targetId = cmd.targetId; break;
      case 'attackTarget': {
        const t = this.get(cmd.targetId);
        if (t?.alive && t.kind === 'monster') { p.targetId = t.id; p.attackTargetId = t.id; p.move.target = null; p.interactId = null; }
        break;
      }
      case 'aim': p.aimPt = { x: cmd.x, z: cmd.z }; break;
      case 'skillRelease': useSkill(this, p, cmd.slot, cmd.aim, 'release'); break;
      case 'skill': {
        if (cmd.aim) p.aimPt = cmd.aim;
        const r = useSkill(this, p, cmd.slot, cmd.aim);
        if (r === true && cmd.slot !== 'basic') p.attackTargetId = null;
        if (r === true) p.channel = null;
        else if (cmd.slot !== 'basic') fail(r);
        break;
      }
      case 'interact': {
        const e = this.get(cmd.id);
        if (!e || !p.alive || !['npc', 'node', 'clue', 'station'].includes(e.kind)) return;
        p.interactId = e.id; p.attackTargetId = null; p.move.target = null;
        break;
      }
      case 'contractAccept': fail(this.contracts.accept(p, cmd.id)); break;
      case 'contractSwitch': fail(this.contracts.switchTo(p, cmd.id)); break;
      case 'contractAbandon': this.contracts.abandon(p); break;
      case 'escortStart': this.contracts.startEscort(p, cmd.choice); break;
      case 'deliver': fail(this.contracts.deliver(p, cmd.mode)); break;
      case 'report': fail(this.contracts.report(p, cmd.mode)); break;
      case 'league':
        p.affiliation = cmd.join ? 'league' : 'independent';
        Relations.tag(this, p, 'haila', cmd.join ? '연맹_가입' : '독립_계약자');
        this.log(cmd.join ? '수선공 연맹 명부에 이름을 올렸습니다.' : '독립 계약자로 남기로 했습니다. 계약은 똑같이 받을 수 있습니다.', 'quest');
        break;
      case 'emergencyHeal':
        // 응급 치료는 관계·기분과 무관하게 보장 (v0.3 §8.2)
        heal(this, null, p, p.stats.maxHp);
        p.fx.bleed = null; p.fx.slow = null;
        Relations.tag(this, p, 'mora', '응급_치료');
        this.log('모라가 상처를 살피고 말없이 붕대를 감아 줍니다.', 'system');
        break;
      case 'moraLamb':
        Relations.tag(this, p, 'mora', '새끼양_진료', 1);
        this.log('모라가 새끼 양을 보러 가겠다며 장부에 적습니다.', 'system');
        break;
      case 'changeClass': fail(this.changeClass(p, cmd.classId)); break;
      case 'buy': fail(Shop.buy(this, p, cmd.item, cmd.count)); break;
      case 'sell': fail(Shop.sell(this, p, cmd.item, cmd.count)); break;
      case 'equip': fail(Shop.equip(this, p, cmd.item)); break;
      case 'unequip': fail(Shop.unequip(this, p, cmd.slot)); break;
      case 'useItem': fail(Shop.useItem(this, p, cmd.item)); break;
      case 'quickPotion': fail(Shop.quickPotion(this, p)); break;
      case 'openShop': if (fail(Shop.nearShop(this, p)) === true) this.bus.emit('shopOpen', { shopId: 'merchant' }); break;
    }
  }

  // ───────────── 직업 변경: 안전 거점 + 비전투만 ─────────────
  canChangeClass(p) {
    if (!inHub(p.pos.x, p.pos.z)) return '안전한 거점 안에서만 바꿀 수 있습니다';
    if (this.time - p.lastCombat < 6) return '전투 중에는 바꿀 수 없습니다';
    if (p.contracts.active?.cartId) return '호송 중에는 바꿀 수 없습니다';
    return true;
  }
  changeClass(p, classId) {
    const ok = this.canChangeClass(p);
    if (ok !== true) return ok;
    if (!CLASSES[classId] || classId === p.classId) return '바꿀 수 없는 직업입니다';
    setClass(p, classId);
    this.bus.emit('classChanged', { id: p.id, classId });
    this.log(`전투 방식을 「${CLASSES[classId].name}」(으)로 바꿨습니다. 레벨과 기록은 그대로입니다.`, 'quest');
    return true;
  }

  // ───────────── 시뮬레이션 ─────────────
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      this.scheduled = this.scheduled.filter((s) => s.at > this.time);
      for (const s of due) s.fn();
    }
    if (this.placed.length) updatePlaced(this);
    for (const e of this.entities.values()) {
      for (const k in e.cooldowns) if (e.cooldowns[k] > 0) e.cooldowns[k] = Math.max(0, e.cooldowns[k] - dt);
      if (e.actionLock > 0) e.actionLock = Math.max(0, e.actionLock - dt);
      if (e.alive && (e.kind === 'player' || e.kind === 'monster' || e.kind === 'cart')) updateEffects(this, e, dt);
      if (e.fx.knock) this.applyKnock(e, dt);
      if (e.kind === 'player') this.updatePlayer(e, dt);
      else if (e.kind === 'monster' && e.alive) this.ai.update(e, dt);
      else if (e.kind === 'cart') this.contracts.updateCart(e, dt);
    }
    this.separateMonsters();
    this.publicState.update(dt);
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i];
      if (r.at <= this.time) { this.respawnQueue.splice(i, 1); this.spawnMonster(r.spawnIndex); }
    }
  }

  updatePlayer(p, dt) {
    if (!p.alive) { if (this.time >= p.respawnAt) this.respawnPlayer(p); return; }
    updateResource(this, p, dt);
    updateCast(this, p, p.aimPt);
    p.moving = false;
    // 구르기 이동
    if (p.fx.dash) {
      p.fx.dash.t -= dt;
      p.pos.x += p.fx.dash.vx * dt; p.pos.z += p.fx.dash.vz * dt;
      this.resolveCollision(p);
      p.moving = true; p.lastMoveT = this.time;
      if (p.fx.dash.t <= 0) p.fx.dash = null;
      return;
    }
    if (p.stun > 0) { p.stun -= dt; return; }
    if (p.channel) { this.updateChannel(p, dt); return; }
    if (p.actionLock > 0) return;
    if (this.time - p.lastCombat > 6) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.03 * dt);

    const riverSlow = inRiver(p.pos.x, p.pos.z) && !(this.publicState.bridgeWalkable() && onBridge(p.pos.x, p.pos.z));
    const speed = p.stats.moveSpeed * (riverSlow ? 0.6 : 1) * speedMult(p);
    const dir = p.move.dir;
    if (dir.x || dir.z) { const l = Math.hypot(dir.x, dir.z); this.step(p, dir.x / l, dir.z / l, speed * dt); return; }
    if (p.attackTargetId != null) {
      const t = this.get(p.attackTargetId);
      if (!t?.alive) { p.attackTargetId = null; return; }
      const sk = SKILLS[p.skills.basic];
      const reach = (sk.range || 2.4) * (sk.type === 'projectile' ? 0.9 : 1) + t.radius;
      if (dist2D(p.pos, t.pos) > reach) this.stepToward(p, t.pos, speed * dt, reach * 0.85);
      else if ((p.cooldowns[sk.id] || 0) <= 0) { p.targetId = t.id; useSkill(this, p, 'basic', t.pos); }
      else p.rot = angleTo(p.pos, t.pos);
      return;
    }
    if (p.interactId != null) {
      const e = this.get(p.interactId);
      if (!e) { p.interactId = null; return; }
      const reach = e.radius + 2.0;
      if (dist2D(p.pos, e.pos) > reach) this.stepToward(p, e.pos, speed * dt, reach - 0.2);
      else { p.rot = angleTo(p.pos, e.pos); p.interactId = null; this.beginInteract(p, e); }
      return;
    }
    if (p.move.target && this.stepToward(p, p.move.target, speed * dt, 0.12)) p.move.target = null;
  }

  // ───────────── 상호작용 (대화/채집/조사/조립) ─────────────
  beginInteract(p, e) {
    if (e.kind === 'npc') { this.bus.emit('npcInteract', { npcId: e.npcId, id: e.id }); return; }
    if (e.kind === 'node') {
      if (this.time < e.readyAt) return this.bus.emit('actionFail', { reason: '아직 다시 모이지 않았습니다' });
      return this.startChannel(p, e, 'gather', 1.4);
    }
    if (e.kind === 'clue') return this.startChannel(p, e, 'investigate', 2.0);
    if (e.kind === 'station') {
      const r = RECIPES.brace;
      for (const [k, n] of Object.entries(r.needs)) if ((p.inventory[k] || 0) < n) return this.bus.emit('actionFail', { reason: '재료가 부족합니다 (목재 판 2 · 쇠 죔쇠 1)' });
      return this.startChannel(p, e, 'craft', r.time);
    }
  }
  startChannel(p, e, kind, dur) {
    p.channel = { targetId: e.id, t: 0, dur, kind };
    this.bus.emit('channelStart', { id: p.id, kind, dur, name: e.name });
  }
  updateChannel(p, dt) {
    const c = p.channel;
    c.t += dt;
    if (c.t < c.dur) return;
    p.channel = null;
    const e = this.get(c.targetId);
    this.bus.emit('channelEnd', { id: p.id, kind: c.kind });
    if (!e) return;
    if (c.kind === 'gather') { this.giveItem(p, e.data.item, 1 + (this.rng() < 0.4 ? 1 : 0), e.pos); e.readyAt = this.time + 20; }
    if (c.kind === 'craft') this.contracts.craft(p, 'brace');
    if (c.kind === 'investigate') {
      const first = !(p.records.clues || []).includes(e.data.id);
      this.contracts.onClue(p, e.data.id);
      this.bus.emit('clue', { id: e.data.id, name: e.data.name, text: e.data.text, first });
      this.log(`[조사] ${e.data.name}: ${e.data.text}`, 'quest');
    }
  }

  /** 넉백: 지수 감속 (총 이동 거리 = push) */
  applyKnock(e, dt) {
    const k = e.fx.knock;
    e.pos.x += k.vx * dt; e.pos.z += k.vz * dt;
    const f = Math.exp(-8 * dt);
    k.vx *= f; k.vz *= f;
    this.resolveCollision(e);
    if (Math.hypot(k.vx, k.vz) < 0.08) e.fx.knock = null;
  }

  // ───────────── 이동/충돌 ─────────────
  step(e, nx, nz, d) {
    const ox = e.pos.x, oz = e.pos.z;
    e.pos.x += nx * d; e.pos.z += nz * d;
    if (e.fx.block > 0) { /* 막는 중엔 방향 유지 (정면 판단) */ } else e.rot = Math.atan2(nx, nz);
    this.resolveCollision(e);
    e.moving = Math.hypot(e.pos.x - ox, e.pos.z - oz) > d * 0.2;
    if (e.moving) e.lastMoveT = this.time;
  }
  stepToward(e, pt, d, stopDist) {
    const dx = pt.x - e.pos.x, dz = pt.z - e.pos.z, len = Math.hypot(dx, dz);
    if (len <= stopDist) return true;
    this.step(e, dx / len, dz / len, Math.min(d, len - stopDist));
    if (!e.moving && e.kind === 'player') { e.move.target = null; return true; }
    return false;
  }

  resolveCollision(e) {
    const r = e.radius;
    for (const o of this.obstacles) {
      const cx = clamp(e.pos.x, o.x - o.hw, o.x + o.hw), cz = clamp(e.pos.z, o.z - o.hd, o.z + o.hd);
      const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); e.pos.x = cx + (dx / d) * r; e.pos.z = cz + (dz / d) * r; }
        else {
          const px = o.hw - Math.abs(e.pos.x - o.x), pz = o.hd - Math.abs(e.pos.z - o.z);
          if (px < pz) e.pos.x = o.x + Math.sign(e.pos.x - o.x || 1) * (o.hw + r);
          else e.pos.z = o.z + Math.sign(e.pos.z - o.z || 1) * (o.hd + r);
        }
      }
    }
    if (e.kind === 'monster') {
      // 성벽 전개: 정면에서 들어오지 못한다 / 안전 거점 진입 불가
      for (const w of this.placed) {
        if (w.kind !== 'wall') continue;
        const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
        const along = (e.pos.x - w.x) * fx + (e.pos.z - w.z) * fz, lat = Math.abs((e.pos.x - w.x) * fz - (e.pos.z - w.z) * fx);
        if (lat < w.width / 2 && along < r + 0.3 && along > -0.8) { e.pos.x += fx * (r + 0.3 - along); e.pos.z += fz * (r + 0.3 - along); }
      }
      const hr = HARVEN.hubRadius, dh = Math.hypot(e.pos.x, e.pos.z);
      if (dh < hr) { e.pos.x *= hr / Math.max(dh, 0.01); e.pos.z *= hr / Math.max(dh, 0.01); }
    }
    if (e.kind === 'player' || e.kind === 'monster') {
      for (const n of this.entities.values()) {
        if (n.kind !== 'npc' && n.kind !== 'station') continue;
        const dx = e.pos.x - n.pos.x, dz = e.pos.z - n.pos.z, d = Math.hypot(dx, dz), min = r + n.radius;
        if (d < min && d > 1e-4) { e.pos.x = n.pos.x + (dx / d) * min; e.pos.z = n.pos.z + (dz / d) * min; }
      }
    }
    const br = this.zone.boundsRadius, dc = Math.hypot(e.pos.x, e.pos.z);
    if (dc > br) { e.pos.x *= br / dc; e.pos.z *= br / dc; }
  }

  /** 시야: 집 AABB 와 선분 교차 검사 (연결 사격은 벽을 뚫지 않는다) */
  lineOfSight(a, b) {
    for (const o of this.obstacles) {
      let t0 = 0, t1 = 1;
      const dx = b.x - a.x, dz = b.z - a.z;
      const clip = (p, q) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
      if (clip(-dx, a.x - (o.x - o.hw)) && clip(dx, o.x + o.hw - a.x) && clip(-dz, a.z - (o.z - o.hd)) && clip(dz, o.z + o.hd - a.z)) return false;
    }
    return true;
  }

  separateMonsters() {
    const ms = this.livingMonsters();
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
      if (d < min && d > 1e-4) {
        const push = (min - d) / 2;
        a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
        b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
      }
    }
  }

  // ───────────── 사망/보상/성장 ─────────────
  kill(e, killer) {
    if (!e.alive) return;
    e.alive = false; e.hp = 0; e.moving = false;
    this.bus.emit('death', { id: e.id, killerId: killer?.id ?? null });
    if (e.kind === 'monster') {
      const def = MONSTERS[e.monsterId];
      for (const m of this.livingMonsters()) if (m.ai.targetId === e.id) m.ai.targetId = null;
      const p = this.player();
      if (killer?.kind === 'player' || (p && dist2D(p.pos, e.pos) < 20)) {
        this.log(`${e.name} (Lv${e.level})의 실이 완전히 풀렸습니다.`, 'combat');
        this.gainXp(p, Math.round(def.xp(e.level)));
        this.contracts.onKill(p, e);
        for (const d of def.drops) if (this.rng() < d.chance) this.giveItem(p, d.item, randInt(this.rng, d.min, d.max), e.pos);
        if (p.targetId === e.id) p.targetId = null;
      }
      if (!e.noRespawn) this.respawnQueue.push({ at: this.time + def.respawn, spawnIndex: e.spawnIndex });
      this.schedule(2.5, () => this.remove(e.id));
    } else if (e.kind === 'cart') {
      this.contracts.onCartDestroyed(e);
    } else if (e.kind === 'player') {
      e.respawnAt = this.time + 4;
      e.attackTargetId = null; e.move.target = null; e.channel = null; e.cast = null;
      this.log('쓰러졌습니다… 잠시 후 거점 진료소 앞에서 깨어납니다. 잃는 것은 없습니다.', 'warn');
      for (const m of this.livingMonsters()) if (m.ai.targetId === e.id) this.ai.startReturn(m);
    }
  }

  respawnPlayer(p) {
    p.alive = true; p.hp = p.stats.maxHp; p.stun = 0; p.fx = {};
    p.pos.x = HARVEN.playerSpawn.x; p.pos.z = HARVEN.playerSpawn.z;
    this.bus.emit('playerRespawn', { id: p.id });
  }

  giveItem(p, itemId, count, at = null, quiet = false) {
    p.inventory[itemId] = (p.inventory[itemId] || 0) + count;
    this.bus.emit('loot', { itemId, count, at: at ? { ...at } : null });
    if (!quiet) this.log(`획득: ${ITEMS[itemId].name} x${count}`, 'loot');
    this.contracts.onInventory(p);
    this.bus.emit('inventory', {});
  }

  gainXp(p, amount) {
    if (p.level >= MAX_LEVEL_SLICE) return;
    p.xp += amount;
    this.bus.emit('xp', { amount });
    while (p.level < MAX_LEVEL_SLICE && p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      applyStats(p);
      p.hp = p.stats.maxHp;
      this.bus.emit('levelUp', { id: p.id, level: p.level });
      this.log(`레벨 상승! Lv ${p.level}`, 'level');
    }
  }

  // ───────────── 저장 (세 층 분리) ─────────────
  serialize() {
    const p = this.player();
    return {
      version: SAVE_VERSION,
      character: {
        name: p.name, origin: p.origin, classId: p.classId, level: p.level, xp: p.xp, hp: Math.round(p.hp), gold: p.gold,
        pos: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) }, inventory: { ...p.inventory }, affiliation: p.affiliation, equipment: { ...p.equipment },
      },
      personal: {
        relations: structuredClone(p.relations),
        contracts: { done: { ...p.contracts.done } }, // 진행 중 계약은 저장하지 않음 (다음 접속에 처음부터, 벌칙 없음)
        contribs: { ...p.contribs },
        records: { clues: [...(p.records.clues || [])], log: p.records.log.slice(-30) },
        lastSeen: this.snapshot(),
      },
      public: this.publicState.serialize(),
      world: { figures: { ...this.figures } },
    };
  }

  /** "지난번 이후 바뀐 것" 비교용 스냅샷 */
  snapshot() {
    return { bridge: this.publicState.bridge.state, total: this.publicState.total(), figures: { ...this.figures } };
  }

  /** 접속 시 변경 요약 (공공 결산·인물 처지·오프라인 진행) */
  changesSinceLastSeen() {
    const out = [];
    const ls = this.lastSeen;
    if (!ls) return out;
    const b = this.publicState.bridge;
    if (this.offlineGain > 0) out.push(`접속하지 않은 동안 교량 조와 다른 계약자들이 작업을 이어 갔습니다 (공공 진행 +${this.offlineGain}).`);
    if (ls.bridge !== b.state) out.push(`교역로: ${BRIDGE_EVENT.states[ls.bridge].name} → ${BRIDGE_EVENT.states[b.state].name}. ${BRIDGE_EVENT.states[b.state].desc}`);
    for (const [k, v] of Object.entries(this.figures)) if (ls.figures?.[k] && ls.figures[k] !== v) out.push(`${k}: ${v}`);
    if (!out.length) out.push('지난 접속 이후 크게 바뀐 것은 없습니다. 거점은 여전히 다리 소식으로 붐빕니다.');
    return out;
  }
}
