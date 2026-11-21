/**
 * 전투 직업 (v0.3 제안 기준). 수직 단면 4종: 수호기사·매듭궁수·원소직조사·생명염색사.
 * - 직업 = 전투 방식. 성격·도덕성·출신·세력은 별도 항목이다.
 * - 직업 이름은 성장해도 바뀌지 않는다. 전문화는 이후 단계 (안전 거점에서 변경, 주간 제한 없음).
 * - 수치는 모두 "검증 전 예시"다. 밸런스 테스트를 거치지 않았다.
 */
export const CLASSES = {
  guardian: {
    id: 'guardian', name: '수호기사', role: '방어', modelId: 'player_guardian',
    weapon: '대형 방패 · 짧은 창 · 낮은 자세',
    judgement: '어디를 막고 누구를 지킬까',
    weakness: '후방과 분산된 공격',
    resource: { id: 'resolve', name: '결의', max: 100, start: 0,
      rule: '방패로 정면 공격을 받으면 축적 → 아군 방호(호위 교대·성벽 전개)와 반격에 소비. 비전투 시 감소.' },
    base: { maxHp: 190, atk: 10, def: 6, moveSpeed: 5.0, critChance: 0.05 }, // 검증 전 예시
    perLevel: { maxHp: 30, atk: 1.8, def: 1.4 },
    skills: { basic: 'g_basic', q: 'g_shield', w: 'g_escort', e: 'g_wall', r: 'g_parry', a: 'g_rush', s: 'g_chain', d: 'g_taunt', f: 'g_release', ult: 'g_ult', dodge: 'dodge' },
  },
  archer: {
    id: 'archer', name: '매듭궁수', role: '원거리 공격', modelId: 'player_archer',
    weapon: '장궁 · 화살통 · 긴 조준선',
    judgement: '어디에 표식을 남길까',
    weakness: '근접 압박과 조준 중단',
    resource: { id: 'marks', name: '표식', max: 3, start: 0,
      rule: '표식 화살로 적에게 표식(대상당 최대 3) → 연결 사격이 표식을 소모해 추가 피해. 표식은 10초 뒤 사라진다.' },
    base: { maxHp: 135, atk: 13, def: 3, moveSpeed: 5.4, critChance: 0.12 },
    perLevel: { maxHp: 20, atk: 2.6, def: 0.7 },
    skills: { basic: 'a_basic', q: 'a_mark', w: 'a_link', e: 'a_knotstep', r: 'a_pierce', a: 'a_post', s: 'a_volley', d: 'a_backshot', f: 'a_rain', ult: 'a_ult', dodge: 'dodge' },
  },
  elementalist: {
    id: 'elementalist', name: '원소직조사', role: '마법 공격', modelId: 'player_elementalist',
    weapon: '지팡이 · 회전 문양판',
    judgement: '어떤 순서로 원소를 결합할까',
    weakness: '이동 중 출력과 집중 방해',
    resource: { id: 'elements', name: '원소식', max: 3, start: 0,
      rule: '불씨·서리선이 원소식 칸(최대 3)을 채움 → 완성 문양이 모두 소모. 같은 원소 연속은 집중 피해, 다른 원소 조합은 범위·제어. 8초간 입력이 없으면 흩어진다(자폭 없음).' },
    base: { maxHp: 125, atk: 14, def: 2.5, moveSpeed: 5.2, critChance: 0.08 },
    perLevel: { maxHp: 18, atk: 2.8, def: 0.6 },
    skills: { basic: 'e_basic', q: 'e_ember', w: 'e_frost', e: 'e_complete', r: 'e_firewall', a: 'e_crystal', s: 'e_beam', d: 'e_leap', f: 'e_cycle', ult: 'e_ult', dodge: 'dodge' },
  },
  dyer: {
    id: 'dyer', name: '생명염색사', role: '회복', modelId: 'player_dyer',
    weapon: '염료병 · 도포봉 · 작업 앞치마',
    judgement: '지금 회복할까, 다음 피해를 준비할까',
    weakness: '자원 소진과 단독 폭딜',
    resource: { id: 'pigment', name: '안료', max: 100, start: 100,
      rule: '회복·보호 기술이 안료를 소모. 사용한 안료는 서서히 재생(비전투 시 2배). 바닥나면 회복 기술을 쓸 수 없다.' },
    base: { maxHp: 145, atk: 9, def: 3.5, moveSpeed: 5.3, critChance: 0.06 },
    perLevel: { maxHp: 22, atk: 1.7, def: 0.9 },
    skills: { basic: 'd_basic', q: 'd_green', w: 'd_spread', e: 'd_bleach', r: 'd_shield', a: 'd_pool', s: 'd_needle', d: 'd_suture', f: 'd_burst', ult: 'd_ult', dodge: 'dodge' },
  },
};

/**
 * 전직 전 견습 직업 (계열별, v0.3 제안 기준). 기술 일부만 쓰고, Lv ${ADVANCE} 에 심화 직업으로 전직한다.
 * 수치는 검증 전 예시. 빈 칸은 전직 후 열린다.
 */
const novice = (id, name, role, modelId, resource, base, skills, weapon) => ({ id, name, role, modelId, resource, base, perLevel: { maxHp: 22, atk: 2.1, def: 1.0 }, skills: { dodge: 'dodge', ...skills }, novice: true, weapon, judgement: '전직 전 기본기', weakness: '기술이 적다' });
const RES = {
  resolve: { id: 'resolve', name: '결의', max: 100, start: 0, rule: '공격·막기로 쌓이고 비전투 시 줄어든다.' },
  marks: { id: 'marks', name: '표식', max: 3, start: 0, rule: '표식 화살로 남기고 연결 사격으로 터뜨린다.' },
  elements: { id: 'elements', name: '원소식', max: 3, start: 0, rule: '불씨·서리선으로 채우고 완성 문양으로 쓴다.' },
};
Object.assign(CLASSES, {
  novice_common: novice('novice_common', '일반인 (견습)', '생업 중심', 'npc_villager_a', RES.resolve, { maxHp: 150, atk: 9, def: 4, moveSpeed: 5.3, critChance: 0.05 }, { basic: 'd_basic', q: 'g_shield', w: 'g_rush' }, '작업 지팡이'),
  novice_blade: novice('novice_blade', '견습 검사', '근접 공격', 'player_guardian', RES.resolve, { maxHp: 160, atk: 12, def: 4.5, moveSpeed: 5.3, critChance: 0.08 }, { basic: 'g_basic', q: 'g_chain', w: 'g_rush', e: 'g_parry', r: 'g_release' }, '한손검'),
  novice_tank: novice('novice_tank', '견습 방패병', '방어', 'player_guardian', RES.resolve, { maxHp: 180, atk: 9, def: 6, moveSpeed: 5.0, critChance: 0.05 }, { basic: 'g_basic', q: 'g_shield', w: 'g_parry', e: 'g_taunt' }, '방패와 창'),
  novice_ranged: novice('novice_ranged', '견습 사수', '원거리 공격', 'player_archer', RES.marks, { maxHp: 130, atk: 12, def: 3, moveSpeed: 5.4, critChance: 0.1 }, { basic: 'a_basic', q: 'a_mark', w: 'a_link', e: 'a_knotstep' }, '사냥 활'),
  novice_mage: novice('novice_mage', '견습 술사', '마법 공격', 'player_elementalist', RES.elements, { maxHp: 120, atk: 13, def: 2.5, moveSpeed: 5.2, critChance: 0.08 }, { basic: 'e_basic', q: 'e_ember', w: 'e_frost', e: 'e_complete' }, '나무 지팡이'),
});

/** 플레이 가능한 심화 직업 (전직 후) */
export const CLASS_ORDER = ['guardian', 'archer', 'elementalist', 'dyer'];
export const MAX_LEVEL_SLICE = 20;
export const xpToNext = (level) => Math.round(70 * Math.pow(level, 1.55) + 50);

export function statsFor(classId, level) {
  const c = CLASSES[classId] || CLASSES.guardian;
  const l = level - 1;
  return {
    maxHp: Math.round(c.base.maxHp + c.perLevel.maxHp * l),
    atk: c.base.atk + c.perLevel.atk * l,
    def: c.base.def + c.perLevel.def * l,
    moveSpeed: c.base.moveSpeed,
    critChance: c.base.critChance,
  };
}
