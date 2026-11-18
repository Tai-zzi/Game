import * as THREE from 'three';
import { npcMarker } from '../game/Dialogs.js';
import { ITEMS } from '../data/items.js';
import { FEEL } from '../data/feel.js';

/**
 * 3D 위치에 붙는 DOM 요소: 데미지 숫자, 이름표/체력바, NPC 퀘스트 표식.
 */
export class Overlay {
  constructor(game, bus, views, camera) {
    Object.assign(this, { game, views, camera });
    this.el = document.getElementById('overlay');
    this.floats = [];
    this.plates = new Map();
    this.v = new THREE.Vector3();

    bus.on('damage', ({ targetId, amount, crit, weight }) => {
      const t = game.get(targetId);
      const cls = t?.kind === 'player' ? 'taken' : crit ? 'crit' : weight === 'heavy' ? 'heavy' : '';
      this.float(targetId, (t?.kind === 'player' ? '-' : '') + amount, cls, 1.6 * (t?.scale || 1), { pop: crit ? 1.9 : weight === 'heavy' ? 1.5 : 1.25 });
    });
    const CALL = { back: '백 어택', head: '헤드 어택' };
    bus.on('positional', ({ targetId, kind }) => this.float(targetId, CALL[kind], 'callout', 2.4, { pop: 1.3, still: true }));
    bus.on('counter', ({ id }) => this.float(id, '카운터!', 'callout counter', 2.8, { pop: 2, still: true }));
    bus.on('groggy', ({ id }) => this.float(id, '무력화!', 'callout groggy', 3.0, { pop: 2, still: true }));
    bus.on('parry', ({ id }) => this.float(id, '받아치기!', 'callout counter', 2.4, { pop: 1.8, still: true }));
    bus.on('absorb', ({ targetId, amount }) => this.float(targetId, `보호막 ${amount}`, 'healed', 1.9));
    bus.on('xp', ({ amount }) => this.float(game.playerId, `+${amount} 경험치`, 'xp', 2.4));
    bus.on('loot', ({ itemId, count }) => this.float(game.playerId, `${ITEMS[itemId]?.name || itemId} +${count}`, 'loot', 2.1));
    bus.on('heal', ({ targetId, amount }) => { if (amount >= 2) this.float(targetId, `+${amount}`, 'healed', 1.8); });
    bus.on('evade', ({ targetId }) => this.float(targetId, '회피', 'xp', 1.8));
    bus.on('blocked', ({ targetId }) => this.float(targetId, '차단', 'xp', 1.8));
    bus.on('despawn', ({ id }) => { this.plates.get(id)?.remove(); this.plates.delete(id); });
  }

  /** 떠오르는 글자: 튀어나오며(pop) 포물선으로 떨어진다. still = 제자리에서 위로만 */
  float(entityId, text, cls = '', yOff = 1.6, { pop = 1.25, still = false } = {}) {
    const pos = this.views.positionOf(entityId, yOff);
    const d = document.createElement('div');
    d.className = `dmg ${cls}`;
    d.textContent = text;
    this.el.appendChild(d);
    const N = FEEL.numbers;
    this.floats.push({ d, pos, t: 0, life: still ? N.life * 1.2 : N.life, dx: still ? 0 : (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * N.arc), pop, still });
    if (this.floats.length > 60) { const f = this.floats.shift(); f.d.remove(); }
  }

  project(pos) {
    this.v.copy(pos).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * window.innerWidth, y: (-this.v.y * 0.5 + 0.5) * window.innerHeight, vis: this.v.z < 1 };
  }

  plate(e) {
    let p = this.plates.get(e.id);
    if (!p) {
      p = document.createElement('div');
      p.className = `plate ${e.kind}`;
      if (e.kind === 'npc') p.innerHTML = '<div class="mark"></div><div class="nm"></div>';
      else if (e.kind !== 'monster' && e.kind !== 'cart') p.innerHTML = '<div class="nm"></div>';
      else p.innerHTML = '<div class="nm"></div><div class="hpb"><div></div></div>';
      p.querySelector('.nm').textContent = e.kind === 'monster' ? `Lv${e.level} ${e.name}` : e.name;
      this.el.appendChild(p);
      this.plates.set(e.id, p);
      p._hp = p.querySelector('.hpb div');
      p._mark = p.querySelector('.mark');
    }
    return p;
  }

  update(dt) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const s = this.project(f.pos);
      const k = f.t / f.life;
      const N = FEEL.numbers;
      const y = f.still ? -k * N.rise * 0.6 : -Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * N.rise + Math.max(0, k - 0.55) * N.rise * 0.9;
      const sc = 1 + (f.pop - 1) * Math.max(0, 1 - f.t * 9);
      f.d.style.transform = `translate(calc(-50% + ${s.x + f.dx * k}px), calc(-50% + ${s.y + y}px)) scale(${sc})`;
      f.d.style.opacity = String(1 - Math.max(0, k - 0.65) / 0.35);
      if (f.t >= f.life) { f.d.remove(); this.floats.splice(i, 1); }
    }
    const player = this.game.player();
    for (const e of this.game.entities.values()) {
      if (e.kind === 'player') continue;
      const view = this.views.views.get(e.id);
      if (!view) continue;
      const pl = this.plate(e);
      const near = player && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 32;
      const show = near && (e.kind === 'npc' || e.kind === 'cart' || (e.kind === 'monster' ? e.alive && (e.hp < e.stats.maxHp || player.targetId === e.id || e.ai.state !== 'idle' || e.marks.n > 0) : Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 12));
      if (!show) { if (pl.style.display !== 'none') pl.style.display = 'none'; continue; }
      const s = this.project(this.views.positionOf(e.id, view.model.height + 0.45, this.v2 || (this.v2 = new THREE.Vector3())));
      if (!s.vis) { pl.style.display = 'none'; continue; }
      pl.style.display = '';
      pl.style.transform = `translate(calc(-50% + ${s.x | 0}px), calc(-100% + ${s.y | 0}px))`;
      if (e.kind === 'monster' || e.kind === 'cart') {
        pl._hp.style.width = `${(e.hp / e.stats.maxHp) * 100}%`;
        if (e.kind === 'monster' && pl._mk !== e.marks.n) { pl._mk = e.marks.n; pl.querySelector('.nm').textContent = `${'◆'.repeat(e.marks.n)} Lv${e.level} ${e.name}`; }
      } else if (e.kind === 'npc') {
        const m = npcMarker(this.game, player, e.npcId);
        if (pl._m !== m) { pl._m = m; pl._mark.textContent = m; pl._mark.classList.toggle('gray', m === '…'); }
      }
    }
  }
}
