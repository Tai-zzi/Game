/** 아이템 (검증 전 예시). price = 상인 판매가(골드), sell = 상인 매입가 */
export const ITEMS = {
  thread_ball: { id: 'thread_ball', name: '실뭉치', type: 'loot', sell: 4, color: '#e8c87a',
    desc: '풀려버린 생명이 남긴 실. 따뜻하지만 어딘가 비어 있다.' },
  lumber: { id: 'lumber', name: '목재 판', type: 'material', sell: 2, price: 6, color: '#b48a5a',
    desc: '숲 가장자리에서 얻은 판자. 보강 부품의 재료.' },
  clamp: { id: 'clamp', name: '쇠 죔쇠', type: 'material', sell: 3, price: 9, color: '#9aa3ad',
    desc: '부서진 수레 잔해에서 떼어낸 죔쇠.' },
  brace: { id: 'brace', name: '보강 부품', type: 'material', sell: 12, color: '#d9a35a',
    desc: '임시 교량에 쓰는 부품. 목재 판 2 + 쇠 죔쇠 1을 작업대에서 조립한다.' },
  // 출신 소지품
  bread: { id: 'bread', name: '말린 빵 꾸러미', type: 'keepsake', color: '#d9b77a', desc: '집에서 싸 준 빵. 오래 버틴다.' },
  rope: { id: 'rope', name: '부두 밧줄 타래', type: 'keepsake', color: '#c9b48a', desc: '손에 익은 매듭이 묶여 있다.' },
  toolkit: { id: 'toolkit', name: '낡은 공구 주머니', type: 'keepsake', color: '#8a6a4a', desc: '스승이 쓰던 것을 물려받았다.' },
  map: { id: 'map', name: '접힌 지도', type: 'keepsake', color: '#e8dcb8', desc: '여러 사람의 글씨로 덧그린 지도.' },
  lantern: { id: 'lantern', name: '금 간 등불', type: 'keepsake', color: '#e8b04a', desc: '폐허에서 주운 등불. 아직 켜진다.' },
};

/** 작업대 조립법 */
export const RECIPES = {
  brace: { out: 'brace', count: 1, needs: { lumber: 2, clamp: 1 }, time: 1.5 },
};

/**
 * 상점 소모품·장비 (Phase 2). 골드만 사용, 유료 아이템 없음. 가격·능력치는 검증 전 예시.
 * slot: weapon | armor | accessory, classes: 착용 가능 직업 (null = 공용), stats: 더해지는 능력치
 */
Object.assign(ITEMS, {
  potion_s: { id: 'potion_s', name: '회복약 (소)', type: 'consumable', price: 15, sell: 5, color: '#e86a5a', heal: 0.35, cooldown: 8,
    desc: '즉시 최대 체력의 35%를 회복한다. 회복약 재사용 8초.' },
  potion_m: { id: 'potion_m', name: '회복약 (중)', type: 'consumable', price: 40, sell: 12, color: '#ff4a6a', heal: 0.6, cooldown: 8,
    desc: '즉시 최대 체력의 60%를 회복한다. 회복약 재사용 8초.' },
  salve: { id: 'salve', name: '결 연고', type: 'consumable', price: 12, sell: 4, color: '#9fd0ff', cleanse: true, cooldown: 8,
    desc: '찢김·둔화를 지운다. 회복약과 재사용 시간을 공유한다.' },
  gw1: { id: 'gw1', name: '강철 촉 단창', type: 'gear', slot: 'weapon', classes: ['guardian'], price: 60, sell: 20, color: '#cfd5dc', stats: { atk: 4 }, desc: '수호기사용. 짧고 무거운 창.' },
  ga1: { id: 'ga1', name: '덧댄 누비 갑옷', type: 'gear', slot: 'armor', classes: ['guardian'], price: 70, sell: 22, color: '#56677a', stats: { maxHp: 45, def: 3 }, desc: '수호기사용. 여러 번 기운 자국이 있다.' },
  aw1: { id: 'aw1', name: '매듭 장궁', type: 'gear', slot: 'weapon', classes: ['archer'], price: 60, sell: 20, color: '#b48a5a', stats: { atk: 5, critChance: 0.03 }, desc: '매듭궁수용. 시위에 매듭이 셋.' },
  aa1: { id: 'aa1', name: '사냥꾼 가죽옷', type: 'gear', slot: 'armor', classes: ['archer'], price: 55, sell: 18, color: '#5d7a48', stats: { maxHp: 25, def: 2 }, desc: '매듭궁수용. 가볍다.' },
  ew1: { id: 'ew1', name: '불씨 결정 지팡이', type: 'gear', slot: 'weapon', classes: ['elementalist'], price: 65, sell: 21, color: '#ff8a4a', stats: { atk: 6 }, desc: '원소직조사용. 끝이 늘 따뜻하다.' },
  ea1: { id: 'ea1', name: '내열 코트', type: 'gear', slot: 'armor', classes: ['elementalist'], price: 55, sell: 18, color: '#7a3f4a', stats: { maxHp: 22, def: 2 }, desc: '원소직조사용. 그을음 자국.' },
  dw1: { id: 'dw1', name: '은빛 도포봉', type: 'gear', slot: 'weapon', classes: ['dyer'], price: 55, sell: 18, color: '#6ad08a', stats: { atk: 3, maxHp: 15 }, desc: '생명염색사용. 안료가 고르게 묻는다.' },
  da1: { id: 'da1', name: '방수 작업 앞치마', type: 'gear', slot: 'armor', classes: ['dyer'], price: 60, sell: 20, color: '#4f8a6a', stats: { maxHp: 32, def: 2 }, desc: '생명염색사용. 염료가 스미지 않는다.' },
  acc1: { id: 'acc1', name: '매듭 팔찌', type: 'gear', slot: 'accessory', classes: null, price: 45, sell: 15, color: '#e8c87a', stats: { maxHp: 18 }, desc: '공용. 누군가 풀리지 말라고 묶어 준 매듭.' },
  acc2: { id: 'acc2', name: '실 반지', type: 'gear', slot: 'accessory', classes: null, price: 50, sell: 16, color: '#ffd24a', stats: { atk: 1.5, critChance: 0.02 }, desc: '공용. 금실 한 가닥을 감았다.' },
});

Object.assign(ITEMS, {
  antidote: { id: 'antidote', name: '해독제', type: 'consumable', price: 18, color: '#9fe0a0', cleanse: true, cooldown: 8,
    desc: '찢김·독·둔화를 지운다. 회복약과 재사용 시간을 공유한다.' },
  warm_bread: { id: 'warm_bread', name: '따뜻한 보리빵', type: 'consumable', price: 10, color: '#d9a35a', food: { regenPct: 0.01, time: 120 }, cooldown: 2,
    desc: '음식 효과: 2분 동안 초당 최대 체력의 1% 회복 (전투 중에도). 다른 음식으로 덮어쓴다.' },
  herb_stew: { id: 'herb_stew', name: '약초 스튜', type: 'consumable', price: 24, color: '#7aa84a', food: { regenPct: 0.006, def: 3, time: 300 }, cooldown: 2,
    desc: '음식 효과: 5분 동안 방어력 +3, 초당 최대 체력의 0.6% 회복.' },
  recall: { id: 'recall', name: '귀환 실타래', type: 'consumable', price: 30, color: '#e8c87a', recall: true, cooldown: 2,
    desc: '실을 당겨 2초 뒤 하르벤 교역 거점으로 돌아간다. 맞으면 끊긴다.' },
  whetstone: { id: 'whetstone', name: '숫돌', type: 'misc', price: 8, color: '#9aa3ad', desc: '잡화. 선물로 주면 좋아하는 사람이 있다.' },
  candle: { id: 'candle', name: '밀랍 초', type: 'misc', price: 5, color: '#f0e0b0', desc: '잡화. 밤길을 밝힌다(장식).' },
});

/** 상점 분류 */
export const SHOP_CATEGORIES = { consumable: '소모품', material: '재료', gear: '장비', misc: '잡화' };
export const categoryOf = (id) => { const t = ITEMS[id]?.type; return t === 'loot' || t === 'keepsake' ? 'misc' : t; };
/** 되팔기 비율: 정가의 40% (정가가 없는 전리품은 고정 매입가) — 검증 전 예시 */
export const SELL_RATE = 0.4;
export const sellPriceOf = (id) => { const it = ITEMS[id]; if (!it || it.type === 'keepsake') return 0; return it.price ? Math.max(1, Math.round(it.price * SELL_RATE)) : (it.sell || 0); };

/** 잡화점 진열 목록 */
export const SHOP_STOCK = {
  merchant: ['potion_s', 'potion_m', 'antidote', 'salve', 'warm_bread', 'herb_stew', 'recall', 'lumber', 'clamp', 'gw1', 'ga1', 'aw1', 'aa1', 'ew1', 'ea1', 'dw1', 'da1', 'acc1', 'acc2', 'whetstone', 'candle'],
};
export const EQUIP_SLOTS = { weapon: '무기', armor: '방어구', accessory: '장신구' };
