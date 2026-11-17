import { NPCS } from '../data/npcs.js';

const $ = (id) => document.getElementById(id);

/**
 * NPC 대화창. QuestSystem.dialog() 가 만든 데이터를 한 줄씩(타자기 효과) 보여주고,
 * 마지막 줄에서 선택지를 띄운다. 선택 결과는 onAction(cmd) 로 게임에 명령을 보낸다.
 */
export class Dialog {
  constructor(onAction) {
    this.onAction = onAction;
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
    }, true);
  }

  show(data) {
    this.data = data;
    this.idx = 0;
    this.open = true;
    this.el.classList.remove('hidden');
    $('dlg-name').textContent = NPCS[data.npcId].name;
    $('dlg-title').textContent = data.title;
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
    }, 30);
  }

  finishTyping() {
    clearInterval(this.typer);
    this.typing = false;
    $('dlg-text').textContent = this.data.lines[this.idx];
    if (this.idx === this.data.lines.length - 1) this.showOptions();
  }

  showOptions() {
    const box = $('dlg-options');
    box.innerHTML = '';
    this.data.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = o.label;
      if (!o.action && this.data.options.length > 1) b.className = 'secondary';
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); this.choose(o); });
      box.appendChild(b);
      if (i === 0) this.defaultOption = o;
    });
  }

  advance() {
    if (this.typing) { this.finishTyping(); return; }
    if (this.idx < this.data.lines.length - 1) { this.idx++; this.showLine(); return; }
    this.choose(this.defaultOption);
  }

  choose(o) {
    this.close();
    if (o?.action) this.onAction(o.action);
  }

  close() {
    clearInterval(this.typer);
    this.open = false;
    this.el.classList.add('hidden');
  }
}
