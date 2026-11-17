/** 몬스터 데이터 (수치는 검증 전 예시). 상태 분류: 풀린것 / 엉킨것 / 굳은것 / 공백의 메아리 */
export const MONSTERS = {
  unravel_sheep: {
    id: 'unravel_sheep', name: '풀린 양', kind: '풀린것', modelId: 'mob_unravel_sheep',
    levelRange: [1, 3],
    hp: (lv) => 46 + lv * 16, atk: (lv) => 5 + lv * 2.2, def: (lv) => lv * 0.6,
    xp: (lv) => 18 + lv * 8,
    moveSpeed: 2.2, chaseSpeed: 3.8, aggroRange: 0, // 선공하지 않음
    attackRange: 1.7, attackCooldown: 1.9, windup: 0.55, leashRange: 22, radius: 0.7,
    drops: [{ item: 'thread_ball', chance: 0.6, min: 1, max: 1 }],
    respawn: 10,
  },
  unravel_wolf: {
    id: 'unravel_wolf', name: '풀린 늑대', kind: '풀린것', modelId: 'mob_unravel_wolf',
    levelRange: [4, 6],
    hp: (lv) => 90 + lv * 26, atk: (lv) => 9 + lv * 3, def: (lv) => lv * 1.0,
    xp: (lv) => 40 + lv * 13,
    moveSpeed: 2.8, chaseSpeed: 6.0, aggroRange: 9,
    attackRange: 1.9, attackCooldown: 1.5, windup: 0.5,
    onHit: { bleed: { dpsPct: 0.012, time: 4 } }, // 물어뜯어 결을 찢는다(지속 피해). 검증 전 예시
    leashRange: 26, radius: 0.8,
    drops: [{ item: 'thread_ball', chance: 0.65, min: 1, max: 2 }],
    respawn: 14,
  },
};
