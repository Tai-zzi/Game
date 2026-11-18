import { SKILLS, STAGGER_BY_WEIGHT } from '../data/skills.js';
import { FEEL } from '../data/feel.js';
import { dist2D, angleTo, wrapAngle, clamp } from '../core/math.js';
import { gainResource } from './Resources.js';

/**
 * 전투 규칙 (서버 권위 지점). 모든 피해·회복은 이 파일을 거친다.
 * 기술: 예비 동작(windup) → 판정(strike) → 회수(recovery). 시전 방식: 즉발 / 차지 / 유지 / 연계.
 * 몬스터 반응: 밀침·넘어짐·띄움·경직 + 무력화 게이지 + 카운터 + 위치(백/헤드) 보너스.
 */
export const IMPACT = FEEL.weight;
const friendly = (e) => e && (e.kind === 'player' || e.kind === 'cart');

// ───────────────────────── 피해 ─────────────────────────
export function dealDamage(game, src, tgt, mult, opts = {}) {
  if (!tgt?.alive || !src) return 0;
  const fx = tgt.fx;
  if (fx.iframes > 0) { game.bus.emit('evade', { targetId: tgt.id }); return 0; }
  if (src.kind === 'monster' && friendly(tgt)) {
    for (const w of game.placed) if (w.kind === 'wall' && wallBlocks(w, src.pos, tgt.pos)) { game.bus.emit('blocked', { targetId: tgt.id, by: 'wall' }); return 0; }
    // 받아치기: 정면 공격을 받아내면 무효 + 반격
    if (fx.parry > 0 && frontal(tgt, src.pos, 2.4)) { parryCounter(game, tgt, src); return 0; }
  }
  const weight = opts.weight || 'light';
  const imp = IMPACT[weight];
  let critChance = opts.noCrit ? 0 : (src.stats.critChance || 0);
  let dmgMult = 1, staggerMult = 1, positional = null;
  if (opts.pos && tgt.kind === 'monster') {
    const diff = Math.abs(wrapAngle(angleTo(tgt.pos, src.pos) - tgt.rot));
    const P = FEEL.positional;
    if (opts.pos === 'back' && diff > P.backAngle) { positional = 'back'; dmgMult += P.backDamage; critChance += P.backCrit; }
    if (opts.pos === 'head' && diff < P.headAngle) { positional = 'head'; staggerMult += P.headStagger; }
  }
  if (src.fx?.buff) dmgMult += src.fx.buff.v;
  if (tgt.groggy > 0) dmgMult *= FEEL.groggy.damageTaken;
  const crit = game.rng() < critChance;
  let dmg = src.stats.atk * mult * dmgMult * (0.9 + game.rng() * 0.2) * (crit ? 1.6 : 1) - tgt.stats.def * 0.5;
  dmg = Math.max(1, dmg);
  let blocked = false;
  if (fx.block > 0 && frontal(tgt, src.pos, SKILLS.g_shield.arc)) {
    dmg *= 1 - SKILLS.g_shield.reduce;
    blocked = true;
    gainResource(game, tgt, SKILLS.g_shield.gainPerBlock);
    tgt.res.counterUntil = game.time + 2;
  }
  if (fx.guard) dmg *= 1 - fx.guard.v;
  if (fx.protect) dmg *= 1 - fx.protect.v;
  dmg = Math.max(1, Math.round(dmg));
  if (fx.shield) { // 보호막이 먼저 흡수
    const ab = Math.min(fx.shield.v, dmg);
    fx.shield.v -= ab; dmg -= ab;
    if (fx.shield.v <= 0) fx.shield = null;
    if (ab > 0) game.bus.emit('absorb', { targetId: tgt.id, amount: Math.round(ab) });
  }
  tgt.hp = Math.max(0, tgt.hp - dmg);
  tgt.anim.hitSeq++;
  if (src.kind === 'player') src.lastCombat = game.time;
  if (tgt.kind === 'player') { tgt.lastCombat = game.time; interrupt(game, tgt); }
  if (tgt.kind === 'monster') { tgt.threat.set(src.id, (tgt.threat.get(src.id) || 0) + dmg); game.ai.onDamaged(tgt, src); }
  if (opts.bleed && friendly(tgt) && !blocked) fx.bleed = { dps: tgt.stats.maxHp * opts.bleed.dpsPct, t: opts.bleed.time, srcId: src.id };

  // ── 반응: 카운터 · 무력화 · 밀침/넘어짐/띄움 ──
  let countered = false, knockdown = false, air = false, groggyNow = false;
  const dx = tgt.pos.x - src.pos.x, dz = tgt.pos.z - src.pos.z, dl = Math.hypot(dx, dz) || 1;
  if (tgt.kind === 'monster') {
    if (opts.counter && tgt.ai.state === 'attack' && tgt.ai.pattern?.counterable) {
      countered = true;
      game.ai.cancelWindup(tgt);
      tgt.stun = Math.max(tgt.stun, 2.2);
      staggerMult += 2;
      game.bus.emit('counter', { id: tgt.id, by: src.id });
    }
    if (tgt.stagger && tgt.groggy <= 0) {
      tgt.stagger.value -= (opts.stagger ?? STAGGER_BY_WEIGHT[weight]) * staggerMult;
      if (tgt.stagger.value <= 0) {
        tgt.stagger.value = 0; tgt.groggy = FEEL.groggy.duration; groggyNow = true;
        tgt.stun = Math.max(tgt.stun, FEEL.groggy.duration);
        game.ai.cancelWindup(tgt);
        game.bus.emit('groggy', { id: tgt.id });
      }
    }
    const armored = tgt.superArmor && tgt.groggy <= 0;
    if (!armored) {
      const push = imp.push * (crit ? FEEL.crit.pushMult : 1) * (opts.knock === 'push' ? 1.5 : 1);
      fx.knock = { vx: (dx / dl) * push * 8, vz: (dz / dl) * push * 8 };
      const inWindup = tgt.ai.state === 'attack';
      if (opts.knock === 'down' && tgt.hp > 0) { knockdown = true; tgt.stun = Math.max(tgt.stun, FEEL.knock.downTime); fx.down = FEEL.knock.downTime; game.ai.cancelWindup(tgt); }
      else if (opts.knock === 'air' && tgt.hp > 0) { air = true; tgt.stun = Math.max(tgt.stun, FEEL.knock.airTime); fx.air = FEEL.knock.airTime; game.ai.cancelWindup(tgt); }
      else if (!(weight === 'light' && inWindup)) { tgt.stun = Math.max(tgt.stun, imp.stagger); game.ai.cancelWindup(tgt); } // 가벼운 타격은 예비 동작을 못 끊음
    }
  } else if (tgt.kind === 'player' && !blocked) {
    fx.knock = { vx: (dx / dl) * FEEL.playerHit.push * 8, vz: (dz / dl) * FEEL.playerHit.push * 8 };
  }
  if (positional) game.bus.emit('positional', { targetId: tgt.id, kind: positional });
  const killing = tgt.hp <= 0;
  game.bus.emit('damage', { sourceId: src.id, targetId: tgt.id, amount: dmg, crit, blocked, skillId: opts.skillId || null, weight,
    knockdown, air, countered, groggy: groggyNow, positional, killing, dir: { x: dx / dl, z: dz / dl },
    hitStop: src.kind === 'player' || tgt.kind === 'player' ? imp.hitStop * (crit ? FEEL.crit.hitStopMult : 1) : 0 });
  if (killing) game.kill(tgt, src);
  return dmg;
}

const frontal = (e, from, arc) => Math.abs(wrapAngle(angleTo(e.pos, from) - e.rot)) <= arc / 2;

function parryCounter(game, p, src) {
  const sk = SKILLS.g_parry;
  p.fx.parry = 0;
  p.fx.iframes = Math.max(p.fx.iframes || 0, 0.3);
  gainResource(game, p, sk.gainOnParry);
  game.bus.emit('parry', { id: p.id, targetId: src.id });
  dealDamage(game, p, src, sk.damage, { skillId: sk.id, weight: 'heavy', knock: sk.knock, stagger: sk.stagger, counter: true });
}

export function heal(game, src, tgt, amount) {
  if (!tgt?.alive) return 0;
  const before = tgt.hp;
  tgt.hp = Math.min(tgt.stats.maxHp, tgt.hp + amount);
  const v = Math.round(tgt.hp - before);
  if (v > 0) game.bus.emit('heal', { sourceId: src?.id ?? null, targetId: tgt.id, amount: v });
  return v;
}

/** 예비 동작·차지·유지 중 피격 → interruptible 기술은 끊김 (비용·쿨다운 환불). 채집·조사도 끊긴다 */
function interrupt(game, p) {
  if (p.channel) { game.bus.emit('channelBreak', { id: p.id, kind: p.channel.kind }); p.channel = null; }
  const c = p.cast || p.charging;
  if (!c || c.struck) return;
  const sk = SKILLS[c.skillId];
  if (!sk.interruptible) return;
  p.cast = null; p.charging = null;
  p.actionLock = 0;
  p.cooldowns[sk.id] = 0;
  if (c.paid) gainResource(game, p, c.paid, { refund: true });
  game.bus.emit('interrupt', { id: p.id, skillId: sk.id });
  game.log(`${sk.name}이(가) 끊겼습니다.`, 'warn');
}

/** 상태 효과 갱신 */
export function updateEffects(game, e, dt) {
  const fx = e.fx;
  for (const k of ['block', 'iframes', 'root', 'parry', 'air', 'down']) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
  for (const k of ['guard', 'protect', 'slow', 'shield', 'buff']) if (fx[k]) { fx[k].t -= dt; if (fx[k].t <= 0) fx[k] = null; }
  if (e.groggy > 0) {
    e.groggy -= dt;
    if (e.groggy <= 0 && e.stagger) { e.stagger.value = e.stagger.max; game.bus.emit('groggyEnd', { id: e.id }); }
  }
  if (fx.bleed) {
    fx.bleed.t -= dt;
    e.hp = Math.max(1, e.hp - fx.bleed.dps * dt); // 지속 피해만으로는 쓰러지지 않는다 (검증 전 예시)
    if (fx.bleed.t <= 0) fx.bleed = null;
  }
  if (fx.hot) {
    fx.hot.t -= dt;
    fx.hot.acc += fx.hot.perSec * dt;
    if (fx.hot.acc >= 1) { const n = Math.floor(fx.hot.acc); fx.hot.acc -= n; heal(game, null, e, n); }
    if (fx.hot.t <= 0) fx.hot = null;
  }
}

export const speedMult = (e) => (e.fx.root > 0 ? 0 : 1) * (e.fx.slow ? 1 - e.fx.slow.v : 1) * (e.fx.block > 0 ? SKILLS.g_shield.moveMult : 1);

// ───────────────────────── 대상 고르기 ─────────────────────────
function nearest(list, point, maxD) {
  let best = null, bd = maxD;
  for (const m of list) { const d = dist2D(m.pos, point); if (d < bd) { bd = d; best = m; } }
  return best;
}
function inArc(src, tgt, facing, range, arc) {
  const d = dist2D(src.pos, tgt.pos);
  if (d > range + tgt.radius) return false;
  return d < 0.6 + tgt.radius * 0.5 || Math.abs(wrapAngle(angleTo(src.pos, tgt.pos) - facing)) <= arc / 2;
}
function inRect(from, facing, length, width, m) {
  const fx = Math.sin(facing), fz = Math.cos(facing);
  const rx = m.pos.x - from.x, rz = m.pos.z - from.z;
  const along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
  return along > -0.5 && along < length + m.radius && side < width / 2 + m.radius;
}
function pickEnemy(game, p, range, aim) {
  const cands = game.livingMonsters().filter((m) => dist2D(p.pos, m.pos) <= range + m.radius);
  const t = game.get(p.targetId);
  return (aim && nearest(cands, aim, 3)) || (t?.kind === 'monster' && cands.includes(t) ? t : null) || nearest(cands, p.pos, Infinity);
}
function clampToRange(from, to, range) {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz);
  if (l <= range) return { x: to.x, z: to.z };
  return { x: from.x + (dx / l) * range, z: from.z + (dz / l) * range };
}
const friendlies = (game) => [...game.entities.values()].filter((e) => friendly(e) && e.alive);

function allyTarget(game, p, range) {
  const t = game.get(p.targetId);
  if (friendly(t) && t.alive && dist2D(p.pos, t.pos) <= range) return t;
  const carts = friendlies(game).filter((e) => e.kind === 'cart' && e.hp < e.stats.maxHp && dist2D(p.pos, e.pos) <= range);
  return carts.length && p.hp / p.stats.maxHp > 0.6 ? carts[0] : p;
}

// ───────────────────────── 기술 사용 ─────────────────────────
/**
 * slot: basic | q w e r a s d f | ult | dodge,  phase: press | release (차지·유지 기술은 놓을 때 처리)
 * 반환: true 또는 실패 사유
 */
export function useSkill(game, p, slot, aim, phase = 'press') {
  const skillId = p.skills[slot];
  const sk = SKILLS[skillId];
  if (!sk) return '알 수 없는 기술';
  if (phase === 'release') {
    if (p.charging?.skillId === skillId) fireCharge(game, p);
    if (p.holding?.skillId === skillId) endHold(game, p);
    return true;
  }
  if (!p.alive) return '쓰러진 상태입니다';
  if (p.stun > 0) return '움직일 수 없습니다';
  if ((p.actionLock > 0 || p.charging || p.holding) && slot !== 'dodge') return 'busy';
  if (slot === 'dodge') { p.charging = null; if (p.holding) endHold(game, p); }

  // 연계(combo): 창 안에 다시 누르면 다음 단계
  let stage = 0;
  const cs = p.combo[skillId];
  if (sk.cast === 'combo' && cs && game.time <= cs.until && cs.stage < sk.stages.length - 1) stage = cs.stage + 1;
  else if ((p.cooldowns[skillId] || 0) > 0) return '아직 준비되지 않았습니다';
  const S = stage > 0 || sk.cast === 'combo' ? { ...sk, ...sk.stages[stage] } : sk;
  if (stage === 0) {
    if (S.cost && p.res.value < S.cost) return `${p.res.id === 'pigment' ? '안료' : '결의'}가 부족합니다 (${S.cost} 필요)`;
    if (S.minRes && p.res.value < S.minRes) return `결의가 부족합니다 (${S.minRes} 이상)`;
  }

  let facing = p.rot;
  if (aim && Math.hypot(aim.x - p.pos.x, aim.z - p.pos.z) > 0.3) facing = angleTo(p.pos, aim);
  const cast = { skillId, slot, stage, aim: aim ? { x: aim.x, z: aim.z } : null, facing, targetId: null, struck: false, paid: 0 };

  // 사전 검증 + 대상
  switch (S.type) {
    case 'melee': case 'projectile': {
      const t = game.get(p.targetId);
      let target = t?.kind === 'monster' && t.alive && dist2D(p.pos, t.pos) <= (S.range || 2.5) + t.radius + 0.3 ? t : null;
      if (!target) target = S.type === 'projectile' ? pickEnemy(game, p, S.range, aim)
        : nearest(game.livingMonsters().filter((m) => inArc(p, m, facing, S.range + 0.6, S.arc + 0.6)), p.pos, Infinity);
      if (target) { cast.targetId = target.id; cast.facing = angleTo(p.pos, target.pos); }
      break;
    }
    case 'link':
      if (!game.livingMonsters().some((m) => m.marks.n > 0 && dist2D(p.pos, m.pos) <= S.range)) return '사거리 안에 표식이 남은 적이 없습니다';
      break;
    case 'escort': {
      const ally = nearest(friendlies(game).filter((e) => e.kind === 'cart'), p.pos, S.range);
      if (!ally) return '곁으로 갈 보호 대상이 없습니다 (호송 중인 수레 등)';
      cast.targetId = ally.id;
      break;
    }
    case 'complete':
      if (!p.res.slots.length) return '원소식이 비어 있습니다';
      break;
    case 'cycle':
      if (!p.res.slots.length) return '뒤바꿀 원소식이 없습니다';
      break;
    case 'heal': case 'shield':
      cast.targetId = allyTarget(game, p, S.range).id;
      break;
  }

  // 확정
  if (stage === 0 && S.cost) { p.res.value -= S.cost; cast.paid = S.cost; }
  if (sk.cast === 'combo') {
    const last = stage >= sk.stages.length - 1;
    p.combo[skillId] = { stage, until: game.time + S.windup + S.recovery + sk.window };
    if (last) { p.cooldowns[skillId] = sk.cooldown; delete p.combo[skillId]; }
  } else p.cooldowns[skillId] = sk.cooldown;
  p.rot = cast.facing;
  p.move.target = null;
  p.anim.action = skillId; p.anim.actionSeq++;
  if (cast.targetId && game.get(cast.targetId)?.kind === 'monster') p.targetId = cast.targetId;
  if (sk.ult) { p.fx.iframes = Math.max(p.fx.iframes || 0, S.windup + S.recovery); game.bus.emit('ultimate', { id: p.id, skillId, windup: S.windup }); }

  if (sk.cast === 'charge') {
    p.charging = { ...cast, t0: game.time };
    p.actionLock = sk.charge.max + 0.6;
    game.bus.emit('chargeStart', { id: p.id, skillId, max: sk.charge.max });
    game.bus.emit('skillCast', { id: p.id, skillId, slot, stage, facing: cast.facing, windup: sk.charge.max, recovery: S.recovery, charge: true });
    return true;
  }
  if (sk.cast === 'hold') {
    p.holding = { ...cast, t0: game.time, nextTick: game.time + S.windup };
    p.actionLock = sk.hold.max + 0.2;
    if (S.type === 'block') { p.fx.block = sk.hold.max; p.actionLock = 0; } // 막는 동안 걸을 수 있다 (느리게)
    game.bus.emit('holdStart', { id: p.id, skillId, max: sk.hold.max });
    game.bus.emit('skillCast', { id: p.id, skillId, slot, stage, facing: cast.facing, windup: S.windup, recovery: sk.hold.max, hold: true });
    return true;
  }
  p.cast = { ...cast, strikeAt: game.time + S.windup };
  p.actionLock = S.windup + S.recovery;
  game.bus.emit('skillCast', { id: p.id, skillId, slot, stage, targetId: cast.targetId, facing: cast.facing, windup: S.windup, recovery: S.recovery });
  if (S.windup <= 0) strike(game, p, p.cast);
  return true;
}

function fireCharge(game, p) {
  const c = p.charging;
  const sk = SKILLS[c.skillId];
  p.charging = null;
  const frac = clamp((game.time - c.t0) / sk.charge.max, 0, 1);
  c.chargeFrac = frac;
  c.mult = 1 + (sk.charge.mult - 1) * frac;
  if (c.aim) c.facing = angleTo(p.pos, c.aim);
  p.rot = c.facing;
  p.cast = { ...c, strikeAt: game.time + sk.windup };
  p.actionLock = sk.windup + sk.recovery;
  game.bus.emit('chargeRelease', { id: p.id, skillId: sk.id, frac });
}

function endHold(game, p) {
  const h = p.holding;
  if (!h) return;
  const sk = SKILLS[h.skillId];
  p.holding = null;
  if (sk.type === 'block') p.fx.block = 0;
  p.actionLock = sk.recovery;
  game.bus.emit('holdEnd', { id: p.id, skillId: sk.id });
}

/** 매 프레임: 판정 시점 도달, 차지 최대치 자동 발사, 유지 기술 틱 */
export function updateCast(game, p, aim) {
  // 연계 창이 끝나면 그때 재사용 대기 시작
  for (const [id, cs] of Object.entries(p.combo)) if (game.time > cs.until) { p.cooldowns[id] = SKILLS[id].cooldown; delete p.combo[id]; }
  if (p.charging && game.time - p.charging.t0 >= SKILLS[p.charging.skillId].charge.max) fireCharge(game, p);
  if (p.holding) {
    const h = p.holding, sk = SKILLS[h.skillId];
    if (aim) h.aim = aim;
    if (game.time - h.t0 >= sk.hold.max) endHold(game, p);
    else if (sk.type === 'channel' && game.time >= h.nextTick) {
      h.nextTick += sk.hold.tick;
      if (sk.costPerTick && p.res.value < sk.costPerTick) { endHold(game, p); game.bus.emit('actionFail', { reason: '안료가 바닥났습니다' }); }
      else { if (sk.costPerTick) p.res.value -= sk.costPerTick; channelTick(game, p, sk, h); }
    }
  }
  if (p.cast && !p.cast.struck && game.time >= p.cast.strikeAt) strike(game, p, p.cast);
  if (p.cast?.struck && p.actionLock <= 0) p.cast = null;
}

function channelTick(game, p, sk, h) {
  if (sk.heal) {
    const t = allyTarget(game, p, sk.range);
    heal(game, p, t, t.stats.maxHp * sk.healPct);
    game.bus.emit('healCast', { id: p.id, targetId: t.id, skillId: sk.id });
    return;
  }
  const facing = h.aim ? angleTo(p.pos, h.aim) : p.rot;
  p.rot = facing;
  for (const m of game.livingMonsters()) if (inRect(p.pos, facing, sk.length, sk.width, m)) dealDamage(game, p, m, sk.damage, { skillId: sk.id, weight: sk.weight || 'light' });
  if (sk.element && game.time - (h.lastEl ?? h.t0) >= sk.elementEvery) { h.lastEl = game.time; addElement(game, p, sk.element); }
  game.bus.emit('beam', { id: p.id, facing, length: sk.length, skillId: sk.id });
}

// ───────────────────────── 판정 ─────────────────────────
function strike(game, p, c) {
  c.struck = true;
  const base = SKILLS[c.skillId];
  const sk = base.stages ? { ...base, ...base.stages[c.stage || 0] } : base;
  const moveMult = p.classId === 'elementalist' && game.time - p.lastMoveT < 0.4 ? 0.75 : 1; // 이동 중 출력 감소 (약점)
  const mult = (c.mult || 1) * moveMult;
  const hitOpts = { skillId: sk.id, weight: sk.weight || 'light', knock: sk.knock, stagger: sk.stagger, counter: sk.counter, pos: sk.pos };
  const emitStrike = (extra = {}) => game.bus.emit('skillStrike', { id: p.id, skillId: sk.id, stage: c.stage || 0, facing: c.facing, weight: sk.weight || 'light', color: sk.color, ...extra });
  const enemiesIn = (fn) => game.livingMonsters().filter(fn);
  const hitAll = (list, m2 = sk.damage) => { for (const m of list) { dealDamage(game, p, m, m2 * mult, hitOpts); if (sk.addMark) addMark(game, m, sk.addMark); } return list.length; };

  switch (sk.type) {
    case 'dodge': {
      let dx = p.move.dir.x, dz = p.move.dir.z;
      if (!dx && !dz) { dx = Math.sin(c.facing); dz = Math.cos(c.facing); }
      const l = Math.hypot(dx, dz);
      p.fx.dash = { vx: (dx / l) * sk.distance / sk.duration, vz: (dz / l) * sk.distance / sk.duration, t: sk.duration };
      p.fx.iframes = sk.iframes;
      p.rot = Math.atan2(dx, dz);
      p.attackTargetId = null; p.channel = null; p.cast = null;
      p.actionLock = sk.duration;
      emitStrike();
      break;
    }
    case 'melee': {
      // 전방 호 안의 적 모두 (주 대상은 방향 결정용)
      const list = enemiesIn((m) => inArc(p, m, c.facing, sk.range + 0.3, sk.arc));
      let m2 = sk.damage;
      if (p.classId === 'guardian' && sk.id === 'g_basic' && game.time <= p.res.counterUntil && p.res.value >= 20) { // 막은 직후 반격 (검증 전 예시)
        m2 *= 2; p.res.value -= 20; p.res.counterUntil = -99; hitOpts.weight = 'heavy';
        game.bus.emit('counterStrike', { id: p.id });
      }
      if (hitAll(list, m2) && sk.gain) gainResource(game, p, sk.gain);
      emitStrike({ range: sk.range, arc: sk.arc });
      break;
    }
    case 'projectile': {
      const t = game.get(c.targetId);
      const from = { x: p.pos.x, z: p.pos.z };
      if (!t?.alive) {
        const to = c.aim || { x: p.pos.x + Math.sin(c.facing) * sk.range, z: p.pos.z + Math.cos(c.facing) * sk.range };
        game.bus.emit('projectile', { id: p.id, skillId: sk.id, from, to, speed: sk.speed, color: sk.color });
        emitStrike();
        break;
      }
      let m2 = sk.damage * mult;
      if (sk.closeMult && nearest(game.livingMonsters(), p.pos, sk.closeRange)) m2 *= sk.closeMult;
      game.bus.emit('projectile', { id: p.id, skillId: sk.id, from, targetId: t.id, speed: sk.speed, color: sk.color });
      game.schedule(dist2D(p.pos, t.pos) / sk.speed, () => {
        if (!t.alive) return;
        dealDamage(game, p, t, m2, hitOpts);
        if (sk.addMark) addMark(game, t, sk.addMark);
        if (sk.element) addElement(game, p, sk.element);
      });
      emitStrike({ targetId: t.id });
      break;
    }
    case 'line': {
      const len = sk.lengthMax ? sk.length + (sk.lengthMax - sk.length) * (c.chargeFrac || 0) : sk.length;
      const list = enemiesIn((m) => inRect(p.pos, c.facing, len, sk.width, m));
      hitAll(list);
      if (sk.slow) for (const m of list) m.fx.slow = { ...sk.slow };
      if (sk.element) addElement(game, p, sk.element);
      emitStrike({ length: len, width: sk.width });
      break;
    }
    case 'cone': {
      const list = enemiesIn((m) => inArc(p, m, c.facing, sk.range, sk.arc));
      hitAll(list);
      if (sk.placeWall) placeObject(game, p, { kind: 'wall', x: p.pos.x + Math.sin(c.facing) * 2.5, z: p.pos.z + Math.cos(c.facing) * 2.5, facing: c.facing, width: sk.placeWall.width, duration: sk.placeWall.duration });
      if (sk.fillRes) p.res.value = p.res.max;
      emitStrike({ range: sk.range, arc: sk.arc });
      break;
    }
    case 'circleSelf': {
      const list = enemiesIn((m) => dist2D(m.pos, p.pos) <= sk.radius + m.radius);
      hitAll(list);
      supportArea(game, p, p.pos, sk);
      emitStrike({ at: { ...p.pos }, radius: sk.radius });
      break;
    }
    case 'circleAim': {
      const at = clampToRange(p.pos, c.aim || p.pos, sk.range);
      const go = () => {
        let list = enemiesIn((m) => dist2D(m.pos, at) <= sk.radius + m.radius);
        if (sk.fillMarks) for (const m of list) addMark(game, m, 3);
        let m2 = sk.damage;
        if (sk.perElement) { m2 += sk.perElement * p.res.slots.length; if (sk.consumeElements) { p.res.slots = []; p.res.value = 0; } }
        for (const m of list) {
          const bonus = sk.markBonus && m.marks.n > 0 ? 1 + sk.markBonus : 1;
          dealDamage(game, p, m, m2 * mult * bonus, hitOpts);
        }
        if (sk.thenLink) game.schedule(0.35, () => linkShot(game, p, SKILLS.a_link, list.filter((m) => m.alive)));
        supportArea(game, p, at, sk);
        game.bus.emit('areaHit', { id: p.id, skillId: sk.id, at, radius: sk.radius, color: sk.color, ult: !!sk.ult });
      };
      if (sk.delay) { game.bus.emit('areaWarn', { id: p.id, at, radius: sk.radius, time: sk.delay, color: sk.color }); game.schedule(sk.delay, go); }
      else go();
      emitStrike({ at, radius: sk.radius });
      break;
    }
    case 'dash': {
      const from = { ...p.pos };
      const dx = Math.sin(c.facing), dz = Math.cos(c.facing);
      const list = enemiesIn((m) => inRect(from, c.facing, sk.distance, sk.width, m));
      p.fx.dash = { vx: dx * sk.distance / 0.22, vz: dz * sk.distance / 0.22, t: 0.22 };
      p.fx.iframes = Math.max(p.fx.iframes || 0, 0.22);
      game.schedule(0.1, () => { if (hitAll(list.filter((m) => m.alive)) && sk.gain) gainResource(game, p, sk.gain); });
      emitStrike({ from, length: sk.distance });
      break;
    }
    case 'blink': {
      const dir = sk.back ? c.facing + Math.PI : c.facing;
      if (sk.damage) hitAll(enemiesIn((m) => inArc(p, m, c.facing, sk.range, 1.6)));
      const from = { ...p.pos };
      const to = !sk.back && c.aim ? clampToRange(p.pos, c.aim, sk.distance) : { x: p.pos.x + Math.sin(dir) * sk.distance, z: p.pos.z + Math.cos(dir) * sk.distance };
      p.pos.x = to.x; p.pos.z = to.z;
      game.resolveCollision(p);
      p.fx.iframes = Math.max(p.fx.iframes || 0, 0.15);
      if (sk.burst) {
        for (const m of enemiesIn((m) => dist2D(m.pos, from) <= sk.burst.radius + m.radius)) { dealDamage(game, p, m, sk.burst.damage, { ...hitOpts, weight: 'medium' }); m.fx.slow = { ...sk.burst.slow }; }
        game.bus.emit('areaHit', { id: p.id, skillId: sk.id, at: from, radius: sk.burst.radius, color: sk.color });
      }
      game.bus.emit('blink', { id: p.id, from, to: { ...p.pos } });
      emitStrike();
      break;
    }
    case 'link':
      linkShot(game, p, sk, game.livingMonsters().filter((m) => m.marks.n > 0 && dist2D(p.pos, m.pos) <= sk.range));
      emitStrike();
      break;
    case 'place': {
      const at = sk.place === 'wall'
        ? { x: p.pos.x + Math.sin(c.facing) * sk.offset, z: p.pos.z + Math.cos(c.facing) * sk.offset }
        : clampToRange(p.pos, c.aim || p.pos, sk.range || 0);
      placeObject(game, p, { kind: sk.place, ...at, facing: c.facing, width: sk.width, radius: sk.radius, duration: sk.duration, tick: sk.tick, skillId: sk.id });
      if (sk.element) addElement(game, p, sk.element);
      emitStrike({ at });
      break;
    }
    case 'parry':
      p.fx.parry = sk.window;
      emitStrike();
      break;
    case 'block':
      emitStrike();
      break;
    case 'escort': {
      const ally = game.get(c.targetId);
      if (!ally?.alive) break;
      const a = angleTo(ally.pos, p.pos);
      const from = { ...p.pos };
      p.pos.x = ally.pos.x + Math.sin(a) * (ally.radius + 1); p.pos.z = ally.pos.z + Math.cos(a) * (ally.radius + 1);
      game.resolveCollision(p);
      ally.fx.guard = { v: sk.guard, t: sk.guardTime };
      game.bus.emit('blink', { id: p.id, from, to: { ...p.pos }, allyId: ally.id });
      break;
    }
    case 'taunt': {
      const list = enemiesIn((m) => dist2D(m.pos, p.pos) <= sk.radius);
      for (const m of list) { m.ai.targetId = p.id; if (m.ai.state !== 'attack') m.ai.state = 'chase'; }
      gainResource(game, p, sk.gainPer * list.length);
      game.bus.emit('taunt', { id: p.id, n: list.length, radius: sk.radius });
      emitStrike({ radius: sk.radius });
      break;
    }
    case 'release': {
      const used = p.res.value;
      p.res.value = 0;
      const list = enemiesIn((m) => inArc(p, m, c.facing, sk.range, sk.arc));
      hitAll(list, sk.damage + sk.perRes * used);
      emitStrike({ range: sk.range, arc: sk.arc, power: used / 100 });
      break;
    }
    case 'complete': {
      const slots = p.res.slots.slice();
      p.res.slots = []; p.res.value = 0;
      const n = slots.length, same = slots.every((s) => s === slots[0]);
      if (same && n >= 2) {
        const t = pickEnemy(game, p, sk.range, c.aim);
        if (t) { dealDamage(game, p, t, (1.0 + 1.1 * n) * mult, { ...hitOpts, knock: 'down' }); if (slots[0] === 'frost' && t.alive) t.fx.root = 2; }
        game.bus.emit('complete', { id: p.id, mode: 'focus', element: slots[0], n, targetId: t?.id ?? null });
      } else {
        const at = clampToRange(p.pos, c.aim || p.pos, sk.range);
        for (const m of enemiesIn((m) => dist2D(m.pos, at) <= sk.radius + m.radius)) { dealDamage(game, p, m, (0.7 + 0.5 * n) * mult, hitOpts); m.fx.slow = { v: 0.4, t: 2.5 }; }
        game.bus.emit('complete', { id: p.id, mode: 'spread', elements: slots, n, at });
      }
      emitStrike();
      break;
    }
    case 'cycle':
      p.res.slots = p.res.slots.map((s) => (s === 'fire' ? 'frost' : 'fire'));
      p.res.lastGain = game.time;
      p.fx.buff = { ...sk.buff };
      emitStrike();
      break;
    case 'heal': {
      const t = game.get(c.targetId) || p;
      if (t.alive) t.fx.hot = { perSec: (t.stats.maxHp * sk.hotPct) / sk.hotTime, t: sk.hotTime, acc: 0 };
      game.bus.emit('healCast', { id: p.id, targetId: t.id, skillId: sk.id });
      break;
    }
    case 'shield': {
      const t = game.get(c.targetId) || p;
      if (t.alive) t.fx.shield = { v: t.stats.maxHp * sk.shieldPct, t: sk.shieldTime };
      game.bus.emit('shieldCast', { id: p.id, targetId: t.id });
      break;
    }
    case 'cleanse':
      for (const e of friendlies(game)) {
        if (dist2D(e.pos, p.pos) > sk.radius) continue;
        e.fx.bleed = null; e.fx.slow = null;
        e.fx.protect = { v: sk.protect, t: sk.protectTime };
      }
      game.bus.emit('cleanse', { id: p.id, radius: sk.radius });
      break;
  }
}

/** 회복·보호·정화를 지점 주변 아군에게 */
function supportArea(game, p, at, sk) {
  if (!sk.healPct && !sk.shieldPct && !sk.cleanse) return;
  for (const e of friendlies(game)) {
    if (dist2D(e.pos, at) > sk.radius + e.radius) continue;
    if (sk.healPct) heal(game, p, e, e.stats.maxHp * sk.healPct);
    if (sk.shieldPct) e.fx.shield = { v: e.stats.maxHp * sk.shieldPct, t: sk.shieldTime || 6 };
    if (sk.cleanse) { e.fx.bleed = null; e.fx.slow = null; }
  }
  if (sk.fillRes) p.res.value = p.res.max;
}

function linkShot(game, p, sk, marked) {
  const ids = [];
  for (const m of marked) {
    if (!game.lineOfSight(p.pos, m.pos)) continue;
    const n = m.marks.n; m.marks.n = 0;
    ids.push(m.id);
    dealDamage(game, p, m, sk.damage + sk.perMark * n, { skillId: sk.id, weight: 'heavy', stagger: 8 + n * 6 });
  }
  game.bus.emit('link', { id: p.id, targetIds: ids });
  if (marked.length && !ids.length) game.log('표식이 벽에 가려 연결되지 않았습니다.', 'warn');
}

export function addMark(game, m, n) {
  if (!m.alive) return;
  m.marks.n = Math.min(3, m.marks.n + n);
  m.marks.until = game.time + 10;
  game.bus.emit('mark', { targetId: m.id, n: m.marks.n });
}

function addElement(game, p, el) {
  if (p.res.id !== 'elements') return;
  p.res.slots.push(el);
  if (p.res.slots.length > 3) p.res.slots.shift();
  p.res.value = p.res.slots.length;
  p.res.lastGain = game.time;
}

// ───────────────────────── 설치물 ─────────────────────────
export function placeObject(game, p, o) {
  const obj = { id: game.nextId++, ownerId: p.id, ...o, until: game.time + o.duration, nextTick: game.time + (o.tick || 0) };
  game.placed.push(obj);
  game.bus.emit('placed', { ...obj, now: game.time });
  return obj;
}

/** GameState.update 에서 호출 */
export function updatePlaced(game) {
  for (const o of game.placed) {
    if (!o.tick || game.time < o.nextTick) continue;
    o.nextTick += o.tick;
    const owner = game.get(o.ownerId);
    if (!owner) continue;
    const sk = SKILLS[o.skillId];
    const near = game.livingMonsters().filter((m) => dist2D(m.pos, o) <= o.radius + m.radius);
    switch (o.kind) {
      case 'markPost': for (const m of near) addMark(game, m, 1); break;
      case 'fireZone': for (const m of near) dealDamage(game, owner, m, sk.damage, { skillId: sk.id, weight: 'light', noCrit: true }); break;
      case 'frostCrystal': for (const m of near) { dealDamage(game, owner, m, sk.damage, { skillId: sk.id, weight: 'light', noCrit: true }); m.fx.slow = { ...sk.slow }; } break;
      case 'pigmentPool':
        for (const m of near) m.fx.slow = { ...sk.slow };
        for (const e of friendlies(game)) if (dist2D(e.pos, o) <= o.radius + e.radius) heal(game, owner, e, e.stats.maxHp * sk.healPct);
        break;
    }
    game.bus.emit('placedTick', { id: o.id, kind: o.kind });
  }
  const before = game.placed.length;
  game.placed = game.placed.filter((o) => o.until > game.time);
  if (game.placed.length !== before) game.bus.emit('placedChanged', {});
}

/** 방벽이 attacker → target 공격을 막는가: 공격자가 정면 쪽, 대상이 뒤쪽, 폭 안 */
export function wallBlocks(w, from, to) {
  const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
  const sideA = (from.x - w.x) * fx + (from.z - w.z) * fz;
  const sideB = (to.x - w.x) * fx + (to.z - w.z) * fz;
  if (!(sideA > 0 && sideB <= 0.3)) return false;
  return Math.abs((from.x - w.x) * fz - (from.z - w.z) * fx) <= w.width / 2 + 0.5;
}

export { clamp };
