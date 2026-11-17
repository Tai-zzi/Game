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
