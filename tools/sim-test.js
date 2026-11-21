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

console.log('6) 저장 형식 v3 / 구 저장 이관 / 변경 요약');
{
  const { g } = newGame('archer', 'port');
  const s = g.serialize();
  ok(s.version === 4 && s.character && s.personal && s.public && s.world, '저장: character / personal / public / world 층 분리');
  ok(s.character.inventory.rope === 1, '출신 소지품(항구 노동자 → 밧줄)');
  s.savedAt = Date.now() - 600 * 1000;
  const { g: g2 } = newGame('archer', 'port', s);
  ok(g2.offlineGain > 0 && g2.changesSinceLastSeen().length > 0, `부재 중 진행 +${g2.offlineGain}, 변경 요약 ${g2.changesSinceLastSeen().length}줄`);
  const old = migrateSave({ name: '옛사람', classId: 'apprentice', level: 4, xp: 10, quests: {}, version: 1 });
  ok(old.version === 4 && old.needsProfile && old.character.level === 4, '구 저장(v1) → 이름·레벨 유지, 출신·직업 다시 선택');
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
  ok(p.gold === gold + Math.round(60 * 0.4) && !p.inventory.aw1, '판매 → 골드 증가 (정가의 40%)');
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
  for (const c of Object.values(CLASSES).filter((x) => !x.novice)) {
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

console.log('12) 관계 (친밀·교감·반감·신뢰)');
{
  const { relOf, giveGift, relSummary, stance } = await import('../src/game/Relationships.js');
  const { g, p } = newGame('guardian');
  p.inventory.thread_ball = 10; p.inventory.lumber = 10;
  const gains = [];
  for (let i = 0; i < 3; i++) { const r = giveGift(g, p, 'mora', 'thread_ball'); gains.push(r.delta); }
  ok(gains[0] > gains[1] && gains[1] > gains[2], `선물 체감: ${gains.map((x) => x.toFixed(2)).join(' → ')}`);
  ok(typeof giveGift(g, p, 'mora', 'thread_ball') === 'string', '하루 선물 상한(3회)');
  g.life.day++;
  ok(typeof giveGift(g, p, 'mora', 'thread_ball') === 'object', '다음 날 다시 선물 가능');
  ok(relSummary(p, 'mora').known.length > 0, '반응을 보고 좋아하는 것을 알게 됨 (인연 창)');
  // 기억 태그
  g.command({ type: 'contractAccept', id: 'escort' }); g.command({ type: 'contractAbandon' });
  ok(relSummary(p, 'belo').memories.includes('약속한 호송을 포기함') && relOf(p, 'belo').broken === 1, '기억 태그: 「약속한 호송을 포기함」, 어긴 약속 → 신뢰 하락');
  // 금지선: 친밀도 최대여도
  const mr = relOf(p, 'mora'); mr.aff = 100; mr.rap = 100;
  const d = g.dialog('mora', 'emotion');
  ok(/안 해요/.test(d.lines.join('')), '금지선: 친밀도 100 에서도 감정 조작 거절');
  // 반감 최대에서도 필수 기능
  for (const id of ['haila', 'belo', 'mora', 'merchant']) relOf(p, id).anti = 100;
  ok(stance(p, 'mora').substitute, '반감 최대 → 대신 응대(조수)');
  ok(g.dialog('mora').options.some((o) => o.action?.type === 'emergencyHeal'), '반감 최대에도 응급 치료 제공');
  ok(g.dialog('merchant').options.some((o) => o.action?.type === 'openShop'), '반감 최대에도 상점 제공');
  ok(g.dialog('haila').options.some((o) => o.page?.startsWith('offer:') || o.action?.type === 'contractAccept'), '반감 최대에도 계약 안내');
  ok(!g.dialog('mora').options.some((o) => o.page === 'gift'), '반감이 크면 선택형 부탁(선물·잡담)은 받지 않음');
}

console.log('13) 살아 있는 NPC (하루 일과·가족·창구)');
{
  const { scheduledAt } = await import('../src/game/NpcLife.js');
  const { PLACES } = await import('../src/data/households.js');
  const { g, p } = newGame('guardian');
  teleport(p, 0, 8);
  const seen = {};
  const belo = g.life.entity('belo');
  for (let i = 0; i < 1440 / 15; i++) { // 15분씩 하루
    g.life.minutes += 15; g.life.update(0); g.life.decide(g.life.agents.get('belo'), belo);
    seen[g.life.agents.get('belo').current.activity] = true;
  }
  ok(seen.drill && seen.sleep && seen.eat, `벨로의 하루: ${Object.keys(seen).join(', ')}`);
  ok(scheduledAt('mora', 14).activity === 'gather' && scheduledAt('mora', 23).activity === 'sleep', '모라: 오후 약초 채집 → 밤 잠');
  // 밤에는 가족이 집으로
  g.life.minutes = Math.floor(g.life.minutes / 1440) * 1440 + 22 * 60;
  for (let i = 0; i < 90 * 30; i++) g.update(1 / 30); // 90초 (가까운 NPC 는 걸어서)
  const home = PLACES.home_harck;
  const harck = ['belo', 'lise', 'toby'].map((id) => g.life.entity(id));
  ok(harck.every((e) => Math.hypot(e.pos.x - home.x, e.pos.z - home.z) < 3 && e.hidden), '밤: 하르크 가족 모두 집 안');
  // 밤 + 창구
  const d = g.dialog('mora', 'main');
  ok(d.substitute && d.options.some((o) => o.action?.type === 'emergencyHeal'), '밤(모라 잠): 진료소 종 → 조수가 응급 치료');
  const desks = [...g.entities.values()].filter((e) => e.kind === 'desk');
  ok(desks.length === 4, '필수 기능 창구 4곳 (게시판·모집판·진료소 종·좌판 장부)');
  // 접속하지 않은 시간: 감소 없음
  const s = g.serialize(); const before = JSON.stringify(s.personal.relations);
  s.savedAt = Date.now() - 3 * 24 * 3600 * 1000;
  const { g: g2, p: p2 } = newGame('guardian', 'farm', s);
  ok(JSON.stringify(g2.serialize().personal.relations) === before, '3일 접속하지 않아도 관계 수치 그대로 (감소 없음)');
  ok(g2.life.day > g.life.day, `부재 중 시계만 진행 (${g.life.day}일 → ${g2.life.day}일)`);
}

console.log('14) 일 돕기 · 히든 퀘스트');
{
  const { relOf } = await import('../src/game/Relationships.js');
  const { g, p } = newGame('guardian');
  const merchant = g.life.entity('merchant');
  g.life.minutes = 10 * 60; g.life.snap('merchant');
  ok(merchant.activity.id === 'stall', '상인: 오전 좌판 장사');
  g.command({ type: 'helpStart', npcId: 'merchant' });
  ok(!!p.helpTask, '일 돕기 시작 (상자 나르기)');
  const a0 = relOf(p, 'merchant').aff;
  for (const id of [...p.helpTask.spots]) { const e = g.get(id); teleport(p, e.pos.x + 1.2, e.pos.z); g.command({ type: 'interact', id }); run(g, 3); }
  ok(!p.helpTask && relOf(p, 'merchant').aff > a0, `돕기 완료 → 친밀도 ${a0} → ${relOf(p, 'merchant').aff}`);
  g.command({ type: 'helpStart', npcId: 'merchant' });
  ok(!p.helpTask, '돕기는 하루 1회');
  // 히든 퀘스트: 잠김 → 열림
  g.hidden.check(p);
  ok(!p.hidden.belo_withdrawal, '히든 퀘스트: 관계가 낮으면 보이지 않음');
  const r = relOf(p, 'belo'); r.aff = 65; r.rap = 45;
  g.hidden.check(p);
  ok(p.hidden.belo_withdrawal?.status === 'offered', '친밀 「신뢰」+ 교감 40 → 벨로가 따로 말을 건다');
  g.command({ type: 'hiddenAccept', id: 'belo_withdrawal' });
  g.life.minutes = Math.floor(g.life.minutes / 1440) * 1440 + 21 * 60;
  teleport(p, 9, 2); run(g, 1.5);
  ok(p.hidden.belo_withdrawal.step === 1, '밤 훈련장 방문 → 다음 단계');
  g.command({ type: 'hiddenChoose', id: 'belo_withdrawal', index: 0, npcId: 'belo' });
  ok(p.hidden.belo_withdrawal.status === 'done' && p.cosmetics.includes('crest_harck'), '선택 → 보상: 하르크 가문 방패 문양 (외형 전용)');
  const mr = relOf(p, 'merchant'); mr.aff = 70; mr.rap = 40;
  g.hidden.check(p);
  ok(!p.hidden.merchant_smuggle, '상인 히든: 다리가 끊어진 상태면 잠김 (세계 조건)');
}

console.log('15) 탐험 지도 · 질주 · 구르기 충전');
{
  const { ExploreMap } = await import('../src/game/Explore.js');
  const { FEEL } = await import('../src/data/feel.js');
  const { g, p } = newGame('archer');
  ok(g.explore.isExplored(p.pos.x, p.pos.z) && !g.explore.isExplored(80, -80), '시작 지점만 밝혀짐');
  teleport(p, 60, 60); run(g, 1);
  ok(g.explore.isExplored(60, 60), '이동한 곳이 밝혀짐');
  const ex2 = new ExploreMap(g.explore.serialize());
  ok(ex2.isExplored(60, 60) && !ex2.isExplored(-90, 80), '탐험 기록 저장/불러오기');
  teleport(p, -200, -100);
  g.command({ type: 'sprint', on: true }); g.command({ type: 'moveDir', x: 1, z: 0 });
  const x0 = p.pos.x;
  run(g, 1);
  ok(p.pos.x - x0 > p.stats.moveSpeed * 1.4, `질주: 1초에 ${(p.pos.x - x0).toFixed(1)}m (기본 ${p.stats.moveSpeed})`);
  const x1 = p.pos.x; run(g, 8); const x2 = p.pos.x; run(g, 1);
  ok(p.pos.x - x2 > p.stats.moveSpeed * 1.4 && !('stamina' in p), '질주는 제한 없음 (9초 뒤에도 같은 속도, 기력 없음)');
  g.command({ type: 'sprint', on: false }); g.command({ type: 'moveDir', x: 0, z: 0 });
  p.cooldowns = {};
  g.command({ type: 'skill', slot: 'dodge' }); run(g, 0.5);
  g.command({ type: 'skill', slot: 'dodge' }); run(g, 0.5);
  ok(p.dodge.charges === 0, '구르기 2회 충전 소모');
  g.command({ type: 'skill', slot: 'dodge' });
  ok(!(p.fx.iframes > 0), '충전이 없으면 구르기 불가');
  run(g, FEEL.move.dodgeRecharge + 0.1);
  ok(p.dodge.charges === 1, `${FEEL.move.dodgeRecharge}초 뒤 1회 회복`);
}

console.log('16) 타격감 설정 (feel.js) 검증');
{
  const { FEEL } = await import('../src/data/feel.js');
  const { MONSTERS } = await import('../src/data/monsters.js');
  const { CLASS_ORDER } = await import('../src/data/classes.js');
  ok(['light', 'medium', 'heavy'].every((w) => ['push', 'stagger', 'hitStop', 'shake', 'sparks'].every((k) => FEEL.weight[w][k] != null) && FEEL.fx.threadsPerHit[w] && FEEL.rumble[w]), '무게별 히트스톱·흔들림·불꽃·실 조각·진동 값');
  ok(FEEL.weight.light.hitStop < FEEL.weight.medium.hitStop && FEEL.weight.medium.hitStop < FEEL.weight.heavy.hitStop, '히트스톱은 무게에 비례');
  ok(Object.keys(MONSTERS).every((id) => FEEL.materials[id]), '모든 몬스터에 피격 재질 입자');
  ok(CLASS_ORDER.every((c) => FEEL.classFx[c]?.trail && FEEL.classFx[c]?.rim), '직업별 궤적·테두리 색');
  ok(['maxStreaks', 'maxThreads', 'maxPuffs', 'maxFlashes', 'maxRings', 'maxDecals', 'maxGhosts'].every((k) => FEEL.fx[k] > 0) && FEEL.fx.lowQualityScale < 1, '입자 풀 크기 고정 + 저품질 배율');
  const { g, p } = newGame('guardian');
  g.command({ type: 'debugDummy' });
  const dummy = g.livingMonsters().find((m) => m.dummy);
  ok(!!dummy && dummy.stats.atk === 0, 'F9 시험 허수아비 생성 (공격하지 않음)');
  const evs = [];
  g.bus.on('damage', (d) => evs.push(d));
  teleport(dummy, p.pos.x + 2, p.pos.z); p.targetId = dummy.id; p.rot = Math.atan2(2, 0);
  for (let i = 0; i < 3; i++) { g.command({ type: 'skill', slot: 'basic', aim: { ...dummy.pos } }); run(g, 0.45); }
  ok(evs.length >= 3 && evs.every((d) => d.dir && d.hitStop > 0) && evs[2].weight === 'medium', '3연타: 방향·히트스톱 정보, 셋째 타는 더 무겁다');
}

console.log('17) 잡화점: 수량 · 되팔기 40% · 되사기 · 음식 · 귀환');
{
  const { ITEMS, sellPriceOf, SELL_RATE } = await import('../src/data/items.js');
  const { g, p } = newGame('dyer');
  const shop = [...g.entities.values()].find((e) => e.npcId === 'merchant');
  teleport(p, shop.pos.x, shop.pos.z + 2);
  p.gold = 500;
  g.command({ type: 'buy', item: 'potion_s', count: 5 });
  ok(p.inventory.potion_s === 5 && p.gold === 500 - 5 * 15, `수량 구입: 회복약 5개 (골드 ${p.gold})`);
  const g0 = p.gold;
  g.command({ type: 'sell', item: 'potion_s', count: 3 });
  ok(p.inventory.potion_s === 2 && p.gold === g0 + 3 * Math.round(15 * SELL_RATE), `되팔기 정가의 40%: 3개 → +${p.gold - g0}`);
  ok(p.buyback.length === 1 && p.buyback[0].count === 3, '되사기 목록에 기록');
  const g1 = p.gold;
  g.command({ type: 'buyback', index: 0 });
  ok(p.inventory.potion_s === 5 && p.gold === g1 - 3 * sellPriceOf('potion_s') && p.buyback.length === 0, '되사기: 판 값 그대로 돌려받음');
  g.command({ type: 'buy', item: 'warm_bread', count: 1 }); g.command({ type: 'useItem', item: 'warm_bread' });
  p.hp = 10; run(g, 3);
  ok(p.fx.food && p.hp > 10, '음식 효과: 지속 회복');
  g.command({ type: 'buy', item: 'recall' });
  teleport(p, 60, 60); p.lastCombat = -99;
  g.command({ type: 'useItem', item: 'recall' }); run(g, 2.3);
  ok(Math.hypot(p.pos.x - 0, p.pos.z - 10) < 2, '귀환 실타래: 2초 뒤 거점으로');
  ok(g.serialize().personal.buyback !== undefined, '되사기 목록 저장');
  g.command({ type: 'buy', item: 'potion_m' });
  ok(!(p.inventory.potion_m > 0), '다리가 끊긴 동안 일부 물건은 입고 대기');
}

console.log('18) 넓은 계곡: 성벽 · 매듭돌 빠른 이동 · 지역');
{
  const { HARVEN, regionAt, heightAt } = await import('../src/data/zones.js');
  const { g, p } = newGame('archer');
  ok(HARVEN.size >= 1500 && HARVEN.boundsRadius >= 700, `지역 크기 ${HARVEN.size}m, 걸을 수 있는 반경 ${HARVEN.boundsRadius}m`);
  teleport(p, 0, 30); g.command({ type: 'moveDir', x: 0, z: -1 }); run(g, 0.2); g.command({ type: 'moveDir', x: 0, z: 0 });
  teleport(p, -20, 20); g.command({ type: 'moveDir', x: -0.7, z: 0.7 }); run(g, 3); g.command({ type: 'moveDir', x: 0, z: 0 });
  ok(Math.hypot(p.pos.x, p.pos.z) < HARVEN.walls.r, '성벽은 문이 아니면 지나갈 수 없다');
  teleport(p, 34, 3); g.command({ type: 'moveDir', x: 1, z: 0 }); run(g, 1); g.command({ type: 'moveDir', x: 0, z: 0 });
  ok(Math.hypot(p.pos.x, p.pos.z) > HARVEN.walls.r + 1, '동문으로는 나갈 수 있다');
  const a = HARVEN.anchors.find((x) => x.id === 'lake');
  g.command({ type: 'travel', id: 'lake' });
  ok(!p.channel, '찾지 못한 매듭돌로는 이동 불가');
  teleport(p, a.x, a.z); run(g, 0.2);
  ok(p.anchors.includes('lake'), '매듭돌 발견');
  teleport(p, -200, -150); p.lastCombat = -99;
  g.command({ type: 'travel', id: 'lake' }); run(g, 2.8);
  ok(Math.hypot(p.pos.x - a.x, p.pos.z - a.z) < 5, '발견한 매듭돌로 빠른 이동');
  ok(regionAt(-380, 300).id === 'ruins' && regionAt(-40, 380).id === 'forest' && heightAt(600, 600) > 40, '지역: 폐허·숲·바깥 산맥');
  ok(HARVEN.spawns.filter((s) => (s.levelRange?.[0] || 1) >= 7).length >= 4, '멀리 갈수록 높은 레벨 거점');
}

console.log('19) 계열 → 전직 (v0.3 제안 기준)');
{
  const { ARCHETYPES, ADVANCE_LEVEL } = await import('../src/data/archetypes.js');
  const { CLASSES } = await import('../src/data/classes.js');
  const { migrateSave } = await import('../src/core/Save.js');
  const bus = new EventBus();
  const g = new GameState(bus, { seed: 3 }); g.init({ name: '견습', origin: 'farm', archetype: 'ranged' });
  const p = g.player();
  ok(p.classId === 'novice_ranged' && !p.advanced && p.archetype === 'ranged', '계열 선택 → 견습 사수로 시작');
  ok(Object.values(ARCHETYPES).every((a) => CLASSES[a.novice]?.novice), '모든 계열에 견습 직업');
  teleport(p, 0, 8); p.lastCombat = -99;
  g.command({ type: 'advance', classId: 'archer' });
  ok(p.classId === 'novice_ranged', 'Lv ' + ADVANCE_LEVEL + ' 전에는 전직 불가');
  g.command({ type: 'changeClass', classId: 'guardian' });
  ok(p.classId === 'novice_ranged', '전직 전에는 직업 변경 불가');
  p.level = ADVANCE_LEVEL;
  g.command({ type: 'advance', classId: 'shooter' });
  ok(p.classId === 'novice_ranged', '준비 중인 심화 직업(슈터 — 제안)으로는 전직 불가');
  ok(g.dialog('trainer').options.some((o) => o.action?.type === 'advance'), '교육 담당자: 전직 선택지');
  g.command({ type: 'advance', classId: 'archer' });
  ok(p.classId === 'archer' && p.advanced && p.skills.ult === 'a_ult', '전직 → 매듭궁수 (기술 8개 + 각성기 열림)');
  ok(g.serialize().character.archetype === 'ranged' && g.serialize().character.advanced === true, '저장: 계열·전직 여부');
  const old = migrateSave({ version: 3, character: { name: '옛', classId: 'dyer', level: 5 }, personal: {}, public: {}, world: {} });
  ok(old.version === 4 && old.character.archetype === 'mage' && old.character.advanced === true, '구 저장(v3) 이관: 기존 직업 = 전직한 심화 직업');
  const g2 = new GameState(new EventBus(), { seed: 3 }); g2.init({ name: '구', origin: 'farm', classId: 'dyer' }, old);
  ok(g2.player().classId === 'dyer' && g2.player().advanced, '이관한 캐릭터는 그대로 생명염색사');
}

console.log(failures ? `\nFAIL (${failures})` : '\nOK');
process.exit(failures ? 1 : 0);
