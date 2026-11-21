/**
 * 계열(archetype) → 전직 구조 (v0.3 제안 기준 — 새 구조, 사용자 확정 전).
 * v0.3 원칙 유지: 전투 직업과 생업(생활 전문성)은 별개 트랙. 생업은 누구나 배울 수 있고,
 * '일반' 계열은 생업을 강조하는 출발일 뿐 생업을 독점하지 않는다.
 * 개정안 12직업은 전직 후의 '심화 직업'으로 배치한다. 수치(전직 레벨 등)는 검증 전 예시.
 *
 * advances: 심화 직업 목록 — playable: 지금 플레이 가능한지 (나머지는 '준비 중')
 * novice  : 전직 전 사용하는 견습 직업 (CLASSES 의 id)
 */
export const ADVANCE_LEVEL = 10; // 검증 전 예시

export const ARCHETYPES = {
  common: {
    id: 'common', name: '일반', novice: 'novice_common', icon: '⚒',
    desc: '전투보다 생업을 중심에 둔 출발. 생업 숙련이 빠르게 오르고, 전투는 최소한의 호신술만 쓴다.',
    advances: [], lifeFocus: true,
    note: '전직 대신 생업 전문화(농부·상인·대장장이 등). 원하면 나중에 다른 계열 교육으로 전투 직업을 배울 수 있다.',
  },
  blade: {
    id: 'blade', name: '기사 (검을 쓰는 자)', novice: 'novice_blade', icon: '⚔',
    desc: '검을 쓰는 근접 전투. 빈틈에 무게를 싣거나, 받아치거나, 그림자에서 파고든다.',
    advances: [
      { id: 'crusher', name: '파쇄검사', alias: '광전사 계열', playable: false },
      { id: 'duelist', name: '결투사', alias: '성기사 계열은 미정', playable: false },
      { id: 'shadow', name: '그림자재단사', alias: '어쌔신 계열', playable: false },
    ],
  },
  tank: {
    id: 'tank', name: '탱커', novice: 'novice_tank', icon: '⛨',
    desc: '자리를 지키고 동료를 보호하는 방어 전투.',
    advances: [{ id: 'guardian', name: '수호기사', playable: true }, { id: 'warden', name: '결계술사', playable: false }],
  },
  ranged: {
    id: 'ranged', name: '원거리 딜러', novice: 'novice_ranged', icon: '➶',
    desc: '거리를 재며 싸우는 물리 원거리 전투.',
    advances: [
      { id: 'archer', name: '매듭궁수', alias: '아처', playable: true },
      { id: 'trapper', name: '덫장인', playable: false },
      { id: 'shooter', name: '슈터 (화약 · v0.3 제안 기준)', alias: '총기 — 개정안에 없음, 신규 제안', playable: false, proposal: true },
    ],
  },
  mage: {
    id: 'mage', name: '마법사', novice: 'novice_mage', icon: '✶',
    desc: '실과 결을 다루는 비물리 전투 — 공격·회복·소환·기록.',
    advances: [
      { id: 'elementalist', name: '원소직조사', playable: true },
      { id: 'dyer', name: '생명염색사', playable: true },
      { id: 'resonator', name: '울림직공', playable: false },
      { id: 'puppeteer', name: '실인형술사', playable: false },
      { id: 'reciter', name: '유언낭독자', playable: false },
    ],
  },
};
export const ARCHETYPE_ORDER = ['common', 'blade', 'tank', 'ranged', 'mage'];

/** 심화 직업 → 계열 (기존 저장 이관용) */
export function archetypeOfClass(classId) {
  for (const a of Object.values(ARCHETYPES)) {
    if (a.novice === classId) return a.id;
    if (a.advances.some((x) => x.id === classId)) return a.id;
  }
  return 'tank';
}

/** 생업 (전투 직업과 별개, 누구나) — 단면에서는 데이터만 (v0.3 제안 기준) */
export const LIFE_PROFESSIONS = {
  farmer: { name: '농부', desc: '밭과 가축을 돌본다. 데일 가족에게 배울 수 있다.' },
  merchant: { name: '상인', desc: '물건을 사고팔며 교역로를 잇는다.' },
  smith: { name: '대장장이', desc: '쇠를 다뤄 장비를 만들고 고친다.' },
  carpenter: { name: '목수', desc: '다리와 집을 고친다. 교량 조와 함께 일할 수 있다.' },
  herbalist: { name: '약초꾼', desc: '약초를 캐고 연고를 만든다. 모라에게 배울 수 있다.' },
  weaver: { name: '직조공', desc: '공동 베틀에서 천을 짠다.' },
};
