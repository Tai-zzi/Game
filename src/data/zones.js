import { smoothstep, lerp } from '../core/math.js';

/**
 * 하르벤 교역 거점과 주변 필드 (v0.3 §13.1 수직 단면).
 * 높이 함수는 로직(충돌/위치)과 렌더가 함께 쓰므로 순수 함수로 여기에 둔다.
 * 좌표·크기는 레벨 디자인 예시.
 */
export const HARVEN = {
  id: 'harven', name: '하르벤 교역 거점', region: '하르벤 계곡',
  size: 1600, // 지형 한 변 (m)
  boundsRadius: 760, // 걸을 수 있는 반경 (그 밖은 먼 산맥)
  playerSpawn: { x: 0, z: 10 },
  villageCenter: { x: 0, z: 0 },
  hubRadius: 33, // 성벽 안 = 안전 거점: 직업 변경 가능, 몬스터가 들어오지 않음
  waterLevel: -0.45,
  houses: [
    { x: -14, z: -8, w: 7, d: 6, h: 3.4, roof: '#a8553a' },
    { x: 12, z: -12.8, w: 7, d: 2.6, h: 3.4, roof: '#8a5a3c', shop: true }, // 잡화점 (앞이 트인 가게 — 뒤 창고만 막힘)
    { x: -16, z: 10, w: 6, d: 7, h: 3.2, roof: '#b4673f' },
    { x: 15, z: 9, w: 7, d: 5, h: 3.0, roof: '#9c4f36' },
    { x: -2, z: -19, w: 8, d: 6, h: 3.8, roof: '#7d4a33' },
    { x: 41, z: -2, w: 5, d: 5, h: 3.2, roof: '#7a5236', mill: true }, // 물레방앗간
  ],
  loom: { x: 2, z: -3, w: 5, d: 2.4 }, // 연맹 지부 앞 공동 베틀
  wheelZ: -2,
  // 끊어진 다리 (상태: broken → temp_bridge | detour → repaired)
  bridge: { z: 4, halfWidth: 1.7, deckY: 0.55 },
  ford: { z: 56 }, // 상류 여울: 다리 상태와 관계없이 늘 건널 수 있다 (핵심 접근 보장)
  workbench: { x: 39, z: 10 },
  depot: { x: 66, z: 4, name: '동쪽 창고' },
  cartStart: { x: 10, z: 3 },
  cartRoute: [
    { x: 18, z: 14 }, { x: 20, z: 40 }, { x: 36, z: 54 }, { x: 50, z: 56 },
    { x: 62, z: 48 }, { x: 66, z: 24 }, { x: 66, z: 6 },
  ],
  detourArea: { x: 34, z: 50, radius: 16 }, // 우회로 위험 구역 (호위 1단계)
  nodes: [
    { item: 'lumber', name: '목재 더미', x: -30, z: 12 },
    { item: 'lumber', name: '목재 더미', x: -30, z: 2 },
    { item: 'lumber', name: '목재 더미', x: -27, z: 22 },
    { item: 'clamp', name: '부서진 수레 잔해', x: 26, z: -17 },
    { item: 'clamp', name: '부서진 수레 잔해', x: 31, z: -23 },
  ],
  clues: [
    { id: 'tracks', name: '바퀴 자국과 가축 발자국', x: 24, z: 22,
      text: '무거운 수레가 다리 대신 들판으로 돌아간 자국. 그 위를 겁먹은 양 떼가 흩어지며 밟고 지나갔다.' },
    { id: 'lamb', name: '쓰러진 새끼 양', x: 8, z: 44,
      text: '실종된 가축 중 한 마리. 털 끝이 실처럼 풀려 있지만 숨은 붙어 있다. 의사에게 보여야 할 것 같다.' },
    { id: 'footing', name: '교각 아래 지반 이상', x: 43.5, z: 7,
      text: '교각 아래 흙이 결을 따라 갈라져 있다. 그런데 지난 보수 때 박은 말뚝은 규격보다 짧다. 지반 이상과 부실 보수가 겹친 것이다.' },
  ],
  spawns: [
    { monster: 'unravel_sheep', x: 32, z: 32, radius: 12, count: 7 },
    { monster: 'unravel_sheep', x: -6, z: 50, radius: 10, count: 4 },
    { monster: 'unravel_wolf', x: 38, z: 52, radius: 9, count: 4, levelRange: [3, 4], tag: 'detour' },
    { monster: 'unravel_wolf', x: -52, z: -50, radius: 15, count: 6 },
    { monster: 'tangled_alpha', x: -60, z: -60, radius: 2, count: 1, tag: 'elite' }, // 잿빛 숲 엘리트
    { monster: 'bridge_keeper', x: 44, z: 22, radius: 1, count: 1, tag: 'boss' }, // 끊어진 다리 근처 중간 보스
  ],
  hollow: { x: -55, z: -55, radius: 36 },
  // ── 넓은 계곡 (Phase 2.5) ──
  walls: { r: 35, thick: 1.6, height: 7, gates: [{ a: 0.05, w: 0.26, name: '동문' }, { a: 1.25, w: 0.74, name: '북문' }, { a: Math.PI, w: 0.26, name: '서문' }, { a: -Math.PI / 2, w: 0.26, name: '남문' }] },
  keep: { x: 10, z: -25, w: 9, d: 9, h: 16 },
  lake: { x: 380, z: 130, r: 120 },
  regions: [
    { id: 'town', name: '하르벤 교역 거점', x: 0, z: 0, r: 60 },
    { id: 'valley', name: '하르벤 강 계곡', x: 60, z: 120, r: 220 },
    { id: 'forest', name: '바늘잎 숲', x: -40, z: 380, r: 230 },
    { id: 'lake', name: '고요 호수', x: 380, z: 130, r: 170 },
    { id: 'hills', name: '실밥 언덕 절벽', x: -380, z: -300, r: 220 },
    { id: 'ruins', name: '옛 직조소 폐허', x: -380, z: 300, r: 140 },
    { id: 'farms', name: '남쪽 밭', x: 120, z: -220, r: 160 },
    { id: 'hollow', name: '잿빛 숲', x: -120, z: -120, r: 110 },
  ],
  // 길: 꺾은선 (렌더는 흙길로 칠하고, 표지판을 세운다)
  roads: [
    [[0, 3], [24, 3], [42, 4], [60, 5], [120, 20], [220, 60], [300, 110]], // 동쪽: 다리 → 호수
    [[8, 30], [14, 60], [0, 140], [-20, 240], [-40, 360]], // 북쪽: 숲
    [[-35, 0], [-90, 20], [-200, 120], [-300, 230], [-370, 290]], // 서쪽: 폐허
    [[0, -35], [-10, -80], [-120, -150], [-250, -240], [-360, -290]], // 남서: 언덕
    [[0, -35], [40, -110], [120, -210], [160, -280]], // 남쪽: 밭
  ],
  // 실 매듭돌: 발견하면 빠른 이동 지점 (마구간 대신 이 세계의 장치)
  anchors: [
    { id: 'town', name: '거점 광장 매듭돌', x: -6, z: 2 },
    { id: 'forest', name: '숲 어귀 매듭돌', x: -30, z: 330 },
    { id: 'lake', name: '호숫가 매듭돌', x: 280, z: 105 },
    { id: 'hills', name: '언덕 아래 매듭돌', x: -330, z: -270 },
    { id: 'ruins', name: '폐허 입구 매듭돌', x: -340, z: 270 },
    { id: 'farms', name: '남쪽 밭 매듭돌', x: 125, z: -200 },
  ],
};

// 넓은 계곡의 몬스터 거점 (레벨대별) — 기존 거점 목록에 덧붙인다
HARVEN.spawns.push(
  { monster: 'unravel_sheep', x: 140, z: -230, radius: 26, count: 8, levelRange: [3, 5] },
  { monster: 'unravel_wolf', x: 300, z: 40, radius: 22, count: 6, levelRange: [5, 7] },
  { monster: 'unravel_wolf', x: -40, z: 300, radius: 30, count: 8, levelRange: [7, 9] },
  { monster: 'tangled_alpha', x: -60, z: 420, radius: 3, count: 1, levelRange: [10, 10], tag: 'elite' },
  { monster: 'unravel_wolf', x: -360, z: -300, radius: 30, count: 8, levelRange: [10, 12] },
  { monster: 'unravel_wolf', x: -380, z: 300, radius: 25, count: 6, levelRange: [12, 14] },
  { monster: 'tangled_alpha', x: -400, z: 320, radius: 3, count: 1, levelRange: [15, 15], tag: 'elite' },
);

// ───────── 지형: 결정적 노이즈 (로직·렌더 공용, 서버에서도 같은 값) ─────────
function hash(ix, iz) { let h = (ix * 374761393 + iz * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f, z * f) * 2 - 1); f *= 2.03; a *= 0.5; } return s; }
const ridge = (x, z) => 1 - Math.abs(fbm(x, z, 3));
const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);

export const riverX = (z) => 46 + 9 * Math.sin(z * 0.022) + 4 * Math.sin(z * 0.061 + 1.3) + 70 * Math.sin(z * 0.0042) * smoothstep(110, 420, Math.abs(z));

/**
 * 높이: 완만한 들판 + 북서 언덕(계단식 절벽) + 숲 구릉 + 호수 + 바깥 산맥,
 * 거점은 평탄(성채 언덕은 살짝 솟음), 강 계곡은 낮고 평평, 강바닥은 파임.
 */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const amp = 0.12 + 0.88 * smoothstep(110, 320, r);
  let h = 1.4 + fbm(x * 0.0045, z * 0.0045) * 26 * amp + fbm(x * 0.03, z * 0.03, 2) * 1.2 * (0.4 + amp);
  // 북서 언덕: 능선 + 계단식 절벽
  const wh = 1 - smoothstep(120, 330, dist(x, z, { x: -380, z: -300 }));
  if (wh > 0) { const hill = 18 + ridge(x * 0.012, z * 0.012) * 42; const terr = Math.floor(hill / 7) * 7 + smoothstep(0.6, 1, (hill % 7) / 7) * 7; h = lerp(h, terr, wh); }
  // 숲 구릉
  h += (1 - smoothstep(150, 300, dist(x, z, { x: -40, z: 380 }))) * (6 + fbm(x * 0.02, z * 0.02, 2) * 4);
  // 바깥 산맥 (경계 너머 배경)
  h += smoothstep(640, 900, r) * (110 + fbm(x * 0.006, z * 0.006, 3) * 70);
  // 강 계곡: 낮고 평평한 바닥 → 강바닥 파임 (도시 근처는 원래 모양 유지)
  const d = Math.abs(x - riverX(z));
  if (Math.abs(z) < 720) {
    const valley = 1 - smoothstep(14, 90, d);
    h = lerp(h, 0.8 + fbm(x * 0.05, z * 0.05, 2) * 0.6, valley * smoothstep(60, 160, r));
    h = lerp(h, -1.6, 1 - smoothstep(3.5, 11, d));
  }
  // 호수
  const L = HARVEN.lake, dl = dist(x, z, L);
  if (dl < L.r * 1.6) { h = lerp(h, 0.6, 1 - smoothstep(L.r * 0.9, L.r * 1.5, dl)); h = lerp(h, -5.5, 1 - smoothstep(L.r * 0.55, L.r, dl)); }
  // 거점: 평탄 + 성채 언덕
  const v = smoothstep(26, 60, r);
  h = lerp(0.15, h, v);
  h += (1 - smoothstep(5, 13, dist(x, z, HARVEN.keep))) * 2.5;
  return h;
}

export const inRiver = (x, z) => (Math.abs(x - riverX(z)) < 4.2 && Math.abs(z) < 720) || dist(x, z, HARVEN.lake) < HARVEN.lake.r * 0.8;
/** 지역 이름 (가장 가까운 지역) */
export function regionAt(x, z) { let best = HARVEN.regions[0], bd = Infinity; for (const g of HARVEN.regions) { const d = dist(x, z, g) / g.r; if (d < bd) { bd = d; best = g; } } return best; }
/** 다리 상판 위인지 (다리가 쓸 수 있는 상태일 때만 의미) */
export const onBridge = (x, z) => Math.abs(z - HARVEN.bridge.z) < HARVEN.bridge.halfWidth && Math.abs(x - riverX(HARVEN.bridge.z)) < 9;
export const inHub = (x, z) => Math.hypot(x - HARVEN.villageCenter.x, z - HARVEN.villageCenter.z) < HARVEN.hubRadius;
