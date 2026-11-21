import { NPCS } from '../data/npcs.js';
import { CONTRACTS } from '../data/contracts.js';
import { CLASSES, CLASS_ORDER } from '../data/classes.js';
import { ITEMS } from '../data/items.js';
import { ARCHETYPES, ADVANCE_LEVEL } from '../data/archetypes.js';
import { Relations } from './WorldState.js';
import { AFFINITY } from '../data/npcs.js';
import { HELP_TASKS, VILLAGERS, VILLAGER_HELP, HOUSEHOLDS } from '../data/households.js';
import { HIDDEN_QUESTS } from '../data/hiddenQuests.js';
import { relOf, relSummary, stance, trustOf, tierAtLeast } from './Relationships.js';

/**
 * NPC 대화 구성 (로직 계층). UI는 결과를 그리기만 한다.
 * 반환: { npcId, title, lines[], terms?, options: [{ label, action?: command, page?: string, secondary? }] }
 * 원칙: 거절·기분은 어조와 선택형 의뢰만 바꾼다. 응급 치료·상점·직업 교육·기본 의뢰는 막지 않는다.
 */
function coreDialog(game, p, npcId, page = 'main') {
  const npc = NPCS[npcId];
  const C = game.contracts;
  const rel = Relations.get(p, npcId);
  const memo = rel.tags.map((t) => npc.tagLines?.[t]).filter(Boolean);
  const base = { npcId, title: npc.title };
  const close = { label: '대화를 마친다' };

  // 계약 소개 페이지 (모든 의뢰인 공용): 조건을 수락 전에 보여준다
  if (page.startsWith('offer:')) {
    const id = page.slice(6), c = CONTRACTS[id];
    const active = p.contracts.active;
    const opts = [];
    if (!active) opts.push({ label: '맡겠습니다', action: { type: 'contractAccept', id } });
    else if (active.id !== id) opts.push({ label: `「${CONTRACTS[active.id].name}」 포기하고 이걸로 바꾸기`, action: { type: 'contractSwitch', id } });
    opts.push({ label: '생각해 볼게요', secondary: true });
    return { ...base, title: `계약 · ${c.name} (${c.style})`, lines: [c.summary], terms: c.terms, rewards: c.rewards, options: opts };
  }

  switch (npcId) {
    case 'haila': {
      if (page === 'league') {
        return { ...base, lines: ['연맹 명부에 이름을 올릴 수 있어요. 구조·복구 계약을 우선 안내받고, 지부 숙소를 쓸 수 있죠.', '안 올려도 계약은 똑같이 받을 수 있어요. 독립 계약자도 많아요. 정하는 건 당신이에요.'],
          options: [{ label: '이름을 올리겠습니다', action: { type: 'league', join: true } }, { label: '독립 계약자로 남겠습니다', action: { type: 'league', join: false } }, { label: '나중에', secondary: true }] };
      }
      const a = p.contracts.active;
      if (a?.id === 'investigate' && C.step(p)?.type === 'report') {
        return { ...base, lines: ['(명부에 단서를 하나씩 옮겨 적는다) 지반이 결을 따라 갈라졌고, 지난 보수 때 말뚝이 짧았다… 둘 다군요.', '이걸 바로 공지하면 마부들이 겁을 먹고 우회로도 안 쓸지 몰라요. 지부에만 두면 제가 판단해서 알릴 수 있고요.', '…아니, 제가 정하면 안 되겠죠. 당신이 조사했으니까요. 어떻게 할까요?'],
          options: [{ label: '공개 공지로 모두에게 알린다', action: { type: 'report', mode: 'public' } }, { label: '지부에만 보고한다', action: { type: 'report', mode: 'branch' } }, { label: '조금 더 생각해 보겠다', secondary: true }] };
      }
      const lines = memo.length ? [memo[memo.length - 1], ...npc.greeting.slice(1)] : [...npc.greeting];
      const opts = contractOptions(game, p, 'investigate');
      if (!p.affiliation) opts.push({ label: '연맹 가입에 대해 묻는다', page: 'league' });
      opts.push(close);
      return { ...base, lines, options: opts };
    }
    case 'belo': {
      const a = p.contracts.active;
      if (a?.id === 'escort' && C.step(p)?.type === 'escort' && !a.cartId) {
        return { ...base, lines: ['길목은 비었군. 수레는 준비됐어. …문제가 하나 있어.', '마부 하나가 다리를 다쳤다. 지금 모라한테 보내면 수레는 네가 끌어야 해서 느려져. 화물 먼저면 그 친구는 걸어서 돌아와야 하고.', '정답은 없어. 계약서엔 화물이 적혀 있고, 길엔 사람이 있지. 네가 정해.'],
          options: [{ label: '부상자를 먼저 보낸다', action: { type: 'escortStart', choice: 'injured' } }, { label: '화물을 먼저 싣고 간다', action: { type: 'escortStart', choice: 'cargo' } }, { label: '잠깐 준비하고 오겠다', secondary: true }] };
      }
      const lines = memo.length ? [memo[memo.length - 1]] : [...npc.greeting];
      if (p.classId === 'guardian') lines.push('방패는 앞만 막아. 옆이 비면 발을 옮겨. 그게 수호기사 일이야.');
      return { ...base, lines, options: [...contractOptions(game, p, 'escort'), close] };
    }
    case 'mora': {
      if (page === 'emotion') {
        Relations.tag(game, p, 'mora', '감정_조작_요청');
        return { ...base, lines: ['(펜을 멈춘다) 그건 할 수 있어요. 그래서 안 해요.', '안 아프게 할 수는 있어요. 괜찮았던 일로 만들 수는 없고요. 다친 데가 있으면 그건 언제든 봐 드릴게요.'], options: [close] };
      }
      const lines = memo.length ? [memo[memo.length - 1]] : [...npc.greeting];
      const opts = [{ label: '응급 치료를 받는다 (무료)', action: { type: 'emergencyHeal' } }];
      if ((p.records.clues || []).includes('lamb') && !Relations.has(p, 'mora', '새끼양_진료')) opts.push({ label: '쓰러진 새끼 양 이야기를 한다', action: { type: 'moraLamb' } });
      opts.push({ label: '기분이 나아지게 해 달라고 부탁한다', page: 'emotion', secondary: true });
      opts.push(close);
      return { ...base, lines, options: opts };
    }
    case 'merchant': {
      const lines = memo.length ? [memo[memo.length - 1]] : [...npc.greeting];
      const opts = [];
      const a = p.contracts.active;
      if (a?.id === 'repair' && C.step(p)?.type === 'deliver') opts.push({ label: `보강 부품 2개 납품 (공공 기여)`, action: { type: 'deliver', mode: 'contribute' } });
      if ((p.inventory.brace || 0) > 0) opts.push({ label: `보강 부품 판매 (+${ITEMS.brace.sell}골드/개, 기여 없음)`, action: { type: 'deliver', mode: 'sell' }, secondary: true });
      opts.push(...contractOptions(game, p, 'repair'));
      opts.push({ label: '상점을 연다 (사고팔기)', action: { type: 'openShop' } });
      opts.push(close);
      return { ...base, lines, options: opts };
    }
    case 'trainer': {
      const can = game.canChangeClass(p);
      if (!p.advanced) {
        const A = ARCHETYPES[p.archetype];
        const lines = [`${A.name} 계열 견습이군요. Lv ${ADVANCE_LEVEL}이 되면 심화 직업으로 전직할 수 있어요. 지금 Lv ${p.level}.`];
        if (A.lifeFocus) lines.push(A.note);
        const opts = [];
        if (p.level >= ADVANCE_LEVEL && can === true) for (const a of A.advances) opts.push(a.playable ? { label: `「${a.name}」(으)로 전직`, action: { type: 'advance', classId: a.id } } : { label: `「${a.name}」 — 준비 중`, secondary: true });
        else if (p.level >= ADVANCE_LEVEL) lines.push(`지금은 안 돼요: ${can}`);
        else lines.push(`심화 직업: ${A.advances.map((a) => a.name + (a.playable ? '' : ' (준비 중)')).join(' · ') || '없음 — 생업을 중심으로 성장'}`);
        opts.push(close);
        return { ...base, title: '전직 · 공개 교육', lines, options: opts };
      }
      const lines = [...npc.greeting];
      if (can !== true) lines.push(`지금은 안 돼요: ${can}`);
      const opts = can === true ? CLASS_ORDER.filter((c) => c !== p.classId).map((c) => ({ label: `${CLASSES[c].name}로 전환 (${CLASSES[c].role})`, action: { type: 'changeClass', classId: c } })) : [];
      opts.push(close);
      return { ...base, lines, options: opts };
    }
  }
  return { ...base, lines: npc.greeting || ['…'], options: [close] };
}

/** 의뢰인별 계약 선택지 */
function contractOptions(game, p, id) {
  const st = game.contracts.status(p, id);
  const a = p.contracts.active;
  const c = CONTRACTS[id];
  if (st === 'done') return [];
  if (a?.id === id) {
    return [{ label: `「${c.name}」 포기하기`, action: { type: 'contractAbandon' }, secondary: true }];
  }
  const label = p.contracts.done[id] === 'partial' ? `「${c.name}」 다시 맡기 (조건 보기)` : `「${c.name}」 계약 조건 보기`;
  return [{ label, page: `offer:${id}` }];
}

/** NPC 머리 위 표식: '?' 이 사람에게 할 일이 있음, '!' 맡을 수 있는 계약, '…' 이 사람의 계약 진행 중 */
export function npcMarker(game, p, npcId) {
  const C = game.contracts, a = p.contracts.active, step = C.step(p);
  if (Object.entries(p.hidden || {}).some(([id, s]) => s.status === 'offered' && HIDDEN_QUESTS[id].npc === npcId)) return '✦';
  if (a) {
    if (npcId === 'belo' && a.id === 'escort' && step?.type === 'escort' && !a.cartId) return '?';
    if (npcId === 'merchant' && a.id === 'repair' && step?.type === 'deliver') return '?';
    if (npcId === 'haila' && a.id === 'investigate' && step?.type === 'report') return '?';
  }
  const own = Object.values(CONTRACTS).find((c) => c.giver === npcId);
  if (own) {
    if (a?.id === own.id) return '…';
    if (C.status(p, own.id) === 'available' && !a) return '!';
  }
  return '';
}

// ───────────────────────── 관계 · 일과 · 히든 퀘스트를 얹은 대화 ─────────────────────────

const ESSENTIAL = new Set(['contractAccept', 'contractSwitch', 'contractAbandon', 'escortStart', 'deliver', 'report', 'emergencyHeal', 'openShop', 'changeClass']);

/** 오늘의 기분: 게임 날짜·인물로 정해지는 운 + 욕구. 어조만 바꾼다 */
export function moodOf(game, npcId) {
  let h = game.life?.day ?? 0; for (const c of npcId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const roll = ((h % 100) / 100) * 2 - 1;
  const a = game.life?.agents.get(npcId);
  const needs = a ? (a.needs.hunger > 80 ? -0.4 : 0) + (a.needs.rest < 20 ? -0.4 : 0) + (a.needs.social > 70 ? 0.2 : 0) : 0;
  const v = roll * 0.6 + needs;
  return v > 0.35 ? '좋음' : v < -0.35 ? '언짢음' : '보통';
}

/**
 * 대화 구성. opts.substitute = 창구(대신 응대) — 밤·자리 비움·큰 반감에도 필수 기능은 언제나 제공.
 */
export function buildDialog(game, p, npcId, page = 'main', opts = {}) {
  const npc = NPCS[npcId];
  const aff = AFFINITY[npcId];
  const rel = relSummary(p, npcId);
  const st = stance(p, npcId);
  const close = { label: '대화를 마친다' };
  const done = (d) => ({ ...d, rel, substitute: d.substitute || false });

  // 주민 (가벼운 NPC)
  if (npc.villager) return done(villagerDialog(game, p, npcId, page, rel, close));

  // 창구: 필수 기능만, 대신 응대하는 사람 이름으로
  const ent = game.life?.entity(npcId);
  if (aff && (opts.substitute || st.substitute || ent?.hidden)) {
    const core = coreDialog(game, p, npcId, page);
    const clerk = aff.substitute;
    const why = ent?.hidden ? `${npc.name}은(는) 지금 ${ent.activity?.name === '잠' ? '자고 있다' : '집에 있다'}.` : st.substitute ? (aff.tierLines[st.antiTier] || '') : `${npc.name}은(는) 자리를 비웠다.`;
    return done({ ...core, substitute: true, title: `${clerk} · ${npc.name} 대신 응대`, lines: page === 'main' ? [why, `${clerk}: 필요한 일은 제가 똑같이 처리해 드려요.`] : core.lines,
      options: core.options.filter((o) => !o.action || ESSENTIAL.has(o.action.type) || o.page?.startsWith('offer:')).concat(core.options.some((o) => !o.action && !o.page) ? [] : [close]) });
  }
  if (!aff) return done(coreDialog(game, p, npcId, page)); // 교육 담당자 등

  // 관계 페이지
  if (page === 'belief') {
    const bt = aff.beliefTalk;
    return done({ npcId, title: `${npc.title} · 깊은 이야기`, lines: [bt.prompt], options: bt.options.map((o) => ({ label: o.label, action: { type: 'talkBelief', npcId, tag: o.tag }, page: `beliefReply:${o.tag}` })) });
  }
  if (page.startsWith('beliefReply:')) {
    const o = aff.beliefTalk.options.find((x) => x.tag === page.split(':')[1]);
    return done({ npcId, title: npc.title, lines: [o.reply], options: [{ label: '돌아간다', page: 'main' }] });
  }
  if (page === 'gift') {
    const items = Object.entries(p.inventory).filter(([id, n]) => n > 0 && ITEMS[id]?.type !== 'keepsake' && ITEMS[id]?.type !== 'gear');
    return done({ npcId, title: `${npc.name}에게 선물`, lines: [items.length ? '무엇을 건넬까? (하루 3번까지, 같은 물건은 점점 덜 반긴다)' : '건넬 만한 물건이 없다.'],
      options: [...items.slice(0, 7).map(([id, n]) => ({ label: `${ITEMS[id].name} (${n})`, action: { type: 'gift', npcId, item: id }, page: 'giftReply' })), { label: '그만둔다', page: 'main', secondary: true }] });
  }
  if (page === 'giftReply') return done({ npcId, title: npc.title, lines: [aff.gifts.note ? '(반응을 살핀다)' : '(받아 든다)'], options: [{ label: '다른 것도 건넨다', page: 'gift' }, { label: '돌아간다', page: 'main' }] });
  if (page === 'secret') {
    const sec = aff.secrets.filter((s) => trustOf(relOf(p, npcId)) >= s.minTrust && rel.rap >= s.minRapport);
    return done({ npcId, title: `${npc.name} · 털어놓은 이야기`, lines: sec.map((s) => s.text), options: [{ label: '조용히 듣는다', page: 'main' }] });
  }
  if (page === 'refuse') return done({ npcId, title: npc.title, lines: [refusal(npcId)], options: [{ label: '알겠다', page: 'main' }] });
  if (page === 'relQuest') {
    const q = aff.relQuest;
    return done({ npcId, title: `${npc.name} · ${q.name}`, lines: [q.text], options: [{ label: '해 보겠다', action: { type: 'relQuest', npcId }, page: 'main' }, { label: '다음에', page: 'main', secondary: true }] });
  }
  if (page.startsWith('hidden:')) return done(hiddenDialog(game, p, npcId, page.slice(7), close));

  // 기본 대화 + 관계 선택지
  const core = coreDialog(game, p, npcId, page);
  if (page !== 'main') return done(core);
  const mood = moodOf(game, npcId);
  const lines = [...core.lines];
  const tierLine = aff.tierLines[rel.tier];
  if (tierLine && rel.tier !== '낯섦' && !lines.includes(tierLine)) lines.unshift(tierLine);
  if (aff.moodLines?.[mood]) lines.unshift(aff.moodLines[mood]);
  const extra = [];
  for (const [hid, s] of Object.entries(p.hidden || {})) {
    if (HIDDEN_QUESTS[hid].npc !== npcId) continue;
    if (s.status === 'offered') extra.push({ label: '… (따로 할 이야기가 있는 것 같다)', page: `hidden:${hid}` });
    const step = HIDDEN_QUESTS[hid].steps[s.step];
    if (s.status === 'active' && (step?.type === 'talk' || step?.type === 'choice')) extra.push({ label: `「${HIDDEN_QUESTS[hid].name}」 이야기를 잇는다`, page: `hidden:${hid}` });
  }
  if (st.refuseOptional) extra.push({ label: '부탁할 일이 있다', page: 'refuse', secondary: true });
  else {
    if (relOf(p, npcId).daily.talk !== game.life?.day) extra.push({ label: `${aff.beliefTalk.q} (오늘의 대화)`, page: 'belief' });
    extra.push({ label: '선물을 건넨다', page: 'gift' });
    const t = HELP_TASKS[npcId];
    if (t && ent && t.activity.includes(ent.activity?.id) && relOf(p, npcId).daily.help !== game.life?.day && !p.helpTask) extra.push({ label: `일을 돕겠다고 한다: ${t.name}`, action: { type: 'helpStart', npcId } });
    if (aff.relQuest && tierAtLeast(rel.aff, aff.relQuest.minTier) && !relOf(p, npcId).tags.includes(aff.relQuest.tag)) extra.push({ label: `${aff.relQuest.name} (선택형 부탁)`, page: 'relQuest' });
    if (aff.secrets.some((s) => trustOf(relOf(p, npcId)) >= s.minTrust && rel.rap >= s.minRapport)) extra.push({ label: '조금 더 깊은 이야기를 청한다', page: 'secret' });
    if (npcId === 'mora') extra.push({ label: `약초 연고를 받는다 (약초 ${Math.floor(game.life?.world.herbs ?? 0)})`, action: { type: 'herbSalve' } });
  }
  const base = core.options.slice(0, -1);
  return done({ ...core, lines, mood, options: [...base, ...extra, core.options[core.options.length - 1]] });
}

function refusal(npcId) {
  const r = { haila: '지금은 개인적인 부탁은 받기 어려워요. 계약은 서기가 그대로 안내할 거예요.', belo: '지금은 아니야. 일은 조장한테 받아.', mora: '지금은 제 마음이 따라가지 않아요. 아픈 데가 있으면 조수가 바로 볼 거예요.', merchant: '오늘은 장사만 해요. 물건은 점원이 똑같이 팔아요.' };
  return r[npcId] || '지금은 어렵다.';
}

function hiddenDialog(game, p, npcId, hid, close) {
  const q = HIDDEN_QUESTS[hid], s = p.hidden[hid], npc = NPCS[npcId];
  const step = q.steps[s.step];
  if (s.status === 'offered') return { npcId, title: `${npc.name} · ???`, lines: [q.discovery], options: [{ label: '듣겠다', action: { type: 'hiddenAccept', id: hid }, page: `hidden:${hid}` }, { label: '지금은 아니다', page: 'main', secondary: true }] };
  if (step?.type === 'talk') return { npcId, title: `${npc.name} · ${q.name}`, lines: step.text, options: [{ label: '…알겠다', action: { type: 'hiddenTalk', id: hid }, page: 'main' }] };
  if (step?.type === 'choice') return { npcId, title: `${npc.name} · ${q.name}`, lines: [step.prompt], options: step.options.map((o, i) => ({ label: o.label, action: { type: 'hiddenChoose', id: hid, index: i, npcId } })) };
  if (step?.type === 'visit') return { npcId, title: `${npc.name} · ${q.name}`, lines: [`(${step.label})`], options: [{ label: '그만둔다', action: { type: 'hiddenAbandon', id: hid }, secondary: true }, close] };
  return { npcId, title: npc.name, lines: ['…'], options: [close] };
}

function villagerDialog(game, p, vid, page, rel, close) {
  const v = VILLAGERS[vid];
  const hh = HOUSEHOLDS[v.household];
  const ent = game.life?.entity(vid);
  const fam = hh.members.filter((m) => m !== vid).map((m) => NPCS[m].name).join(', ');
  const lines = [v.lines[(game.life?.day ?? 0) % v.lines.length]];
  if (ent?.activity) lines.push(`(${ent.activity.name} 중이다 · ${hh.name}${fam ? ` — ${fam}` : ''})`);
  const opts = [];
  const h = VILLAGER_HELP[vid];
  if (h && !relOf(p, vid).tags.includes(h.tag) && (!h.needsClue || (p.records.clues || []).includes(h.needsClue))) opts.push({ label: h.label, action: { type: 'helpVillager', npcId: vid } });
  opts.push(close);
  return { npcId: vid, title: v.title, lines, options: opts };
}
