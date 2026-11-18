import { ITEMS, SHOP_STOCK, EQUIP_SLOTS } from '../data/items.js';
import { ITEM_AI } from '../data/aiAssets.js';
import { CLASSES } from '../data/classes.js';

const $ = (id) => document.getElementById(id);
const STAT = { atk: '공격력', def: '방어력', maxHp: '최대 체력', critChance: '치명타' };
const TYPE = { consumable: '소모품', gear: '장비', material: '재료', loot: '전리품', keepsake: '출신 소지품' };

/**
 * 상점(사기/팔기) + 소지품 격자 + 장비 칸. 로직은 game/Shop.js (명령만 보낸다).
 * 아이콘: AI 아이템 모델이 있으면 한 번 렌더한 3D 썸네일, 없으면 색 칸.
 */
export class ShopUI {
  constructor(game, bus, send, ai) {
    Object.assign(this, { game, send, ai });
    this.open = false;
    this.tab = 'buy';
    this.inv = $('inventory');
    this.shop = $('shop');
    this.tip = $('itemtip');
    bus.on('inventory', () => this.refresh());
    bus.on('equip', () => this.refresh());
    bus.on('classChanged', () => this.refresh());
    document.addEventListener('mousemove', (e) => { if (!this.tip.classList.contains('hidden')) { this.tip.style.left = `${e.clientX + 14}px`; this.tip.style.top = `${e.clientY + 10}px`; } });
  }

  toggleInventory() { this.inv.classList.toggle('hidden'); this.refresh(); }
  openShop() { this.open = true; this.shop.classList.remove('hidden'); this.inv.classList.remove('hidden'); this.refresh(); }
  close() { this.open = false; this.shop.classList.add('hidden'); this.hideTip(); }

  icon(id) {
    const it = ITEMS[id];
    const aiId = ITEM_AI[id];
    const el = `<span class="ico" data-ico="${id}" style="background:${it?.color || '#888'}">${it?.name?.[0] || '?'}</span>`;
    if (aiId && this.ai.enabled) this.ai.icon(aiId).then((url) => {
      if (!url) return;
      document.querySelectorAll(`[data-ico="${id}"]`).forEach((n) => { n.style.background = `url(${url}) center/contain no-repeat, #2a1d14`; n.textContent = ''; });
    });
    return el;
  }

  tipHtml(id) {
    const it = ITEMS[id], p = this.game.player();
    if (!it) return '';
    const stats = it.stats ? Object.entries(it.stats).map(([k, v]) => `${STAT[k]} +${k === 'critChance' ? Math.round(v * 100) + '%' : v}`).join(' · ') : '';
    const cls = it.classes ? it.classes.map((c) => CLASSES[c].name).join(', ') : it.type === 'gear' ? '공용' : '';
    const bad = it.classes && !it.classes.includes(p.classId);
    return `<b>${it.name}</b> <small>${TYPE[it.type] || ''}${it.slot ? ` · ${EQUIP_SLOTS[it.slot]}` : ''}</small><br>${it.desc || ''}`
      + (stats ? `<br><span class="st">${stats}</span>` : '') + (cls ? `<br><small class="${bad ? 'bad' : ''}">착용: ${cls}</small>` : '')
      + `<br><small>${it.price ? `구입 ${it.price}골드 · ` : ''}${it.sell ? `판매 ${it.sell}골드` : '팔 수 없음'} · 검증 전 예시</small>`;
  }
  showTip(id) { this.tip.innerHTML = this.tipHtml(id); this.tip.classList.remove('hidden'); }
  hideTip() { this.tip.classList.add('hidden'); }

  refresh() {
    const p = this.game.player();
    if (!p) return;
    if (!this.inv.classList.contains('hidden')) this.renderInventory(p);
    if (this.open) this.renderShop(p);
  }

  renderInventory(p) {
    const slots = Object.entries(EQUIP_SLOTS).map(([s, label]) => {
      const id = p.equipment[s];
      return `<div class="eq" data-slot="${s}" ${id ? `data-item="${id}"` : ''}><small>${label}</small>${id ? this.icon(id) : '<span class="ico empty"></span>'}</div>`;
    }).join('');
    const items = Object.entries(p.inventory).filter(([, n]) => n > 0);
    const cells = [];
    for (let i = 0; i < Math.max(20, items.length); i++) {
      const [id, n] = items[i] || [];
      cells.push(id ? `<div class="cell" data-item="${id}">${this.icon(id)}<b>${n}</b></div>` : '<div class="cell"></div>');
    }
    const st = p.stats;
    this.inv.innerHTML = `<div class="qt-title">소지품 <small>(I) · 우클릭: 사용/장착${this.open ? ' · 상점: 판매' : ''}</small><span class="x">✕</span></div>
      <div class="eqrow">${slots}</div>
      <div class="stats">공격력 ${st.atk.toFixed(1)} · 방어력 ${st.def.toFixed(1)} · 체력 ${st.maxHp} · 치명 ${Math.round(st.critChance * 100)}%</div>
      <div class="grid">${cells.join('')}</div><div class="inv-gold">${p.gold} 골드</div>`;
    this.inv.querySelector('.x').onclick = () => { this.inv.classList.add('hidden'); this.close(); };
    this.bindTips(this.inv);
    this.inv.querySelectorAll('.cell[data-item]').forEach((c) => {
      const id = c.dataset.item;
      c.oncontextmenu = (e) => { e.preventDefault(); this.send({ type: 'useItem', item: id }); };
      c.onclick = () => { if (this.open && ITEMS[id]?.sell && ITEMS[id].type !== 'keepsake') this.send({ type: 'sell', item: id, count: 1 }); };
    });
    this.inv.querySelectorAll('.eq[data-item]').forEach((c) => { c.oncontextmenu = (e) => { e.preventDefault(); this.send({ type: 'unequip', slot: c.dataset.slot }); }; c.onclick = c.oncontextmenu; });
  }

  renderShop(p) {
    const stock = SHOP_STOCK.merchant;
    const rows = this.tab === 'buy'
      ? stock.map((id) => { const it = ITEMS[id]; const bad = it.classes && !it.classes.includes(p.classId);
        return `<div class="row ${p.gold < it.price ? 'poor' : ''} ${bad ? 'other' : ''}" data-item="${id}">${this.icon(id)}<span class="nm">${it.name}</span><span class="pr">${it.price}골드</span></div>`; }).join('')
      : Object.entries(p.inventory).filter(([id, n]) => n > 0 && ITEMS[id]?.sell && ITEMS[id].type !== 'keepsake')
        .map(([id, n]) => `<div class="row" data-item="${id}">${this.icon(id)}<span class="nm">${ITEMS[id].name} x${n}</span><span class="pr">${ITEMS[id].sell}골드</span></div>`).join('') || '<div class="qt-obj">팔 물건이 없습니다</div>';
    this.shop.innerHTML = `<div class="qt-title">${this.game.player() && '현지 상인'} <small>· 골드만 받습니다</small><span class="x">✕</span></div>
      <div class="tabs"><span class="${this.tab === 'buy' ? 'on' : ''}" data-tab="buy">사기</span><span class="${this.tab === 'sell' ? 'on' : ''}" data-tab="sell">팔기</span></div>
      <div class="rows">${rows}</div><div class="inv-gold">${p.gold} 골드 · 클릭: ${this.tab === 'buy' ? '1개 구입 (Shift: 5개)' : '1개 판매 (Shift: 전부)'}</div>`;
    this.shop.querySelector('.x').onclick = () => this.close();
    this.shop.querySelectorAll('[data-tab]').forEach((t) => { t.onclick = () => { this.tab = t.dataset.tab; this.renderShop(p); }; });
    this.bindTips(this.shop);
    this.shop.querySelectorAll('.row[data-item]').forEach((r) => {
      r.onclick = (e) => {
        const id = r.dataset.item;
        if (this.tab === 'buy') this.send({ type: 'buy', item: id, count: e.shiftKey ? 5 : 1 });
        else this.send({ type: 'sell', item: id, count: e.shiftKey ? 999 : 1 });
      };
    });
  }

  bindTips(root) {
    root.querySelectorAll('[data-item]').forEach((n) => {
      n.onmouseenter = () => this.showTip(n.dataset.item);
      n.onmouseleave = () => this.hideTip();
    });
  }
}
