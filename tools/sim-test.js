// 로직 계층 헤드리스 테스트 (렌더러 없이 Node 에서 GameState 실행). 실행: npm run test:logic
import { EventBus } from '../src/core/EventBus.js';
import { GameState } from '../src/game/GameState.js';
import { CLASS_ORDER, CLASSES } from '../src/data/classes.js';
import { HARVEN } from '../src/data/zones.js';
import { migrateSave } from '../src/core/Save.js';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };
const dt = 1 / 30;
const run = (g, sec, each) => { for (let t = 0; t < sec; t += dt) { each?.(); g.update(dt); } };
function newGame(classId = 'guardian', origin = 'farm', save = null) {
  const bus = new EventBus();
  const events = {};
  bus.on('*', (t) => { events[t] = (events[t] || 0) + 1; });
  const g = new GameState(bus, { seed: 7 });
  g.init({ name: '테스트', origin, classId }, save);
  return { g, p: g.player(), events };
}
const teleport = (p, x, z) => { p.pos.x = x; p.pos.z = z; };
const nearestMonster = (g, p, filter = () => true) => g.livingMonsters().filter(filter)
  .sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0];

console.log('1) 직업 선택과 기술');
for (const cid of CLASS_ORDER) {
  const { g, p, events } = newGame(cid);
  ok(p.classId === cid && p.res.id === CLASSES[cid].resource.id, `${CLASSES[cid].name}: 자원 ${p.res.id}`);
  teleport(p, 30, 30);
  const m = nearestMonster(g, p);
  teleport(m, 32, 30); m.ai.state = 'idle';
  p.targetId = m.id;
  for (const slot of ['basic', 'q', 'w', 'e']) { g.command({ type: 'skill', slot, aim: { ...m.pos } }); run(g, 1.2); }
  g.command({ type: 'skill', slot: 'dodge', aim: { x: 20, z: 30 } }); run(g, 0.5);
  ok((events.skillStrike || 0) >= 2 && (events.damage || 0) >= 1, `${CLASSES[cid].name}: 기술 판정 ${events.skillStrike}회, 피해 ${events.damage}회`);
}
{
  const { g, p } = newGame('archer');
  teleport(p, 30, 30);
  ok(g.changeClass(p, 'dyer') !== true, '거점 밖에서는 직업 변경 불가');
  teleport(p, 0, 8); p.lastCombat = g.time - 10;
  ok(g.changeClass(p, 'dyer') === true && p.classId === 'dyer' && p.level === 1, '안전 거점·비전투에서 직업 변경, 레벨 유지');
  p.lastCombat = g.time;
  ok(g.changeClass(p, 'guardian') !== true, '전투 중 직업 변경 불가');
}

console.log('2) 교역로 사건 — 수레 호위');
{
  const { g, p } = newGame('guardian');
  const buff = () => { p.stats.atk = 400; p.hp = p.stats.maxHp; }; // 레벨업 시 능력치가 재계산되므로 매 프레임
  g.command({ type: 'contractAccept', id: 'escort' });
  ok(p.contracts.active?.id === 'escort', '호위 계약 수락');
  teleport(p, HARVEN.detourArea.x, HARVEN.detourArea.z);
  run(g, 90, () => {
    buff();
    if (g.contracts.step(p)?.type !== 'killInArea' || p.attackTargetId) return;
    const t = nearestMonster(g, p, (m) => m.tag === 'detour');
    if (t) g.command({ type: 'attackTarget', targetId: t.id });
  });
  ok(g.contracts.step(p)?.type === 'escort', '우회로 정리 완료 → 호송 단계');
  ok(g.dialog('belo').options.some((o) => o.action?.type === 'escortStart'), '벨로: 부상자/화물 선택지 제시');
  teleport(p, HARVEN.cartStart.x + 2, HARVEN.cartStart.z);
  g.command({ type: 'escortStart', choice: 'injured' });
  const cart = g.get(p.contracts.active.cartId);
  run(g, 240, () => {
    buff();
    if (cart.alive && Math.hypot(p.pos.x - cart.pos.x, p.pos.z - cart.pos.z) > 6) { p.pos.x = cart.pos.x + 1.5; p.pos.z = cart.pos.z; }
    const tg = g.get(p.attackTargetId);
    if (!tg?.alive || Math.hypot(tg.pos.x - cart.pos.x, tg.pos.z - cart.pos.z) > 7) { const t = nearestMonster(g, p, (m) => (m.ai.targetId === cart.id || m.ai.targetId === p.id) && Math.hypot(m.pos.x - cart.pos.x, m.pos.z - cart.pos.z) < 7); g.command(t ? { type: 'attackTarget', targetId: t.id } : { type: 'stop' }); }
  });
  ok(p.contracts.done.escort === 'success', `호송 성공 (수레 체력 ${Math.ceil(cart.hp)})`);
  ok(p.relations.belo?.tags.includes('부상자_우선'), '관계 태그: 벨로 — 부상자_우선');
  ok(g.publicState.bridge.contrib.escort === 60, '공공 기여: 호송 안전 +60');
}

console.log('3) 교역로 사건 — 장치 수리 보조 (+계약 전환)');
{
  const { g, p } = newGame('dyer');
  g.command({ type: 'contractAccept', id: 'investigate' });
  g.command({ type: 'contractSwitch', id: 'repair' });
  ok(p.contracts.active?.id === 'repair' && p.relations.haila?.tags.includes('조사_포기'), '조사 → 수리로 계약 전환 (포기 비용 = 기억 태그만)');
  const nodes = [...g.entities.values()].filter((e) => e.kind === 'node');
  let guard = 0;
  while (((p.inventory.lumber || 0) < 4 || (p.inventory.clamp || 0) < 2) && guard++ < 20) {
    for (const n of nodes) { n.readyAt = 0; teleport(p, n.pos.x + 1.5, n.pos.z); g.command({ type: 'interact', id: n.id }); run(g, 2); }
  }
  const bench = [...g.entities.values()].find((e) => e.kind === 'station');
  for (let i = 0; i < 2; i++) { teleport(p, bench.pos.x + 2, bench.pos.z); g.command({ type: 'interact', id: bench.id }); run(g, 2.5); }
  ok((p.inventory.brace || 0) >= 2 && g.contracts.step(p)?.type === 'deliver', `보강 부품 조립 ${p.inventory.brace}개 → 납품 단계`);
  g.command({ type: 'deliver', mode: 'contribute' });
  ok(p.contracts.done.repair === 'success' && g.publicState.bridge.contrib.repair === 60, '납품 완료 → 수리 자재 +60');
  const gold = p.gold; g.giveItem(p, 'brace', 1); g.command({ type: 'deliver', mode: 'sell' });
  ok(p.gold > gold && g.publicState.bridge.contrib.repair === 60, '판매는 골드만, 공공 기여 없음');
}

console.log('4) 교역로 사건 — 실종 가축 조사');
{
  const { g, p } = newGame('elementalist');
  g.command({ type: 'contractAccept', id: 'investigate' });
  for (const c of [...g.entities.values()].filter((e) => e.kind === 'clue')) { teleport(p, c.pos.x + 1.5, c.pos.z); g.command({ type: 'interact', id: c.id }); run(g, 2.6); }
  ok(g.contracts.step(p)?.type === 'report', '단서 3개 조사 → 보고 단계');
  ok(g.dialog('haila').options.some((o) => o.action?.type === 'report'), '하일라: 공지 방식 선택지');
  g.command({ type: 'report', mode: 'public' });
  ok(p.contracts.done.investigate === 'success' && p.relations.haila.tags.includes('공지_공개'), '보고 완료, 관계 태그: 공지_공개');
  ok(g.dialog('mora').options.some((o) => o.action?.type === 'moraLamb'), '모라: 새끼 양 선택지 (단서와 연결)');
  ok(g.dialog('mora').options.some((o) => o.action?.type === 'emergencyHeal'), '모라: 응급 치료는 항상 제공');
}

console.log('5) 다리 상태 전환 (공공 결산)');
{
  const { g, events } = newGame('guardian');
  const ps = g.publicState;
  ok(ps.bridge.state === 'broken' && !ps.bridgeWalkable(), '시작: 끊어진 다리 (여울 접근은 유지)');
  ps.contribute('repair', 60); ps.contribute('escort', 45);
  ok(ps.bridge.state === 'temp_bridge' && ps.bridgeWalkable(), `합계 ${ps.total()} → 임시 교량`);
  ps.contribute('investigate', 60); ps.contribute('escort', 15);
  run(g, 60 * 8 + 5);
  ok(ps.bridge.state === 'repaired', `NPC 작업조 진행 포함 합계 ${ps.total()} → 정식 복구`);
  ok((events.bridgeState || 0) >= 2, '상태 변화 이벤트 발행');
  const { g: g2 } = newGame('guardian');
  g2.publicState.contribute('escort', 60); g2.publicState.contribute('investigate', 45);
  ok(g2.publicState.bridge.state === 'detour', '수리 자재 비중이 낮으면 → 임시 우회로');
}

console.log('6) 저장 형식 v2 / 구 저장 이관 / 변경 요약');
{
  const { g } = newGame('archer', 'port');
  const s = g.serialize();
  ok(s.version === 2 && s.character && s.personal && s.public && s.world, '저장: character / personal / public / world 층 분리');
  ok(s.character.inventory.rope === 1, '출신 소지품(항구 노동자 → 밧줄)');
  s.savedAt = Date.now() - 600 * 1000;
  const { g: g2 } = newGame('archer', 'port', s);
  ok(g2.offlineGain > 0 && g2.changesSinceLastSeen().length > 0, `부재 중 진행 +${g2.offlineGain}, 변경 요약 ${g2.changesSinceLastSeen().length}줄`);
  const old = migrateSave({ name: '옛사람', classId: 'apprentice', level: 4, xp: 10, quests: {}, version: 1 });
  ok(old.version === 2 && old.needsProfile && old.character.level === 4, '구 저장(v1) → 이름·레벨 유지, 출신·직업 다시 선택');
}

console.log('7) 상점 · 소지품 · 장비');
{
  const { g, p } = newGame('guardian');
  const merchant = [...g.entities.values()].find((e) => e.npcId === 'merchant');
  teleport(p, 30, 30);
  g.command({ type: 'buy', item: 'potion_s' });
  ok(!(p.inventory.potion_s > 0), '상인과 멀면 거래 불가');
  teleport(p, merchant.pos.x + 2, merchant.pos.z);
  p.gold = 200;
  g.command({ type: 'buy', item: 'potion_s', count: 2 });
  ok(p.inventory.potion_s === 2 && p.gold === 170, `회복약 2개 구입 (골드 ${p.gold})`);
  g.command({ type: 'buy', item: 'gw1' });
  const atk0 = p.stats.atk;
  g.command({ type: 'equip', item: 'gw1' });
  ok(p.equipment.weapon === 'gw1' && Math.abs(p.stats.atk - atk0 - 4) < 1e-6 && !p.inventory.gw1, `무기 장착 → 공격력 +4 (${atk0.toFixed(1)} → ${p.stats.atk.toFixed(1)})`);
  g.command({ type: 'buy', item: 'aw1' }); g.command({ type: 'equip', item: 'aw1' });
  ok(p.equipment.weapon === 'gw1', '다른 직업 전용 장비는 장착 불가');
  const gold = p.gold; g.command({ type: 'sell', item: 'aw1' });
  ok(p.gold === gold + 20 && !p.inventory.aw1, '판매 → 골드 증가');
  p.hp = 10; g.command({ type: 'quickPotion' });
  ok(p.hp > 10 && p.inventory.potion_s === 1 && p.cooldowns.potion > 0, `회복약 사용 → 체력 ${Math.round(p.hp)}, 재사용 대기`);
  g.command({ type: 'quickPotion' });
  ok(p.inventory.potion_s === 1, '재사용 대기 중에는 사용 불가');
  p.lastCombat = -99; g.command({ type: 'unequip', slot: 'weapon' });
  ok(!p.equipment.weapon && p.inventory.gw1 === 1 && Math.abs(p.stats.atk - atk0) < 1e-6, '장비 해제 → 능력치 복귀');
  g.command({ type: 'equip', item: 'gw1' });
  teleport(p, 0, 8); p.lastCombat = -99; g.changeClass(p, 'archer');
  ok(!p.equipment.weapon && p.inventory.gw1 === 1, '직업 변경 시 못 쓰는 장비는 소지품으로');
  const s = g.serialize();
  ok(s.character.equipment && 'weapon' in s.character.equipment, '장비 저장');
}

console.log('8) 타격 타이밍 · 넉백 · 경직');
{
  const { g, p } = newGame('guardian');
  const hits = [];
  g.bus.on('damage', (d) => { if (d.sourceId === p.id) hits.push({ ...d, t: g.time }); });
  teleport(p, 30, 30);
  const m = nearestMonster(g, p);
  teleport(m, 31.8, 30); m.ai.state = 'idle'; m.stats.maxHp = m.hp = 9999;
  p.targetId = m.id;
  const t0 = g.time;
  g.command({ type: 'skill', slot: 'basic', aim: { ...m.pos } });
  ok(hits.length === 0, '기술 입력 직후에는 피해 없음 (예비 동작)');
  const before = { ...m.pos };
  run(g, 0.5);
  ok(hits.length === 1 && Math.abs(hits[0].t - t0 - 0.16) < 0.05, `판정 프레임에 피해 (${((hits[0]?.t ?? 0) - t0).toFixed(2)}초, 예비 동작 0.16초)`);
  ok(Math.hypot(m.pos.x - before.x, m.pos.z - before.z) > 0.2 && hits[0].hitStop > 0, `넉백 ${Math.hypot(m.pos.x - before.x, m.pos.z - before.z).toFixed(2)}m, 히트스톱 힌트 ${hits[0]?.hitStop}s`);
  run(g, 0.6);
  m.stun = 0; m.ai.targetId = p.id; m.ai.state = 'attack'; m.ai.windup = 0.45;
  g.command({ type: 'skill', slot: 'basic', aim: { ...m.pos } }); run(g, 0.2);
  ok(m.ai.state === 'attack' && m.stun === 0, '가벼운 타격은 적의 공격 예비 동작을 끊지 않음 (슈퍼아머)');
  const { g: g2, p: p2 } = newGame('elementalist');
  teleport(p2, 30, 30);
  const m2 = nearestMonster(g2, p2); teleport(m2, 33, 30); m2.ai.state = 'idle'; m2.stats.maxHp = m2.hp = 9999;
  p2.targetId = m2.id;
  p2.res.slots = ['fire', 'fire']; p2.res.lastGain = g2.time;
  g2.command({ type: 'skill', slot: 'e', aim: { ...m2.pos } });
  const before2 = p2.res.slots.length;
  run(g2, 0.3);
  ok(p2.cast && !p2.cast.struck, '완성 문양: 0.3초 시점에는 아직 예비 동작 중');
  run(g2, 0.6);
  ok(p2.res.slots.length === 0 && before2 === 2, '완성 문양: 예비 동작 0.7초 뒤 판정, 원소식 소모');
}

console.log('9) AI 에셋 목록·로더 (없는 파일은 조용히 대체)');
{
  const THREE = await import('three');
  const { AiAssetLoader } = await import('../src/render/AiAssets.js');
  const { AI_ASSETS, NPC_AI, resolveFirst, placementFor, AI_MAX_HEAVY } = await import('../src/data/aiAssets.js');
  ok(Object.values(NPC_AI).every((n) => n.ids.every((id) => AI_ASSETS[id])), 'NPC 대역 목록의 모든 ID가 목록에 있음');
  ok(resolveFirst(['npc_hayla', 'class_weaver'], new Set(['class_weaver'])) === 'class_weaver', 'NPC 전용 모델이 없으면 직업 모델 대역');
  const pl = placementFor('class_guardian', { min: { x: -0.3, y: -0.5, z: -0.25 }, max: { x: 0.3, y: 0.5, z: 0.25 } });
  ok(Math.abs(pl.scale - 1.8) < 1e-6 && Math.abs(pl.y - 0.9) < 1e-6, `높이 1.8m 맞춤 + 바닥 맞춤 (scale ${pl.scale}, y ${pl.y})`);
  const missing = new AiAssetLoader({ fetchFn: async () => ({ ok: false }) });
  ok((await missing.instance('class_guardian')) === null && missing.missing.has('class_guardian'), '없는 파일 → null (오류 없음)');
  const html = new AiAssetLoader({ fetchFn: async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('<!doctype html>...').buffer }) });
  ok((await html.instance('prop_loom')) === null, '개발 서버가 index.html 을 돌려줘도 → null');
  const glbBuf = () => { const b = new ArrayBuffer(16); new DataView(b).setUint32(0, 0x46546c67, true); return b; };
  const fakeScene = () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.5), new THREE.MeshStandardMaterial()); g.add(m); return { scene: g }; };
  let parses = 0;
  const okLoader = new AiAssetLoader({ fetchFn: async () => ({ ok: true, arrayBuffer: async () => glbBuf() }), parse: async () => { parses++; return fakeScene(); } });
  const a = await okLoader.instance('class_guardian'), b = await okLoader.instance('class_guardian');
  const box = new THREE.Box3().setFromObject(a);
  ok(a && b && a !== b && parses === 1, '한 번만 불러오고 복제해서 사용 (캐시)');
  ok(Math.abs(box.min.y) < 1e-3 && Math.abs(box.max.y - 1.8) < 1e-3, `바닥에 맞춰 1.8m (min ${box.min.y.toFixed(3)}, max ${box.max.y.toFixed(2)})`);
  const ids = Object.keys(AI_ASSETS).slice(0, AI_MAX_HEAVY + 2);
  const loaded = (await Promise.all(ids.map((id) => okLoader.load(id)))).filter(Boolean).length;
  ok(loaded === AI_MAX_HEAVY, `무거운 메시 종류 상한 ${AI_MAX_HEAVY}`);
  okLoader.enabled = false;
  ok((await okLoader.instance('class_guardian')) === null, '저품질 설정 → AI 에셋 끔 (대체 모델)');
}

console.log('10) 기술 데이터 검증');
{
  const { SKILLS, SKILL_SLOTS } = await import('../src/data/skills.js');
  const { SKILL_ANIMS } = await import('../src/data/animations.js');
  const { CLASSES } = await import('../src/data/classes.js');
  for (const c of Object.values(CLASSES)) {
    const ids = SKILL_SLOTS.map((s) => c.skills[s]);
    const all = [...ids, c.skills.ult, c.skills.basic, c.skills.dodge];
    ok(ids.length === 8 && new Set(ids).size === 8 && ids.every((id) => SKILLS[id]) && SKILLS[c.skills.ult]?.ult, `${c.name}: 기술 8개 + 각성기`);
    ok(all.every((id) => SKILLS[id].cooldown > 0), `${c.name}: 재사용 대기 > 0`);
    ok(all.every((id) => SKILL_ANIMS[id]), `${c.name}: 애니메이션 매핑 있음`);
    ok(SKILLS[c.skills.basic].stages?.length === 3, `${c.name}: 기본 공격 3연타`);
    ok(ids.filter((id) => SKILLS[id].doc).length === 3, `${c.name}: 개정안 대표 기술 3개 포함`);
  }
  const casts = new Set(Object.values(SKILLS).map((s) => s.cast));
  ok(['instant', 'charge', 'hold', 'combo'].every((k) => casts.has(k)), '시전 방식: 즉발·차지·유지·연계 모두 존재');
}

console.log('11) 시전 방식 · 카운터 · 무력화 · 보스 단계');
{
  const { g, p } = newGame('archer');
  teleport(p, 30, 30);
  const m = nearestMonster(g, p); teleport(m, 36, 30); m.ai.state = 'idle'; m.stats.maxHp = m.hp = 99999;
  g.command({ type: 'skill', slot: 'r', aim: { ...m.pos } }); // 관통 사격 (차지)
  run(g, 0.3);
  ok(!!p.charging, '차지 기술: 누르는 동안 충전');
  g.command({ type: 'skillRelease', slot: 'r', aim: { ...m.pos } }); run(g, 0.4);
  ok(!p.charging && p.cooldowns.a_pierce > 0, '차지 기술: 놓으면 발사');
  const { g: g2, p: p2 } = newGame('guardian');
  teleport(p2, 30, 30);
  g2.command({ type: 'skill', slot: 'q' });
  ok(p2.fx.block > 0, '유지 기술(방패 세우기): 누르는 동안 막기');
  run(g2, 0.5); g2.command({ type: 'skillRelease', slot: 'q' });
  ok(!(p2.fx.block > 0), '유지 기술: 놓으면 해제');
  // 보스: 카운터 → 무력화 → 단계
  const boss = g2.livingMonsters().find((x) => x.monsterId === 'bridge_keeper');
  ok(!!boss && boss.stagger?.max === 200, '중간 보스 「엉킨 교각지기」 + 무력화 게이지');
  teleport(boss, 34, 30); boss.home = { x: 34, z: 30 };
  run(g2, 0.2); p2.lastCombat = -99; p2.cooldowns = {};
  g2.ai.beginAttack(boss, boss.ai && (await import('../src/data/monsters.js')).MONSTERS.bridge_keeper.patterns[1], p2);
  teleport(p2, 32.2, 30); p2.rot = Math.PI / 2;
  p2.targetId = boss.id;
  g2.command({ type: 'skill', slot: 'a', aim: { ...boss.pos } }); // 방패 돌진 (카운터)
  let countered = false; g2.bus.on('counter', () => { countered = true; });
  run(g2, 0.6);
  ok(countered, '카운터 가능 패턴을 카운터 기술로 끊음');
  for (let i = 0; i < 40 && !(boss.groggy > 0); i++) { boss.stun = 0; p2.hp = p2.stats.maxHp; g2.command({ type: 'skill', slot: 'basic', aim: { ...boss.pos } }); run(g2, 0.5); }
  ok(boss.groggy > 0 || boss.stagger.value < boss.stagger.max, `무력화 게이지 감소 (${Math.round(boss.stagger.value)}/${boss.stagger.max})`);
  boss.hp = boss.stats.maxHp * 0.45; boss.groggy = 0; boss.stun = 0; boss.ai.state = 'chase'; boss.ai.targetId = p2.id;
  let phase = null; g2.bus.on('bossPhase', (e) => { phase = phase || e.kind; });
  run(g2, 0.2);
  ok(phase === 'staggerCheck', '체력 50%: 무력화 확인 단계 시작');
  const elite = g2.livingMonsters().find((x) => x.monsterId === 'tangled_alpha');
  ok(!!elite && elite.superArmor && elite.stagger, '엘리트 「엉킨 늑대우두머리」: 슈퍼아머 + 무력화 게이지');
}

console.log(failures ? `\nFAIL (${failures})` : '\nOK');
process.exit(failures ? 1 : 0);
