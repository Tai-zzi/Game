import { NPCS } from '../data/npcs.js';

const $ = (id) => document.getElementById(id);

/**
 * NPC 대화창. 로직(Dialogs.buildDialog)이 만든 데이터를 한 줄씩 보여주고 선택지를 띄운다.
 * 계약 제안은 제한시간·실패 결과·포기 비용·보상을 함께 표시한다 (v0.3 §9.5).
 * option: { label, action?, page?, secondary? } — action 은 게임 명령, page 는 다음 대화 페이지.
 */
export class Dialog {
  constructor({ onAction, getPage }) {
    this.onAction = onAction;
    this.getPage = getPage;
    this.el = $('dialog');
    this.open = false;
    this.sel = 0;
    this.el.querySelector('.dlg-box').addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.target.tagName !== 'BUTTON') this.advance();
    });
    // 대화 중 키는 여기서 소비한다 (월드 조작으로 새지 않게): E·Space·Enter = 수락/다음, ↑↓·W/S = 선택 이동, 1~9 = 바로 선택, Esc = 닫기
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      const opts = this.data.options, shown = !this.typing && this.idx === this.data.lines.length - 1;
      const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { eat(); if (e.repeat) return; if (shown && opts.length) this.choose(opts[this.sel] || opts[0]); else this.advance(); return; }
      if (e.code === 'Escape') { eat(); this.close(); return; }
      if (shown && (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ArrowRight')) { eat(); this.select(this.sel + 1); return; }
      if (shown && (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowLeft')) { eat(); this.select(this.sel - 1); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) { eat(); if (shown && opts[n - 1]) this.choose(opts[n - 1]); return; }
      if (/^Key|^Digit/.test(e.code)) eat(); // 대화 중 다른 기술 키도 막는다
    }, true);
  }

  show(data) {
    this.data = data;
    this.idx = 0;
    this.open = true;
    this.el.classList.remove('hidden');
    $('dlg-name').textContent = NPCS[data.npcId].name;
    const portrait = { haila: 'npc_hayla', belo: 'npc_bello', mora: 'npc_mora', merchant: 'npc_merchant' }[data.npcId];
    const pe = $('dlg-portrait');
    if (pe) { pe.style.backgroundImage = portrait && !data.substitute ? `url(${import.meta.env.BASE_URL}art/concept/${portrait}.webp)` : 'none'; pe.classList.toggle('hidden', !portrait || data.substitute); }
    $('dlg-title').textContent = data.title;
    this.renderRel(data);
    const terms = $('dlg-terms');
    terms.classList.add('hidden');
    if (data.terms) {
      const r = data.rewards;
      terms.innerHTML = `<div><b>제한시간</b> ${data.terms.timeLimit}</div><div><b>실패하면</b> ${data.terms.failure}</div><div><b>포기하면</b> ${data.terms.abandon}</div>`
        + (r ? `<div><b>보상</b> 경험치 ${r.xp} · ${r.gold}골드 · 공공 기여 ${r.contribution} <small>(검증 전 예시)</small></div>` : '');
    }
    this.showLine();
  }

  /** 관계 패널: 친밀·교감·반감·신뢰 막대, 단계, 기억 3개 */
  renderRel(data) {
    const el = $('dlg-rel');
    const r = data.rel;
    if (!r || data.substitute) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const bar = (label, v, cls, max = 100) => `<div class="rb"><span>${label}</span><i><b class="${cls}" style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></b></i><em>${v}</em></div>`;
    el.innerHTML = `<div class="rt">${r.tier}${r.antiTier ? ` · <span class="anti">${r.antiTier}</span>` : ''}${data.mood && data.mood !== '보통' ? ` · 오늘 ${data.mood}` : ''}</div>`
      + bar('친밀도', r.aff, 'aff') + bar('교감도', r.rap, 'rap') + bar('반감도', r.anti, 'anti') + `<div class="rb"><span>신뢰</span><em class="tr">${r.trust > 0 ? '+' : ''}${r.trust}</em></div>`
      + (r.memories.length ? `<div class="mem">${r.memories.map((m) => `<div>· ${m}</div>`).join('')}</div>` : '');
  }

  showLine() {
    const text = this.data.lines[this.idx];
    const el = $('dlg-text');
    $('dlg-options').innerHTML = '';
    clearInterval(this.typer);
    this.typing = true;
    let i = 0;
    el.textContent = '';
    this.typer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) this.finishTyping();
    }, 24);
  }

  finishTyping() {
    clearInterval(this.typer);
    this.typing = false;
    $('dlg-text').textContent = this.data.lines[this.idx];
    if (this.idx === this.data.lines.length - 1) {
      if (this.data.terms) $('dlg-terms').classList.remove('hidden');
      this.showOptions();
    }
  }

  showOptions() {
    const box = $('dlg-options');
    box.innerHTML = '';
    this.data.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${o.label}`;
      if (o.secondary) b.className = 'secondary';
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); this.choose(o); });
      b.addEventListener('mouseenter', () => this.select(i));
      box.appendChild(b);
    });
    this.select(Math.max(0, this.data.options.findIndex((o) => !o.secondary)));
  }

  /** 선택 표시 + 주 버튼에 [E] */
  select(i) {
    const btns = [...$('dlg-options').children];
    if (!btns.length) return;
    this.sel = (i + btns.length) % btns.length;
    btns.forEach((b, k) => { b.classList.toggle('sel', k === this.sel); b.querySelector('.ekey')?.remove(); if (k === this.sel) b.insertAdjacentHTML('beforeend', '<span class="ekey">E</span>'); });
  }

  advance() {
    if (this.typing) { this.finishTyping(); return; }
    if (this.idx < this.data.lines.length - 1) { this.idx++; this.showLine(); return; }
  }

  choose(o) {
    const npcId = this.data.npcId;
    if (o.action) this.onAction(o.action);
    if (o.page) this.show(this.getPage(npcId, o.page, { substitute: this.data.substitute }));
    else this.close();
  }

  close() {
    clearInterval(this.typer);
    this.open = false;
    this.el.classList.add('hidden');
  }
}
