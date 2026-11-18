import { AFFINITY, AFF_TIERS, ANTI_TIERS, GIFT_RULES, DISCOUNTS, NPCS } from '../data/npcs.js';
import { VILLAGER_HELP } from '../data/households.js';
import { ITEMS } from '../data/items.js';
import { clamp } from '../core/math.js';

/**
 * 개인 관계 (캐릭터별, v0.3 §8 첫 번째 층). 순수 로직.
 *  친밀도 aff 0~100 · 교감도 rap 0~100 · 반감도 anti 0~100 (친밀도와 별개 → 애증 가능)
 *  신뢰 = 지킨 약속 ×12 − 어긴 약속 ×20 (−100~100)
 *  기분: 오늘의 운(게임 날짜·인물로 결정) + 욕구 → 어조만 바꾼다. 신념·금지선·필수 기능은 기분과 무관.
 * 원칙: 필수 기능(교육·필수 상점·귀환·기본 의뢰)은 어떤 관계에서도 막지 않는다. 접속하지 않아도 값이 줄지 않는다.
 */
export function relOf(p, npcId) {
  const r = (p.relations[npcId] ||= {});
  r.aff ??= 0; r.rap ??= 0; r.anti ??= 0; r.kept ??= 0; r.broken ??= 0;
  r.tags ??= []; r.mem ??= []; r.gifts ??= { day: -1, n: 0, per: {} }; r.known ??= []; r.daily ??= {};
  return r;
}

export const trustOf = (r) => clamp(r.kept * 12 - r.broken * 20, -100, 100);
export const affTier = (aff) => AFF_TIERS.find(([min]) => aff >= min)[1];
export const antiTier = (anti) => ANTI_TIERS.find(([min]) => anti >= min)?.[1] || null;
const TIER_ORDER = ['낯섦', '안면', '호의', '신뢰', '각별'];
export const tierAtLeast = (aff, tier) => TIER_ORDER.indexOf(affTier(aff)) >= TIER_ORDER.indexOf(tier);

/** 기억 태그 기록 + 변화 적용. 같은 태그는 기억이 한 번만 쌓이고 수치도 한 번만 오른다 (반복 착취 방지) */
export function relEvent(game, p, npcId, tag, { delta = null, repeatable = false, silent = false, propagate = true } = {}) {
  const r = relOf(p, npcId);
  const def = AFFINITY[npcId]?.events?.[tag] || delta || { aff: 1, rap: 1 };
  const first = !r.tags.includes(tag);
  if (!first && !repeatable && !delta) return r;
  if (first) r.tags.push(tag);
  r.mem.unshift({ tag, day: game.life?.day ?? 0 });
  r.mem.length = Math.min(r.mem.length, 12);
  applyDelta(game, p, npcId, def, { silent, reason: tag });
  if (def.promise === 'kept') r.kept++;
  if (def.promise === 'broken') r.broken++;
  // 다른 NPC 에게 번짐 (그 사람이 아끼거나 반대하는 사람)
  if (propagate && def.aff) {
    for (const [other, data] of Object.entries(AFFINITY)) {
      const k = (data.cares?.[npcId] || 0) - (data.opposes?.[npcId] || 0);
      if (k && other !== npcId) applyDelta(game, p, other, { aff: def.aff * k }, { silent: true, reason: `${npcId}:${tag}` });
    }
  }
  game.bus.emit('relation', { npcId, tag, aff: r.aff, rap: r.rap, anti: r.anti });
  return r;
}

export function applyDelta(game, p, npcId, d, { silent = false, reason = '' } = {}) {
  const r = relOf(p, npcId);
  const before = affTier(r.aff);
  r.aff = clamp(r.aff + (d.aff || 0), 0, 100);
  r.rap = clamp(r.rap + (d.rap || 0), 0, 100);
  r.anti = clamp(r.anti + (d.anti || 0), 0, 100);
  if (!silent && (d.aff || d.rap)) game.bus.emit('affinity', { npcId, aff: d.aff || 0, rap: d.rap || 0, anti: d.anti || 0, reason });
  const after = affTier(r.aff);
  if (TIER_ORDER.indexOf(after) > TIER_ORDER.indexOf(before)) {
    const a = AFFINITY[npcId];
    game.bus.emit('tierUp', { npcId, tier: after, line: a?.tierLines?.[after] || '' });
    const letter = a?.letter?.[after];
    if (letter && !p.records.letters?.some((l) => l.text === letter)) (p.records.letters ||= []).push({ npcId, tier: after, text: letter, day: game.life?.day ?? 0 });
  }
}

/** 관계에 따른 모드: 반감이 크면 선택형 부탁은 거절, 필수 기능은 대신 창구가 응대 */
export function stance(p, npcId) {
  const r = relOf(p, npcId);
  const at = antiTier(r.anti);
  return { refuseOptional: r.anti >= 50, substitute: r.anti >= 50, antiTier: at, tier: affTier(r.aff) };
}

/** 금지선: 관계와 무관하게 언제나 거절 */
export function hardLine(npcId, id) {
  return AFFINITY[npcId]?.hardLines?.find((h) => h.id === id) || null;
}

/** 상인 할인 (친밀도 기준, 최대 5%) */
export function discountFor(p, npcId = 'merchant') {
  const aff = relOf(p, npcId).aff;
  return DISCOUNTS.find(([min]) => aff >= min)?.[1] || 0;
}

const itemCategory = (id) => {
  const it = ITEMS[id];
  return [id, it?.type, it?.type === 'consumable' && id.startsWith('potion') ? 'consumable' : null].filter(Boolean);
};

/** 선물: 좋아함/싫어함, 같은 물건 반복 체감, 하루 상한. 금지선에는 영향 없음 */
export function giveGift(game, p, npcId, itemId) {
  const data = AFFINITY[npcId];
  const r = relOf(p, npcId);
  const day = game.life?.day ?? 0;
  if (!(p.inventory[itemId] > 0)) return '가지고 있지 않습니다';
  if (ITEMS[itemId]?.type === 'keepsake') return '출신 소지품은 선물하지 않는 편이 좋겠다';
  if (r.gifts.day !== day) { r.gifts.day = day; r.gifts.n = 0; }
  if (r.gifts.n >= GIFT_RULES.dailyCap) return '오늘은 이미 충분히 받았다며 사양한다';
  const cats = itemCategory(itemId);
  const liked = data?.gifts?.liked?.some((c) => cats.includes(c));
  const disliked = data?.gifts?.disliked?.some((c) => cats.includes(c));
  const prev = r.gifts.per[itemId] || 0;
  const mult = 1 / (1 + prev * GIFT_RULES.decay);
  const base = liked ? GIFT_RULES.liked : disliked ? GIFT_RULES.disliked : GIFT_RULES.neutral;
  p.inventory[itemId] -= 1;
  r.gifts.n++; r.gifts.per[itemId] = prev + 1;
  const d = { aff: +(base * (base > 0 ? mult : 1)).toFixed(2), rap: GIFT_RULES.rapport, anti: disliked ? GIFT_RULES.dislikedAnti : 0 };
  applyDelta(game, p, npcId, d, { reason: '선물' });
  if (!r.tags.includes('선물')) r.tags.push('선물');
  r.mem.unshift({ tag: '선물', day }); r.mem.length = Math.min(r.mem.length, 12);
  // 반응을 보면 좋아하는 것을 알게 된다 (교감도와 연결)
  const known = liked ? `좋아함: ${ITEMS[itemId].name}` : disliked ? `싫어함: ${ITEMS[itemId].name}` : null;
  if (known && !r.known.includes(known)) r.known.push(known);
  game.bus.emit('inventory', {});
  game.bus.emit('gift', { npcId, itemId, liked, disliked, delta: d.aff });
  return { liked, disliked, delta: d.aff };
}

/** 하루 한 번 의미 있는 대화 (신념 질문). 반박도 교감도는 오른다 */
export function dailyTalk(game, p, npcId, tag) {
  const r = relOf(p, npcId);
  const day = game.life?.day ?? 0;
  if (r.daily.talk === day) return '오늘은 이미 깊은 이야기를 나눴다';
  r.daily.talk = day;
  relEvent(game, p, npcId, tag, { repeatable: true, delta: AFFINITY[npcId]?.events?.[tag] });
  if (r.rap >= 20) for (const b of AFFINITY[npcId]?.beliefs || []) { const k = `신념: ${b}`; if (!r.known.includes(k)) r.known.push(k); }
  if (r.rap >= 20 && AFFINITY[npcId]?.gifts?.note && !r.known.includes(AFFINITY[npcId].gifts.note)) r.known.push(AFFINITY[npcId].gifts.note);
  return true;
}

/** 주민(가족) 돕기 → 그 주민 + 관련 주요 NPC */
export function helpVillager(game, p, vid) {
  const h = VILLAGER_HELP[vid];
  if (!h) return '도울 일이 없습니다';
  const r = relOf(p, vid);
  if (r.tags.includes(h.tag)) return '이미 도왔습니다';
  if (h.needsClue && !(p.records.clues || []).includes(h.needsClue)) return '아직 전할 소식이 없습니다';
  relEvent(game, p, vid, h.tag, { delta: { aff: h.aff, rap: 3 } });
  for (const [npc, a] of Object.entries(h.alsoNpc || {})) applyDelta(game, p, npc, { aff: a }, { reason: `${NPCS[vid].name} 도움` });
  return h.reply;
}

/** 대화창 관계 패널용 요약 */
export function relSummary(p, npcId) {
  const r = relOf(p, npcId);
  const mem = AFFINITY[npcId]?.memory || {};
  const seen = new Set();
  const memories = r.mem.filter((m) => { if (seen.has(m.tag)) return false; seen.add(m.tag); return true; })
    .slice(0, 3).map((m) => mem[m.tag] || (m.tag.includes(':') ? null : m.tag.replace(/_/g, ' '))).filter(Boolean);
  return { aff: Math.round(r.aff), rap: Math.round(r.rap), anti: Math.round(r.anti), trust: trustOf(r), tier: affTier(r.aff), antiTier: antiTier(r.anti), memories, known: r.known.slice(0, 4) };
}

/** v2 저장의 { trust, tags } → v3 */
export function migrateRelations(old = {}) {
  const out = {};
  for (const [id, r] of Object.entries(old)) {
    if (r && 'aff' in r) { out[id] = r; continue; }
    const tags = r?.tags || [];
    out[id] = { aff: clamp((r?.trust || 0) * 5 + tags.length * 4, 0, 100), rap: tags.length * 5, anti: tags.includes('감정_조작_요청') ? 12 : 0, kept: 0, broken: tags.filter((t) => t.endsWith('포기')).length,
      tags: [...tags], mem: tags.map((tag) => ({ tag, day: 0 })), gifts: { day: -1, n: 0, per: {} }, known: [], daily: {} };
  }
  return out;
}
