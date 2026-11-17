import * as THREE from 'three';

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

    bus.on('damage', ({ targetId, amount, crit }) => {
      const t = game.get(targetId);
      const cls = t?.kind === 'player' ? 'taken' : crit ? 'crit' : '';
      this.float(targetId, (t?.kind === 'player' ? '-' : '') + amount + (crit ? '!' : ''), cls);
    });
    bus.on('xp', ({ amount }) => this.float(game.playerId, `+${amount} 경험치`, 'xp', 2.4));
    bus.on('loot', ({ itemId, count }) => this.float(game.playerId, `실뭉치 +${count}`, 'loot', 2.1));
    bus.on('despawn', ({ id }) => { this.plates.get(id)?.remove(); this.plates.delete(id); });
  }

  float(entityId, text, cls = '', yOff = 1.6) {
    const pos = this.views.positionOf(entityId, yOff);
    const d = document.createElement('div');
    d.className = `dmg ${cls}`;
    d.textContent = text;
    this.el.appendChild(d);
    this.floats.push({ d, pos, t: 0, dx: (Math.random() - 0.5) * 40 });
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
      if (e.kind === 'npc') p.innerHTML = '<div class="mark"></div><div class="nm"></div><div class="sub">수선공 연맹</div>';
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
      const k = f.t / 1.0;
      f.d.style.transform = `translate(calc(-50% + ${s.x + f.dx * k}px), calc(-50% + ${s.y - k * 50}px)) scale(${1 + Math.max(0, 0.4 - f.t * 2)})`;
      f.d.style.opacity = String(1 - Math.max(0, k - 0.6) / 0.4);
      if (f.t >= 1) { f.d.remove(); this.floats.splice(i, 1); }
    }
    const player = this.game.player();
    for (const e of this.game.entities.values()) {
      if (e.kind === 'player') continue;
      const view = this.views.views.get(e.id);
      if (!view) continue;
      const pl = this.plate(e);
      const near = player && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 32;
      const show = near && (e.kind === 'npc' || (e.alive && (e.hp < e.stats.maxHp || player.targetId === e.id || e.ai.state !== 'idle')));
      if (!show) { if (pl.style.display !== 'none') pl.style.display = 'none'; continue; }
      const s = this.project(this.views.positionOf(e.id, view.model.height + 0.45, this.v2 || (this.v2 = new THREE.Vector3())));
      if (!s.vis) { pl.style.display = 'none'; continue; }
      pl.style.display = '';
      pl.style.transform = `translate(calc(-50% + ${s.x | 0}px), calc(-100% + ${s.y | 0}px))`;
      if (e.kind === 'monster') pl._hp.style.width = `${(e.hp / e.stats.maxHp) * 100}%`;
      else {
        const m = this.game.quests.npcMarker(player, e.npcId);
        if (pl._m !== m) { pl._m = m; pl._mark.textContent = m; pl._mark.classList.toggle('gray', m === '…'); }
      }
    }
  }
}
