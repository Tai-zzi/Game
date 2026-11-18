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
    this.el.querySelector('.dlg-box').addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.target.tagName !== 'BUTTON') this.advance();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.advance(); }
      if (e.code === 'Escape') { e.stopImmediatePropagation(); this.close(); }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && !this.typing && this.data.options[n - 1]) { e.stopImmediatePropagation(); this.choose(this.data.options[n - 1]); }
    }, true);
  }

  show(data) {
    this.data = data;
    this.idx = 0;
    this.open = true;
    this.el.classList.remove('hidden');
    $('dlg-name').textContent = NPCS[data.npcId].name;
    $('dlg-title').textContent = data.title;
    const terms = $('dlg-terms');
    terms.classList.add('hidden');
    if (data.terms) {
      const r = data.rewards;
      terms.innerHTML = `<div><b>제한시간</b> ${data.terms.timeLimit}</div><div><b>실패하면</b> ${data.terms.failure}</div><div><b>포기하면</b> ${data.terms.abandon}</div>`
        + (r ? `<div><b>보상</b> 경험치 ${r.xp} · ${r.gold}골드 · 공공 기여 ${r.contribution} <small>(검증 전 예시)</small></div>` : '');
    }
    this.showLine();
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
      box.appendChild(b);
    });
  }

  advance() {
    if (this.typing) { this.finishTyping(); return; }
    if (this.idx < this.data.lines.length - 1) { this.idx++; this.showLine(); return; }
  }

  choose(o) {
    const npcId = this.data.npcId;
    if (o.action) this.onAction(o.action);
    if (o.page) this.show(this.getPage(npcId, o.page));
    else this.close();
  }

  close() {
    clearInterval(this.typer);
    this.open = false;
    this.el.classList.add('hidden');
  }
}
