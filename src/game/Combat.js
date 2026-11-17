import { SKILLS } from '../data/skills.js';
import { MONSTERS } from '../data/monsters.js';
import { dist2D, angleTo, wrapAngle, clamp } from '../core/math.js';
import { gainResource } from './Resources.js';

/**
 * 전투 규칙 (서버 권위 지점). 모든 피해·회복은 이 파일의 함수를 거친다.
 * 기술은 windup(예비 동작) 뒤 strike(판정)에서 효과가 적용된다.
 */

const friendly = (e) => e && (e.kind === 'player' || e.kind === 'cart');

export function dealDamage(game, src, tgt, mult, opts = {}) {
  if (!tgt?.alive || !src) return 0;
  const fx = tgt.fx;
  if (fx.iframes > 0) { game.bus.emit('evade', { targetId: tgt.id }); return 0; }
  // 성벽 전개: 방벽 정면에서 오는 공격 차단
  if (src.kind === 'monster' && friendly(tgt)) {
    for (const w of game.walls) if (wallBlocks(w, src.pos, tgt.pos)) { game.bus.emit('blocked', { targetId: tgt.id, by: 'wall', wallId: w.id }); return 0; }
  }
  let atk = src.stats.atk * mult;
  const crit = !opts.noCrit && game.rng() < (src.stats.critChance || 0);
  let dmg = atk * (0.9 + game.rng() * 0.2) * (crit ? 1.6 : 1) - tgt.stats.def * 0.5;
  dmg = Math.max(1, dmg);
  let blocked = false;
  // 방패 세우기: 정면만 막는다
  if (fx.block > 0 && Math.abs(wrapAngle(angleTo(tgt.pos, src.pos) - tgt.rot)) <= SKILLS.g_shield.arc / 2) {
    dmg *= 1 - SKILLS.g_shield.reduce;
    blocked = true;
    gainResource(game, tgt, SKILLS.g_shield.gainPerBlock);
    tgt.res.counterUntil = game.time + 2;
  }
  if (fx.guard) dmg *= 1 - fx.guard.v;
  if (fx.protect) dmg *= 1 - fx.protect.v;
  dmg = Math.max(1, Math.round(dmg));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  tgt.anim.hitSeq++;
  if (src.kind === 'player') src.lastCombat = game.time;
  if (tgt.kind === 'player') { tgt.lastCombat = game.time; interrupt(game, tgt); }
  if (tgt.kind === 'monster') {
    tgt.threat.set(src.id, (tgt.threat.get(src.id) || 0) + dmg);
    game.ai.onDamaged(tgt, src);
  }
  // 몬스터 부가 효과 (늑대의 찢김)
  if (src.kind === 'monster' && friendly(tgt) && !blocked) {
    const b = MONSTERS[src.monsterId].onHit?.bleed;
    if (b) fx.bleed = { dps: tgt.stats.maxHp * b.dpsPct, t: b.time, srcId: src.id };
  }
  game.bus.emit('damage', { sourceId: src.id, targetId: tgt.id, amount: dmg, crit, blocked, skillId: opts.skillId || null, weight: opts.weight || 'light' });
  if (tgt.hp <= 0) game.kill(tgt, src);
  return dmg;
}

export function heal(game, src, tgt, amount) {
  if (!tgt?.alive) return 0;
  const before = tgt.hp;
  tgt.hp = Math.min(tgt.stats.maxHp, tgt.hp + amount);
  const v = Math.round(tgt.hp - before);
  if (v > 0) game.bus.emit('heal', { sourceId: src?.id ?? null, targetId: tgt.id, amount: v });
  return v;
}

/** 예비 동작 중 피격 → 끊김 (interruptible 기술만, 비용·쿨다운 환불). 채집·조사도 끊긴다 */
function interrupt(game, p) {
  if (p.channel) { game.bus.emit('channelBreak', { id: p.id, kind: p.channel.kind }); p.channel = null; }
  const c = p.cast;
  if (!c || c.struck) return;
  const sk = SKILLS[c.skillId];
  if (!sk.interruptible) return;
  p.cast = null;
  p.actionLock = 0;
  p.cooldowns[sk.id] = 0;
  if (c.paid) gainResource(game, p, c.paid, { refund: true });
  game.bus.emit('interrupt', { id: p.id, skillId: sk.id });
  game.log(`${sk.name}이(가) 끊겼습니다.`, 'warn');
}

/** 상태 효과 갱신 */
export function updateEffects(game, e, dt) {
  const fx = e.fx;
  for (const k of ['block', 'iframes', 'root']) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
  for (const k of ['guard', 'protect', 'slow']) if (fx[k]) { fx[k].t -= dt; if (fx[k].t <= 0) fx[k] = null; }
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

// ───────────────────────── 기술 사용 ─────────────────────────

function nearest(list, point, maxD) {
  let best = null, bd = maxD;
  for (const m of list) { const d = dist2D(m.pos, point); if (d < bd) { bd = d; best = m; } }
  return best;
}
function inArc(src, tgt, facing, range, arc) {
  const d = dist2D(src.pos, tgt.pos);
  if (d > range + tgt.radius) return false;
  return d < 0.6 || Math.abs(wrapAngle(angleTo(src.pos, tgt.pos) - facing)) <= arc / 2;
}
/** 대상 고르기: 커서 근처 → 현재 대상 → 가장 가까운 적 */
function pickEnemy(game, p, range, aim) {
  const cands = game.livingMonsters().filter((m) => dist2D(p.pos, m.pos) <= range + m.radius);
  const t = game.get(p.targetId);
  return (aim && nearest(cands, aim, 3)) || (t?.kind === 'monster' && cands.includes(t) ? t : null) || nearest(cands, p.pos, Infinity);
}

/**
 * slot: basic | q | w | e | dodge. 반환 true 또는 실패 사유.
 */
export function useSkill(game, p, slot, aim) {
  const skillId = p.skills[slot];
  const sk = SKILLS[skillId];
  if (!sk) return '알 수 없는 기술';
  if (!p.alive) return '쓰러진 상태입니다';
  if (p.stun > 0) return '움직일 수 없습니다';
  if (p.actionLock > 0 && slot !== 'dodge') return 'busy'; // 구르기는 언제든 (동작 취소)
  if ((p.cooldowns[skillId] || 0) > 0) return '아직 준비되지 않았습니다';
  if (sk.cost && p.res.value < sk.cost) return `${p.res.id === 'pigment' ? '안료' : '결의'}가 부족합니다 (${sk.cost} 필요)`;

  let facing = p.rot;
  if (aim && Math.hypot(aim.x - p.pos.x, aim.z - p.pos.z) > 0.3) facing = angleTo(p.pos, aim);
  const cast = { skillId, slot, aim: aim ? { x: aim.x, z: aim.z } : null, facing, targetId: null, struck: false, paid: 0 };

  // 기술별 사전 검증 + 대상 결정
  switch (sk.type) {
    case 'melee': {
      const t = game.get(p.targetId);
      let target = t?.kind === 'monster' && t.alive && dist2D(p.pos, t.pos) <= sk.range + t.radius + 0.3 ? t : null;
      if (!target) target = nearest(game.livingMonsters().filter((m) => inArc(p, m, facing, sk.range + 0.6, sk.arc + 0.6)), p.pos, Infinity);
      if (target) { cast.targetId = target.id; cast.facing = angleTo(p.pos, target.pos); }
      break;
    }
    case 'projectile': {
      const target = pickEnemy(game, p, sk.range, aim);
      if (target) { cast.targetId = target.id; cast.facing = angleTo(p.pos, target.pos); }
      break;
    }
    case 'link': {
      const marked = game.livingMonsters().filter((m) => m.marks.n > 0 && dist2D(p.pos, m.pos) <= sk.range);
      if (!marked.length) return '사거리 안에 표식이 남은 적이 없습니다';
      break;
    }
    case 'escort': {
      const ally = nearest([...game.entities.values()].filter((e) => e.kind === 'cart' && e.alive), p.pos, sk.range);
      if (!ally) return '곁으로 갈 보호 대상이 없습니다 (호송 중인 수레 등)';
      cast.targetId = ally.id;
      break;
    }
    case 'complete':
      if (!p.res.slots.length) return '원소식이 비어 있습니다 (불씨·서리선으로 채우세요)';
      break;
    case 'heal': {
      const t = game.get(p.targetId);
      let target = friendly(t) && t.alive && dist2D(p.pos, t.pos) <= sk.range ? t : null;
      if (!target) {
        const carts = [...game.entities.values()].filter((e) => e.kind === 'cart' && e.alive && e.hp < e.stats.maxHp && dist2D(p.pos, e.pos) <= sk.range);
        target = carts.length && p.hp / p.stats.maxHp > 0.6 ? carts[0] : p;
      }
      cast.targetId = target.id;
      break;
    }
  }

  // 사용 확정
  p.cooldowns[skillId] = sk.cooldown;
  if (sk.cost) { p.res.value -= sk.cost; cast.paid = sk.cost; }
  p.rot = cast.facing;
  p.move.target = null;
  p.anim.action = skillId; p.anim.actionSeq++;
  if (cast.targetId && game.get(cast.targetId)?.kind === 'monster') p.targetId = cast.targetId;
  p.cast = cast;
  p.cast.strikeAt = game.time + sk.windup;
  p.actionLock = sk.windup + sk.recovery;
  game.bus.emit('skillCast', { id: p.id, skillId, slot, targetId: cast.targetId, facing: cast.facing, windup: sk.windup });
  if (sk.windup <= 0) strike(game, p);
  return true;
}

/** GameState.update 에서 매 프레임 호출: windup 이 끝나면 판정 */
export function updateCast(game, p) {
  if (p.cast && !p.cast.struck && game.time >= p.cast.strikeAt) strike(game, p);
  if (p.cast?.struck && p.actionLock <= 0) p.cast = null;
}

function strike(game, p) {
  const c = p.cast;
  c.struck = true;
  const sk = SKILLS[c.skillId];
  const moveMult = p.classId === 'elementalist' && game.time - p.lastMoveT < 0.4 ? 0.75 : 1; // 이동 중 출력 감소 (약점)
  const emitStrike = (extra = {}) => game.bus.emit('skillStrike', { id: p.id, skillId: sk.id, facing: c.facing, weight: sk.weight || 'light', ...extra });

  switch (sk.type) {
    case 'dodge': {
      let dx = p.move.dir.x, dz = p.move.dir.z;
      if (!dx && !dz) { dx = Math.sin(c.facing); dz = Math.cos(c.facing); }
      const l = Math.hypot(dx, dz);
      p.fx.dash = { vx: (dx / l) * sk.distance / sk.duration, vz: (dz / l) * sk.distance / sk.duration, t: sk.duration };
      p.fx.iframes = sk.iframes;
      p.rot = Math.atan2(dx, dz);
      p.attackTargetId = null;
      p.channel = null;
      emitStrike();
      break;
    }
    case 'melee': {
      const t = game.get(c.targetId);
      if (t?.alive && dist2D(p.pos, t.pos) <= sk.range + t.radius + 0.8) {
        let mult = sk.damage;
        if (p.classId === 'guardian' && game.time <= p.res.counterUntil && p.res.value >= 20) { // 반격 (검증 전 예시)
          mult *= 2; p.res.value -= 20; p.res.counterUntil = -99;
          game.bus.emit('counter', { id: p.id, targetId: t.id });
        }
        dealDamage(game, p, t, mult, { skillId: sk.id, weight: mult > sk.damage ? 'heavy' : sk.weight });
        if (sk.gain) gainResource(game, p, sk.gain);
      }
      emitStrike({ targetId: c.targetId });
      break;
    }
    case 'projectile': {
      const t = game.get(c.targetId);
      const from = { x: p.pos.x, z: p.pos.z };
      if (!t?.alive) {
        const to = c.aim || { x: p.pos.x + Math.sin(c.facing) * sk.range, z: p.pos.z + Math.cos(c.facing) * sk.range };
        game.bus.emit('projectile', { id: p.id, skillId: sk.id, from, to, speed: sk.speed });
        break;
      }
      const d = dist2D(p.pos, t.pos);
      let mult = sk.damage * moveMult;
      if (sk.closeMult) { const near = nearest(game.livingMonsters(), p.pos, sk.closeRange); if (near) mult *= sk.closeMult; }
      game.bus.emit('projectile', { id: p.id, skillId: sk.id, from, targetId: t.id, speed: sk.speed });
      game.schedule(d / sk.speed, () => {
        if (!t.alive) return;
        dealDamage(game, p, t, mult, { skillId: sk.id, weight: sk.weight });
        if (sk.addMark) { t.marks.n = Math.min(3, t.marks.n + sk.addMark); t.marks.until = game.time + 10; game.bus.emit('mark', { targetId: t.id, n: t.marks.n }); }
        if (sk.element) addElement(game, p, sk.element);
      });
      emitStrike({ targetId: t.id });
      break;
    }
    case 'link': {
      const marked = game.livingMonsters().filter((m) => m.marks.n > 0 && dist2D(p.pos, m.pos) <= sk.range && game.lineOfSight(p.pos, m.pos));
      const ids = [];
      for (const m of marked) {
        const n = m.marks.n; m.marks.n = 0;
        ids.push(m.id);
        dealDamage(game, p, m, sk.damage + sk.perMark * n, { skillId: sk.id, weight: 'heavy' });
      }
      game.bus.emit('link', { id: p.id, targetIds: ids });
      if (!ids.length) game.log('표식이 벽에 가려 연결되지 않았습니다.', 'warn');
      emitStrike();
      break;
    }
    case 'blink': {
      const to = c.aim || { x: p.pos.x + Math.sin(c.facing) * sk.distance, z: p.pos.z + Math.cos(c.facing) * sk.distance };
      const dx = to.x - p.pos.x, dz = to.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
      const k = Math.min(sk.distance, l) / l;
      const from = { ...p.pos };
      p.pos.x += dx * k; p.pos.z += dz * k;
      game.resolveCollision(p);
      p.fx.iframes = Math.max(p.fx.iframes, 0.15);
      game.bus.emit('blink', { id: p.id, from, to: { ...p.pos } });
      break;
    }
    case 'block':
      p.fx.block = sk.duration;
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
      game.bus.emit('blink', { id: p.id, from, to: { ...p.pos }, escort: true, allyId: ally.id });
      break;
    }
    case 'wall': {
      const w = { id: game.nextId++, x: p.pos.x + Math.sin(c.facing) * sk.offset, z: p.pos.z + Math.cos(c.facing) * sk.offset,
        facing: c.facing, width: sk.width, until: game.time + sk.duration, ownerId: p.id };
      game.walls.push(w);
      game.bus.emit('wall', { ...w });
      emitStrike();
      break;
    }
    case 'line': {
      const fx = Math.sin(c.facing), fz = Math.cos(c.facing);
      for (const m of game.livingMonsters()) {
        const rx = m.pos.x - p.pos.x, rz = m.pos.z - p.pos.z;
        const along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
        if (along > -0.5 && along < sk.length && side < sk.width / 2 + m.radius) {
          dealDamage(game, p, m, sk.damage * moveMult, { skillId: sk.id, weight: sk.weight });
          m.fx.slow = { v: sk.slow, t: sk.slowTime };
        }
      }
      addElement(game, p, sk.element);
      emitStrike({ length: sk.length });
      break;
    }
    case 'complete': {
      const slots = p.res.slots.slice();
      p.res.slots = []; p.res.value = 0;
      const n = slots.length;
      const same = slots.every((s) => s === slots[0]);
      if (same && n >= 2) {
        // 같은 원소 연속 → 단일 집중
        const t = pickEnemy(game, p, sk.range, c.aim);
        if (t) {
          dealDamage(game, p, t, (1.0 + 1.1 * n) * moveMult, { skillId: sk.id, weight: 'heavy' });
          if (slots[0] === 'frost' && t.alive) t.fx.root = 2;
        }
        game.bus.emit('complete', { id: p.id, mode: 'focus', element: slots[0], n, targetId: t?.id ?? null });
      } else {
        // 섞인 조합(또는 한 칸) → 범위와 둔화
        const at = clampToRange(p.pos, c.aim || p.pos, sk.range);
        for (const m of game.livingMonsters()) {
          if (dist2D(m.pos, at) <= sk.radius + m.radius) {
            dealDamage(game, p, m, (0.7 + 0.5 * n) * moveMult, { skillId: sk.id, weight: 'heavy' });
            m.fx.slow = { v: 0.4, t: 2.5 };
          }
        }
        game.bus.emit('complete', { id: p.id, mode: 'spread', elements: slots, n, at });
      }
      emitStrike();
      break;
    }
    case 'heal': {
      const t = game.get(c.targetId) || p;
      if (t.alive) t.fx.hot = { perSec: (t.stats.maxHp * sk.hotPct) / sk.hotTime, t: sk.hotTime, acc: 0 };
      game.bus.emit('healCast', { id: p.id, targetId: t.id, skillId: sk.id });
      break;
    }
    case 'healArea': {
      const at = clampToRange(p.pos, c.aim || p.pos, sk.range);
      for (const e of game.entities.values()) {
        if (!e.alive || dist2D(e.pos, at) > sk.radius + e.radius) continue;
        if (friendly(e)) heal(game, p, e, e.stats.maxHp * sk.healPct);
        else if (e.kind === 'monster') dealDamage(game, p, e, sk.damage, { skillId: sk.id, weight: sk.weight });
      }
      game.bus.emit('healArea', { id: p.id, at, radius: sk.radius });
      break;
    }
    case 'cleanse': {
      for (const e of game.entities.values()) {
        if (!friendly(e) || !e.alive || dist2D(e.pos, p.pos) > sk.radius) continue;
        e.fx.bleed = null; e.fx.slow = null;
        e.fx.protect = { v: sk.protect, t: sk.protectTime };
      }
      game.bus.emit('cleanse', { id: p.id, radius: sk.radius });
      break;
    }
  }
}

function addElement(game, p, el) {
  if (p.res.id !== 'elements') return;
  p.res.slots.push(el);
  if (p.res.slots.length > 3) p.res.slots.shift();
  p.res.value = p.res.slots.length;
  p.res.lastGain = game.time;
}

function clampToRange(from, to, range) {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz);
  if (l <= range) return { x: to.x, z: to.z };
  return { x: from.x + (dx / l) * range, z: from.z + (dz / l) * range };
}

/** 방벽이 attacker → target 공격을 막는가: 공격자가 방벽 정면 쪽, 대상이 뒤쪽, 폭 안 */
export function wallBlocks(w, from, to) {
  const fx = Math.sin(w.facing), fz = Math.cos(w.facing);
  const sideA = (from.x - w.x) * fx + (from.z - w.z) * fz;
  const sideB = (to.x - w.x) * fx + (to.z - w.z) * fz;
  if (!(sideA > 0 && sideB <= 0.3)) return false;
  const lat = Math.abs((from.x - w.x) * fz - (from.z - w.z) * fx);
  return lat <= w.width / 2 + 0.5;
}

export { clamp };
