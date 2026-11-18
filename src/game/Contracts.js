import { CONTRACTS, BRIDGE_EVENT } from '../data/contracts.js';
import { HARVEN } from '../data/zones.js';
import { RECIPES, ITEMS } from '../data/items.js';
import { dist2D } from '../core/math.js';
import { createCart } from './Entity.js';
import { Relations } from './WorldState.js';

/**
 * 교역로 사건 계약 (개인 진행). 한 번에 하나만 진행하고, 언제든 바꾸거나 포기할 수 있다.
 * player.contracts = { active: { id, step, kills, clues[], cartId, choice } | null, done: { id: 'success'|'partial' } }
 * player.contribs  = { escort, repair, investigate } (경로별 캐릭터 기여 — 한도 적용)
 */
export class ContractSystem {
  constructor(game) { this.game = game; }

  status(p, id) {
    if (p.contracts.done[id] === 'success') return 'done';
    if (p.contracts.active?.id === id) return this.stepDone(p) && this.isLastStep(p) ? 'ready' : 'active';
    return 'available';
  }

  step(p) { const a = p.contracts.active; return a ? CONTRACTS[a.id].steps[a.step] : null; }
  isLastStep(p) { const a = p.contracts.active; return a && a.step === CONTRACTS[a.id].steps.length - 1; }

  /** 진행 표시용 */
  progress(p) {
    const a = p.contracts.active;
    if (!a) return null;
    const c = CONTRACTS[a.id];
    return {
      id: a.id, name: c.name, giver: c.giver,
      steps: c.steps.map((s, i) => ({ label: s.label, state: i < a.step ? 'done' : i === a.step ? 'current' : 'todo', detail: i === a.step ? this.detail(p, s) : '' })),
    };
  }

  detail(p, s) {
    const a = p.contracts.active;
    switch (s.type) {
      case 'killInArea': return `${Math.min(a.kills, s.count)}/${s.count}`;
      case 'escort': {
        const cart = this.game.get(a.cartId);
        if (!cart) return '벨로에게 출발 준비를 알리기';
        return `수레 ${Math.ceil(cart.hp)}/${cart.stats.maxHp} · 경유지 ${cart.waypoint}/${HARVEN.cartRoute.length}`;
      }
      case 'craft': return `${Math.min(p.inventory.brace || 0, s.count)}/${s.count} (목재 판 ${p.inventory.lumber || 0} · 쇠 죔쇠 ${p.inventory.clamp || 0})`;
      case 'deliver': return `${ITEMS[s.item].name} ${p.inventory[s.item] || 0}/${s.count} 소지`;
      case 'clues': return `${a.clues.length}/${s.ids.length}`;
      case 'report': return '공지 방식 선택';
    }
    return '';
  }

  stepDone(p) {
    const a = p.contracts.active, s = this.step(p);
    if (!s) return false;
    switch (s.type) {
      case 'killInArea': return a.kills >= s.count;
      case 'craft': return (p.inventory[s.item] || 0) >= s.count;
      case 'clues': return s.ids.every((id) => a.clues.includes(id));
      default: return false; // escort/deliver/report 는 명시적 행동으로 완료
    }
  }

  advance(p) {
    const a = p.contracts.active;
    while (a && this.stepDone(p) && !this.isLastStep(p)) {
      a.step++;
      this.game.log(`계약 단계: ${this.step(p).label}`, 'quest');
    }
    this.game.bus.emit('contractUpdate', { id: a?.id, step: a?.step });
  }

  accept(p, id) {
    if (p.contracts.active) return '진행 중인 계약을 먼저 바꾸거나 포기하세요';
    if (p.contracts.done[id] === 'success') return '이미 마친 계약입니다';
    p.contracts.active = { id, step: 0, kills: 0, clues: [...(p.records.clues || [])], cartId: null, choice: null };
    this.game.log(`계약 수락: 「${CONTRACTS[id].name}」`, 'quest');
    this.advance(p); // 이미 조건을 채웠다면 (예: 확인한 단서) 바로 다음 단계
    return true;
  }

  /** 포기 비용은 수락 전 안내한 그대로 */
  abandon(p, reasonTag = true) {
    const a = p.contracts.active;
    if (!a) return false;
    const c = CONTRACTS[a.id];
    if (a.cartId) this.game.remove(a.cartId);
    p.contracts.active = null;
    if (reasonTag && a.id === 'escort') Relations.tag(this.game, p, 'belo', '호위_포기');
    if (reasonTag && a.id === 'investigate') Relations.tag(this.game, p, 'haila', '조사_포기');
    this.game.log(`계약 포기: 「${c.name}」 — ${c.terms.abandon}`, 'warn');
    this.game.bus.emit('contractUpdate', { id: a.id, abandoned: true });
    return true;
  }

  switchTo(p, id) {
    this.abandon(p);
    return this.accept(p, id);
  }

  // ───── 진행 훅 ─────
  onKill(p, m) {
    const a = p.contracts.active, s = this.step(p);
    if (!a || s?.type !== 'killInArea') return;
    const area = HARVEN[s.area];
    if (m.tag === 'detour' || dist2D(m.pos, area) <= area.radius) { a.kills++; this.advance(p); }
  }

  onClue(p, clueId) {
    (p.records.clues ||= []);
    if (!p.records.clues.includes(clueId)) p.records.clues.push(clueId);
    const a = p.contracts.active;
    if (a?.id === 'investigate' && !a.clues.includes(clueId)) { a.clues.push(clueId); this.advance(p); }
  }

  onInventory(p) { if (p.contracts.active?.id === 'repair') this.advance(p); }

  /** 호위 2단계 시작: 벨로와의 대화에서 부상자/화물 선택 */
  startEscort(p, choice) {
    const a = p.contracts.active;
    if (a?.id !== 'escort' || this.step(p)?.type !== 'escort' || a.cartId) return false;
    a.choice = choice;
    Relations.tag(this.game, p, 'belo', choice === 'injured' ? '부상자_우선' : '화물_우선');
    const cart = createCart(this.game.nextId++, HARVEN.cartStart);
    if (choice === 'injured') cart.stats.moveSpeed *= 0.8; // 마부 없이 끌어 느리다 (검증 전 예시)
    this.game.add(cart);
    a.cartId = cart.id;
    this.game.log(choice === 'injured' ? '다친 마부를 모라에게 먼저 보냈습니다. 수레는 직접 끕니다.' : '화물을 먼저 싣고 출발합니다. 마부는 걸어서 돌아옵니다.', 'quest');
    this.game.bus.emit('contractUpdate', { id: 'escort' });
    return true;
  }

  /** 수레 이동: 플레이어가 10m 안에 있을 때만 경유지를 따라 움직인다 */
  updateCart(cart, dt) {
    const g = this.game, p = g.player();
    cart.moving = false;
    if (!cart.alive) return;
    const wp = HARVEN.cartRoute[cart.waypoint];
    if (!wp) return;
    if (!p?.alive || dist2D(p.pos, cart.pos) > 10) return;
    const dx = wp.x - cart.pos.x, dz = wp.z - cart.pos.z, d = Math.hypot(dx, dz);
    const step = cart.stats.moveSpeed * dt * (cart.fx.slow ? 1 - cart.fx.slow.v : 1);
    if (d <= step) {
      cart.pos.x = wp.x; cart.pos.z = wp.z; cart.waypoint++;
      if (cart.waypoint >= HARVEN.cartRoute.length) this.finishEscort(p, cart, true);
      else if (cart.waypoint === 3 || cart.waypoint === 5) g.ambush(cart); // 우회로 매복
    } else {
      cart.pos.x += (dx / d) * step; cart.pos.z += (dz / d) * step;
      cart.rot = Math.atan2(dx, dz);
      cart.moving = true;
    }
  }

  onCartDestroyed(cart) {
    const p = this.game.player();
    if (p.contracts.active?.cartId === cart.id) this.finishEscort(p, cart, false);
  }

  finishEscort(p, cart, success) {
    if (success) { this.complete(p, 'escort', 'success'); }
    else {
      // 실패: 기여 절반, 계약은 다시 맡을 수 있다
      const c = CONTRACTS.escort;
      this.addContribution(p, 'escort', Math.round(c.rewards.contribution / 2));
      p.contracts.active = null;
      p.contracts.done.escort = 'partial';
      Relations.tag(this.game, p, 'belo', '호위_실패');
      this.game.log(`수레가 부서졌습니다. ${c.terms.failure}`, 'warn');
      this.game.schedule(3, () => this.game.remove(cart.id));
      this.game.bus.emit('contractUpdate', { id: 'escort', failed: true });
    }
    if (success) this.game.schedule(2, () => this.game.remove(cart.id));
  }

  /** 작업대 조립 (채널 완료 시 호출) */
  craft(p, recipeId) {
    const r = RECIPES[recipeId];
    for (const [k, n] of Object.entries(r.needs)) if ((p.inventory[k] || 0) < n) return `재료가 부족합니다 (목재 판 2 · 쇠 죔쇠 1)`;
    for (const [k, n] of Object.entries(r.needs)) p.inventory[k] -= n;
    this.game.giveItem(p, r.out, r.count);
    return true;
  }

  /** 납품(공공 기여) vs 판매(골드, 기여 없음) — §9.4 순수 납품과 거래 구분 */
  deliver(p, mode) {
    const a = p.contracts.active;
    const have = p.inventory.brace || 0;
    if (mode === 'sell') {
      if (!have) return '팔 부품이 없습니다';
      p.inventory.brace = 0;
      p.gold += have * ITEMS.brace.sell;
      Relations.tag(this.game, p, 'merchant', '판매');
      this.game.log(`보강 부품 ${have}개를 팔았습니다 (+${have * ITEMS.brace.sell} 골드, 공공 기여 없음).`, 'loot');
      this.game.bus.emit('inventory', {});
      return true;
    }
    if (a?.id !== 'repair' || this.step(p)?.type !== 'deliver') return '납품할 계약이 없습니다';
    if (have < 2) return '보강 부품이 2개 필요합니다';
    p.inventory.brace -= 2;
    Relations.tag(this.game, p, 'merchant', '납품', 1);
    this.complete(p, 'repair', 'success');
    return true;
  }

  /** 조사 보고: 공개 공지 / 지부에만 보고 */
  report(p, mode) {
    const a = p.contracts.active;
    if (a?.id !== 'investigate' || this.step(p)?.type !== 'report') return '보고할 조사가 없습니다';
    Relations.tag(this.game, p, 'haila', mode === 'public' ? '공지_공개' : '지부에만_보고', 1);
    this.complete(p, 'investigate', 'success');
    return true;
  }

  addContribution(p, track, amount) {
    const cur = p.contribs[track] || 0;
    const add = Math.max(0, Math.min(amount, BRIDGE_EVENT.personalCap - cur)); // 캐릭터 기여 한도
    p.contribs[track] = cur + add;
    if (add > 0) this.game.publicState.contribute(track, add);
    return add;
  }

  complete(p, id, quality) {
    const c = CONTRACTS[id];
    p.contracts.active = null;
    p.contracts.done[id] = quality;
    const add = this.addContribution(p, c.track, c.rewards.contribution);
    p.gold += c.rewards.gold;
    this.game.log(`계약 완료: 「${c.name}」 (+${c.rewards.gold} 골드, 공공 기여 +${add})`, 'quest');
    p.records.log.push({ at: Date.now(), text: `「${c.name}」 완료` });
    Relations.tag(this.game, p, c.giver, `${id}_완료`); // 약속을 지킴 (신뢰)
    this.game.gainXp(p, c.rewards.xp);
    this.game.bus.emit('contractUpdate', { id, completed: true });
  }
}
