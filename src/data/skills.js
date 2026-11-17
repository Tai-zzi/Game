/**
 * 기술 데이터 (v0.3 제안 기준). 이름·역할은 개정안 §5에서 가져왔고,
 * 거리·피해·재사용·비용 등 모든 숫자는 "검증 전 예시"다.
 *
 * 타이밍: windup(예비 동작) → strike(판정 순간) → recovery(회수). 행동 고정 = windup + recovery.
 * weight: 타격감 연출 강도 힌트 (light | medium | heavy)
 * cost: 직업 자원 소모량, interruptible: 예비 동작 중 피격되면 취소(자원·쿨다운 환불)
 */
export const SKILLS = {
  // ── 공통 자가 생존 수단 ──
  dodge: { id: 'dodge', name: '구르기', desc: '짧게 굴러 공격을 피한다 (잠깐 무적).', type: 'dodge',
    distance: 4.5, duration: 0.28, iframes: 0.32, cooldown: 4, windup: 0, recovery: 0.05, icon: '구' },

  // ── 수호기사 ──
  g_thrust: { id: 'g_thrust', name: '창 찌르기', desc: '짧은 창으로 찌른다. 막은 직후라면 결의 20을 써서 반격(2배).', type: 'melee',
    range: 2.6, arc: 1.4, damage: 1.0, cooldown: 0.6, windup: 0.16, recovery: 0.2, gain: 5, weight: 'light', icon: '창' },
  g_shield: { id: 'g_shield', name: '방패 세우기', desc: '3초간 정면을 막는다. 막은 공격마다 결의 +15. 이동 속도 절반. 측면·후방은 막지 못한다.', type: 'block',
    duration: 3, arc: 2.4, reduce: 0.75, gainPerBlock: 15, moveMult: 0.5, cooldown: 6, windup: 0.08, recovery: 0.05, icon: '방' },
  g_escort: { id: 'g_escort', name: '호위 교대', desc: '보호 중인 아군(호송 수레 등) 곁으로 이동해 4초간 받는 피해를 절반으로 줄인다. 결의 20.', type: 'escort',
    range: 12, cost: 20, guard: 0.5, guardTime: 4, cooldown: 10, windup: 0.1, recovery: 0.15, icon: '호' },
  g_wall: { id: 'g_wall', name: '성벽 전개', desc: '전방에 5초간 실 방벽을 세워 정면에서 오는 공격과 진입을 차단한다. 결의 40.', type: 'wall',
    cost: 40, width: 5.5, offset: 2.2, duration: 5, cooldown: 14, windup: 0.3, recovery: 0.2, weight: 'medium', icon: '벽' },

  // ── 매듭궁수 ──
  a_shot: { id: 'a_shot', name: '사격', desc: '장궁으로 쏜다. 적이 너무 가까우면(2.5m) 위력이 떨어진다.', type: 'projectile',
    range: 12, damage: 0.9, speed: 28, closeMult: 0.6, closeRange: 2.5, cooldown: 0.7, windup: 0.2, recovery: 0.12, weight: 'light', icon: '사' },
  a_mark: { id: 'a_mark', name: '표식 화살', desc: '조준 후 쏘아 표식을 남긴다(최대 3). 조준 중 맞으면 끊긴다.', type: 'projectile',
    range: 14, damage: 1.1, speed: 32, addMark: 1, interruptible: true, cooldown: 2.2, windup: 0.45, recovery: 0.12, weight: 'medium', icon: '표' },
  a_link: { id: 'a_link', name: '연결 사격', desc: '사거리 안의 표식 걸린 적을 잇는 사격. 표식당 추가 피해 후 표식 소모. 벽을 뚫지 않는다.', type: 'link',
    range: 14, damage: 0.6, perMark: 0.9, cooldown: 7, windup: 0.3, recovery: 0.2, weight: 'heavy', icon: '연' },
  a_knotstep: { id: 'a_knotstep', name: '매듭 이동', desc: '커서 방향으로 짧게(6m) 이동해 거리를 다시 잰다.', type: 'blink',
    distance: 6, cooldown: 9, windup: 0.08, recovery: 0.1, icon: '매' },

  // ── 원소직조사 ──
  e_bolt: { id: 'e_bolt', name: '문양탄', desc: '작은 문양을 날린다. 원소식을 채우지 않는다.', type: 'projectile',
    range: 10, damage: 0.8, speed: 22, cooldown: 0.75, windup: 0.22, recovery: 0.12, weight: 'light', icon: '문' },
  e_ember: { id: 'e_ember', name: '불씨', desc: '불씨를 던지고 원소식 칸에 [불]을 넣는다.', type: 'projectile',
    range: 10, damage: 0.9, speed: 20, element: 'fire', cooldown: 1.4, windup: 0.22, recovery: 0.12, weight: 'light', icon: '불' },
  e_frost: { id: 'e_frost', name: '서리선', desc: '전방 직선에 서리를 그어 둔화시키고 [서리]를 넣는다.', type: 'line',
    length: 8, width: 1.6, damage: 0.6, slow: 0.45, slowTime: 3, element: 'frost', cooldown: 3, windup: 0.25, recovery: 0.15, weight: 'medium', icon: '서' },
  e_complete: { id: 'e_complete', name: '완성 문양', desc: '원소식을 모두 소모. 같은 원소 연속 = 단일 집중 피해, 섞인 조합 = 범위 피해와 둔화. 시전 중 맞으면 취소되지만 원소식은 남는다.', type: 'complete',
    range: 10, radius: 3.5, interruptible: true, cooldown: 3, windup: 0.7, recovery: 0.2, weight: 'heavy', icon: '완' },

  // ── 생명염색사 ──
  d_tap: { id: 'd_tap', name: '도포봉 치기', desc: '도포봉으로 친다. 위력은 낮다.', type: 'melee',
    range: 2.4, arc: 1.4, damage: 0.7, cooldown: 0.65, windup: 0.16, recovery: 0.2, weight: 'light', icon: '봉' },
  d_green: { id: 'd_green', name: '초록 도포', desc: '아군(대상 없으면 자신)에게 5초간 최대 체력 35%를 서서히 회복. 안료 25.', type: 'heal',
    range: 9, cost: 25, hotPct: 0.35, hotTime: 5, cooldown: 2, windup: 0.2, recovery: 0.15, icon: '초' },
  d_spread: { id: 'd_spread', name: '번지는 빛', desc: '지점에 빛을 번지게 해 아군 15% 회복, 적에게 피해. 안료 30.', type: 'healArea',
    range: 9, radius: 4, healPct: 0.15, damage: 0.7, cost: 30, cooldown: 6, windup: 0.3, recovery: 0.15, weight: 'medium', icon: '빛' },
  d_bleach: { id: 'd_bleach', name: '색 빼기', desc: '자신과 주변 아군의 해로운 효과(찢김·둔화)를 빼고 3초간 받는 피해 20% 감소. 안료 15.', type: 'cleanse',
    radius: 5, protect: 0.2, protectTime: 3, cost: 15, cooldown: 8, windup: 0.15, recovery: 0.1, icon: '색' },
};

/** 슬롯 표시 순서 */
export const SLOT_ORDER = ['basic', 'q', 'w', 'e', 'dodge'];
