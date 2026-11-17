/**
 * 하르벤의 끊어진 교역로 (v0.3 §9.4). 세 경로 중 하나를 고르고, 도중에 바꿀 수 있다.
 * 수락 전 제한시간·실패 결과·포기 비용을 보여준다 (§9.5).
 * 보상·기여·수치는 검증 전 예시.
 */
export const CONTRACTS = {
  escort: {
    id: 'escort', name: '수레 호위', giver: 'belo', track: 'escort', style: '전투',
    summary: '우회로 길목의 풀린 것들을 몰아내고, 식량 수레를 상류 여울을 건너 동쪽 창고까지 호송한다.',
    terms: {
      timeLimit: '없음. 호송 중에는 수레 곁(10m)을 떠나면 수레가 멈춘다.',
      failure: '수레가 부서지면 화물 일부를 잃는다. 기여는 절반만 집계되고, 다시 맡을 수 있다.',
      abandon: '진행도가 초기화된다. 벌칙이나 관계 손실은 없다(벨로가 이유를 묻는다).',
    },
    steps: [
      { id: 'clear', type: 'killInArea', area: 'detourArea', count: 4, label: '우회로 위험 생물 몰아내기' },
      { id: 'escort', type: 'escort', label: '수레를 동쪽 창고까지 호송' },
    ],
    rewards: { xp: 260, gold: 40, contribution: 60 },
  },
  repair: {
    id: 'repair', name: '장치 수리 보조', giver: 'merchant', track: 'repair', style: '제작',
    summary: '목재 판과 쇠 죔쇠를 모아 작업대에서 보강 부품을 조립하고, 교량 조에 납품한다.',
    terms: {
      timeLimit: '없음.',
      failure: '실패 없음. 채집·조립 중 공격받으면 그 작업만 끊긴다.',
      abandon: '모은 재료와 부품은 그대로 가진다. 납품 전이면 기여는 없다.',
    },
    steps: [
      { id: 'craft', type: 'craft', item: 'brace', count: 2, label: '보강 부품 조립 (작업대)' },
      { id: 'deliver', type: 'deliver', item: 'brace', count: 2, to: 'merchant', label: '상인에게 부품 납품' },
    ],
    rewards: { xp: 200, gold: 30, contribution: 60 },
  },
  investigate: {
    id: 'investigate', name: '실종 가축 조사', giver: 'haila', track: 'investigate', style: '탐험',
    summary: '사라진 가축의 흔적과 다리 아래 지반 이상을 조사하고, 결과를 어떻게 알릴지 정한다.',
    terms: {
      timeLimit: '없음.',
      failure: '조사 중 공격받으면 그 단서 조사만 끊긴다. 다시 시도할 수 있다.',
      abandon: '확인한 단서는 기록에 남는다. 보고 전이면 기여는 없다.',
    },
    steps: [
      { id: 'clues', type: 'clues', ids: ['tracks', 'lamb', 'footing'], label: '단서 조사' },
      { id: 'report', type: 'report', to: 'haila', label: '하일라에게 보고' },
    ],
    rewards: { xp: 220, gold: 25, contribution: 60 },
  },
};
export const CONTRACT_ORDER = ['escort', 'repair', 'investigate'];

/** 공공 사건 결산 규칙 (검증 전 예시) */
export const BRIDGE_EVENT = {
  stage1At: 100, // 합계가 넘으면 임시 단계
  stage2At: 240, // 합계가 넘으면 정식 복구
  tempBridgeRepairShare: 0.34, // 1단계 시 수리 자재 비중이 이 이상이면 임시 교량, 아니면 임시 우회로
  npcSupportEvery: 8, // 초마다 NPC 작업조가 수리 자재 +1 (사건이 영구 정체되지 않게)
  offlineCap: 120, // 접속하지 않은 동안 NPC 진행 최대치
  personalCap: 60, // 경로별 캐릭터 기여 한도
  states: {
    broken: { name: '끊어진 다리', desc: '다리가 무너졌다. 상류 여울로만 건널 수 있다.' },
    detour: { name: '임시 우회로', desc: '여울 우회로에 표지와 경계가 세워졌다. 다리는 아직 무너진 채다.' },
    temp_bridge: { name: '임시 교량', desc: '보강 부품으로 임시 교량을 걸었다. 천천히 건널 수 있다.' },
    repaired: { name: '정식 복구', desc: '다리가 다시 섰다. 교역 수레가 오간다.' },
  },
};
