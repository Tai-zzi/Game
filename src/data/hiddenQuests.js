/**
 * 히든 퀘스트 (관계로 열린다) — v0.3 제안 기준 (이야기 전부 단면용 신규 제안).
 * 퀘스트 목록에 미리 보이지 않는다. 조건을 만족하면 그 인물이 따로 말을 걸거나, 플레이어가 무언가를 발견한다.
 * 보상은 관계·외형·편의 위주 (전투력 독점 없음). 실패·포기 경로가 있다.
 *
 * unlock: { tier: 최소 친밀 단계, rapport: 최소 교감도, contract?: 완료한 계약, bridge?: 다리 상태 목록, hours?: [시작, 끝] }
 * steps : talk(그 NPC 와 대화) | visit(장소에 가기, hours 시간대) | item(물건 가져가기) | choice(선택 — 결과별 태그/보상)
 */
export const HIDDEN_QUESTS = {
  belo_withdrawal: {
    npc: 'belo', name: '철수 명령의 진실',
    unlock: { tier: '신뢰', rapport: 40 },
    discovery: '벨로가 사람들이 없을 때 낮게 말한다. “밤에 훈련장으로 와. 할 얘기가 있어.”',
    steps: [
      { type: 'visit', place: 'yard', hours: [20, 24], meet: 'belo', label: '밤 8시 이후 훈련장에서 벨로 만나기',
        text: ['(벨로가 허수아비 앞에 앉아 있다) 그날, 철수 명령은 위에서 온 게 아니었어. 내가 냈다.', '셋을 두고 왔지. 남은 아홉은 살았고. 다들 내가 명령을 따랐을 뿐이라고 알아.', '토비가 방패를 들겠대. 그 애한테 뭐라고 해야 할지 모르겠어.'] },
      { type: 'choice', label: '벨로에게 답하기', prompt: '토비에게 진실을 말할까?',
        options: [
          { label: '토비에게 직접 말해 주라고 권한다', tag: '진실_권유', result: '…그래. 버틴 시간 말고 돌아온 사람을 세라고, 내 입으로 말해야겠지.', reward: 'crest_harck' },
          { label: '지금은 묻어 두자고 한다', tag: '비밀_유지', result: '…알았어. 그 애가 방패를 제대로 들 때까지만.', reward: 'crest_harck' },
          { label: '대답하지 않고 자리를 뜬다', tag: '자리_뜸', result: '(벨로는 고개를 끄덕일 뿐 붙잡지 않는다)', abandon: true },
        ] },
    ],
    rewards: { crest_harck: { kind: 'cosmetic', name: '하르크 가문 방패 문양', desc: '방패와 망토에 하르크 가문의 문양. 외형 전용.' } },
  },
  mora_patient: {
    npc: 'mora', name: '고치지 않은 환자',
    unlock: { tier: '신뢰', rapport: 45 },
    discovery: '진료소 책상 위에 펼쳐진 장부 한 장. “페드 — 어깨. 처치 거부. 동의 존중. 매주 다시 묻는다.”',
    steps: [
      { type: 'talk', label: '모라에게 장부에 대해 묻기',
        text: ['봤군요. 페드 씨는 통증을 없애는 약을 원하지 않아요. 아픈 게 일한 증거라고요.', '안 아프게 할 수는 있어요. 그래도 그건 그 사람이 정할 일이에요.', '저녁에 방앗간 앞에 가 봐 줄래요? 제가 가면 또 약 얘기가 될 테니까.'] },
      { type: 'visit', place: 'mill_yard', hours: [17, 22], meet: 'ped', label: '저녁에 방앗간 앞에서 페드 만나기',
        text: ['모라 선생이 보냈죠? …괜찮아요. 아픈 거 알고 있어요.', '아프면 내일도 조심하게 돼요. 그게 저한텐 약이에요.'] },
      { type: 'choice', label: '모라에게 전하기', prompt: '페드의 뜻을 어떻게 전할까?',
        options: [
          { label: '그의 선택을 존중하자고 전한다', tag: '선택_존중', result: '네. 다음 주에도 똑같이 물어볼 거예요. 그게 제 일이니까.', reward: 'recipe_mora' },
          { label: '몰래라도 약을 쓰자고 한다', tag: '금지선_요청', result: '그건 안 해요. 당신이 저를 얼마나 아끼든요. (모라의 금지선은 바뀌지 않는다)', hardLine: true },
          { label: '전하지 않는다', tag: '전하지_않음', result: '(모라는 장부를 덮는다. 다음에 다시 물어볼 것이다)', abandon: true },
        ] },
    ],
    rewards: { recipe_mora: { kind: 'recipe', name: '모라의 처방전: 결 연고', desc: '작업대에서 실뭉치 2개로 결 연고를 만들 수 있다. (상점에서도 파는 물건 — 편의용)' } },
  },
  haila_ledger: {
    npc: 'haila', name: '명부에서 지워진 이름',
    unlock: { tier: '신뢰', rapport: 40, contract: 'investigate' },
    discovery: '하일라가 명부의 한 줄을 손가락으로 덮는다. “이 사람… 지난 보수 공사 날 이후로 돌아온 기록이 없어요.”',
    steps: [
      { type: 'talk', label: '하일라에게 지워진 이름에 대해 듣기',
        text: ['이름은 세린. 보수 공사 일용직이었어요. 말뚝이 짧다고 말했다가 다음 날부터 명단에서 빠졌죠.', '죽었는지, 떠났는지 몰라요. 모르는 채로 명부를 덮고 싶지 않아요.', '밤에 다리 공사장을 봐 줄래요? 낮엔 사람이 많아서요.'] },
      { type: 'visit', place: 'bridge_site', hours: [19, 24], label: '밤에 다리 공사장 살펴보기',
        text: ['(교각 옆 돌 틈에 낡은 일당 표가 끼어 있다. 뒷면에 서툰 글씨: “말뚝 짧음. 말했음. 동쪽으로 감. — 세린”)'] },
      { type: 'choice', label: '하일라에게 알리기', prompt: '세린의 일당 표를 어떻게 할까?',
        options: [
          { label: '공개 명부에 이름을 다시 올리자고 한다', tag: '이름_공개', result: '…올릴게요. 말한 사람이 지워지는 명부는 명부가 아니니까.', reward: 'title_ledger' },
          { label: '하일라의 개인 기록에만 남기자고 한다', tag: '개인_기록', result: '그래요. 적어도 저는 기억할게요.', reward: 'title_ledger' },
        ] },
    ],
    rewards: { title_ledger: { kind: 'title', name: '칭호: 돌아온 사람을 센 자', desc: '이름 옆에 붙는 칭호. 외형 전용.' } },
  },
  merchant_smuggle: {
    npc: 'merchant', name: '밀수 화물',
    unlock: { tier: '신뢰', rapport: 30, bridge: ['detour', 'temp_bridge', 'repaired'] },
    discovery: '상인이 목소리를 낮춘다. “동쪽 창고에 제 이름 없는 상자가 하나 있어요. 밤에 좀 가져와 줄래요? 묻지 말고요.”',
    steps: [
      { type: 'visit', place: 'depot', hours: [20, 24], label: '밤에 동쪽 창고에서 이름 없는 상자 찾기',
        text: ['(상자 안에는 가문 인장이 찍히지 않은 염료병이 가득하다. 쪽지: “모라 선생 진료소 — 싸게.”)'] },
      { type: 'choice', label: '상자를 어떻게 할까', prompt: '가문 독점을 피한 값싼 염료다. 장부에는 없다.',
        options: [
          { label: '조용히 상인에게 전한다', tag: '조용히_전달', result: '고마워요. 이건 장사가 아니에요. …아니, 장사이기도 하죠.', reward: 'ledger_regular' },
          { label: '하일라에게 알려 공개 장부에 올리자고 한다', tag: '공개_권유', result: '…그러면 가문이 모라 선생을 압박할 거예요. 그래도 당신이 정할 일이죠. 알겠어요, 하일라한테 가 볼게요.', reward: 'ledger_regular', also: { haila: 3 } },
          { label: '상자를 두고 온다', tag: '상자_두고옴', result: '(상인은 아무 말 없이 고개를 끄덕인다)', abandon: true },
        ] },
    ],
    rewards: { ledger_regular: { kind: 'trinket', name: '단골 장부 한 장', desc: '상인의 단골 장부. 수집품.' } },
  },
};
