import { HARVEN, heightAt, riverX } from '../data/zones.js';
import { PLACES } from '../data/households.js';
import { NPCS } from '../data/npcs.js';
import { BRIDGE_EVENT, CONTRACTS } from '../data/contracts.js';
import { relSummary } from '../game/Relationships.js';
import { EXPLORE } from '../game/Explore.js';

const $ = (id) => document.getElementById(id);
const PX = 4; // 배경: 1m = 4px

/**
 * 세계 지도 (M). 수놓은 천 지도 느낌. 탐험하지 않은 곳은 양피지 안개로 덮인다.
 * 휠 확대 · 드래그 이동 · 클릭 목적지 (미니맵·화면 화살표와 연동). 게임은 멈추지 않는다.
 */
export class WorldMap {
  constructor(game, send) {
    this.game = game; this.send = send;
    this.el = $('worldmap'); this.cv = $('worldmap-canvas'); this.ctx = this.cv.getContext('2d');
    this.open = false;
    this.zoom = 3; this.cx = 0; this.cz = 0;
    this.bg = null; this.fog = null; this.fogVer = -1;
    let drag = null;
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(10, Math.max(1.2, this.zoom * (e.deltaY > 0 ? 0.88 : 1.14))); }, { passive: false });
    this.cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false }; this.cv.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      this.cx = drag.cx - dx / this.zoom; this.cz = drag.cz - dy / this.zoom;
    });
    window.addEventListener('mouseup', (e) => {
      if (!drag) return;
      if (!drag.moved && e.target === this.cv) {
        const r = this.cv.getBoundingClientRect();
        const x = this.cx + (e.clientX - r.left - r.width / 2) / this.zoom, z = this.cz + (e.clientY - r.top - r.height / 2) / this.zoom;
        const wp = this.game.player().waypoint;
        if (wp && Math.hypot(wp.x - x, wp.z - z) < 6 / this.zoom * 4) this.send({ type: 'setWaypoint' });
        else this.send({ type: 'setWaypoint', x, z });
      }
      drag = null; this.cv.style.cursor = 'grab';
    });
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    this.open = true; this.el.classList.remove('hidden');
    const p = this.game.player(); this.cx = p.pos.x; this.cz = p.pos.z;
    if (!this.bg) this.bg = this.renderBackground();
  }
  close() { this.open = false; this.el.classList.add('hidden'); }

  /** 수놓은 천 지도 배경 (한 번만) */
  renderBackground() {
    const S = HARVEN.size, W = S * PX;
    const c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d');
    const img = g.createImageData(W / 2, W / 2);
    for (let j = 0; j < W / 2; j++) for (let i = 0; i < W / 2; i++) {
      const x = (i / (W / 2) - 0.5) * S, z = (j / (W / 2) - 0.5) * S;
      const h = heightAt(x, z);
      const weave = ((i + j) % 4 < 2 ? 6 : 0) + ((i - j) % 6 === 0 ? -6 : 0); // 천의 결
      let r = 196 + h * 3 + weave, gg = 178 + h * 4 + weave, b = 132 + weave;
      if (Math.hypot(x - HARVEN.hollow.x, z - HARVEN.hollow.z) < HARVEN.hollow.radius) { r -= 30; gg -= 28; b -= 10; }
      if (h > 5) { r -= 18; gg -= 12; b -= 16; }
      const o = (j * (W / 2) + i) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    const small = document.createElement('canvas'); small.width = small.height = W / 2;
    small.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(small, 0, 0, W, W);
    const P = (x, z) => [(x + S / 2) * PX, (z + S / 2) * PX];
    // 등고선 실 (수놓은 선)
    g.strokeStyle = 'rgba(122,90,58,0.35)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
    for (let lv = 2; lv < 14; lv += 3) {
      for (let j = 0; j < S; j += 2) for (let i = 0; i < S; i += 2) {
        const x = i - S / 2, z = j - S / 2;
        const a = heightAt(x, z) >= lv, bb = heightAt(x + 2, z) >= lv;
        if (a !== bb) { const [px, pz] = P(x + 1, z); g.beginPath(); g.moveTo(px, pz - 3); g.lineTo(px, pz + 3); g.stroke(); }
      }
    }
    // 강: 파란 실 여러 가닥
    g.setLineDash([]);
    for (let k = -2; k <= 2; k++) {
      g.strokeStyle = k === 0 ? '#4a7aa8' : 'rgba(90,140,190,0.7)'; g.lineWidth = k === 0 ? 5 : 2;
      g.beginPath();
      for (let z = -S / 2; z <= S / 2; z += 2) { const [px, pz] = P(riverX(z) + k * 2.2, z); z === -S / 2 ? g.moveTo(px, pz) : g.lineTo(px, pz); }
      g.stroke();
    }
    // 길: 바느질 점선
    g.strokeStyle = '#7a4a2a'; g.lineWidth = 3; g.setLineDash([8, 6]);
    g.beginPath(); let first = true;
    for (let x = -20; x <= 60; x += 2) { const [px, pz] = P(x, 3 + Math.sin(x * 0.08) * 2); first ? g.moveTo(px, pz) : g.lineTo(px, pz); first = false; }
    g.stroke();
    g.beginPath(); HARVEN.cartRoute.forEach((w, i) => { const [px, pz] = P(w.x, w.z); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.stroke();
    g.setLineDash([]);
    // 집: 덧댄 천 조각
    for (const h of HARVEN.houses) {
      const [px, pz] = P(h.x - h.w / 2, h.z - h.d / 2);
      g.fillStyle = h.roof; g.fillRect(px, pz, h.w * PX, h.d * PX);
      g.strokeStyle = '#f3e3c0'; g.setLineDash([3, 2]); g.lineWidth = 1.5; g.strokeRect(px + 2, pz + 2, h.w * PX - 4, h.d * PX - 4); g.setLineDash([]);
    }
    // 나무 숲 무늬 (잿빛 숲)
    g.fillStyle = 'rgba(90,100,80,0.35)';
    for (let i = 0; i < 260; i++) { const a = i * 2.4, r = (i % 37); const [px, pz] = P(HARVEN.hollow.x + Math.cos(a) * r, HARVEN.hollow.z + Math.sin(a) * r); g.beginPath(); g.arc(px, pz, 3, 0, 6.3); g.fill(); }
    return c;
  }

  updateFog() {
    const ex = this.game.explore;
    if (this.fogVer === ex.version && this.fog) return;
    this.fogVer = ex.version;
    const n = ex.n;
    this.fog ||= Object.assign(document.createElement('canvas'), { width: n, height: n });
    const g = this.fog.getContext('2d');
    const img = g.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4, open = ex.isOpen(i, j);
      img.data[o] = 226; img.data[o + 1] = 212; img.data[o + 2] = 178; img.data[o + 3] = open ? 0 : 245;
    }
    g.putImageData(img, 0, 0);
  }

  update() {
    if (!this.open) return;
    const cv = this.cv, ctx = this.ctx, g = this.game, p = g.player();
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    this.updateFog();
    const S = HARVEN.size, z = this.zoom;
    const toS = (x, wz) => [W / 2 + (x - this.cx) * z, H / 2 + (wz - this.cz) * z];
    ctx.fillStyle = '#cbb48a'; ctx.fillRect(0, 0, W, H);
    const [ox, oz] = toS(-S / 2, -S / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bg, ox, oz, S * z, S * z);
    ctx.drawImage(this.fog, ox, oz, S * z, S * z); // 부드러운 안개 (확대 보간)
    const explored = (x, wz) => g.explore.isExplored(x, wz);
    const label = (x, wz, text, color = '#3b2a1c', icon = null) => {
      const [sx, sy] = toS(x, wz);
      if (icon) { ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.fillText(icon, sx, sy + 5); }
      ctx.font = 'bold 12px "Gowun Batang", serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(250,239,214,0.9)'; ctx.strokeText(text, sx, sy - 10); ctx.fillStyle = color; ctx.fillText(text, sx, sy - 10);
    };
    // 장소
    label(0, 0, '하르벤 교역 거점', '#7a3b22', '⌂');
    for (const [k, icon] of [['stall', '⚖'], ['yard', '⚔'], ['clinic', '✚'], ['office', '✎']]) if (explored(PLACES[k].x, PLACES[k].z)) label(PLACES[k].x, PLACES[k].z, PLACES[k].name, '#5a3a22', icon);
    const B = HARVEN.bridge, bs = g.publicState.bridge.state;
    if (explored(riverX(B.z), B.z)) {
      const [x1, y1] = toS(riverX(B.z) - 9, B.z), [x2] = toS(riverX(B.z) + 9, B.z);
      ctx.strokeStyle = { broken: '#c03a2a', detour: '#d98a2a', temp_bridge: '#c9a02a', repaired: '#3a8a4a' }[bs]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
      label(riverX(B.z), B.z - 2, `다리 · ${BRIDGE_EVENT.states[bs].name}`, '#7a2a1a');
    }
    if (explored(riverX(HARVEN.ford.z), HARVEN.ford.z)) label(riverX(HARVEN.ford.z), HARVEN.ford.z, '상류 여울 (늘 건널 수 있음)', '#2a5a8a', '≈');
    if (explored(HARVEN.depot.x, HARVEN.depot.z)) label(HARVEN.depot.x, HARVEN.depot.z, '동쪽 창고', '#5a3a22', '▣');
    // 발견한 지점: 단서 · 위험 지역
    for (const c of HARVEN.clues) if ((p.records.clues || []).includes(c.id)) label(c.x, c.z, c.name, '#2a5a8a', '◆');
    for (const s of HARVEN.spawns) if (s.tag && explored(s.x, s.z)) label(s.x, s.z, s.tag === 'boss' ? '엉킨 교각지기 (위험)' : s.tag === 'elite' ? '엉킨 늑대우두머리 (위험)' : '우회로 위험 구역', '#a02a1a', '☠');
    // 진행 중 계약 목표
    const a = p.contracts.active;
    if (a) {
      const st = g.contracts.step(p);
      const goals = [];
      if (st?.type === 'killInArea') goals.push([HARVEN.detourArea.x, HARVEN.detourArea.z, '우회로 정리']);
      if (st?.type === 'escort') { const cart = g.get(a.cartId); goals.push(cart ? [cart.pos.x, cart.pos.z, '수레'] : [PLACES.yard.x, PLACES.yard.z, '벨로에게']); goals.push([HARVEN.depot.x, HARVEN.depot.z, '호송 목적지']); }
      if (st?.type === 'craft') { goals.push([HARVEN.workbench.x, HARVEN.workbench.z, '작업대']); for (const n of HARVEN.nodes) goals.push([n.x, n.z, n.name]); }
      if (st?.type === 'deliver') goals.push([PLACES.stall.x, PLACES.stall.z, '상인에게 납품']);
      if (st?.type === 'clues') for (const c of HARVEN.clues) if (!a.clues.includes(c.id)) goals.push([c.x, c.z, c.name]);
      if (st?.type === 'report') goals.push([PLACES.office.x, PLACES.office.z, '하일라에게 보고']);
      for (const [x, wz, t] of goals) { const [sx, sy] = toS(x, wz); ctx.strokeStyle = '#d9431a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy, 9 + Math.sin(performance.now() / 200) * 2, 0, 6.3); ctx.stroke(); label(x, wz + 4, `▶ ${t}`, '#d9431a'); }
    }
    // 만난 사람: 지금 있는 곳 (일과 시뮬레이션)
    for (const id of Object.keys(p.relations)) {
      if (!NPCS[id]) continue;
      const w = g.life.whereIs(id);
      if (!w) continue;
      const [sx, sy] = toS(w.x, w.z);
      ctx.fillStyle = w.hidden ? '#8a7a6a' : '#c8402a'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 6.3); ctx.fill();
      ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 1.5; ctx.stroke();
      if (z > 2.2) label(w.x, w.z + 3.5, `${NPCS[id].name}${w.hidden ? ' (집)' : ` · ${w.activity}`}`, '#3b2a1c');
    }
    // 목적지
    if (p.waypoint) { const [sx, sy] = toS(p.waypoint.x, p.waypoint.z); ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#7a3b22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 7, sy - 16); ctx.lineTo(sx + 7, sy - 16); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // 플레이어 (위치·방향)
    const [px, py] = toS(p.pos.x, p.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-p.rot);
    ctx.fillStyle = '#fff6d8'; ctx.strokeStyle = '#3b2a1c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(8, -8); ctx.lineTo(0, -3); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // 테두리 바느질
    ctx.strokeStyle = 'rgba(122,74,42,0.8)'; ctx.setLineDash([10, 6]); ctx.lineWidth = 3; ctx.strokeRect(10, 10, W - 20, H - 20); ctx.setLineDash([]);
    this.renderLegend(p);
  }

  renderLegend(p) {
    const ratio = Math.round(this.game.explore.ratio() * 100);
    const key = `${ratio}|${this.game.publicState.bridge.state}|${p.contracts.active?.id}`;
    if (this.legendKey === key) return;
    this.legendKey = key;
    $('worldmap-legend').innerHTML = `<h3>하르벤 계곡</h3>탐험 ${ratio}% · ${this.game.life.clockText}<br>⌂ 거점 · ⚖ 상점 · ⚔ 훈련장 · ✚ 진료소 · ✎ 연맹<br>● 만난 사람(지금 위치) · ◆ 찾은 단서<br>☠ 위험 지역 · ▶ 계약 목표 · ▼ 목적지<br>다리 색: 빨강 끊어짐 · 주황 우회로 · 노랑 임시 · 초록 복구${p.contracts.active ? `<br>진행 중: 「${CONTRACTS[p.contracts.active.id].name}」` : ''}`;
  }
}

/** 인연 창 (K): 사람들 · 관계 단계 · 지금 있는 곳 · 가족 · 알게 된 취향 */
export class BondsWindow {
  constructor(game) { this.game = game; this.el = $('bonds'); this.open = false; }
  toggle() { this.open = !this.open; this.el.classList.toggle('hidden', !this.open); if (this.open) this.render(); }
  close() { this.open = false; this.el.classList.add('hidden'); }
  render() {
    const g = this.game, p = g.player();
    const ids = ['haila', 'belo', 'mora', 'merchant', ...Object.keys(NPCS).filter((id) => NPCS[id].villager && p.relations[id])];
    const rows = ids.map((id) => {
      const n = NPCS[id], r = relSummary(p, id), w = g.life.whereIs(id);
      const hh = Object.values(g.life ? (g.life.householdOf(id) ? { h: g.life.householdOf(id) } : {}) : {})[0];
      const fam = hh ? (Object.entries(NPCS).filter(([k, v]) => k !== id && g.life.householdOf(k) === hh).map(([, v]) => v.name).join(', ')) : '';
      return `<div class="bond"><div><b>${n.name}</b><small>${n.title}</small><small class="tier">${r.tier}${r.antiTier ? ` · ${r.antiTier}` : ''} · 친밀 ${r.aff} · 교감 ${r.rap}</small></div>
        <div><small class="where">지금: ${w ? (w.hidden ? `${w.place} (집 안 — 창구 이용)` : `${w.place} · ${w.activity}`) : '?'}</small>
        ${fam ? `<small>가족·함께 사는 사람: ${fam}</small>` : ''}
        <small class="known">${r.known.length ? r.known.join(' · ') : '아직 취향을 모른다 (오늘의 대화·선물로 알아 가기)'}</small>
        ${r.memories.length ? `<small>기억: ${r.memories.join(' · ')}</small>` : ''}</div></div>`;
    }).join('');
    this.el.innerHTML = `<div class="qt-title">인연 <small>(K) · 관계는 접속하지 않아도 줄지 않습니다</small><span class="x">✕</span></div>${rows}`;
    this.el.querySelector('.x').onclick = () => this.close();
  }
}

export const MAP_CONST = { PX, EXPLORE };
