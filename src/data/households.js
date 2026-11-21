/**
 * 살아 있는 거점 (v0.3 제안 기준 — 주민 이름·가족·일과·대사는 단면용 신규 제안, 수치는 검증 전 예시)
 * - 하루 시계 · 장소/길 그래프 · 일과표 · 직업 활동 · 가족(가구) · 주민끼리의 관계와 잡담 · 일 돕기
 * 순수 데이터. 로직은 game/NpcLife.js
 */

/** 시계: 게임 하루 = 실제 20분 (조정 가능). 시작 시각 8시 */
export const CLOCK = { realMinutesPerDay: 20, startHour: 8 };

/** 장소 (거점 지도 좌표). door: 집 문 앞 (밤에는 집 안 = 보이지 않음) */
export const PLACES = {
  commons: { name: '공동 베틀 광장', x: 1, z: 3 },
  office: { name: '연맹 지부 책상', x: -4, z: 6 },
  yard: { name: '훈련장', x: 9, z: 1 },
  clinic: { name: '진료소', x: -10, z: -2 },
  stall: { name: '잡화점 계산대', x: 12, z: -10.6 },
  cargo: { name: '수레 짐터', x: 13, z: 3 },
  bridge_site: { name: '다리 공사장', x: 37, z: 6 },
  herb_field: { name: '숲 가장자리 약초밭', x: -24, z: 16 },
  farm: { name: '데일 가족 밭', x: -22, z: 28 },
  mill_yard: { name: '물레방앗간 앞', x: 38, z: 2 },
  home_harck: { name: '하르크 가족 집', x: 13.6, z: 12.4, home: true },
  home_dale: { name: '데일 가족 집', x: -17.2, z: 14.4, home: true },
  home_mora: { name: '모라의 집(진료소 뒤)', x: -15.4, z: -4.2, home: true },
  home_haila: { name: '지부 숙소', x: -3.6, z: -15.2, home: true },
  home_merchant: { name: '잡화점 뒤 살림방', x: 15.2, z: -10.4, home: true },
  bunk: { name: '짐꾼 숙소(방앗간)', x: 39.5, z: 1.3, home: true },
  depot: { name: '동쪽 창고', x: 68, z: 3 },
};

/** 길 그래프 (교차점 + 장소). NPC 는 이 그래프의 최단 경로를 따라 걷는다 */
export const NODES = {
  j_c: { x: 0, z: 1 }, j_w: { x: -9, z: 3 }, j_e: { x: 9, z: 4 }, j_n: { x: 0, z: 13 }, j_s: { x: 0, z: -12 },
  j_sw: { x: -9, z: -13 }, j_se: { x: 8, z: -5 }, j_nw: { x: -12, z: 16 }, j_ne: { x: 12, z: 15 }, j_road: { x: 24, z: 3 },
  j_fw: { x: -22, z: 12 },
};
export const EDGES = [
  ['j_c', 'j_w'], ['j_c', 'j_e'], ['j_c', 'j_n'], ['j_c', 'j_s'], ['j_c', 'commons'], ['j_w', 'office'], ['j_w', 'clinic'],
  ['j_e', 'yard'], ['j_e', 'cargo'], ['j_e', 'j_road'], ['j_road', 'bridge_site'], ['j_road', 'mill_yard'], ['mill_yard', 'bunk'],
  ['j_s', 'j_sw'], ['j_s', 'j_se'], ['j_s', 'home_haila'], ['j_sw', 'home_mora'], ['j_sw', 'clinic'], ['j_se', 'stall'], ['stall', 'home_merchant'],
  ['j_n', 'j_nw'], ['j_n', 'j_ne'], ['j_ne', 'home_harck'], ['j_nw', 'home_dale'], ['j_nw', 'j_fw'], ['j_fw', 'herb_field'], ['j_fw', 'farm'],
  ['j_w', 'j_fw'], ['j_e', 'j_ne'], ['j_se', 'j_e'],
];

/**
 * 활동 → 애니메이션 클립(KayKit) + 설명. anim 이 배열이면 번갈아 재생.
 * hidden: 집 안 (보이지 않음, 대화 불가 → 대신 창구가 응대)
 */
export const ACTIVITIES = {
  sleep: { name: '잠', hidden: true },
  home: { name: '집안일', hidden: true },
  eat: { name: '식사', anim: ['Sit_Floor_Idle'] },
  social: { name: '이야기', anim: ['Idle', 'Cheer'] },
  walk: { name: '이동' },
  drill: { name: '수련생 훈련', anim: ['Block', '1H_Melee_Attack_Chop', 'Blocking'] },
  spar: { name: '대련', anim: ['1H_Melee_Attack_Slice_Diagonal', 'Block'] },
  ledger: { name: '명부 정리', anim: ['Interact'] },
  inspect: { name: '화물 명세 확인', anim: ['Interact', 'PickUp'] },
  survey: { name: '다리 공사장 점검', anim: ['Interact', 'Idle'] },
  treat: { name: '환자 진료', anim: ['Use_Item', 'Interact'] },
  gather: { name: '약초 채집', anim: ['PickUp'] },
  stall: { name: '좌판 장사', anim: ['Interact', 'Cheer'] },
  restock: { name: '수레에서 물건 채우기', anim: ['PickUp'] },
  haggle: { name: '흥정', anim: ['Cheer', 'Interact'] },
  farm: { name: '밭일', anim: ['PickUp', 'Interact'] },
  carry: { name: '짐 나르기', anim: ['PickUp'] },
  play: { name: '놀이', anim: ['Jump_Full_Short', 'Running_A', 'Cheer'] },
  watch: { name: '훈련 구경', anim: ['Idle', 'Cheer'] },
  visit_clinic: { name: '진료소 방문', anim: ['Idle'] },
};

/**
 * 일과표: [시작 시각, 활동, 장소]. 욕구(배고픔·휴식·사교·일 만족)가 높으면 일과에서 벗어날 수 있다.
 */
export const SCHEDULES = {
  haila: [[6, 'home', 'home_haila'], [7.5, 'ledger', 'office'], [10, 'inspect', 'cargo'], [12, 'eat', 'commons'], [13, 'survey', 'bridge_site'], [15.5, 'ledger', 'office'], [19, 'social', 'commons'], [21, 'sleep', 'home_haila']],
  belo: [[5.5, 'home', 'home_harck'], [6.5, 'drill', 'yard'], [12, 'eat', 'home_harck'], [13, 'drill', 'yard'], [17, 'social', 'commons'], [19, 'eat', 'home_harck'], [21, 'sleep', 'home_harck']],
  mora: [[6, 'home', 'home_mora'], [7, 'treat', 'clinic'], [12, 'eat', 'commons'], [13, 'gather', 'herb_field'], [16, 'treat', 'clinic'], [20, 'social', 'commons'], [22, 'sleep', 'home_mora']],
  merchant: [[6, 'home', 'home_merchant'], [7, 'restock', 'cargo'], [8, 'stall', 'stall'], [12.5, 'eat', 'commons'], [13.5, 'stall', 'stall'], [16, 'haggle', 'stall'], [19, 'social', 'commons'], [21, 'sleep', 'home_merchant']],
  lise: [[6, 'home', 'home_harck'], [7, 'carry', 'cargo'], [12, 'eat', 'home_harck'], [13, 'carry', 'mill_yard'], [17, 'home', 'home_harck'], [19, 'eat', 'home_harck'], [21, 'sleep', 'home_harck']],
  toby: [[7, 'home', 'home_harck'], [8, 'watch', 'yard'], [12, 'eat', 'home_harck'], [13, 'play', 'commons'], [16, 'watch', 'yard'], [18, 'home', 'home_harck'], [20, 'sleep', 'home_harck']],
  oren: [[5, 'home', 'home_dale'], [6, 'farm', 'farm'], [12, 'eat', 'home_dale'], [13, 'farm', 'farm'], [17, 'social', 'commons'], [19, 'eat', 'home_dale'], [21, 'sleep', 'home_dale']],
  maren: [[5.5, 'home', 'home_dale'], [7, 'farm', 'farm'], [11, 'home', 'home_dale'], [12, 'eat', 'home_dale'], [14, 'gather', 'herb_field'], [17, 'home', 'home_dale'], [19, 'eat', 'home_dale'], [21, 'sleep', 'home_dale']],
  ped: [[5, 'home', 'bunk'], [6, 'carry', 'bridge_site'], [12, 'eat', 'commons'], [13, 'carry', 'cargo'], [18, 'social', 'commons'], [21, 'sleep', 'bunk']],
  kai: [[6, 'home', 'bunk'], [7, 'spar', 'yard'], [12, 'eat', 'commons'], [13, 'spar', 'yard'], [17, 'carry', 'bridge_site'], [20, 'sleep', 'bunk']],
};

/** 가벼운 주민 NPC (KayKit 리그 + 색조). family: 가구 ID */
export const VILLAGERS = {
  lise: { id: 'lise', name: '리세 하르크', title: '짐꾼 · 벨로의 배우자', modelId: 'npc_villager_a', household: 'harck', home: 'home_harck',
    lines: ['벨로가 또 출구 쪽에 앉았죠? 그 사람은 집에서도 그래요.', '토비가 방패를 들겠다고 난리예요. 그 사람은 반대하지 않아요. 그게 더 무서워요.'] },
  toby: { id: 'toby', name: '토비 하르크', title: '벨로의 아이 · 방패 수련생 지망', modelId: 'npc_child', household: 'harck', home: 'home_harck', child: true, scale: 0.72,
    lines: ['아빠처럼 방패 들 거예요! …근데 아빠는 왜 맨날 도망치는 연습만 시켜요?', '훈련장 허수아비, 제가 이름 붙였어요. 버티기 씨예요.'] },
  oren: { id: 'oren', name: '오렌 데일', title: '농부 · 가축을 잃은 집', modelId: 'npc_villager_b', household: 'dale', home: 'home_dale',
    lines: ['양 세 마리가 밤사이에 사라졌어요. 털이 실처럼 풀린 자국만 남기고.', '다리가 끊기니 곡식도 못 팔아요. 그래도 밭은 매야죠.'] },
  maren: { id: 'maren', name: '마렌 데일', title: '농부 · 오렌의 배우자', modelId: 'npc_villager_a', household: 'dale', home: 'home_dale',
    lines: ['모라 선생이 약초를 같이 캐 주면 품삯 대신 연고를 줘요.', '우리 양 중 한 마리라도 돌아오면 좋겠어요.'] },
  ped: { id: 'ped', name: '페드', title: '짐꾼 · 방앗간 숙소', modelId: 'npc_villager_b', household: 'bunk', home: 'bunk',
    lines: ['오늘도 다리 공사장 돌 날랐어요. 어깨가 결려도… 약은 됐어요.', '모라 선생이요? 좋은 분이죠. 제 고집을 존중해 주는 분이에요.'] },
  kai: { id: 'kai', name: '카이', title: '방패 수련생', modelId: 'npc_villager_a', household: 'bunk', home: 'bunk',
    lines: ['벨로 교관님은 버티는 법보다 빠지는 법을 먼저 가르쳐요. 처음엔 이상했는데.', '대련 상대 해 주실래요? 교관님이 허락하면요.'] },
};

/** 가구 (가족). members 의 첫 번째가 보호자 (아이를 데리고 귀가) */
export const HOUSEHOLDS = {
  harck: { name: '하르크 가족', home: 'home_harck', members: ['belo', 'lise', 'toby'] },
  dale: { name: '데일 가족', home: 'home_dale', members: ['oren', 'maren'] },
  bunk: { name: '방앗간 숙소', home: 'bunk', members: ['ped', 'kai'] },
};

/** 직업 결과가 세계에 반영되는 방식 (검증 전 예시) */
export const JOB_OUTPUT = {
  gather: { stat: 'herbs', perHour: 2, max: 12 }, // 모라·마렌의 약초 → 진료소 연고
  restock: { stat: 'stallStock', perHour: 4, max: 20 }, // 상인의 짐 → 좌판 재고 (다리 상태가 상한에 영향)
};

/** 주민끼리의 관계 (개정안 인물 관계 + 가족) — value: -100~100, 잡담 대사 */
export const PAIRS = [
  { a: 'haila', b: 'belo', value: 40, tags: ['동료', '서로의 철수를 이해'], lines: [['오늘 나간 호송조, 다 돌아왔어요.', '세어 봤어. 맞아.'], ['다리 공사장 말뚝, 이번엔 규격대로예요.', '네가 봤으면 됐어.']] },
  { a: 'mora', b: 'merchant', value: 30, tags: ['염료 공급', '비밀'], lines: [['이번 염료는 지난번보다 싸네요?', '쉿, 장부엔 그대로 적혀 있어요.'], ['붕대가 모자라요.', '다리만 열리면 한 수레 가져올게요.']] },
  { a: 'belo', b: 'lise', value: 80, tags: ['부부'], lines: [['출구 쪽 자리 맡아 뒀어.', '집에선 좀 등지고 앉아요.'], ['토비가 또 방패 들었어?', '당신 닮아서 그래요.']] },
  { a: 'belo', b: 'toby', value: 85, tags: ['부자'], lines: [['오늘은 뭐 배웠어?', '빠지는 거요! 또요!'], ['방패보다 발이 먼저야.', '알아요오.']] },
  { a: 'lise', b: 'toby', value: 85, tags: ['모자'], lines: [['해 지기 전에 들어와.', '조금만 더요!']] },
  { a: 'oren', b: 'maren', value: 75, tags: ['부부'], lines: [['내일은 북쪽 밭 먼저 하자.', '양 찾으러 가는 거 아니고요?'], ['모라 선생이 연고 또 줬어.', '약초 더 캐다 드려야겠네.']] },
  { a: 'mora', b: 'ped', value: 35, tags: ['환자와 의사', '존중'], lines: [['어깨는요?', '결려요. 그래도 약은 됐어요.'], ['오늘도 같은 대답이네요.', '선생님도 같은 질문이시고요.']] },
  { a: 'belo', b: 'kai', value: 50, tags: ['교관과 수련생'], lines: [['발.', '네, 발!'], ['오늘은 몇 번 빠졌지?', '열두 번이요.']] },
  { a: 'haila', b: 'merchant', value: 10, tags: ['장부 다툼'], lines: [['부품값 또 올렸죠.', '빵값은 안 올렸어요.']] },
  { a: 'oren', b: 'haila', value: 20, tags: ['실종 신고'], lines: [['양 소식은요?', '조사 중이에요. 숨기지 않을게요.']] },
];

/**
 * 일 돕기 (매일 1회, 30~90초). NPC 가 그 활동 중일 때 대화로 시작한다.
 * spots: 활동 장소 주변에 생기는 작업 지점 수, channel: 지점당 작업 시간(초)
 */
export const HELP_TASKS = {
  merchant: { activity: ['stall', 'restock', 'haggle'], name: '상자 나르기', desc: '짐터의 상자를 좌판으로 세 번 나른다.', spots: 3, channel: 2.5, place: 'cargo', aff: 6, rap: 2, gold: 8, xp: 30 },
  mora: { activity: ['gather'], name: '약초 캐기', desc: '약초밭에서 약초 세 포기를 캔다.', spots: 3, channel: 2, place: 'herb_field', aff: 6, rap: 3, xp: 30, herbs: 3 },
  belo: { activity: ['drill'], name: '수련생 대련', desc: '수련생이 막는 허수아비를 네 번 친다.', spots: 4, channel: 1.5, place: 'yard', aff: 6, rap: 2, xp: 40 },
  haila: { activity: ['inspect', 'survey'], name: '화물 명세 확인', desc: '짐터의 화물 세 개를 명세와 맞춰 본다.', spots: 3, channel: 2.5, place: 'cargo', aff: 6, rap: 3, xp: 30 },
};

/** 주민(가족) 돕기 — 조건과 효과 (관련 주요 NPC 에게도 번진다) */
export const VILLAGER_HELP = {
  oren: { label: '쓰러진 새끼 양 이야기를 전한다', needsClue: 'lamb', tag: '새끼양_소식', aff: 10, alsoNpc: { mora: 2 }, reply: '살아 있다고요? …고마워요. 모라 선생께 데려가 볼게요.' },
  toby: { label: '방패 쥐는 법을 조금 알려 준다', tag: '방패_가르침', aff: 8, alsoNpc: { belo: 4 }, reply: '이렇게요? 아빠한테 자랑해야지!' },
  ped: { label: '어깨 걱정을 말없이 들어 준다', tag: '들어줌', aff: 6, alsoNpc: { mora: 2 }, reply: '…약 얘기 안 하셔서 고마워요.' },
  kai: { label: '대련 상대를 해 준다', tag: '대련', aff: 6, alsoNpc: { belo: 3 }, reply: '한 번 더요! 이번엔 빠질게요!' },
  lise: { label: '짐을 같이 들어 준다', tag: '짐_도움', aff: 6, alsoNpc: { belo: 2 }, reply: '고마워요. 벨로한텐 말하지 마요, 또 출구 얘기할 테니.' },
  maren: { label: '약초 캐는 곳을 알려 준다', tag: '약초_정보', aff: 6, alsoNpc: { mora: 1 }, reply: '숲 가장자리요? 내일 가 볼게요.' },
};

/** 필수 기능 창구: 그 인물이 자거나 바쁘거나 반감이 커도 언제나 응대 (v0.3 §8.2) */
export const DESKS = {
  office_board: { name: '연맹 계약 게시판', serviceOf: 'haila', x: -6.5, z: 7.5 },
  yard_board: { name: '호위 모집판', serviceOf: 'belo', x: 11.5, z: 6 },
  clinic_bell: { name: '진료소 종', serviceOf: 'mora', x: -8, z: 0.5 },
  stall_ledger: { name: '잡화점 종 (밤에도 장부로 거래)', serviceOf: 'merchant', x: 9.4, z: -9.4 },
};
