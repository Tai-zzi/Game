import { HARVEN } from '../data/zones.js';

/**
 * 탐험 기록 (전장의 안개). 지역을 N×N 칸으로 나누고 플레이어 주변 반경을 밝힌다.
 * 비트로 묶어 base64 로 저장 (128×128 → 2KB).
 */
export const EXPLORE = { cells: 128, radius: 22, interval: 0.4 };

export class ExploreMap {
  constructor(saved = null) {
    const n = EXPLORE.cells;
    this.n = n;
    this.size = HARVEN.size;
    this.bits = new Uint8Array((n * n) / 8);
    if (saved) this.load(saved);
    this.t = 0;
    this.version = 0; // 그리기 갱신용
  }

  cellOf(x, z) {
    const n = this.n, h = this.size / 2;
    return [Math.floor(((x + h) / this.size) * n), Math.floor(((z + h) / this.size) * n)];
  }

  isOpen(i, j) { if (i < 0 || j < 0 || i >= this.n || j >= this.n) return false; const k = j * this.n + i; return (this.bits[k >> 3] >> (k & 7)) & 1; }
  isExplored(x, z) { const [i, j] = this.cellOf(x, z); return !!this.isOpen(i, j); }

  reveal(x, z, r = EXPLORE.radius) {
    const n = this.n, cs = this.size / n;
    const [ci, cj] = this.cellOf(x, z), rc = Math.ceil(r / cs);
    let changed = 0;
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n || (i - ci) ** 2 + (j - cj) ** 2 > rc * rc) continue;
      const k = j * n + i;
      if (!((this.bits[k >> 3] >> (k & 7)) & 1)) { this.bits[k >> 3] |= 1 << (k & 7); changed++; }
    }
    if (changed) this.version++;
    return changed;
  }

  update(p, dt) { this.t -= dt; if (this.t <= 0) { this.t = EXPLORE.interval; this.reveal(p.pos.x, p.pos.z); } }

  ratio() { let c = 0; for (const b of this.bits) for (let k = 0; k < 8; k++) c += (b >> k) & 1; return c / (this.n * this.n); }

  serialize() { let s = ''; for (const b of this.bits) s += String.fromCharCode(b); return btoa(s); }
  load(str) {
    try { const s = atob(str); for (let i = 0; i < Math.min(s.length, this.bits.length); i++) this.bits[i] = s.charCodeAt(i); }
    catch { /* 깨진 기록은 무시하고 새로 시작 */ }
  }
}
