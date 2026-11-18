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
  // 이동: 질주(Shift)와 기력 — 구르기와 같은 기력을 쓴다
  move: { sprintMult: 1.6, drain: 16, combatDrain: 26, regen: 22, regenDelay: 0.6, dodgeCost: 25, unlockAt: 20, max: 100, fovKick: 4 },
  // 무력화 상태
  groggy: { duration: 4, damageTaken: 1.2 },
};
