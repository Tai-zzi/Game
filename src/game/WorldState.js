import { relOf, relEvent } from './Relationships.js';
import { BRIDGE_EVENT } from '../data/contracts.js';

/**
 * 상태 세 층 (v0.3 §8.1)
 *  1) 개인 관계  : 캐릭터별 — player.relations { npcId: { trust, tags[] } } (Relations 함수)
 *  2) 지역 공공 상태: 서버·지역별 — PublicState (교역로 다리 결산)
 *  3) 공개 인물의 처지: 서버 공통 — WorldFigures (사전 예고된 공식 사건으로만 바뀜)
 * 지금은 로컬에서 서버 역할을 흉내 낸다. Phase 3에서 서버로 이동.
 */

// ───── 1) 개인 관계 ───── (Relationships.js 로 위임: 친밀도·교감도·반감도·신뢰·기억 태그)
export const Relations = {
  get: (p, npcId) => relOf(p, npcId),
  has: (p, npcId, tag) => relOf(p, npcId).tags.includes(tag),
  tag(game, p, npcId, tag) { relEvent(game, p, npcId, tag); },
  swap(game, p, npcId, remove, add) { const r = relOf(p, npcId); r.tags = r.tags.filter((t) => t !== remove); relEvent(game, p, npcId, add); },
};

// ───── 2) 지역 공공 상태 ─────
export class PublicState {
  constructor(game, saved) {
    this.game = game;
    const b = saved?.bridge;
    this.bridge = {
      state: b?.state || 'broken',
      contrib: { escort: 0, repair: 0, investigate: 0, npc: 0, ...(b?.contrib || {}) },
      supportAcc: 0,
      history: b?.history ? [...b.history] : [{ state: 'broken', at: Date.now() }],
    };
  }

  total() { const c = this.bridge.contrib; return c.escort + c.repair + c.investigate + c.npc; }

  contribute(track, amount, who = 'player') {
    this.bridge.contrib[track] += amount;
    this.game.bus.emit('publicContribution', { track, amount, who, total: this.total() });
    this.evaluate();
  }

  /** NPC 작업조 진행: 인구가 적어도 사건이 멈추지 않게 */
  update(dt) {
    if (this.bridge.state === 'repaired') return;
    this.bridge.supportAcc += dt;
    while (this.bridge.supportAcc >= BRIDGE_EVENT.npcSupportEvery) {
      this.bridge.supportAcc -= BRIDGE_EVENT.npcSupportEvery;
      this.bridge.contrib.npc += 1;
      this.evaluate();
    }
  }

  /** 접속하지 않은 동안의 진행 (벌칙 없음, 상한 있음) */
  applyOffline(seconds) {
    if (this.bridge.state === 'repaired' || !(seconds > 0)) return 0;
    const pts = Math.min(BRIDGE_EVENT.offlineCap, Math.floor(seconds / BRIDGE_EVENT.npcSupportEvery));
    this.bridge.contrib.npc += pts;
    this.evaluate(true);
    return pts;
  }

  evaluate(silent = false) {
    const b = this.bridge, t = this.total();
    let next = b.state;
    if (b.state === 'broken' && t >= BRIDGE_EVENT.stage1At) {
      const repairShare = (b.contrib.repair + b.contrib.npc) / t;
      next = repairShare >= BRIDGE_EVENT.tempBridgeRepairShare ? 'temp_bridge' : 'detour';
    }
    if ((b.state === 'temp_bridge' || b.state === 'detour' || next !== 'broken') && t >= BRIDGE_EVENT.stage2At) next = 'repaired';
    if (next !== b.state) {
      const prev = b.state;
      b.state = next;
      b.history.push({ state: next, at: Date.now() });
      this.game.bus.emit('bridgeState', { prev, state: next, silent });
      if (!silent) this.game.log(`[공공 결산] 교역로: ${BRIDGE_EVENT.states[next].name} — ${BRIDGE_EVENT.states[next].desc}`, 'public');
    }
  }

  /** 다리 상판을 걸을 수 있는가 (여울은 언제나 열려 있음) */
  bridgeWalkable() { return this.bridge.state === 'temp_bridge' || this.bridge.state === 'repaired'; }
  serialize() { return { bridge: { state: this.bridge.state, contrib: { ...this.bridge.contrib }, history: this.bridge.history.slice(-10) } }; }
}

// ───── 3) 공개 인물의 처지 ─────
export const DEFAULT_FIGURES = {
  haila: '하르벤 지부에서 교역로 계약을 감독 중',
  belo: '거점 동쪽 길목에서 호위 계약을 모집 중',
  mora: '거점 진료소에서 부상자를 돌보는 중',
  merchant: '부품값이 올라 장부를 다시 쓰는 중',
};
