import { ITEMS, SHOP_STOCK } from '../data/items.js';
import { NPCS } from '../data/npcs.js';
import { dist2D } from '../core/math.js';
import { applyStats } from './Entity.js';
import { heal } from './Combat.js';

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
  count = Math.max(1, Math.floor(count));
  const cost = it.price * count;
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
  if (!it?.sell || count <= 0) return '팔 수 없는 물건입니다';
  if (it.type === 'keepsake') return '출신 소지품은 팔 수 없습니다';
  p.inventory[itemId] = have - count;
  const gain = it.sell * count;
  p.gold += gain;
  game.bus.emit('trade', { kind: 'sell', itemId, count, gold: gain });
  game.bus.emit('inventory', {});
  game.log(`${it.name} x${count} 판매 (+${gain} 골드)`, 'loot');
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
  if ((p.cooldowns.potion || 0) > 0) return `아직 쓸 수 없습니다 (${p.cooldowns.potion.toFixed(1)}초)`;
  p.inventory[itemId] -= 1;
  p.cooldowns.potion = it.cooldown;
  if (it.heal) heal(game, null, p, p.stats.maxHp * it.heal);
  if (it.cleanse) { p.fx.bleed = null; p.fx.slow = null; }
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
