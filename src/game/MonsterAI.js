import { MONSTERS } from '../data/monsters.js';
import { inHub } from '../data/zones.js';
import { dist2D, angleTo } from '../core/math.js';
import { dealDamage, speedMult } from './Combat.js';

const HOME_WANDER = 6;

/**
 * 몬스터 AI: idle(배회) → chase(추적) → attack(예고 후 타격) → return(귀환/회복)
 * - 플레이어와 호송 수레 모두 노린다. 안전 거점(허브) 안으로는 들어오지 않는다.
 * - 공격 예비 동작 시작 시 'telegraph' 이벤트 → 렌더가 바닥 경고 표시.
 */
export class MonsterAI {
  constructor(game) { this.game = game; }

  onDamaged(m, src) {
    if (m.ai.state === 'return') return;
    if (!m.ai.targetId || m.ai.state === 'idle') { m.ai.targetId = src.id; m.ai.state = 'chase'; }
  }

  findTarget(m, range) {
    let best = null, bd = range;
    for (const e of this.game.entities.values()) {
      if ((e.kind !== 'player' && e.kind !== 'cart') || !e.alive || inHub(e.pos.x, e.pos.z)) continue;
      const d = dist2D(e.pos, m.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  update(m, dt) {
    const g = this.game;
    const def = MONSTERS[m.monsterId];
    const ai = m.ai;
    ai.attackCd = Math.max(0, ai.attackCd - dt);
    m.moving = false;
    if (m.stun > 0) { m.stun -= dt; this.cancelWindup(m); return; }
    const homeDist = dist2D(m.pos, m.home);
    const target = g.get(ai.targetId);
    const sm = speedMult(m);

    switch (ai.state) {
      case 'idle': {
        ai.timer -= dt;
        if (ai.wander) { if (this.moveToward(m, ai.wander, def.moveSpeed * sm, dt, 0.2)) ai.wander = null; }
        else if (ai.timer <= 0) {
          const a = g.rng() * Math.PI * 2, r = g.rng() * HOME_WANDER;
          ai.wander = { x: m.home.x + Math.cos(a) * r, z: m.home.z + Math.sin(a) * r };
          ai.timer = 2.5 + g.rng() * 4;
        }
        // 선공 몬스터 또는 호송 수레는 근처에 오면 노린다
        const range = Math.max(def.aggroRange, 0);
        const t = range > 0 ? this.findTarget(m, range) : this.findCart(m, 7);
        if (t) { ai.targetId = t.id; ai.state = 'chase'; g.bus.emit('aggro', { id: m.id, targetId: t.id }); }
        break;
      }
      case 'chase': {
        if (!target?.alive || homeDist > def.leashRange || inHub(target.pos.x, target.pos.z)) { this.startReturn(m); break; }
        const reach = def.attackRange + m.radius + target.radius;
        if (dist2D(m.pos, target.pos) > reach) this.moveToward(m, target.pos, def.chaseSpeed * sm, dt, reach * 0.9);
        else {
          m.rot = angleTo(m.pos, target.pos);
          if (ai.attackCd <= 0) {
            ai.state = 'attack'; ai.windup = def.windup;
            m.anim.action = 'attack'; m.anim.actionSeq++;
            const reachT = def.attackRange + m.radius;
            g.bus.emit('telegraph', { id: m.id, x: m.pos.x + Math.sin(m.rot) * reachT * 0.6, z: m.pos.z + Math.cos(m.rot) * reachT * 0.6, radius: reachT * 0.75, time: def.windup });
          }
        }
        break;
      }
      case 'attack': {
        if (!target?.alive) { this.startReturn(m); break; }
        ai.windup -= dt;
        if (ai.windup <= 0) {
          const reach = def.attackRange + m.radius + target.radius;
          // 예고 방향 판정: 예비 동작 중 피했으면 빗나간다
          if (dist2D(m.pos, target.pos) <= reach * 1.15) dealDamage(g, m, target, 1, { weight: 'medium' });
          else g.bus.emit('miss', { id: m.id });
          ai.attackCd = def.attackCooldown;
          if (ai.state === 'attack') ai.state = 'chase';
        }
        break;
      }
      case 'return': {
        m.hp = Math.min(m.stats.maxHp, m.hp + m.stats.maxHp * 0.5 * dt);
        if (this.moveToward(m, m.home, def.chaseSpeed * 1.2, dt, 0.4)) {
          ai.state = 'idle'; ai.timer = 1 + g.rng() * 2; m.hp = m.stats.maxHp; m.threat.clear();
        }
        break;
      }
    }
  }

  findCart(m, range) {
    for (const e of this.game.entities.values()) if (e.kind === 'cart' && e.alive && dist2D(e.pos, m.pos) < range) return e;
    return null;
  }

  cancelWindup(m) { if (m.ai.state === 'attack') { m.ai.state = 'chase'; m.ai.windup = 0; m.ai.attackCd = 0.6; } }

  startReturn(m) {
    m.ai.state = 'return'; m.ai.targetId = null; m.ai.windup = 0; m.ai.wander = null;
    this.game.bus.emit('leash', { id: m.id });
  }

  moveToward(m, pt, speed, dt, stopDist) {
    const dx = pt.x - m.pos.x, dz = pt.z - m.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopDist) return true;
    if (speed <= 0) return false;
    const step = Math.min(d - stopDist, speed * dt);
    m.pos.x += (dx / d) * step; m.pos.z += (dz / d) * step;
    m.rot = Math.atan2(dx, dz);
    m.moving = true;
    this.game.resolveCollision(m);
    return false;
  }
}
