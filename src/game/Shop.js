import { ITEMS, SHOP_STOCK, sellPriceOf } from '../data/items.js';
import { HARVEN } from '../data/zones.js';
import { NPCS } from '../data/npcs.js';
import { dist2D } from '../core/math.js';
import { applyStats } from './Entity.js';
import { heal } from './Combat.js';
import { discountFor } from './Relationships.js';

/** 다리가 끊긴 동안 들어오지 않는 물건 (교역로 상태가 상인 재고에 반영) */
const NEEDS_ROUTE = new Set(['potion_m', 'acc1', 'acc2']);
export function inStock(game, itemId) {
  if (NEEDS_ROUTE.has(itemId) && game.publicState?.bridge.state === 'broken') return '다리가 끊겨 아직 들어오지 않았습니다';
  return true;
}
/** 가격: 친밀도 할인(최대 5%) · 교역로가 끊기면 장비값 +20% (검증 전 예시) */
export function priceOf(game, p, itemId) {
  const it = ITEMS[itemId];
  if (!it?.price) return 0;
  let m = 1 - discountFor(p, 'merchant');
  if (it.type === 'gear' && game.publicState?.bridge.state === 'broken') m *= 1.2;
  return Math.max(1, Math.round(it.price * m));
}

/**
 * 상점·소지품·장비 규칙 (서버 권위 지점). 화폐는 골드뿐이며 현금 상품은 없다.
 * 모든 함수는 true 또는 실패 사유 문자열을 돌려준다.
 */
const SHOP_RANGE = 6;

export function nearShop(game, p, shopId = 'merchant') {
  const npc = [...game.entities.values()].find((e) => e.npcId === shopId);
  return npc && dist2D(npc.pos, p.pos) <= SHOP_RANGE ? true : '상인 곁에서만 거래할 수 있습니다';
}

export function buy(game, p, itemId, count = 1, shopId = 'merchant') {
  const near = nearShop(game, p, shopId);
  if (near !== true) return near;
  const it = ITEMS[itemId];
  if (!it?.price || !SHOP_STOCK[shopId]?.includes(itemId)) return '팔지 않는 물건입니다';
  const st = inStock(game, itemId);
  if (st !== true) return st;
  count = Math.max(1, Math.floor(count));
  const cost = priceOf(game, p, itemId) * count;
  if (p.gold < cost) return '골드가 부족합니다';
  p.gold -= cost;
  p.inventory[itemId] = (p.inventory[itemId] || 0) + count;
  game.bus.emit('trade', { kind: 'buy', itemId, count, gold: -cost });
  game.bus.emit('inventory', {});
  game.contracts.onInventory(p);
  game.log(`${it.name} x${count} 구입 (-${cost} 골드)`, 'loot');
  return true;
}

export function sell(game, p, itemId, count = 1, shopId = 'merchant') {
  const near = nearShop(game, p, shopId);
  if (near !== true) return near;
  const it = ITEMS[itemId];
  const have = p.inventory[itemId] || 0;
  count = Math.min(Math.max(1, Math.floor(count)), have);
  if (it?.type === 'keepsake') return '출신 소지품은 팔 수 없습니다';
  const unit = sellPriceOf(itemId);
  if (!unit || count <= 0) return '팔 수 없는 물건입니다';
  p.inventory[itemId] = have - count;
  const gain = unit * count;
  // 되사기 목록 (최근 판매 8건, 판 값 그대로 되살 수 있다)
  (p.buyback ||= []).unshift({ itemId, count, unit });
  p.buyback.length = Math.min(p.buyback.length, 8);
  p.gold += gain;
  game.bus.emit('trade', { kind: 'sell', itemId, count, gold: gain });
  game.bus.emit('inventory', {});
  game.log(`${it.name} x${count} 판매 (+${gain} 골드)`, 'loot');
  return true;
}

/** 되사기: 최근에 판 물건을 판 값 그대로 돌려받는다 */
export function buyback(game, p, index) {
  const near = nearShop(game, p);
  if (near !== true) return near;
  const b = p.buyback?.[index];
  if (!b) return '되살 물건이 없습니다';
  const cost = b.unit * b.count;
  if (p.gold < cost) return '골드가 부족합니다';
  p.gold -= cost;
  p.inventory[b.itemId] = (p.inventory[b.itemId] || 0) + b.count;
  p.buyback.splice(index, 1);
  game.bus.emit('trade', { kind: 'buyback', itemId: b.itemId, count: b.count, gold: -cost });
  game.bus.emit('inventory', {});
  game.log(`${ITEMS[b.itemId].name} x${b.count} 되삼 (-${cost} 골드)`, 'loot');
  return true;
}

export function equip(game, p, itemId) {
  const it = ITEMS[itemId];
  if (it?.type !== 'gear') return '장비가 아닙니다';
  if (!(p.inventory[itemId] > 0)) return '가지고 있지 않습니다';
  if (it.classes && !it.classes.includes(p.classId)) return '지금 전투 방식으로는 쓸 수 없는 장비입니다';
  if (game.time - p.lastCombat < 3) return '전투 중에는 장비를 바꿀 수 없습니다';
  const prev = p.equipment[it.slot];
  p.inventory[itemId] -= 1;
  if (prev) p.inventory[prev] = (p.inventory[prev] || 0) + 1;
  p.equipment[it.slot] = itemId;
  applyStats(p);
  game.bus.emit('equip', { slot: it.slot, itemId });
  game.bus.emit('inventory', {});
  return true;
}

export function unequip(game, p, slot) {
  const id = p.equipment[slot];
  if (!id) return '비어 있습니다';
  if (game.time - p.lastCombat < 3) return '전투 중에는 장비를 바꿀 수 없습니다';
  p.equipment[slot] = null;
  p.inventory[id] = (p.inventory[id] || 0) + 1;
  applyStats(p);
  game.bus.emit('equip', { slot, itemId: null });
  game.bus.emit('inventory', {});
  return true;
}

/** 소모품 사용. 회복약류는 재사용 시간을 공유한다 (cooldowns.potion) */
export function useItem(game, p, itemId) {
  const it = ITEMS[itemId];
  if (it?.type === 'gear') return equip(game, p, itemId);
  if (it?.type !== 'consumable') return '사용할 수 없습니다';
  if (!(p.inventory[itemId] > 0)) return '가지고 있지 않습니다';
  if (!p.alive) return '쓰러진 상태입니다';
  const cdKey = it.food || it.recall ? `item_${itemId}` : 'potion';
  if ((p.cooldowns[cdKey] || 0) > 0) return `아직 쓸 수 없습니다 (${p.cooldowns[cdKey].toFixed(1)}초)`;
  if (it.recall && game.time - p.lastCombat < 5) return '전투 중에는 귀환할 수 없습니다';
  p.inventory[itemId] -= 1;
  p.cooldowns[cdKey] = it.cooldown;
  if (it.heal) heal(game, null, p, p.stats.maxHp * it.heal);
  if (it.cleanse) { p.fx.bleed = null; p.fx.slow = null; }
  if (it.food) p.fx.food = { ...it.food, t: it.food.time, acc: 0 };
  if (it.recall) { p.channel = { targetId: null, t: 0, dur: 2, kind: 'recall' }; game.bus.emit('channelStart', { id: p.id, kind: 'recall', dur: 2, name: it.name }); }
  game.bus.emit('itemUsed', { id: p.id, itemId });
  game.bus.emit('inventory', {});
  return true;
}

/** 단축키용: 가장 작은 회복약부터 */
export function quickPotion(game, p) {
  const id = ['potion_s', 'potion_m'].find((k) => p.inventory[k] > 0);
  return id ? useItem(game, p, id) : '회복약이 없습니다';
}

export const shopName = (shopId) => NPCS[shopId]?.name || shopId;
