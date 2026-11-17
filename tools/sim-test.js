// 로직 계층 헤드리스 테스트: 렌더러 없이 Node 에서 GameState 를 돌려 본다.
// (서버 권위 구조로 옮길 수 있는지 확인하는 용도)  실행: npm run test:logic
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/game/GameState.js';

const bus = new EventBus();
const counts = {};
bus.on('*', (t) => { counts[t] = (counts[t] || 0) + 1; });
const g = new GameState(bus, { seed: 7 });
g.init('테스트');
const p = g.player();
p.stats.atk = 60; // 빠른 진행을 위해
g.command({ type: 'questAccept', questId: 'q_sheep' });

let t = 0;
const dt = 1 / 30;
while (t < 240) {
  // 가장 가까운 양을 추적 공격, 장력이 높으면 놓아치기
  if (!p.attackTargetId && p.alive) {
    const target = g.livingMonsters().filter((m) => m.monsterId === 'unravel_sheep')
      .sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0];
    if (target) g.command({ type: 'attackTarget', targetId: target.id });
  }
  if (p.tension.value > 60) g.command({ type: 'skill', skillId: 'release', aim: g.get(p.attackTargetId)?.pos });
  g.update(dt);
  t += dt;
  if (g.quests.status(p, 'q_sheep') === 'ready') break;
}
console.log('time', t.toFixed(1), 'status', g.quests.status(p, 'q_sheep'), 'level', p.level, 'xp', p.xp, 'inv', p.inventory);
g.command({ type: 'questComplete', questId: 'q_sheep' });
console.log('after complete:', g.quests.status(p, 'q_sheep'), 'q2:', g.quests.status(p, 'q_threads'), 'level', p.level);
console.log('events', counts);
if (g.quests.status(p, 'q_sheep') !== 'done') { console.error('FAIL'); process.exit(1); }
console.log('OK');
