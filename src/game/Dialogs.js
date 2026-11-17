import { NPCS } from '../data/npcs.js';
import { CONTRACTS } from '../data/contracts.js';
import { CLASSES, CLASS_ORDER } from '../data/classes.js';
import { ITEMS } from '../data/items.js';
import { Relations } from './WorldState.js';

/**
 * NPC 대화 구성 (로직 계층). UI는 결과를 그리기만 한다.
 * 반환: { npcId, title, lines[], terms?, options: [{ label, action?: command, page?: string, secondary? }] }
 * 원칙: 거절·기분은 어조와 선택형 의뢰만 바꾼다. 응급 치료·상점·직업 교육·기본 의뢰는 막지 않는다.
 */
export function buildDialog(game, p, npcId, page = 'main') {
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
      if (page === 'shop') {
        const tb = p.inventory.thread_ball || 0;
        return { ...base, lines: [`소지금 ${p.gold}골드. 목재 판 ${ITEMS.lumber.price}골드, 쇠 죔쇠 ${ITEMS.clamp.price}골드. 실뭉치는 개당 ${ITEMS.thread_ball.sell}골드에 사요.`],
          options: [{ label: '목재 판 1개 산다', action: { type: 'buy', item: 'lumber' }, page: 'shop' }, { label: '쇠 죔쇠 1개 산다', action: { type: 'buy', item: 'clamp' }, page: 'shop' },
            ...(tb ? [{ label: `실뭉치 ${tb}개 모두 판다`, action: { type: 'sell', item: 'thread_ball', count: tb }, page: 'shop' }] : []), { label: '그만 본다', page: 'main', secondary: true }] };
      }
      const lines = memo.length ? [memo[memo.length - 1]] : [...npc.greeting];
      const opts = [];
      const a = p.contracts.active;
      if (a?.id === 'repair' && C.step(p)?.type === 'deliver') opts.push({ label: `보강 부품 2개 납품 (공공 기여)`, action: { type: 'deliver', mode: 'contribute' } });
      if ((p.inventory.brace || 0) > 0) opts.push({ label: `보강 부품 판매 (+${ITEMS.brace.sell}골드/개, 기여 없음)`, action: { type: 'deliver', mode: 'sell' }, secondary: true });
      opts.push(...contractOptions(game, p, 'repair'));
      opts.push({ label: '물건을 사고판다', page: 'shop' });
      opts.push(close);
      return { ...base, lines, options: opts };
    }
    case 'trainer': {
      const can = game.canChangeClass(p);
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
