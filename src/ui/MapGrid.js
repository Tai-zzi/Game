import { HARVEN, heightAt } from '../data/zones.js';

/**
 * 지도용 높이 격자 (한 번만 계산, 지도·미니맵 공용). 넓은 계곡(1.6km)을 4m 칸으로.
 */
export const GRID = { n: 400 };
let grid = null;

export function mapGrid() {
  if (grid) return grid;
  const n = GRID.n, S = HARVEN.size, h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = heightAt((i / n - 0.5) * S + S / n / 2, (j / n - 0.5) * S + S / n / 2);
  grid = { n, S, h, at(x, z) { const i = Math.max(0, Math.min(n - 1, Math.floor((x / S + 0.5) * n))), k = Math.max(0, Math.min(n - 1, Math.floor((z / S + 0.5) * n))); return h[k * n + i]; } };
  return grid;
}
