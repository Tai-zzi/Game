import { HARVEN, heightAt, riverX } from '../data/zones.js';
import { npcMarker } from '../game/Dialogs.js';

/**
 * 원형 미니맵. 지형은 한 번만 오프스크린 캔버스에 그려두고,
 * 매 프레임 플레이어 주변을 카메라 방향에 맞춰 회전해 잘라 그린다.
 */
export class Minimap {
  constructor(canvas, game, camFwd) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.game = game;
    this.range = 48; // 반경(월드 단위)
    this.rot = -Math.PI / 2 - Math.atan2(camFwd.z, camFwd.x); // 카메라 전방이 위로
    this.bgScale = 2; // 월드 1 = 2px
    this.bg = this.renderBackground();
    this.t = 0;
  }

  renderBackground() {
    const S = HARVEN.size, px = S * this.bgScale / 2; // 해상도 절반으로 그린 뒤 확대
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d');
    const img = g.createImageData(px, px);
    const H = HARVEN.hollow;
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
      const x = (i / px - 0.5) * S, z = (j / px - 0.5) * S;
      const h = heightAt(x, z);
      let r = 112 + h * 6, gg = 150 + h * 5, b = 78 + h * 3;
      if (Math.abs(x - riverX(z)) < 5) { r = 80; gg = 150; b = 175; }
      else if (Math.hypot(x, z) < 10) { r = 190; gg = 160; b = 110; }
      if (Math.hypot(x - H.x, z - H.z) < H.radius) { const m = (r + gg + b) / 3; r = (r + m * 2) / 3; gg = (gg + m * 2) / 3; b = (b + m * 2) / 3 + 8; }
      const o = (j * px + i) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const big = document.createElement('canvas'); big.width = big.height = S * this.bgScale;
    const bg = big.getContext('2d');
    bg.imageSmoothingEnabled = true;
    bg.drawImage(c, 0, 0, big.width, big.height);
    bg.fillStyle = '#8a5a3c';
    for (const h of HARVEN.houses) bg.fillRect((h.x - h.w / 2 + S / 2) * this.bgScale, (h.z - h.d / 2 + S / 2) * this.bgScale, h.w * this.bgScale, h.d * this.bgScale);
    bg.fillStyle = '#ffd27a';
    const L = HARVEN.loom;
    bg.fillRect((L.x - L.w / 2 + S / 2) * this.bgScale, (L.z - L.d / 2 + S / 2) * this.bgScale, L.w * this.bgScale, L.d * this.bgScale);
    return big;
  }

  update(dt) {
    this.t += dt;
    const p = this.game.player();
    if (!p) return;
    const { ctx, canvas } = this;
    const W = canvas.width, scale = W / 2 / this.range, S = HARVEN.size;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#3a4a2a'; ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.rotate(this.rot);
    const k = scale / this.bgScale;
    ctx.drawImage(this.bg, (-(p.pos.x + S / 2) * this.bgScale) * k, (-(p.pos.z + S / 2) * this.bgScale) * k, this.bg.width * k, this.bg.height * k);
    const toMap = (e) => [(e.pos.x - p.pos.x) * scale, (e.pos.z - p.pos.z) * scale];
    for (const e of this.game.entities.values()) {
      if (e.kind === 'player' || !e.alive) continue;
      const [x, y] = toMap(e);
      if (x * x + y * y > (W / 2) ** 2) continue;
      if (e.kind === 'monster') {
        ctx.fillStyle = e.ai.state === 'idle' ? '#e2775a' : '#ff3a2a';
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'cart') {
        ctx.fillStyle = '#6ad08a'; ctx.fillRect(x - 4, y - 4, 8, 8);
      } else if (e.kind === 'clue') {
        if ((p.records.clues || []).includes(e.data.id)) continue;
        ctx.fillStyle = '#9fd0ff'; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3.5, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3.5, y); ctx.fill();
      } else if (e.kind === 'node' || e.kind === 'station') {
        ctx.fillStyle = e.kind === 'station' ? '#ffd27a' : '#c49a63'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'npc') {
        const m = npcMarker(this.game, p, e.npcId);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        if (m === '!' || m === '?') {
          ctx.save(); ctx.translate(x, y); ctx.rotate(-this.rot);
          ctx.fillStyle = '#2a1a0a'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m, 0, 3);
          ctx.restore();
        }
      }
    }
    // 다리 상태 표시
    {
      const bz = HARVEN.bridge.z, bx = riverX(bz);
      const x = (bx - p.pos.x) * scale, y = (bz - p.pos.z) * scale;
      const col = { broken: '#ff4a3a', detour: '#ffb84a', temp_bridge: '#ffd24a', repaired: '#6ad08a' }[this.game.publicState.bridge.state];
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 9 * scale, y); ctx.lineTo(x + 9 * scale, y); ctx.stroke();
      if (this.game.publicState.bridge.state === 'broken') { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
    }
    // 플레이어 화살표
    ctx.rotate(-p.rot);
    ctx.fillStyle = '#fff6d8'; ctx.strokeStyle = '#3b2a1c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(5, -5); ctx.lineTo(0, -2); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
