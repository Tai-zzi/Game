/**
 * 직업 자원의 획득·소모·고갈 규칙 (수치는 검증 전 예시).
 *  결의(resolve)   : 막기·찌르기 적중으로 축적, 5초 비전투 후 초당 6 감소
 *  표식(marks)     : 적에게 붙는 값. HUD에는 현재 대상(없으면 최대)의 표식 수. 10초 뒤 소멸
 *  원소식(elements): 칸 배열(최대 3). 8초간 새 원소가 없으면 흩어짐
 *  안료(pigment)   : 초당 4 재생, 비전투 시 2배
 */
export function gainResource(game, p, amount, { refund = false } = {}) {
  const r = p.res;
  if (!r || r.id === 'marks' || r.id === 'elements') return;
  r.value = Math.min(r.max, r.value + amount);
  if (!refund) r.lastGain = game.time;
}

export function updateResource(game, p, dt) {
  const r = p.res;
  const inCombat = game.time - p.lastCombat < 5;
  switch (r.id) {
    case 'resolve':
      if (!inCombat) r.value = Math.max(0, r.value - 6 * dt);
      break;
    case 'pigment':
      r.value = Math.min(r.max, r.value + (inCombat ? 4 : 8) * dt);
      break;
    case 'elements':
      if (r.slots.length && game.time - r.lastGain > 8) {
        r.slots = [];
        game.log('원소식이 흩어졌습니다.', 'system');
      }
      r.value = r.slots.length;
      break;
    case 'marks': {
      let best = 0;
      const t = game.get(p.targetId);
      for (const m of game.livingMonsters()) {
        if (m.marks.n && game.time > m.marks.until) m.marks.n = 0;
        if (m.marks.n > best) best = m.marks.n;
      }
      r.value = t?.kind === 'monster' && t.alive ? t.marks.n : best;
      break;
    }
  }
}
