import { ITEMS, SHOP_STOCK, EQUIP_SLOTS, SHOP_CATEGORIES, categoryOf, sellPriceOf } from '../data/items.js';
import { ITEM_AI } from '../data/aiAssets.js';
import { CLASSES } from '../data/classes.js';
import { priceOf, inStock } from '../game/Shop.js';

const $ = (id) => document.getElementById(id);
const STAT = { atk: '공격력', def: '방어력', maxHp: '최대 체력', critChance: '치명타' };
const TYPE = { consumable: '소모품', gear: '장비', material: '재료', loot: '전리품', keepsake: '출신 소지품', misc: '잡화' };

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
      + `<br><small>${it.price ? `구입 ${it.price}골드 · ` : ''}${sellPriceOf(id) ? `판매 ${sellPriceOf(id)}골드` : '팔 수 없음'} · 검증 전 예시</small>`;
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
      c.onclick = () => { if (this.open && sellPriceOf(id) > 0) this.send({ type: 'sell', item: id, count: 1 }); };
    });
    this.inv.querySelectorAll('.eq[data-item]').forEach((c) => { c.oncontextmenu = (e) => { e.preventDefault(); this.send({ type: 'unequip', slot: c.dataset.slot }); }; c.onclick = c.oncontextmenu; });
  }

  /** 잡화점: 사기(분류) · 팔기(정가 40%) · 되사기, 수량 선택 */
  renderShop(p) {
    const cat = this.cat || 'all';
    const stock = SHOP_STOCK.merchant.filter((id) => cat === 'all' || categoryOf(id) === cat);
    let rows = '';
    if (this.tab === 'buy') {
      rows = stock.map((id) => {
        const it = ITEMS[id]; const bad = it.classes && !it.classes.includes(p.classId); const pr = priceOf(this.game, p, id); const oos = inStock(this.game, id) !== true;
        return `<div class="row ${p.gold < pr ? 'poor' : ''} ${bad || oos ? 'other' : ''}" data-item="${id}" data-act="buy">${this.icon(id)}<span class="nm">${it.name}${oos ? ' <small>(다리 끊김 — 입고 대기)</small>' : ''}</span><span class="pr">${pr}골드${pr < it.price ? ' ♥' : ''}</span></div>`;
      }).join('');
    } else if (this.tab === 'sell') {
      rows = Object.entries(p.inventory).filter(([id, n]) => n > 0 && sellPriceOf(id) > 0 && (cat === 'all' || categoryOf(id) === cat))
        .map(([id, n]) => `<div class="row" data-item="${id}" data-act="sell">${this.icon(id)}<span class="nm">${ITEMS[id].name} x${n}</span><span class="pr">${sellPriceOf(id)}골드</span></div>`).join('') || '<div class="qt-obj">팔 물건이 없습니다</div>';
    } else {
      rows = (p.buyback || []).map((b, i) => `<div class="row ${p.gold < b.unit * b.count ? 'poor' : ''}" data-item="${b.itemId}" data-act="buyback" data-index="${i}">${this.icon(b.itemId)}<span class="nm">${ITEMS[b.itemId].name} x${b.count}</span><span class="pr">${b.unit * b.count}골드</span></div>`).join('') || '<div class="qt-obj">최근에 판 물건이 없습니다</div>';
    }
    const cats = ['all', ...Object.keys(SHOP_CATEGORIES)].map((c) => `<span class="${cat === c ? 'on' : ''}" data-cat="${c}">${c === 'all' ? '전체' : SHOP_CATEGORIES[c]}</span>`).join('');
    this.shop.innerHTML = `<div class="qt-title">하르벤 잡화점 <small>· 골드만 받습니다 · 되팔기는 정가의 40%</small><span class="x">✕</span></div>
      <div class="tabs">${[['buy', '사기'], ['sell', '팔기'], ['buyback', '되사기']].map(([k, l]) => `<span class="${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</span>`).join('')}</div>
      ${this.tab !== 'buyback' ? `<div class="tabs cats">${cats}</div>` : ''}
      <div class="rows">${rows}</div>
      <div class="qty hidden"></div>
      <div class="inv-gold">${p.gold} 골드 · 클릭: 수량 선택</div>`;
    this.shop.querySelector('.x').onclick = () => this.close();
    this.shop.querySelectorAll('[data-tab]').forEach((t) => { t.onclick = () => { this.tab = t.dataset.tab; this.renderShop(p); }; });
    this.shop.querySelectorAll('[data-cat]').forEach((t) => { t.onclick = () => { this.cat = t.dataset.cat; this.renderShop(p); }; });
    this.bindTips(this.shop);
    this.shop.querySelectorAll('.row[data-item]').forEach((r) => {
      r.onclick = () => {
        const id = r.dataset.item, act = r.dataset.act;
        if (act === 'buyback') { this.send({ type: 'buyback', index: +r.dataset.index }); return; }
        this.askQty(p, id, act);
      };
    });
  }

  /** 수량 선택 (− / + / 최대) */
  askQty(p, id, act) {
    const box = this.shop.querySelector('.qty');
    const unit = act === 'buy' ? priceOf(this.game, p, id) : sellPriceOf(id);
    const max = act === 'buy' ? Math.max(1, Math.min(99, Math.floor(p.gold / Math.max(1, unit)))) : (p.inventory[id] || 0);
    let n = 1;
    const draw = () => {
      box.innerHTML = `<b>${ITEMS[id].name}</b> ${act === 'buy' ? '사기' : '팔기'}<div class="qrow"><button data-q="-10">-10</button><button data-q="-1">−</button><span>${n}</span><button data-q="1">+</button><button data-q="10">+10</button><button data-q="max">최대</button></div>
        <div class="qrow"><span>합계 ${unit * n}골드</span><button class="primary" data-q="ok">${act === 'buy' ? '구입' : '판매'}<span class="ekey">E</span></button><button data-q="cancel">취소</button></div>`;
      box.querySelectorAll('[data-q]').forEach((bt) => {
        bt.onclick = (e) => {
          e.stopPropagation();
          const q = bt.dataset.q;
          if (q === 'ok') { this.send({ type: act, item: id, count: n }); box.classList.add('hidden'); return; }
          if (q === 'cancel') { box.classList.add('hidden'); return; }
          n = q === 'max' ? max : Math.max(1, Math.min(max, n + +q));
          draw();
        };
      });
    };
    box.classList.remove('hidden');
    draw();
  }

  bindTips(root) {
    root.querySelectorAll('[data-item]').forEach((n) => {
      n.onmouseenter = () => this.showTip(n.dataset.item);
      n.onmouseleave = () => this.hideTip();
    });
  }
}
