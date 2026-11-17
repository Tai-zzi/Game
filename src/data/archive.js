/**
 * 아이디어 보관함 (v0.3 §2: 폐기 자료가 아니라 보관). 현재 수직 단면에서는 사용하지 않는다.
 *
 * - 당김꾼(Phase 1 임시 직업)은 은퇴. 장력(Tension) 자원은 v0.3에서 파쇄검사의 자원이다.
 * - 파쇄검사는 단면 범위 밖. 구현할 때 아래 Phase 1 장력 규칙을 출발점으로 검토한다.
 */
export const ARCHIVE = {
  tension_phase1: {
    owner: '파쇄검사 (v0.3)',
    note: 'Phase 1 당김꾼 시제품 규칙. 검증 전 예시.',
    max: 100, damageBonusPerPoint: 0.003, onHitTaken: 5, decayDelay: 3.5, decayPerSec: 9,
    snapAfter: 3.0, snapStun: 1.3, snapResetTo: 25,
    skills: ['끌어베기(적을 끌어당기며 베기)', '팽팽함(장력 +40)', '놓아치기(장력 전부 소모 전방 강타)'],
    v03Skills: ['지반 가르기', '버티는 칼날', '장력 해방'],
  },
  retired: ['견습 수선공(공통 직업 강제 — v0.3에서 폐기)', '하르벤 마을 장로 퀘스트 체인(v0.3 교역로 사건으로 대체)'],
};
