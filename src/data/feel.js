/**
 * 타격감(FEEL) 조정값 — 한 파일에서 모두 튜닝한다. 검증 전 예시.
 * 로직(넉백·경직·무력화)은 판정에 쓰이고, 나머지(히트스톱·흔들림·섬광·소리)는 연출 전용이다.
 */
export const FEEL = {
  // 무게별 반응. push: 밀려나는 거리(m), stagger: 경직(초), hitStop: 정지(초), shake: 화면 트라우마(0~1), punch: 줌 펀치
  weight: {
    light: { push: 0.35, stagger: 0.12, hitStop: 0.045, shake: 0.08, punch: 0, sparks: 6 },
    medium: { push: 0.8, stagger: 0.3, hitStop: 0.065, shake: 0.16, punch: 0.4, sparks: 10 },
    heavy: { push: 1.6, stagger: 0.6, hitStop: 0.09, shake: 0.32, punch: 1.1, sparks: 16 },
  },
  crit: { hitStopMult: 1.3, pushMult: 1.3, flash: 0.55, flashColor: '#ffd24a' },
  knock: { downTime: 0.9, airTime: 0.85, airHeight: 1.6 },
  playerHit: { push: 0.25, shake: 0.18, flash: 0.35, flashColor: '#ff3a2a' },
  // 마무리 일격·각성기 슬로모션 (초, 시간 배율)
  slowMo: { killDuration: 0.15, ultDuration: 0.35, scale: 0.25 },
  ultimate: { flash: 1.0, flashColor: '#fff3c0', shake: 0.6, punch: 2.0, chroma: 1.0 },
  // 큰 타격 색수차 펄스 (고품질에서만)
  chroma: { heavy: 0.5, decay: 4 },
  // 데미지 숫자
  numbers: { size: 22, critSize: 34, heavyScale: 1.25, rise: 60, arc: 46, life: 0.9 },
  // 피격 찌그러짐·섬광
  squash: { light: 0.45, medium: 0.7, heavy: 1.0 },
  // 소리 층 (휘두름 → 충돌 → 여운)
  sfx: { whoosh: true, impact: true, tail: true, volume: 0.5 },
  // 위치 보너스
  positional: { backDamage: 0.1, backCrit: 0.1, headStagger: 0.25, backAngle: 2.1, headAngle: 1.0 },
  // 이동: 질주(Shift)는 제한 없음. 구르기는 충전 횟수로 제한 (charges 개, recharge 초마다 1회 회복)
  move: { sprintMult: 1.6, fovKick: 4, dodgeCharges: 2, dodgeRecharge: 3.5 },
  // 무력화 상태
  groggy: { duration: 4, damageTaken: 1.2 },
  // ── 이펙트 풀·연출 (Phase 2 타격감 확장) ──
  fx: { maxStreaks: 600, maxThreads: 260, maxPuffs: 400, maxFlashes: 24, maxRings: 16, maxDecals: 40, maxGhosts: 16, lowQualityScale: 0.45,
    flashSize: { light: 0.9, medium: 1.4, heavy: 2.2 }, flashPerDamage: 0.004, threadsPerHit: { light: 4, medium: 7, heavy: 12 },
    shockwave: { heavy: 3.5, medium: 0 }, slideMarks: true, ripple: 0.6 },
  // 피격 재질별 입자
  materials: {
    unravel_sheep: { puff: '#f4eee0', thread: '#ffd98a', puffSize: 0.55 },
    unravel_wolf: { puff: '#5a5450', thread: '#b8c8ff', stitch: '#2a2420', puffSize: 0.4 },
    tangled_alpha: { shard: '#9ab0d8', thread: '#b8c8ff', puff: '#4a4450', puffSize: 0.5 },
    bridge_keeper: { shard: '#c8b090', thread: '#ffd27a', puff: '#6a5a48', puffSize: 0.7 },
    player: { puff: '#ff8a6a', thread: '#ff9a7a', puffSize: 0.3 },
  },
  // 직업별 궤적·색 (피해 종류 색과 공용)
  classFx: {
    guardian: { trail: '#cfe0ff', width: 1.6, afterimage: true, rim: '#9fd0ff', dmg: '#e8f0ff' },
    archer: { trail: '#ffe08a', width: 0.5, pin: true, rim: '#ffd24a', dmg: '#fff0a0' },
    elementalist: { trail: '#ff8a4a', width: 1.0, ribbons: ['#ff8a4a', '#8fc8ff', '#c9b0ff'], rim: '#ffb070', dmg: '#ffb07a' },
    dyer: { trail: '#6ad08a', width: 1.0, splash: true, rim: '#6ad08a', dmg: '#9fe8a8' },
  },
  elementColors: { fire: '#ff8a4a', frost: '#8fc8ff', lightning: '#c9b0ff' },
  // 카메라: 가벼운 타격은 맞은 방향으로 살짝 밀림, 무거운 타격은 트라우마 흔들림
  camera: { kick: { light: 0.08, medium: 0.14, heavy: 0.2 }, kickReturn: 14 },
  // 히트스톱 후 시간이 부드럽게 돌아온다 (딱 멈췄다 풀리는 대신)
  hitStopEase: { minScale: 0.05, easeOut: 0.08 },
  // 각성기 연출
  cinematic: { letterbox: 1.0, desaturate: 0.85, impactFrames: 2, dolly: 2.5 },
  // 낮은 체력
  lowHp: { threshold: 0.3, pulse: 1.1 },
  // 데미지 숫자 묶기 (같은 대상·같은 기술이 연달아 맞으면 합산)
  stack: { window: 0.45 },
  // 연타 표시
  combo: { reset: 2.5, milestones: [10, 25, 50, 100] },
  // 패드 진동
  rumble: { light: [40, 0.15, 0.3], medium: [70, 0.35, 0.5], heavy: [120, 0.7, 0.9] },
};
