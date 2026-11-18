import { CLOCK, PLACES, NODES, EDGES, ACTIVITIES, SCHEDULES, VILLAGERS, HOUSEHOLDS, JOB_OUTPUT, PAIRS } from '../data/households.js';
import { dist2D } from '../core/math.js';

/**
 * 살아 있는 NPC 시뮬레이션 (순수 로직, 서버 이식 가능).
 * - 하루 시계(게임 하루 = 실제 20분), 일과표 + 욕구(배고픔·휴식·사교·일 만족) 기반 효용 선택
 * - 길 그래프 최단 경로 보행, 직업 활동(애니메이션 힌트), 가족 행동(아이 데려가기, 다친 아이 진료소)
 * - 주민끼리 가까우면 잡담 (말풍선 이벤트)
 * - 성능: 플레이어 근처(40m)만 걸어서 이동, 먼 NPC 는 일과 장소로 바로 이동(값싼 보간)
 * - 접속하지 않은 시간: 시계만 진행하고 일과 위치로 맞춘다 (사망·삭제·감소 없음)
 * NPC 엔티티의 필드: activity { id, anim[], place }, hidden(집 안), busyUntil(대화 정지)
 */
const RATE = 1440 / (CLOCK.realMinutesPerDay * 60); // 실제 1초당 게임 분
const NEAR = 40;
const WALK = 2.3;

/** 그래프: 장소와 교차점 */
const GRAPH = (() => {
  const pts = { ...NODES };
  for (const [k, v] of Object.entries(PLACES)) pts[k] = { x: v.x, z: v.z };
  const adj = {};
  for (const [a, b] of EDGES) { (adj[a] ||= []).push(b); (adj[b] ||= []).push(a); }
  return { pts, adj };
})();

function nearestNode(pos) {
  let best = null, bd = Infinity;
  for (const [k, v] of Object.entries(GRAPH.pts)) { if (!GRAPH.adj[k]) continue; const d = Math.hypot(v.x - pos.x, v.z - pos.z); if (d < bd) { bd = d; best = k; } }
  return best;
}

/** 다익스트라 (작은 그래프) */
export function findPath(fromPos, toKey) {
  const start = nearestNode(fromPos);
  if (!start || !GRAPH.pts[toKey]) return [GRAPH.pts[toKey] || fromPos];
  const dist = { [start]: 0 }, prev = {}, open = new Set([start]);
  while (open.size) {
    let u = null; for (const k of open) if (u === null || dist[k] < dist[u]) u = k;
    open.delete(u);
    if (u === toKey) break;
    for (const v of GRAPH.adj[u] || []) {
      const d = dist[u] + dist2D(GRAPH.pts[u], GRAPH.pts[v]);
      if (d < (dist[v] ?? Infinity)) { dist[v] = d; prev[v] = u; open.add(v); }
    }
  }
  const path = [];
  for (let k = toKey; k; k = prev[k]) { path.unshift({ ...GRAPH.pts[k] }); if (k === start) break; }
  if (!GRAPH.adj[toKey]) path.push({ ...GRAPH.pts[toKey] }); // 그래프 밖 장소 (예: 동쪽 창고)
  return path;
}

export function scheduledAt(npcId, hour) {
  const s = SCHEDULES[npcId];
  if (!s) return null;
  let cur = s[s.length - 1];
  for (const e of s) if (hour >= e[0]) cur = e;
  return { activity: cur[1], place: cur[2] };
}

export class NpcLife {
  constructor(game, saved = null) {
    this.game = game;
    this.minutes = saved?.minutes ?? CLOCK.startHour * 60;
    this.day = saved?.day ?? 1;
    this.world = { herbs: 4, stallStock: 10, ...(saved?.world || {}) };
    this.agents = new Map();
    this.pairs = PAIRS.map((p) => ({ ...p, value: saved?.pairs?.[`${p.a}|${p.b}`] ?? p.value }));
    this.chatT = 0;
    this.decideT = 0;
  }

  get hour() { return (this.minutes % 1440) / 60; }
  get clockText() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  get isNight() { const h = this.hour; return h >= 20 || h < 5.5; }

  /** NPC 엔티티 등록 (GameState.init 에서) */
  register(e) {
    if (!SCHEDULES[e.npcId]) return;
    this.agents.set(e.npcId, {
      id: e.npcId, entityId: e.id,
      needs: { hunger: 30 + Math.random() * 20, rest: 70, social: 50, work: 50 },
      current: null, path: [], hurt: false, follow: null,
    });
    this.snap(e.npcId);
  }

  entity(npcId) { const a = this.agents.get(npcId); return a ? this.game.get(a.entityId) : null; }

  /** 일과 위치로 즉시 맞춤 (원거리·접속 복귀) */
  snap(npcId) {
    const a = this.agents.get(npcId), e = this.entity(npcId);
    if (!a || !e) return;
    const s = scheduledAt(npcId, this.hour);
    const pl = PLACES[s.place];
    a.current = s; a.path = [];
    e.pos.x = pl.x + jitter(npcId).x; e.pos.z = pl.z + jitter(npcId).z;
    this.setActivity(e, s.activity, s.place);
  }

  setActivity(e, activity, place) {
    const def = ACTIVITIES[activity] || {};
    e.activity = { id: activity, name: def.name || activity, anim: def.anim || null, place };
    e.hidden = !!def.hidden;
  }

  /** 대화 중에는 멈추고 플레이어를 바라본다 */
  pause(npcId, seconds = 6) { const e = this.entity(npcId); if (e) e.busyUntil = this.game.time + seconds; }

  /** 접속하지 않은 동안: 시계만 진행, 위치는 일과에 맞춤 (벌칙 없음) */
  advanceOffline(seconds) {
    if (!(seconds > 0)) return;
    const add = Math.min(seconds * RATE, 1440 * 7);
    const before = this.minutes;
    this.minutes += add;
    this.day += Math.floor(this.minutes / 1440) - Math.floor(before / 1440);
    for (const id of this.agents.keys()) this.snap(id);
  }

  update(dt) {
    const g = this.game;
    const prevDay = Math.floor(this.minutes / 1440);
    this.minutes += dt * RATE;
    if (Math.floor(this.minutes / 1440) !== prevDay) { this.day++; g.bus.emit('newDay', { day: this.day }); }
    const gm = dt * RATE; // 이번 프레임의 게임 분
    const player = g.player();
    this.decideT -= dt;
    const decide = this.decideT <= 0;
    if (decide) this.decideT = 1.0;
    for (const a of this.agents.values()) {
      const e = this.entity(a.id);
      if (!e) continue;
      this.updateNeeds(a, e, gm);
      if (decide) this.decide(a, e);
      const near = player && dist2D(player.pos, e.pos) < NEAR;
      if (e.busyUntil > g.time) { e.moving = false; continue; }
      if (a.path.length) {
        if (!near) { const last = a.path[a.path.length - 1]; e.pos.x = last.x; e.pos.z = last.z; a.path = []; }
        else this.walk(a, e, dt);
        if (!a.path.length) this.arrive(a, e);
      } else e.moving = false;
      if (a.follow) this.followUpdate(a, e, dt, near);
    }
    this.chat(dt);
  }

  updateNeeds(a, e, gm) {
    const n = a.needs, act = e.activity?.id;
    n.hunger = Math.min(100, n.hunger + gm * 0.06);
    n.rest = act === 'sleep' ? Math.min(100, n.rest + gm * 0.2) : Math.max(0, n.rest - gm * 0.05);
    n.social = act === 'social' || act === 'eat' ? Math.min(100, n.social + gm * 0.3) : Math.max(0, n.social - gm * 0.03);
    if (act === 'eat') n.hunger = Math.max(0, n.hunger - gm * 1.2);
    const job = JOB_OUTPUT[act];
    if (job && !e.hidden && !a.path.length) {
      n.work = Math.min(100, n.work + gm * 0.1);
      const w = this.world;
      const cap = act === 'restock' ? this.stallCap() : job.max;
      w[job.stat] = Math.min(cap, (w[job.stat] || 0) + (job.perHour / 60) * gm);
    }
  }

  stallCap() { const s = this.game.publicState?.bridge.state; return s === 'repaired' ? 24 : s === 'broken' ? 10 : 16; }

  /** 효용 선택: 일과(기본) vs 배고픔·피로·외로움 (허용된 시간대에만 벗어남) */
  decide(a, e) {
    const h = this.hour;
    let want = scheduledAt(a.id, h);
    const n = a.needs, sched = want.activity;
    const free = !['sleep', 'home'].includes(sched);
    const scores = [{ s: 1.0, act: want }];
    if (free && n.hunger > 80) scores.push({ s: n.hunger / 70, act: { activity: 'eat', place: 'commons' } });
    if (free && n.rest < 12 && h > 15) scores.push({ s: 1.4, act: { activity: 'home', place: this.homeOf(a.id) } });
    if (free && n.social < 15 && h > 16) scores.push({ s: 1.1, act: { activity: 'social', place: 'commons' } });
    // 히든 퀘스트: 밤에 훈련장 (벨로) 등 일과 덮어쓰기
    const ov = this.game.hidden?.scheduleOverride(a.id, h);
    if (ov) scores.push({ s: 9, act: ov });
    // 다친 아이 → 보호자가 진료소로
    if (a.clinicVisit) scores.push({ s: 5, act: { activity: 'visit_clinic', place: 'clinic' } });
    scores.sort((x, y) => y.s - x.s);
    want = scores[0].act;
    if (a.current && a.current.activity === want.activity && a.current.place === want.place) return;
    this.goTo(a, e, want);
  }

  goTo(a, e, want) {
    a.current = want;
    const pl = PLACES[want.place];
    if (!pl) return;
    a.path = findPath(e.pos, want.place).concat([{ x: pl.x + jitter(a.id).x, z: pl.z + jitter(a.id).z }]);
    this.setActivity(e, 'walk', want.place);
    e.hidden = false;
    // 가족: 저녁 귀가 시 보호자가 아이를 데려간다
    const hh = HOUSEHOLDS[VILLAGERS[a.id]?.household || this.householdOf(a.id)];
    if (hh && (want.activity === 'home' || want.activity === 'sleep') && hh.members[0] === a.id) {
      for (const m of hh.members) {
        const ca = this.agents.get(m);
        if (VILLAGERS[m]?.child && ca && !this.entity(m)?.hidden) {
          ca.follow = a.id;
          this.game.bus.emit('npcBubble', { id: e.id, text: `${VILLAGERS[m].name.split(' ')[0]}, 들어가자!` });
        }
      }
    }
  }

  householdOf(npcId) { return Object.entries(HOUSEHOLDS).find(([, h]) => h.members.includes(npcId))?.[0]; }
  homeOf(npcId) { const hh = HOUSEHOLDS[this.householdOf(npcId)]; return hh?.home || SCHEDULES[npcId]?.[0][2]; }

  walk(a, e, dt) {
    const t = a.path[0];
    const dx = t.x - e.pos.x, dz = t.z - e.pos.z, d = Math.hypot(dx, dz);
    const step = WALK * dt * (VILLAGERS[a.id]?.child ? 1.15 : 1);
    if (d <= step) { e.pos.x = t.x; e.pos.z = t.z; a.path.shift(); }
    else { e.pos.x += (dx / d) * step; e.pos.z += (dz / d) * step; e.rot = Math.atan2(dx, dz); }
    e.moving = true;
  }

  arrive(a, e) {
    e.moving = false;
    this.setActivity(e, a.current.activity, a.current.place);
    if (a.current.activity === 'visit_clinic') { a.clinicVisit = false; this.treatHurt(a); }
    // 아이: 놀다가 넘어짐 (하루 한 번 15%) → 보호자가 진료소로
    if (a.current.activity === 'play' && VILLAGERS[a.id]?.child && a.hurtDay !== this.day && this.game.rng() < 0.15) {
      a.hurtDay = this.day; a.hurt = true;
      this.game.bus.emit('npcBubble', { id: e.id, text: '아야… 무릎 까졌어…' });
      const guardian = HOUSEHOLDS[VILLAGERS[a.id].household].members.find((m) => m !== a.id && this.agents.get(m));
      const ga = this.agents.get(guardian);
      if (ga) { ga.clinicVisit = true; ga.decideNow = true; a.follow = guardian; }
      this.game.bus.emit('familyEvent', { kind: 'childHurt', child: a.id, guardian });
    }
  }

  treatHurt(guardianAgent) {
    for (const a of this.agents.values()) if (a.hurt && a.follow === guardianAgent.id) {
      a.hurt = false; a.follow = null;
      const mora = this.entity('mora');
      if (mora && !mora.hidden) this.game.bus.emit('npcBubble', { id: mora.id, text: '괜찮아요, 금방 나아요. 아픈 건 아프다고 말해도 돼요.' });
      this.game.bus.emit('familyEvent', { kind: 'childTreated', child: a.id });
    }
  }

  followUpdate(a, e, dt, near) {
    const leader = this.entity(a.follow);
    if (!leader) { a.follow = null; return; }
    if (leader.hidden) { e.pos.x = leader.pos.x; e.pos.z = leader.pos.z; this.setActivity(e, leader.activity.id, leader.activity.place); a.follow = a.hurt ? a.follow : null; return; }
    const d = dist2D(e.pos, leader.pos);
    a.path = [];
    if (d > 1.4) {
      if (!near) { e.pos.x = leader.pos.x + 0.8; e.pos.z = leader.pos.z; return; }
      const step = Math.min(d - 1.2, WALK * 1.2 * dt);
      e.pos.x += ((leader.pos.x - e.pos.x) / d) * step; e.pos.z += ((leader.pos.z - e.pos.z) / d) * step;
      e.rot = Math.atan2(leader.pos.x - e.pos.x, leader.pos.z - e.pos.z);
      e.moving = true;
      this.setActivity(e, 'walk', leader.activity?.place);
    } else e.moving = false;
  }

  /** 주민끼리 가까우면 잡담 (말풍선) */
  chat(dt) {
    this.chatT -= dt;
    if (this.chatT > 0) return;
    this.chatT = 6;
    const player = this.game.player();
    for (const pair of this.pairs) {
      const a = this.entity(pair.a), b = this.entity(pair.b);
      if (!a || !b || a.hidden || b.hidden || a.moving || b.moving) continue;
      if (dist2D(a.pos, b.pos) > 4.5 || (player && dist2D(player.pos, a.pos) > 30)) continue;
      if (this.game.rng() > 0.5) continue;
      const [la, lb] = pair.lines[(this.game.rng() * pair.lines.length) | 0];
      this.game.bus.emit('npcBubble', { id: a.id, text: la });
      this.game.schedule(2.2, () => this.game.bus.emit('npcBubble', { id: b.id, text: lb }));
      pair.value = Math.min(100, pair.value + 0.5);
      return;
    }
  }

  /** 지금 이 NPC 는 어디서 무엇을 하나 (인연 창·지도용) */
  whereIs(npcId) {
    const e = this.entity(npcId);
    if (!e) return null;
    const pl = PLACES[e.activity?.place];
    return { x: e.pos.x, z: e.pos.z, place: pl?.name || '', activity: e.activity?.name || '', hidden: e.hidden };
  }

  serialize() {
    return { minutes: Math.round(this.minutes), day: this.day, world: { ...this.world }, pairs: Object.fromEntries(this.pairs.map((p) => [`${p.a}|${p.b}`, Math.round(p.value)])) };
  }
}

/** 같은 장소에 겹치지 않게 NPC 마다 조금씩 다른 자리 */
function jitter(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return { x: ((h & 7) - 3.5) * 0.45, z: (((h >> 3) & 7) - 3.5) * 0.45 }; }

export const RATE_PER_SEC = RATE;
