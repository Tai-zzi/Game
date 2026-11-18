import { HIDDEN_QUESTS } from '../data/hiddenQuests.js';
import { PLACES } from '../data/households.js';
import { relOf, tierAtLeast, relEvent, applyDelta, hardLine } from './Relationships.js';
import { dist2D } from '../core/math.js';

/**
 * 히든 퀘스트 (관계로 열림, v0.3 제안 기준). 목록에 미리 보이지 않는다.
 * p.hidden[id] = { step, status: 'offered' | 'active' | 'done' | 'abandoned' }
 * 실패·포기 가능, 보상은 외형·편의·관계 (전투력 독점 없음).
 */
export class HiddenQuestSystem {
  constructor(game) { this.game = game; this.checkT = 0; }

  unlocked(p, id) {
    const q = HIDDEN_QUESTS[id], u = q.unlock, r = relOf(p, q.npc);
    if (!tierAtLeast(r.aff, u.tier) || r.rap < u.rapport) return false;
    if (u.contract && p.contracts.done[u.contract] !== 'success') return false;
    if (u.bridge && !u.bridge.includes(this.game.publicState.bridge.state)) return false;
    return true;
  }

  /** 조건을 만족하면 '발견' — 인물이 따로 말을 건다 (대화 선택지로 나타남) */
  check(p) {
    for (const id of Object.keys(HIDDEN_QUESTS)) {
      if (p.hidden[id] || !this.unlocked(p, id)) continue;
      p.hidden[id] = { step: 0, status: 'offered' };
      this.game.bus.emit('hiddenDiscovered', { id, npcId: HIDDEN_QUESTS[id].npc, text: HIDDEN_QUESTS[id].discovery });
    }
  }

  step(p, id) { const s = p.hidden[id]; return s ? HIDDEN_QUESTS[id].steps[s.step] : null; }

  accept(p, id) {
    const s = p.hidden[id];
    if (s?.status !== 'offered') return '받을 수 없습니다';
    s.status = 'active';
    this.game.log(`[히든] 「${HIDDEN_QUESTS[id].name}」`, 'quest');
    this.game.bus.emit('hiddenUpdate', { id });
    return true;
  }

  advance(p, id) {
    const s = p.hidden[id];
    s.step++;
    if (s.step >= HIDDEN_QUESTS[id].steps.length) s.status = 'done';
    this.game.bus.emit('hiddenUpdate', { id });
  }

  /** talk 단계: 그 인물과 대화하면 진행 */
  talk(p, id) {
    const st = this.step(p, id);
    if (p.hidden[id]?.status !== 'active' || st?.type !== 'talk') return null;
    this.advance(p, id);
    return st.text;
  }

  /** choice 단계: 선택 결과 (금지선 선택은 거절되고 단계가 남는다) */
  choose(p, id, idx) {
    const st = this.step(p, id), q = HIDDEN_QUESTS[id];
    if (p.hidden[id]?.status !== 'active' || st?.type !== 'choice') return { text: '…' };
    const o = st.options[idx];
    if (!o) return { text: '…' };
    if (o.hardLine) {
      relEvent(this.game, p, q.npc, o.tag, { delta: { rap: 4, anti: 6 } });
      this.game.bus.emit('hardLine', { npcId: q.npc, text: hardLine(q.npc, 'emotion')?.text || '' });
      return { text: o.result, stay: true };
    }
    relEvent(this.game, p, q.npc, o.tag, { delta: o.abandon ? { rap: 2 } : { aff: 10, rap: 8 } });
    for (const [npc, a] of Object.entries(o.also || {})) applyDelta(this.game, p, npc, { aff: a });
    if (o.abandon) { p.hidden[id].status = 'abandoned'; this.game.log(`[히든] 「${q.name}」을(를) 내려놓았습니다. 관계는 그대로입니다.`, 'quest'); }
    else {
      p.hidden[id].status = 'done';
      const rw = q.rewards?.[o.reward];
      if (rw) {
        (p.cosmetics ||= []).includes(o.reward) || p.cosmetics.push(o.reward);
        if (rw.kind === 'title') p.title = rw.name.replace('칭호: ', '');
        this.game.log(`[히든 보상] ${rw.name} — ${rw.desc}`, 'level');
      }
      this.game.bus.emit('hiddenDone', { id, reward: o.reward });
    }
    this.game.bus.emit('hiddenUpdate', { id });
    return { text: o.result };
  }

  abandon(p, id) {
    const s = p.hidden[id];
    if (!s || s.status === 'done') return false;
    s.status = 'abandoned';
    this.game.bus.emit('hiddenUpdate', { id });
    return true;
  }

  inHours(st) {
    if (!st.hours) return true;
    const h = this.game.life.hour, [a, b] = st.hours;
    return a <= b ? h >= a && h < b : h >= a || h < b;
  }

  /** visit 단계: 시간대에 그 장소에 가면 장면이 나온다 */
  update(p, dt) {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    this.check(p);
    for (const [id, s] of Object.entries(p.hidden)) {
      if (s.status !== 'active') continue;
      const st = this.step(p, id);
      if (st?.type !== 'visit' || !this.inHours(st)) continue;
      const pl = PLACES[st.place];
      if (pl && dist2D(p.pos, pl) < 5) {
        this.advance(p, id);
        this.game.bus.emit('hiddenScene', { id, npcId: HIDDEN_QUESTS[id].npc, name: HIDDEN_QUESTS[id].name, lines: st.text });
      }
    }
  }

  /** 일과 덮어쓰기: 만남 단계의 인물은 그 시간에 그 장소로 간다 */
  scheduleOverride(npcId, hour) {
    const p = this.game.player();
    if (!p) return null;
    for (const [id, s] of Object.entries(p.hidden || {})) {
      if (s.status !== 'active') continue;
      const st = this.step(p, id);
      if (st?.type === 'visit' && st.meet === npcId && this.inHours(st)) return { activity: 'social', place: st.place };
    }
    return null;
  }

  /** 진행 표시 (발견 후에만) */
  tracker(p) {
    return Object.entries(p.hidden || {}).filter(([, s]) => s.status === 'active').map(([id, s]) => ({ id, name: HIDDEN_QUESTS[id].name, label: HIDDEN_QUESTS[id].steps[s.step]?.label || '' }));
  }
}
