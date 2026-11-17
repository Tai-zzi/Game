# 베르넬: 풀린 실의 세계 (Bernel)

3D 쿼터뷰 액션 MMORPG 「베르넬」의 **Phase 1 버티컬 슬라이스**입니다.
세계는 거대한 직물(대직물)이고, 플레이어는 실을 볼 수 있는(결시) 견습 수선공이 되어
903년 하르벤 계곡에서 밤마다 실로 풀려버리는 양들의 비밀을 쫓습니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ 에 배포용 빌드
npm run preview    # 빌드 결과 미리보기
npm run test:logic # 렌더러 없이 게임 로직만 Node에서 시뮬레이션 (서버 이식성 확인)
```

요구 사항: Node 18+ (Node 24에서 확인), WebGL2 지원 브라우저.

## 조작

| 입력 | 동작 |
|---|---|
| 우클릭 / 좌클릭 (지면) | 그 위치로 이동 (꾹 누르면 커서를 따라 계속 이동) |
| 좌클릭 (적) | 대상 지정 + 추적하며 기본 공격 |
| 좌클릭 (NPC) / F | 다가가서 대화 |
| Space | 기본 공격 「바늘 찌르기」 (커서 방향) |
| Q / 1 | 「끌어베기」 — 커서 근처 적의 실을 붙잡아 끌어당기며 벤다 |
| W / 2 | 「팽팽함」 — 장력 +40 |
| E / 3 | 「놓아치기」 — 장력을 전부 풀어 전방 광역 타격 (장력 비례 피해) |
| Tab | 가까운 적 순환 선택 |
| 방향키 | 카메라 기준 이동 |
| 마우스 휠 | 확대 / 축소 (제한 있음) |
| Enter | 채팅 입력 (현재 로컬 전용) |
| Esc | 대상 해제 / 대화 닫기 |
| F2 | 키 배치 전환: **로스트아크식**(마우스 이동·QWE) ↔ **WASD 이동**(스킬 1/2/3, Q/E) |

> W 키가 이동과 스킬에 겹치므로 기본은 로스트아크식이고, F2로 WASD 모드로 바꿀 수 있습니다. 설정은 저장됩니다.

### 장력(Tension) 규칙
- 공격 적중 / 피격 / 「팽팽함」으로 쌓임 (0~100). 장력 1당 피해 +0.3%.
- 전투 행동이 3.5초 없으면 서서히 감소.
- **최대치(100)에 3초 이상 머물면 실이 끊어져(snap) 1.3초 기절**, 장력 25로 초기화.
- 「놓아치기」로 높은 장력을 한 번에 터뜨리는 것이 핵심 리듬입니다.

## 폴더 구조

```
Bernel/
├─ index.html              HUD/대화/타이틀 DOM 골격
├─ public/models/          GLB 캐릭터를 넣는 곳 (없으면 절차적 모델)
├─ tools/sim-test.js       헤드리스 로직 테스트
└─ src/
   ├─ main.js              조립(진입점): 로직 ↔ 렌더 ↔ UI 연결
   ├─ core/                EventBus, Input(입력→명령), Save(localStorage), math(결정적 RNG 등)
   ├─ data/                데이터 주도 설정 (한글 이름)
   │   classes.js skills.js monsters.js items.js npcs.js quests.js zones.js(지형 높이 함수 포함)
   ├─ game/                순수 게임 로직 (three.js/DOM 의존 없음 → 서버 이식 가능)
   │   GameState.js        엔티티 저장소, 명령 처리, 이동/충돌, 사망/보상/레벨
   │   Entity.js           엔티티(컴포넌트 묶음) 생성
   │   Combat.js           피해 공식, 장력, 스킬 실행
   │   MonsterAI.js        배회 → 추적 → 공격 → 귀환(리쉬)
   │   Quests.js           퀘스트 상태/진행/대화 구성
   ├─ render/              three.js 표현 계층 (상태를 읽기만 함)
   │   Renderer.js         씬, 쿼터뷰 카메라, 조명/그림자/안개/하늘
   │   World.js            하르벤 계곡 (지형, 강, 물레방아, 마을, 공동 베틀, 인스턴싱 나무/풀)
   │   CharacterModel.js   GLB 로더 + 절차적 모델 + 애니메이션
   │   EntityViews.js      엔티티 ↔ 3D 모델 동기화, 피격 섬광, 풀림(사망) 연출
   │   VFX.js              빛나는 실 이펙트 (타격, 끌어당김, 놓아치기, 레벨업)
   └─ ui/                  HUD, Overlay(데미지 숫자/이름표), Minimap, Dialog, Title, style.css
```

### 아키텍처 원칙
- **GameState는 권위 있는 시뮬레이션**입니다. 입력은 `command({type, ...})` 로만 들어가고, 결과는 `EventBus` 이벤트로만 나옵니다.
  멀티플레이(Phase 3)에서는 `main.js`의 `send()`를 WebSocket 전송으로 바꾸고, 서버에서 같은 `GameState`를 돌리면 됩니다.
- 렌더/UI는 엔티티 데이터를 **읽기만** 합니다.
- 밸런스·콘텐츠는 `src/data/*.js` 수정만으로 바뀝니다.

## Higgsfield GLB 캐릭터 넣기

`public/models/` 에 아래 이름으로 넣으면 다음 실행 시 자동으로 절차적 모델 대신 사용됩니다.

| 파일명 | 대상 | 정규화 키(m) |
|---|---|---|
| `player_mender.glb` | 플레이어 (견습 수선공) | 1.8 |
| `npc_elder.glb` | 하르벤 마을 장로 | 1.75 |
| `mob_unravel_sheep.glb` | 풀린 양 | 1.15 |
| `mob_unravel_wolf.glb` | 풀린 늑대 | 1.25 |

- 모델은 자동으로 위 키에 맞춰 크기 조정되고, 발이 지면(원점)에 오도록 정렬됩니다.
- 정면은 **+Z** 방향(glTF 기본)이어야 합니다.
- 애니메이션 클립 이름에 `idle`, `run`(또는 `walk`), `attack`(또는 `slash`/`hit`)이 들어 있으면 자동 재생됩니다.
  애니메이션이 없으면 절차적 흔들림만 적용됩니다(전신 bob/회전).
- 새 모델 ID를 추가하려면 `src/render/CharacterModel.js`의 `MODEL_SPECS`에 키와 대체 빌더를 등록하세요.

## 저장
진행 상황(레벨, 경험치, 위치, 인벤토리, 퀘스트)은 `localStorage`에 15초마다, 그리고 퀘스트/레벨 변화와 창 닫기 시 저장됩니다.
타이틀의 「처음부터 새로 시작」으로 초기화할 수 있습니다.
