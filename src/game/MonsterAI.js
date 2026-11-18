import { MONSTERS } from '../data/monsters.js';
import { inHub } from '../data/zones.js';
import { dist2D, angleTo, wrapAngle } from '../core/math.js';
import { dealDamage, speedMult } from './Combat.js';

const HOME_WANDER = 6;

/**
 * 몬스터 AI: idle(배회) → chase(추적) → attack(패턴 예고 → 판정) → return(귀환/회복)
 * - 패턴은 데이터(monsters.js patterns). 예비 동작 동안 'telegraph' 이벤트로 바닥 예고(빨강, 카운터 가능은 파랑 빛).
 * - 판정은 예고 모양 그대로 → 구르기·이동으로 피할 수 있다.
 * - 보스 단계(phases): 체력 기준으로 무력화 확인 단계 → 실패 시 강력한 패턴.
 * - 플레이어와 호송 수레를 노린다. 안전 거점 안으로는 들어오지 않는다.
 */
export class MonsterAI {
  constructor(game) { this.game = game; }

  onDamaged(m, src) {
    if (m.ai.state === 'return') return;
    if (m.ai.state === 'idle') { m.ai.targetId = src.id; m.ai.state = 'chase'; }
    else if (!m.ai.targetId) m.ai.targetId = src.id; // 공격 중에는 상태를 바꾸지 않는다
  }

  findTarget(m, range, cartsOnly = false) {
    let best = null, bd = range;
    for (const e of this.game.entities.values()) {
      if (!e.alive || inHub(e.pos.x, e.pos.z)) continue;
      if (!(e.kind === 'cart' || (!cartsOnly && e.kind === 'player'))) continue;
      const d = dist2D(e.pos, m.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  update(m, dt) {
    const g = this.game, def = MONSTERS[m.monsterId], ai = m.ai;
    for (const k in ai.cd) ai.cd[k] = Math.max(0, ai.cd[k] - dt);
    m.moving = false;
    if (m.stun > 0) { m.stun -= dt; this.cancelWindup(m); return; }
    if (ai.dummy) { m.moving = false; return; }
    const target = g.get(ai.targetId);
    const homeDist = dist2D(m.pos, m.home);
    const sm = speedMult(m);
    this.checkPhases(m, def);

    switch (ai.state) {
      case 'idle': {
        ai.timer -= dt;
        if (ai.wander) { if (this.moveToward(m, ai.wander, def.moveSpeed * sm, dt, 0.2)) ai.wander = null; }
        else if (ai.timer <= 0) {
          const a = g.rng() * Math.PI * 2, r = g.rng() * HOME_WANDER * (m.tier === 'boss' ? 0.4 : 1);
          ai.wander = { x: m.home.x + Math.cos(a) * r, z: m.home.z + Math.sin(a) * r };
          ai.timer = 2.5 + g.rng() * 4;
        }
        const t = def.aggroRange > 0 ? this.findTarget(m, def.aggroRange) : this.findTarget(m, 7, true);
        if (t) { ai.targetId = t.id; ai.state = 'chase'; g.bus.emit('aggro', { id: m.id, targetId: t.id }); }
        break;
      }
      case 'chase': {
        if (!target?.alive || homeDist > def.leashRange || inHub(target.pos.x, target.pos.z)) { this.startReturn(m); break; }
        const d = dist2D(m.pos, target.pos);
        const pat = this.choosePattern(m, def, d, target);
        if (pat) this.beginAttack(m, pat, target);
        else {
          const reach = Math.min(...def.patterns.map((p) => this.reach(p, m))) + target.radius;
          if (d > reach * 0.85) this.moveToward(m, target.pos, def.chaseSpeed * sm, dt, reach * 0.7);
          else m.rot = angleTo(m.pos, target.pos);
        }
        break;
      }
      case 'attack': {
        ai.windup -= dt;
        if (ai.windup <= 0) this.resolveAttack(m, ai.pattern);
        break;
      }
      case 'return': {
        m.hp = Math.min(m.stats.maxHp, m.hp + m.stats.maxHp * 0.5 * dt);
        if (this.moveToward(m, m.home, def.chaseSpeed * 1.2, dt, 0.4)) {
          ai.state = 'idle'; ai.timer = 1 + g.rng() * 2; m.hp = m.stats.maxHp; m.threat.clear();
          if (m.stagger) m.stagger.value = m.stagger.max;
          ai.phaseDone = [];
        }
        break;
      }
    }
  }

  reach(p, m) { return p.shape === 'cone' ? p.range * 0.8 : p.shape === 'line' ? p.length * 0.8 : p.at === 'target' ? (p.maxRange || 6) : p.radius * 0.8 + m.radius; }

  choosePattern(m, def, d, target) {
    const ok = def.patterns.filter((p) => !(m.ai.cd[p.id] > 0) && d >= (p.minRange || 0) && d <= (p.maxRange ?? this.reach(p, m) + target.radius));
    if (!ok.length) return null;
    // 무거운 패턴 우선 (쿨다운이 돌아왔으면)
    ok.sort((a, b) => (b.cooldown || 0) - (a.cooldown || 0));
    return this.game.rng() < 0.7 ? ok[0] : ok[(this.game.rng() * ok.length) | 0];
  }

  beginAttack(m, pat, target) {
    const g = this.game, ai = m.ai;
    m.rot = angleTo(m.pos, target.pos);
    ai.state = 'attack';
    ai.pattern = pat;
    ai.windup = pat.windup * (ai.enraged ? 0.85 : 1);
    ai.cd[pat.id] = pat.cooldown || 2;
    // 예고 모양 확정 (판정도 이 모양으로)
    const tel = { id: m.id, patternId: pat.id, name: pat.name, shape: pat.shape, time: ai.windup, counterable: !!pat.counterable, facing: m.rot };
    if (pat.shape === 'cone') Object.assign(tel, { x: m.pos.x, z: m.pos.z, range: pat.range + m.radius * 0.5, angle: pat.angle });
    else if (pat.shape === 'line') Object.assign(tel, { x: m.pos.x, z: m.pos.z, length: pat.length, width: pat.width });
    else { const at = pat.at === 'target' ? target.pos : m.pos; Object.assign(tel, { x: at.x, z: at.z, radius: pat.radius }); }
    ai.tel = tel;
    m.anim.action = 'attack'; m.anim.actionSeq++;
    g.bus.emit('telegraph', tel);
  }

  resolveAttack(m, pat) {
    const g = this.game, ai = m.ai, tel = ai.tel;
    ai.state = 'chase';
    ai.pattern = null;
    if (pat.dash) { // 덮치기: 예고 지점으로 이동
      const to = pat.shape === 'line' ? { x: tel.x + Math.sin(tel.facing) * pat.length * 0.85, z: tel.z + Math.cos(tel.facing) * pat.length * 0.85 } : { x: tel.x, z: tel.z };
      m.pos.x = to.x; m.pos.z = to.z; g.resolveCollision(m);
    }
    let hit = 0;
    for (const e of g.entities.values()) {
      if (!e.alive || (e.kind !== 'player' && e.kind !== 'cart')) continue;
      if (!this.inShape(tel, e)) continue;
      hit++;
      dealDamage(g, m, e, pat.damage, { weight: pat.weight || 'light', bleed: pat.bleed });
      if (pat.slow) e.fx.slow = { ...pat.slow };
      if (pat.pull && e.alive) { // 실 휘감기: 몬스터 쪽으로 끌어옴
        const a = angleTo(e.pos, m.pos), d = Math.max(0, dist2D(e.pos, m.pos) - m.radius - 1.2);
        const k = Math.min(pat.pull, d);
        e.pos.x += Math.sin(a) * k; e.pos.z += Math.cos(a) * k; g.resolveCollision(e);
      }
    }
    g.bus.emit('patternHit', { id: m.id, patternId: pat.id, shape: tel.shape, x: tel.x, z: tel.z, radius: tel.radius, hits: hit, weight: pat.weight });
    if (!hit) g.bus.emit('miss', { id: m.id });
  }

  inShape(tel, e) {
    const r = e.radius;
    if (tel.shape === 'circle') return Math.hypot(e.pos.x - tel.x, e.pos.z - tel.z) <= tel.radius + r;
    const dx = e.pos.x - tel.x, dz = e.pos.z - tel.z;
    if (tel.shape === 'cone') {
      const d = Math.hypot(dx, dz);
      if (d > tel.range + r) return false;
      return d < 0.8 || Math.abs(wrapAngle(Math.atan2(dx, dz) - tel.facing)) <= tel.angle / 2;
    }
    const fx = Math.sin(tel.facing), fz = Math.cos(tel.facing);
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    return along > -0.5 && along < tel.length + r && side < tel.width / 2 + r;
  }

  /** 보스 단계: 체력 기준. 무력화 확인 — 제한 시간 안에 무력화 못 하면 실패 패턴 */
  checkPhases(m, def) {
    if (!def.phases) return;
    const g = this.game, ai = m.ai;
    for (const [i, ph] of def.phases.entries()) {
      if (ai.phaseDone.includes(i) || m.hp / m.stats.maxHp > ph.at) continue;
      ai.phaseDone.push(i);
      if (ph.kind === 'staggerCheck') {
        ai.enraged = true;
        if (m.stagger) m.stagger.value = m.stagger.max * 0.6; // 깰 수 있을 만큼
        ai.check = { until: g.time + ph.time, fail: ph.fail };
        g.bus.emit('bossPhase', { id: m.id, kind: 'staggerCheck', time: ph.time, text: `${m.name}이(가) 실을 끌어모은다! ${ph.time}초 안에 무력화하세요` });
        g.log(`[경고] ${m.name}이(가) 실을 끌어모은다! 무력화하지 못하면 「${ph.fail.name}」`, 'warn');
      }
    }
    if (ai.check) {
      if (m.groggy > 0) { ai.check = null; g.bus.emit('bossPhase', { id: m.id, kind: 'broken', text: '무력화 성공! 실 폭발이 흩어졌다' }); }
      else if (g.time >= ai.check.until && m.stun <= 0) {
        const fail = ai.check.fail; ai.check = null;
        const t = g.get(ai.targetId) || g.player();
        this.beginAttack(m, fail, t || m);
      }
    }
  }

  cancelWindup(m) {
    if (m.ai.state === 'attack') {
      m.ai.state = 'chase'; m.ai.windup = 0; m.ai.pattern = null;
      this.game.bus.emit('telegraphCancel', { id: m.id });
    }
  }

  startReturn(m) {
    m.ai.state = 'return'; m.ai.targetId = null; m.ai.windup = 0; m.ai.wander = null; m.ai.pattern = null; m.ai.check = null;
    this.game.bus.emit('leash', { id: m.id });
  }

  moveToward(m, pt, speed, dt, stopDist) {
    const dx = pt.x - m.pos.x, dz = pt.z - m.pos.z, d = Math.hypot(dx, dz);
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
