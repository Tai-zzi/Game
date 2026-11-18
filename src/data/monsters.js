/**
 * 몬스터 데이터 (수치는 검증 전 예시). 분류: 풀린것 / 엉킨것 / 굳은것 / 공백의 메아리
 *
 * patterns: 공격 패턴. 예비 동작(windup) 동안 바닥에 빨간 예고가 뜨고, 끝나는 순간 범위 안에 있으면 맞는다.
 *  shape: cone(range, angle) | circle(radius, at: self|target) | line(length, width)
 *  counterable: 파란 빛 — 카운터 판정 기술로 맞히면 공격이 끊기고 무력화된다
 *  weight / damage(공격력 배수) / cooldown / minRange·maxRange(사용 거리) / pull(끌어당김) / slow / bleed
 * staggerMax: 무력화 게이지 (엘리트·보스). 0이 되면 무력화(groggy).
 * superArmor: 밀침·넘어짐·띄움에 버팀 (무력화 중에는 적용 안 됨)
 */
export const MONSTERS = {
  unravel_sheep: {
    id: 'unravel_sheep', name: '풀린 양', kind: '풀린것', modelId: 'mob_unravel_sheep', tier: 'normal',
    levelRange: [1, 3],
    hp: (lv) => 46 + lv * 16, atk: (lv) => 5 + lv * 2.2, def: (lv) => lv * 0.6, xp: (lv) => 18 + lv * 8,
    moveSpeed: 2.2, chaseSpeed: 3.8, aggroRange: 0, leashRange: 22, radius: 0.7,
    patterns: [{ id: 'butt', name: '들이받기', shape: 'cone', range: 2.4, angle: 1.2, windup: 0.55, damage: 1, cooldown: 1.9, weight: 'light' }],
    drops: [{ item: 'thread_ball', chance: 0.6, min: 1, max: 1 }],
    respawn: 10,
  },
  unravel_wolf: {
    id: 'unravel_wolf', name: '풀린 늑대', kind: '풀린것', modelId: 'mob_unravel_wolf', tier: 'normal',
    levelRange: [4, 6],
    hp: (lv) => 90 + lv * 26, atk: (lv) => 9 + lv * 3, def: (lv) => lv * 1.0, xp: (lv) => 40 + lv * 13,
    moveSpeed: 2.8, chaseSpeed: 6.0, aggroRange: 9, leashRange: 26, radius: 0.8,
    patterns: [
      { id: 'bite', name: '물어뜯기', shape: 'cone', range: 2.5, angle: 1.0, windup: 0.5, damage: 1, cooldown: 1.5, weight: 'light', bleed: { dpsPct: 0.012, time: 4 } },
      { id: 'pounce', name: '덮치기', shape: 'line', length: 5.5, width: 1.4, windup: 0.8, damage: 1.4, cooldown: 6, minRange: 3, maxRange: 6, weight: 'medium', dash: true },
    ],
    drops: [{ item: 'thread_ball', chance: 0.65, min: 1, max: 2 }],
    respawn: 14,
  },
  tangled_alpha: {
    id: 'tangled_alpha', name: '엉킨 늑대우두머리', kind: '엉킨것', modelId: 'mob_unravel_wolf', tier: 'elite', scale: 1.6,
    levelRange: [7, 7],
    hp: (lv) => 900 + lv * 60, atk: (lv) => 14 + lv * 3, def: (lv) => 4 + lv, xp: (lv) => 260 + lv * 20,
    moveSpeed: 3, chaseSpeed: 5.5, aggroRange: 10, leashRange: 28, radius: 1.3,
    staggerMax: 120, superArmor: true,
    patterns: [
      { id: 'maul', name: '할퀴기', shape: 'cone', range: 3.6, angle: 1.8, windup: 0.6, damage: 1.1, cooldown: 2.2, weight: 'medium', bleed: { dpsPct: 0.015, time: 4 } },
      { id: 'leap', name: '뛰어 덮치기', shape: 'circle', at: 'target', radius: 2.8, windup: 1.1, damage: 1.8, cooldown: 7, minRange: 3, maxRange: 10, weight: 'heavy', counterable: true, dash: true },
      { id: 'howl', name: '엉킨 울부짖음', shape: 'circle', at: 'self', radius: 6, windup: 1.0, damage: 0.6, cooldown: 12, weight: 'medium', slow: { v: 0.4, t: 3 } },
    ],
    drops: [{ item: 'thread_ball', chance: 1, min: 3, max: 4 }],
    respawn: 45,
  },
  bridge_keeper: {
    id: 'bridge_keeper', name: '엉킨 교각지기', kind: '엉킨것', modelId: 'mob_unravel_wolf', tier: 'boss', scale: 2.3,
    // 다리 아래 지반 이상에 얽힌 실이 뭉친 것 — 단면용 제안 (v0.3 제안 기준, 세계관 위치 미정)
    levelRange: [8, 8],
    hp: (lv) => 2200 + lv * 100, atk: (lv) => 18 + lv * 3, def: (lv) => 6 + lv, xp: (lv) => 600 + lv * 30,
    moveSpeed: 2.4, chaseSpeed: 4.2, aggroRange: 7, leashRange: 20, radius: 1.8,
    staggerMax: 200, superArmor: true,
    patterns: [
      { id: 'sweep', name: '휩쓸기', shape: 'cone', range: 4.8, angle: 2.4, windup: 1.0, damage: 1.2, cooldown: 3, weight: 'medium' },
      { id: 'slam', name: '내려찍기', shape: 'circle', at: 'target', radius: 3.2, windup: 1.4, damage: 2.0, cooldown: 7, maxRange: 9, weight: 'heavy', counterable: true },
      { id: 'reel', name: '실 휘감기', shape: 'line', length: 11, width: 2, windup: 1.1, damage: 1.0, cooldown: 9, minRange: 3, maxRange: 11, weight: 'medium', pull: 6 },
    ],
    // 체력 50%: 무력화 단계 — 6초 안에 무력화 게이지를 깨지 못하면 '실 폭발'
    phases: [{ at: 0.5, kind: 'staggerCheck', time: 6, fail: { id: 'burst', name: '실 폭발', shape: 'circle', at: 'self', radius: 9, windup: 0.4, damage: 3.0, weight: 'heavy' } }],
    drops: [{ item: 'thread_ball', chance: 1, min: 5, max: 6 }],
    respawn: 60,
  },
};
