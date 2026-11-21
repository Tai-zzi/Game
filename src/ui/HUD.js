import { SKILLS, SLOT_ORDER } from '../data/skills.js';
import { xpToNext, CLASSES } from '../data/classes.js';
import { MONSTERS } from '../data/monsters.js';
import { NPCS } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';
import { BRIDGE_EVENT } from '../data/contracts.js';
import { ORIGINS } from '../data/origins.js';

const $ = (id) => document.getElementById(id);
const AFFIL = { league: '수선공 연맹 소속', independent: '독립 계약자' };
const ELEMENT = { fire: ['불', '#ff8a4a'], frost: ['서리', '#8fc8ff'] };
const CAST = { instant: '즉발', charge: '차지 — 누르고 있다가 놓기', hold: '유지 — 누르는 동안', combo: '연계 — 다시 누르면 이어짐' };
const KEYNAME = (code) => code.replace('Key', '').replace('Digit', '').replace('Space', 'Spc');

/** 한국어 HUD. 게임 상태를 읽어 그리기만 하며, 값이 바뀔 때만 DOM 을 갱신한다. */
export class HUD {
  constructor(game, bus, { onSkillClick, onChat }) {
    this.game = game;
    this.cache = {};
    this.onSkillClick = onSkillClick;
    this.logEl = $('log');
    this.keymap = null;

    bus.on('log', ({ text, kind }) => this.log(text, kind));
    bus.on('levelUp', ({ level }) => this.banner(`Lv ${level}`, '조금 더 단단해졌습니다'));
    bus.on('actionFail', ({ reason }) => this.toast(reason));
    bus.on('classChanged', () => { this.buildSkillbar(); this.cache = {}; });
    bus.on('bridgeState', ({ state, silent }) => { if (!silent) this.banner(BRIDGE_EVENT.states[state].name, BRIDGE_EVENT.states[state].desc); });
    bus.on('contractUpdate', ({ completed, failed }) => { if (completed) this.banner('계약 완료', ''); if (failed) this.banner('호송 실패', '다시 맡을 수 있습니다'); });
    bus.on('relation', ({ npcId, tag }) => this.log(`[기억] ${NPCS[npcId].name}: ‘${tag.replace(/_/g, ' ')}’`, 'relation'));
    bus.on('channelBreak', () => this.toast('작업이 끊겼습니다'));
    bus.on('skillCast', ({ id, slot }) => {
      if (id !== game.playerId) return;
      const el = this.slots?.[slot];
      if (el) { el.root.classList.remove('flash'); void el.root.offsetWidth; el.root.classList.add('flash'); }
    });

    const chat = $('chat-input');
    chat.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.stopPropagation();
      const v = chat.value.trim();
      if (v) onChat(v);
      chat.value = ''; chat.blur();
    });
  }

  show() { $('hud').classList.remove('hidden'); this.buildSkillbar(); }
  focusChat() { $('chat-input').focus(); }

  buildSkillbar() {
    const p = this.game.player();
    const bar = $('skillbar');
    bar.innerHTML = '';
    this.slots = {};
    for (const slot of SLOT_ORDER) {
      const sk = SKILLS[p.skills[slot]];
      const root = document.createElement('div');
      root.className = `skill ${slot === 'dodge' || slot === 'basic' ? 'small' : ''} ${slot === 'ult' ? 'ult' : ''} ${slot === 'a' ? 'gap' : ''}`;
      const res = CLASSES[p.classId].resource.name;
      const cost = sk.cost ? ` · ${res} ${sk.cost}` : sk.minRes ? ` · ${res} ${sk.minRes} 이상` : '';
      const tags = [sk.counter ? '<span class="tag c">카운터</span>' : '', sk.pos === 'back' ? '<span class="tag">백 어택</span>' : '', sk.pos === 'head' ? '<span class="tag">헤드 어택</span>' : '',
        sk.knock === 'down' ? '<span class="tag">넘어뜨림</span>' : sk.knock === 'air' ? '<span class="tag">띄움</span>' : '', sk.doc ? '<span class="tag d">개정안 대표 기술</span>' : ''].join('');
      root.innerHTML = `<span class="key"></span>${sk.icon}<div class="cd"></div><span class="cdt"></span>
        <div class="tip"><b>${sk.name}</b> <small>${CAST[sk.cast] || ''}</small><br>${sk.desc}<div class="tags">${tags}</div><small>재사용 ${sk.cooldown}초${cost} · 수치는 검증 전 예시</small></div>`;
      root.addEventListener('mousedown', (e) => { e.stopPropagation(); this.onSkillClick(slot, 'press'); });
      root.addEventListener('mouseup', (e) => { e.stopPropagation(); this.onSkillClick(slot, 'release'); });
      bar.appendChild(root);
      this.slots[slot] = { root, key: root.querySelector('.key'), cd: root.querySelector('.cd'), cdt: root.querySelector('.cdt'), id: sk.id };
    }
    if (this.keymap) this.setKeymap(this.keymap);
  }

  setKeymap(keymap) {
    this.keymap = keymap;
    if (!this.slots) return;
    const inv = {};
    for (const [code, slot] of Object.entries(keymap.slots)) if (!inv[slot]) inv[slot] = KEYNAME(code);
    for (const [slot, el] of Object.entries(this.slots)) el.key.textContent = inv[slot] || '';
    const move = keymap.move.up.includes('KeyW') ? 'WASD 이동' : '우클릭/좌클릭 이동 · 꾹 누르면 계속 이동';
    $('keyhint').innerHTML = `${move} · Shift 질주<br>좌클릭 적: 연타 공격 (${inv.basic}) · 사람/물건: 상호작용 G<br>Space 구르기 · ${inv.ult} 각성기 · T 회복약 · Tab 대상<br>I 소지품 · M 지도 · K 인연 · F2 키 배치 (${keymap.label}) · F3 그래픽`;
  }

  log(text, kind = 'system') {
    const line = document.createElement('div');
    line.className = kind;
    const t = new Date();
    line.textContent = `[${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}] ${text}`;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 150) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  banner(title, sub) {
    const b = $('banner');
    b.innerHTML = `${title}<small>${sub}</small>`;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 2500);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), 1400);
  }

  /** 접속 시 "지난번 이후 바뀐 것" */
  showSummary(lines, intro) {
    const el = $('summary');
    el.innerHTML = `<div class="qt-title">${intro ? '하르벤 교역 거점' : '지난 접속 이후 바뀐 것'}</div>${(intro ? [intro] : lines).map((l) => `<p>${l}</p>`).join('')}<button class="primary">확인</button>`;
    el.classList.remove('hidden');
    el.querySelector('button').addEventListener('click', () => el.classList.add('hidden'));
  }

  toggleInventory() {
    const el = $('inventory');
    el.classList.toggle('hidden');
    this.cache.inv = null;
  }

  set(key, value, fn) { if (this.cache[key] !== value) { this.cache[key] = value; fn(value); } }

  update() {
    const g = this.game, p = g.player();
    if (!p) return;
    const cls = CLASSES[p.classId];
    this.set('name', p.name, (v) => { $('pf-name').textContent = v; });
    this.set('lvl', p.level, (v) => { $('pf-level').textContent = `Lv ${v}`; });
    this.set('cls', `${p.classId}|${p.affiliation}|${p.title}`, () => {
      $('pf-class').textContent = `${cls.name} (${cls.role}) · ${AFFIL[p.affiliation] || '소속 미정'} · ${ORIGINS[p.origin]?.name || ''}${p.title ? ` · 「${p.title}」` : ''}`;
    });
    const hp = Math.ceil(p.hp);
    this.set('hp', `${hp}/${p.stats.maxHp}`, (v) => { $('pf-hp').style.width = `${(hp / p.stats.maxHp) * 100}%`; $('pf-hp-text').textContent = v; });
    this.set('gold', p.gold, (v) => { $('pf-gold').textContent = `${v} 골드`; });
    this.renderResource(p, cls);
    // 경험치
    const need = xpToNext(p.level);
    this.set('xp', `${p.xp}/${need}`, (v) => { $('xp-fill').style.width = `${(p.xp / need) * 100}%`; $('xp-text').textContent = `경험치 ${v}`; });
    // 쿨다운
    if (this.slots) for (const el of Object.values(this.slots)) {
      const sk = SKILLS[el.id];
      const cd = p.cooldowns[el.id] || 0;
      this.set(`cd_${el.id}`, cd > 0 ? Math.round((cd / sk.cooldown) * 100) : 0, (v) => el.cd.style.setProperty('--p', `${v}%`));
      this.set(`cdt_${el.id}`, cd > 0.05 && sk.cooldown > 1 ? cd.toFixed(cd < 1 ? 1 : 0) : '', (v) => { el.cdt.textContent = v; });
      const dis = !p.alive || (sk.cost && p.res.value < sk.cost) || (sk.minRes && p.res.value < sk.minRes) || ((sk.type === 'complete' || sk.type === 'cycle') && !p.res.slots.length);
      this.set(`dis_${el.id}`, !!dis, (v) => el.root.classList.toggle('disabled', v));
    }
    // 채집/조사/조립 진행
    const ch = p.channel;
    this.set('chan', ch ? `${ch.kind}:${Math.round((ch.t / ch.dur) * 20)}` : '', () => {
      $('channel').classList.toggle('hidden', !ch);
      if (ch) { $('channel-fill').style.width = `${(ch.t / ch.dur) * 100}%`; $('channel-text').textContent = { gather: '채집 중', investigate: '조사 중', craft: '조립 중' }[ch.kind]; }
    });
    // 대상
    const t = g.get(p.targetId);
    this.set('target', t ? `${t.id}:${Math.ceil(t.hp)}:${t.alive}:${t.marks?.n || 0}:${Math.round(t.stagger?.value ?? -1)}:${t.groggy > 0}` : '', () => this.renderTarget(t));
    this.set('dead', !p.alive, (v) => $('death-screen').classList.toggle('hidden', !v));
    this.set('coords', `${Math.round(p.pos.x)}, ${Math.round(p.pos.z)}`, (v) => { $('coords').textContent = v; });
    // 시계 · 기력
    const life = g.life;
    if (life) this.set('clock', life.clockText, (v) => { $('clock').innerHTML = `${life.isNight ? '☾' : '☀'} ${v} <small>${life.day}일째</small>`; });
    if (p.dodge && this.slots?.dodge) this.set('dodgeCh', p.dodge.charges, (v) => { this.slots.dodge.cdt.textContent = v < 2 ? `${v}` : ''; this.slots.dodge.root.classList.toggle('disabled', v <= 0); });
    // 계약 추적
    const prog = g.contracts.progress(p);
    this.set('contract', JSON.stringify([prog, p.hidden, p.helpTask?.left]), () => this.renderContract(prog));
    // 공공 상태 (서버 공유 영역)
    const b = g.publicState.bridge;
    this.set('public', `${b.state}|${JSON.stringify(b.contrib)}`, () => this.renderPublic(b));
  }

  renderResource(p, cls) {
    const r = p.res;
    const key = `${r.id}:${Math.round(r.value)}:${r.slots.join(',')}`;
    this.set('res', key, () => {
      let body = '';
      if (r.id === 'marks') body = Array.from({ length: 3 }, (_, i) => `<i class="pip ${i < r.value ? 'on' : ''}"></i>`).join('');
      else if (r.id === 'elements') body = Array.from({ length: 3 }, (_, i) => { const e = r.slots[i]; return `<i class="slot" style="${e ? `background:${ELEMENT[e][1]}` : ''}">${e ? ELEMENT[e][0] : ''}</i>`; }).join('');
      else body = `<div class="bar res ${r.id}"><div class="fill" style="width:${(r.value / r.max) * 100}%"></div><span>${Math.round(r.value)}/${r.max}</span></div>`;
      $('pf-res').innerHTML = `<div class="res-label" title="${cls.resource.rule}">${cls.resource.name}</div><div class="res-body">${body}</div>`;
    });
  }

  renderTarget(t) {
    const tf = $('target-frame');
    if (!t || !t.alive || !['monster', 'npc', 'cart'].includes(t.kind)) { tf.classList.add('hidden'); return; }
    tf.classList.remove('hidden');
    tf.classList.toggle('npc', t.kind !== 'monster');
    $('tf-name').textContent = t.name;
    $('tf-level').textContent = t.kind === 'monster' ? `Lv ${t.level}` : t.kind === 'cart' ? '보호 대상' : 'NPC';
    $('tf-kind').textContent = t.kind === 'monster' ? `${MONSTERS[t.monsterId].kind}${t.marks?.n ? ` · 표식 ${'◆'.repeat(t.marks.n)}` : ''}` : t.kind === 'npc' ? NPCS[t.npcId].title : '호송 중인 식량 수레';
    $('tf-hp').style.width = t.kind === 'npc' ? '100%' : `${(t.hp / t.stats.maxHp) * 100}%`;
    $('tf-hp-text').textContent = t.kind === 'npc' ? '' : `${Math.ceil(t.hp)} / ${t.stats.maxHp}`;
    const sg = $('tf-stagger');
    sg.classList.toggle('hidden', !t.stagger);
    if (t.stagger) { $('tf-stg').style.width = `${(t.stagger.value / t.stagger.max) * 100}%`; sg.classList.toggle('groggy', t.groggy > 0); $('tf-stg-text').textContent = t.groggy > 0 ? '무력화!' : '무력화 게이지'; }
    tf.classList.toggle('elite', t.tier === 'elite' || t.tier === 'boss');
  }

  renderContract(prog) {
    const el = $('quest-tracker');
    const hid = this.game.hidden?.tracker(this.game.player()) || [];
    const hidHtml = hid.map((h) => `<div class="qt-title hidden-q">✦ ${h.name}</div><div class="qt-obj current">▶ ${h.label}</div>`).join('');
    const help = this.game.player().helpTask;
    const helpHtml = help ? `<div class="qt-title">돕기 · ${NPCS[help.npcId].name}</div><div class="qt-obj current">▶ 남은 작업 ${help.left}</div>` : '';
    if (hidHtml || helpHtml) { this.renderContractInner(prog, el); el.innerHTML += helpHtml + hidHtml; return; }
    this.renderContractInner(prog, el);
  }

  renderContractInner(prog, el) {
    if (!prog) { el.innerHTML = '<div class="qt-title">진행 중인 계약 없음</div><div class="qt-obj">거점 사람들에게 말을 걸어 보세요. 하지 않아도 됩니다.</div>'; return; }
    el.innerHTML = `<div class="qt-title">${prog.name} <small>· ${NPCS[prog.giver].name}</small></div>` +
      prog.steps.map((s) => `<div class="qt-obj ${s.state}">${s.state === 'done' ? '✓' : s.state === 'current' ? '▶' : '·'} ${s.label}${s.detail ? ` <small>${s.detail}</small>` : ''}</div>`).join('');
  }

  renderPublic(b) {
    const st = BRIDGE_EVENT.states[b.state];
    const c = b.contrib, total = c.escort + c.repair + c.investigate + c.npc;
    const goal = b.state === 'broken' ? BRIDGE_EVENT.stage1At : BRIDGE_EVENT.stage2At;
    const row = (label, v, cls) => `<div class="pub-row"><span>${label}</span><div class="pub-bar"><div class="${cls}" style="width:${Math.min(100, (v / BRIDGE_EVENT.stage2At) * 100)}%"></div></div><b>${v}</b></div>`;
    $('public-panel').innerHTML = `<div class="qt-title">교역로 · ${st.name}</div><div class="pub-desc">${st.desc}</div>` +
      row('호송 안전', c.escort, 'e') + row('수리 자재', c.repair, 'r') + row('조사 진행', c.investigate, 'i') + row('교량 조(NPC)', c.npc, 'n') +
      `<div class="pub-total">공공 결산 ${total} / ${b.state === 'repaired' ? '완료' : goal}</div>`;
  }

  renderInventory(p) {
    const items = Object.entries(p.inventory).filter(([, n]) => n > 0);
    $('inventory').innerHTML = `<div class="qt-title">소지품 <small>(I)</small></div>` + (items.length
      ? items.map(([id, n]) => `<div class="inv-row" title="${ITEMS[id]?.desc || ''}"><i style="background:${ITEMS[id]?.color || '#888'}"></i>${ITEMS[id]?.name || id}<b>${n}</b></div>`).join('')
      : '<div class="qt-obj">비어 있음</div>') + `<div class="inv-gold">${p.gold} 골드</div>`;
  }
}
