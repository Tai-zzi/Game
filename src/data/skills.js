/**
 * 기술 데이터 (v0.3 제안 기준). 직업마다: 기본 공격 3연타 + 기술 8개(Q W E R / A S D F) + 각성기(V) + 공통 구르기.
 * - 개정안 §5 의 대표 기술 3개는 그대로, 나머지 5개 + 각성기는 그 직업의 핵심 판단·자원에 맞춘 신규 제안.
 * - 숫자는 모두 "검증 전 예시" (밸런스 미검증).
 *
 * 공통 필드
 *  cast   : instant(즉발) | charge(누르고 있다가 놓으면 강해짐) | hold(누르는 동안 유지) | combo(창 안에 다시 누르면 다음 단계)
 *  type   : melee | projectile | line | cone | circleSelf | circleAim | dash | blink | link | place | heal | shield | cleanse
 *           complete | cycle | parry | block | channel | release | taunt
 *  windup : 예비 동작(초) — 이 시간이 끝나는 순간이 판정 프레임  · recovery: 회수 동작(초)
 *  damage : 공격력 배수 · stagger: 무력화 수치(없으면 무게로 결정) · weight: light | medium | heavy (타격감 강도)
 *  knock  : push(밀침) | down(넘어뜨림) | air(띄움) · counter: 카운터 가능 공격을 끊음 · pos: back | head (위치 보너스)
 *  cost   : 직업 자원 소모 · gain: 적중 시 자원 획득 · color: 이펙트 색
 */
const G = '#9fd0ff', A = '#ffd24a', EF = '#ff8a4a', EC = '#8fc8ff', D = '#6ad08a';

export const SKILLS = {
  // ───────────── 공통 ─────────────
  dodge: { id: 'dodge', name: '구르기', desc: '짧게 굴러 공격을 피한다. 잠깐 무적. 다른 동작을 취소할 수 있다.', type: 'dodge', cast: 'instant',
    distance: 4.5, duration: 0.28, iframes: 0.32, cooldown: 4, windup: 0, recovery: 0.05, icon: '구' },

  // ───────────── 수호기사 (결의) — "어디를 막고 누구를 지킬까" ─────────────
  g_basic: { id: 'g_basic', name: '창 연타', desc: '짧은 창 3연타. 막은 직후의 찌르기는 결의 20을 써서 반격(2배).', type: 'melee', cast: 'combo', icon: '창',
    range: 2.6, arc: 1.5, gain: 5, cooldown: 0.25, window: 0.75, color: G,
    stages: [{ damage: 0.9, windup: 0.14, recovery: 0.16 }, { damage: 1.0, windup: 0.14, recovery: 0.18 }, { damage: 1.5, windup: 0.2, recovery: 0.3, weight: 'medium', knock: 'push' }] },
  g_shield: { id: 'g_shield', name: '방패 세우기', desc: '누르는 동안(최대 4초) 정면을 막는다. 막은 공격마다 결의 +15. 이동 속도 절반, 측면·후방은 못 막는다.', type: 'block', cast: 'hold', icon: '방',
    hold: { max: 4 }, arc: 2.4, reduce: 0.8, gainPerBlock: 15, moveMult: 0.5, cooldown: 5, windup: 0.06, recovery: 0.05, color: G, doc: true },
  g_escort: { id: 'g_escort', name: '호위 교대', desc: '보호 대상(호송 수레 등) 곁으로 뛰어들어 4초간 받는 피해를 절반으로. 결의 20.', type: 'escort', cast: 'instant', icon: '호',
    range: 12, cost: 20, guard: 0.5, guardTime: 4, cooldown: 10, windup: 0.1, recovery: 0.15, color: G, doc: true },
  g_wall: { id: 'g_wall', name: '성벽 전개', desc: '전방에 5초간 실 방벽을 세워 정면 공격과 진입을 막는다. 결의 40.', type: 'place', place: 'wall', cast: 'instant', icon: '벽',
    cost: 40, width: 5.5, offset: 2.2, duration: 5, cooldown: 14, windup: 0.3, recovery: 0.2, weight: 'medium', color: G, doc: true },
  g_parry: { id: 'g_parry', name: '받아치기', desc: '0.5초 동안 정면 공격을 받아내면 피해 무효 + 강한 반격(넘어뜨림), 결의 +30. 카운터 공격 판정.', type: 'parry', cast: 'instant', icon: '받',
    window: 0.5, damage: 2.2, stagger: 45, knock: 'down', counter: true, gainOnParry: 30, cooldown: 8, windup: 0.05, recovery: 0.45, weight: 'heavy', color: '#ffffff' },
  g_rush: { id: 'g_rush', name: '방패 돌진', desc: '방패를 앞세워 6m 돌진, 경로의 적을 밀쳐낸다. 무력화 높음. 머리 공격 보너스.', type: 'dash', cast: 'instant', icon: '돌',
    distance: 6, width: 1.8, damage: 1.2, stagger: 30, knock: 'push', pos: 'head', counter: true, cooldown: 9, windup: 0.18, recovery: 0.25, weight: 'medium', gain: 8, color: G },
  g_chain: { id: 'g_chain', name: '창 연격', desc: '다시 누르면 이어진다: 찌르기 → 찌르기 → 휘둘러 넘어뜨리기 (창 0.9초).', type: 'melee', cast: 'combo', icon: '연',
    range: 3.0, arc: 1.4, window: 0.9, cooldown: 7, gain: 6, color: G,
    stages: [{ damage: 1.1, windup: 0.16, recovery: 0.2, weight: 'light' }, { damage: 1.2, windup: 0.14, recovery: 0.2, weight: 'medium' }, { damage: 1.9, windup: 0.26, recovery: 0.4, weight: 'heavy', arc: 2.6, knock: 'down', stagger: 25 }] },
  g_taunt: { id: 'g_taunt', name: '도발 함성', desc: '8m 안의 적이 나를 노리게 한다. 붙잡은 적 하나마다 결의 +6.', type: 'taunt', cast: 'instant', icon: '도',
    radius: 8, gainPer: 6, cooldown: 15, windup: 0.25, recovery: 0.3, weight: 'medium', color: '#ffb070' },
  g_release: { id: 'g_release', name: '결의 방출', desc: '모은 결의를 전부 써서 전방을 크게 내려친다. 결의가 많을수록 강하고 넘어뜨린다. (결의 30 이상)', type: 'release', cast: 'instant', icon: '방출',
    minRes: 30, range: 4.2, arc: 2.2, damage: 1.0, perRes: 0.035, knock: 'down', cooldown: 10, windup: 0.45, recovery: 0.35, weight: 'heavy', color: G },
  g_ult: { id: 'g_ult', name: '철벽 진형', desc: '【각성】 방패로 땅을 찍어 넓은 성벽을 세우고 충격파로 전방의 적을 넘어뜨린다. 결의 최대 충전.', type: 'cone', cast: 'instant', ult: true, icon: '각',
    range: 7, arc: 2.6, damage: 4.5, stagger: 80, knock: 'down', placeWall: { width: 9, duration: 6 }, fillRes: true, cooldown: 90, windup: 0.8, recovery: 0.5, weight: 'heavy', color: G },

  // ───────────── 매듭궁수 (표식) — "어디에 표식을 남길까" ─────────────
  a_basic: { id: 'a_basic', name: '연사', desc: '장궁 3연사. 적이 가까우면(2.5m) 약해진다.', type: 'projectile', cast: 'combo', icon: '사',
    range: 12, speed: 30, closeMult: 0.6, closeRange: 2.5, cooldown: 0.3, window: 0.7, color: A,
    stages: [{ damage: 0.8, windup: 0.16, recovery: 0.12 }, { damage: 0.8, windup: 0.14, recovery: 0.12 }, { damage: 1.3, windup: 0.22, recovery: 0.25, weight: 'medium' }] },
  a_mark: { id: 'a_mark', name: '표식 화살', desc: '조준 후 쏘아 표식을 남긴다(최대 3). 조준 중 맞으면 끊긴다.', type: 'projectile', cast: 'instant', icon: '표',
    range: 14, damage: 1.1, speed: 32, addMark: 1, interruptible: true, cooldown: 2.2, windup: 0.45, recovery: 0.12, weight: 'medium', color: A, doc: true },
  a_link: { id: 'a_link', name: '연결 사격', desc: '사거리 안의 표식 걸린 적을 이어 쏜다. 표식당 추가 피해 후 소모. 벽을 뚫지 않는다.', type: 'link', cast: 'instant', icon: '연',
    range: 14, damage: 0.6, perMark: 0.9, cooldown: 7, windup: 0.3, recovery: 0.2, weight: 'heavy', color: A, doc: true },
  a_knotstep: { id: 'a_knotstep', name: '매듭 이동', desc: '커서 방향으로 짧게(6m) 이동해 거리를 다시 잰다.', type: 'blink', cast: 'instant', icon: '매',
    distance: 6, cooldown: 9, windup: 0.08, recovery: 0.1, color: A, doc: true },
  a_pierce: { id: 'a_pierce', name: '관통 사격', desc: '누르고 있다가 놓는다. 오래 당길수록 멀리·세게 관통(최대 1.2초). 카운터 공격 판정. 조준 중 맞으면 끊긴다.', type: 'line', cast: 'charge', icon: '관',
    charge: { max: 1.2, mult: 2.4 }, length: 9, lengthMax: 16, width: 1.2, damage: 1.2, stagger: 20, counter: true, interruptible: true, cooldown: 8, windup: 0.1, recovery: 0.25, weight: 'heavy', color: A },
  a_post: { id: 'a_post', name: '매듭 말뚝', desc: '지점에 말뚝을 박는다. 8초 동안 1.5초마다 주변 4m 적에게 표식 +1.', type: 'place', place: 'markPost', cast: 'instant', icon: '말',
    range: 10, radius: 4, duration: 8, tick: 1.5, cooldown: 16, windup: 0.25, recovery: 0.2, color: A },
  a_volley: { id: 'a_volley', name: '부채 사격', desc: '전방 부채꼴로 화살 다섯 대. 맞은 적마다 표식 +1.', type: 'cone', cast: 'instant', icon: '부',
    range: 8, arc: 1.2, damage: 0.9, addMark: 1, cooldown: 9, windup: 0.3, recovery: 0.2, weight: 'medium', color: A },
  a_backshot: { id: 'a_backshot', name: '물러서며 쏘기', desc: '뒤로 5m 뛰며 바로 앞 적을 밀쳐낸다. 근접 압박을 푸는 기술.', type: 'blink', back: true, cast: 'instant', icon: '물',
    distance: 5, damage: 1.0, range: 4, knock: 'push', cooldown: 10, windup: 0.12, recovery: 0.15, weight: 'medium', color: A },
  a_rain: { id: 'a_rain', name: '화살비', desc: '지점에 0.8초 뒤 화살비. 표식이 있는 적은 1.5배.', type: 'circleAim', cast: 'instant', icon: '비',
    range: 12, radius: 3.5, delay: 0.8, damage: 1.6, markBonus: 0.5, cooldown: 12, windup: 0.3, recovery: 0.2, weight: 'medium', pos: 'back', color: A },
  a_ult: { id: 'a_ult', name: '천 개의 매듭', desc: '【각성】 넓은 범위(9m)의 적에게 표식을 가득 새긴 뒤 한꺼번에 잇는다.', type: 'circleAim', cast: 'instant', ult: true, icon: '각',
    range: 12, radius: 9, damage: 1.5, fillMarks: true, thenLink: true, stagger: 60, knock: 'air', cooldown: 90, windup: 0.7, recovery: 0.5, weight: 'heavy', color: A },

  // ───────────── 원소직조사 (원소식) — "어떤 순서로 원소를 결합할까" ─────────────
  e_basic: { id: 'e_basic', name: '문양탄', desc: '작은 문양 3연발. 원소식을 채우지 않는다.', type: 'projectile', cast: 'combo', icon: '문',
    range: 10, speed: 24, cooldown: 0.3, window: 0.7, color: '#c9b0ff',
    stages: [{ damage: 0.75, windup: 0.18, recovery: 0.12 }, { damage: 0.75, windup: 0.16, recovery: 0.12 }, { damage: 1.2, windup: 0.24, recovery: 0.25, weight: 'medium' }] },
  e_ember: { id: 'e_ember', name: '불씨', desc: '불씨를 던지고 원소식 칸에 [불]을 넣는다.', type: 'projectile', cast: 'instant', icon: '불',
    range: 10, damage: 0.9, speed: 20, element: 'fire', cooldown: 1.4, windup: 0.22, recovery: 0.12, weight: 'light', color: EF, doc: true },
  e_frost: { id: 'e_frost', name: '서리선', desc: '전방 직선에 서리를 그어 둔화시키고 [서리]를 넣는다. 카운터 공격 판정.', type: 'line', cast: 'instant', icon: '서',
    length: 8, width: 1.6, damage: 0.6, slow: { v: 0.45, t: 3 }, element: 'frost', counter: true, cooldown: 3, windup: 0.25, recovery: 0.15, weight: 'medium', color: EC, doc: true },
  e_complete: { id: 'e_complete', name: '완성 문양', desc: '원소식을 모두 소모. 같은 원소 연속 = 단일 집중, 섞인 조합 = 범위·둔화. 시전 중 맞으면 끊기지만 원소식은 남는다.', type: 'complete', cast: 'instant', icon: '완',
    range: 10, radius: 3.5, interruptible: true, cooldown: 3, windup: 0.7, recovery: 0.2, weight: 'heavy', color: '#ffb070', doc: true },
  e_firewall: { id: 'e_firewall', name: '화염 장막', desc: '지점에 6초간 타는 장막. 0.5초마다 피해. [불]을 넣는다.', type: 'place', place: 'fireZone', cast: 'instant', icon: '장',
    range: 9, radius: 3, duration: 6, tick: 0.5, damage: 0.35, element: 'fire', cooldown: 14, windup: 0.35, recovery: 0.2, color: EF },
  e_crystal: { id: 'e_crystal', name: '서리 결정', desc: '결정을 세운다. 10초간 1초마다 주변 5m 적을 둔화시키고 작은 피해. [서리]를 넣는다.', type: 'place', place: 'frostCrystal', cast: 'instant', icon: '결',
    range: 8, radius: 5, duration: 10, tick: 1, damage: 0.25, slow: { v: 0.35, t: 1.2 }, element: 'frost', cooldown: 16, windup: 0.3, recovery: 0.2, color: EC },
  e_beam: { id: 'e_beam', name: '열기 집속', desc: '누르는 동안(최대 3초) 커서 방향으로 열선. 0.3초마다 피해, 1초마다 [불]. 움직일 수 없다.', type: 'channel', cast: 'hold', icon: '집',
    hold: { max: 3, tick: 0.3 }, length: 9, width: 1.2, damage: 0.45, elementEvery: 1, element: 'fire', cooldown: 10, windup: 0.15, recovery: 0.2, weight: 'light', color: EF },
  e_leap: { id: 'e_leap', name: '문양 도약', desc: '뒤로 6m 물러나며 원래 자리에 서리 폭발(둔화).', type: 'blink', back: true, cast: 'instant', icon: '도',
    distance: 6, burst: { radius: 3, damage: 0.6, slow: { v: 0.5, t: 2 } }, cooldown: 11, windup: 0.1, recovery: 0.15, color: EC },
  e_cycle: { id: 'e_cycle', name: '원소 순환', desc: '원소식의 [불]과 [서리]를 서로 뒤바꾼다. 조합 순서를 다시 짜는 기술. 5초간 피해 +10%.', type: 'cycle', cast: 'instant', icon: '순',
    buff: { v: 0.1, t: 5 }, cooldown: 12, windup: 0.1, recovery: 0.1, color: '#ffb070' },
  e_ult: { id: 'e_ult', name: '대직조 문양', desc: '【각성】 지점에 거대한 문양을 짠다. 원소식 칸마다 위력이 커지고 모두 소모한다. 띄움.', type: 'circleAim', cast: 'instant', ult: true, icon: '각',
    range: 12, radius: 7, damage: 3.5, perElement: 0.8, consumeElements: true, stagger: 70, knock: 'air', cooldown: 90, windup: 1.0, recovery: 0.4, weight: 'heavy', color: '#ffb070' },

  // ───────────── 생명염색사 (안료) — "지금 회복할까, 다음 피해를 준비할까" ─────────────
  d_basic: { id: 'd_basic', name: '도포봉 연타', desc: '도포봉 3연타. 위력은 낮다. 셋째 타는 안료 +4.', type: 'melee', cast: 'combo', icon: '봉',
    range: 2.4, arc: 1.4, cooldown: 0.3, window: 0.75, color: D,
    stages: [{ damage: 0.7, windup: 0.15, recovery: 0.16 }, { damage: 0.7, windup: 0.15, recovery: 0.18 }, { damage: 0.9, windup: 0.2, recovery: 0.28, gain: 4 }] },
  d_green: { id: 'd_green', name: '초록 도포', desc: '아군(대상 없으면 자신)에게 5초간 최대 체력 35% 지속 회복. 안료 25.', type: 'heal', cast: 'instant', icon: '초',
    range: 9, cost: 25, hotPct: 0.35, hotTime: 5, cooldown: 2, windup: 0.2, recovery: 0.15, color: D, doc: true },
  d_spread: { id: 'd_spread', name: '번지는 빛', desc: '지점에 빛을 번지게 해 아군 15% 회복, 적에게 피해. 안료 30.', type: 'circleAim', cast: 'instant', icon: '빛',
    range: 9, radius: 4, healPct: 0.15, damage: 0.7, cost: 30, cooldown: 6, windup: 0.3, recovery: 0.15, weight: 'medium', color: D, doc: true },
  d_bleach: { id: 'd_bleach', name: '색 빼기', desc: '자신과 주변 아군의 해로운 효과(찢김·둔화)를 빼고 3초간 받는 피해 20% 감소. 안료 15.', type: 'cleanse', cast: 'instant', icon: '색',
    radius: 5, protect: 0.2, protectTime: 3, cost: 15, cooldown: 8, windup: 0.15, recovery: 0.1, color: '#e8f4ff', doc: true },
  d_shield: { id: 'd_shield', name: '보호막 염색', desc: '아군(없으면 자신)에게 6초간 최대 체력 25% 보호막. 다음 피해를 미리 준비. 안료 25.', type: 'shield', cast: 'instant', icon: '막',
    range: 9, cost: 25, shieldPct: 0.25, shieldTime: 6, cooldown: 9, windup: 0.2, recovery: 0.15, color: '#9fe0c0' },
  d_pool: { id: 'd_pool', name: '안료 웅덩이', desc: '지점에 8초간 웅덩이. 1초마다 아군 4% 회복, 적은 둔화. 안료 20.', type: 'place', place: 'pigmentPool', cast: 'instant', icon: '웅',
    range: 9, radius: 3.5, duration: 8, tick: 1, healPct: 0.04, slow: { v: 0.3, t: 1.2 }, cost: 20, cooldown: 14, windup: 0.3, recovery: 0.2, color: D },
  d_needle: { id: 'd_needle', name: '붉은 침', desc: '다시 누르면 이어진다: 찌르기 → 안료 회수(적중 시 안료 +12). 카운터 공격 판정.', type: 'melee', cast: 'combo', icon: '침',
    range: 3.2, arc: 1.2, window: 0.9, counter: true, cooldown: 7, color: '#e86a5a',
    stages: [{ damage: 1.0, windup: 0.16, recovery: 0.2, weight: 'medium', stagger: 15 }, { damage: 0.8, windup: 0.18, recovery: 0.3, gain: 12, knock: 'push' }] },
  d_suture: { id: 'd_suture', name: '응급 봉합', desc: '누르는 동안(최대 3초) 0.5초마다 아군(없으면 자신) 6% 회복, 틱마다 안료 6. 움직일 수 없다.', type: 'channel', heal: true, cast: 'hold', icon: '봉합',
    hold: { max: 3, tick: 0.5 }, range: 9, healPct: 0.06, costPerTick: 6, cooldown: 12, windup: 0.15, recovery: 0.15, color: D },
  d_burst: { id: 'd_burst', name: '탈색 폭발', desc: '누르고 있다가 놓는다(최대 1초). 주변 4m 적에게 피해, 아군의 해로운 효과를 지운다. 안료 20.', type: 'circleSelf', cast: 'charge', icon: '폭',
    charge: { max: 1, mult: 2 }, radius: 4, damage: 0.8, cleanse: true, knock: 'push', cost: 20, cooldown: 10, windup: 0.1, recovery: 0.25, weight: 'medium', color: '#e8f4ff' },
  d_ult: { id: 'd_ult', name: '만개', desc: '【각성】 주변 10m 아군을 크게 회복(60%)하고 보호막(30%), 안료를 모두 채운다. 적은 밀려난다.', type: 'circleSelf', cast: 'instant', ult: true, icon: '각',
    radius: 10, damage: 1.2, healPct: 0.6, shieldPct: 0.3, shieldTime: 8, fillRes: true, knock: 'push', stagger: 40, cooldown: 90, windup: 0.8, recovery: 0.4, weight: 'heavy', color: D },
};

/** 기술바 슬롯 순서: 8칸 + 각성 + 구르기 (기본 공격은 별도 표시) */
export const SLOT_ORDER = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'ult', 'basic', 'dodge'];
export const SKILL_SLOTS = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f'];

/** 무게별 기본 무력화 수치 (검증 전 예시) */
export const STAGGER_BY_WEIGHT = { light: 4, medium: 10, heavy: 22 };
