import * as THREE from 'three';
import { HARVEN, heightAt, riverX, fbm } from '../data/zones.js';
import { smoothstep } from '../core/math.js';
import { rawTex } from './Textures.js';

/**
 * 조각(청크) 지형 + 거리별 LOD + 스트리밍.
 * - 플레이어 주변 청크만 만들고, 멀어지면 버린다. 링마다 해상도가 다르고, 이음매는 치마(skirt)로 가린다.
 * - 재질: 실사 PBR 텍스처 6종(풀·숲 바닥·흙길·자갈길·강바닥·바위)을 정점 가중치로 섞는 스플랫 셰이더
 * - 먼 배경: 지역 전체를 덮는 저해상도 지형(먼 산맥 포함)을 항상 그린다.
 */
export const CHUNK = 64;
const RINGS = [{ r: 1, seg: 48 }, { r: 2, seg: 24 }, { r: 3, seg: 12 }];
const LOAD_R = 3;

/** 길까지의 거리 (모든 꺾은선) */
const ROAD_SEGS = HARVEN.roads.flatMap((pl) => pl.slice(1).map((p, i) => [pl[i], p]));
export function roadDist(x, z) {
  let best = Infinity;
  for (const [[ax, az], [bx, bz]] of ROAD_SEGS) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/** 정점 가중치: (풀, 숲 바닥, 흙길, 바위) + (자갈, 강바닥) */
export function splatAt(x, z, h, slope) {
  const r = Math.hypot(x, z);
  let road = 1 - smoothstep(1.6, 3.4, roadDist(x, z));
  const cobble = (1 - smoothstep(22, 31, r)) * (0.6 + 0.4 * smoothstep(0.2, 0.6, fbm(x * 0.15, z * 0.15, 2) + 0.5));
  if (r < 31) road *= 0.3;
  const rd = Math.abs(x - riverX(z)), ld = Math.hypot(x - HARVEN.lake.x, z - HARVEN.lake.z) - HARVEN.lake.r * 0.8;
  const bed = Math.max(Math.abs(z) < 720 ? 1 - smoothstep(5, 10, rd) : 0, 1 - smoothstep(0, 18, ld));
  const rock = Math.max(smoothstep(0.45, 0.85, slope), smoothstep(60, 110, h));
  const forestR = Math.hypot(x + 40, z - 380), hollowR = Math.hypot(x + 120, z + 120);
  const forest = Math.max(1 - smoothstep(120, 260, forestR), (1 - smoothstep(60, 120, hollowR)) * 0.8, smoothstep(0.25, 0.6, fbm(x * 0.01 + 7, z * 0.01, 3)) * 0.5);
  let w = [Math.max(0.05, 1 - forest), forest, road, rock, cobble, bed];
  // 우선순위: 바위 > 강바닥 > 자갈 > 길
  w = w.map((v, i) => (i === 3 ? v : v * (1 - rock * 0.9)));
  w[0] *= (1 - bed) * (1 - cobble) * (1 - road); w[1] *= (1 - bed) * (1 - cobble) * (1 - road);
  w[2] *= 1 - bed; w[4] *= 1 - bed;
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((v) => v / s);
}

let sharedMat = null;
function terrainMaterial() {
  if (sharedMat) return sharedMat;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true });
  const tex = {
    tGrass: rawTex('ground_grass'), tForest: rawTex('ground_forest'), tRoad: rawTex('ground_road'),
    tRock: rawTex('rock'), tCobble: rawTex('ground_cobble'), tBed: rawTex('ground_riverbed'),
    nGrass: rawTex('ground_grass', 'nor'), nRock: rawTex('rock', 'nor'),
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, Object.fromEntries(Object.entries(tex).map(([k, v]) => [k, { value: v }])));
    sh.vertexShader = 'attribute vec4 aW1;\nattribute vec2 aW2;\nvarying vec4 vW1;\nvarying vec2 vW2;\nvarying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvW1 = aW1; vW2 = aW2; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D tGrass, tForest, tRoad, tRock, tCobble, tBed, nGrass, nRock;\nvarying vec4 vW1;\nvarying vec2 vW2;\nvarying vec3 vWPos;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec2 wuv = vWPos.xz * 0.25;
        // 반복 무늬가 덜 보이게 두 배율을 섞는다
        vec3 grass = mix(texture2D(tGrass, wuv).rgb, texture2D(tGrass, wuv * 0.23 + 0.37).rgb, 0.35) * vec3(0.78, 1.0, 0.6); // 낙엽 섞인 풀밭을 초록 쪽으로
        vec3 col = grass * vW1.x + texture2D(tForest, wuv * 0.8).rgb * vW1.y + texture2D(tRoad, wuv * 0.9).rgb * vW1.z
          + texture2D(tRock, vWPos.xz * 0.08 + vWPos.y * 0.04).rgb * vW1.w + texture2D(tCobble, wuv * 1.2).rgb * vW2.x + texture2D(tBed, wuv).rgb * vW2.y;
        diffuseColor.rgb *= pow(col, vec3(2.2)) * 1.15; // sRGB → 선형`)
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        {
          vec3 ng = texture2D(nGrass, vWPos.xz * 0.25).xyz * 2.0 - 1.0;
          vec3 nr = texture2D(nRock, vWPos.xz * 0.08).xyz * 2.0 - 1.0;
          vec3 nd = normalize(mix(ng, nr, vW1.w));
          normal = normalize(normal + (viewMatrix * vec4(nd.x, 0.0, -nd.y, 0.0)).xyz * 0.45);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain-splat';
  sharedMat = m;
  return m;
}

/** 지형 메시 하나 (청크 또는 먼 배경) */
function buildPatch(x0, z0, size, seg, skirt, macroTint = true) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + size / 2, 0, z0 + size / 2);
  const pos = geo.attributes.position, n = pos.count;
  const w1 = new Float32Array(n * 4), w2 = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const e = size / seg;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    const slope = Math.min(1, Math.hypot(dx, dz) / (2 * e));
    const w = splatAt(x, z, h, slope);
    w1.set([w[0], w[1], w[2], w[3]], i * 4); w2.set([w[4], w[5]], i * 2);
    // 거시 색 변화 (같은 풀도 곳곳 색이 다르게) + 높은 산의 눈
    const m = macroTint ? 0.85 + fbm(x * 0.008, z * 0.008, 2) * 0.25 : 1;
    const snow = smoothstep(115, 150, h);
    col.set([m + snow * 1.2, m + snow * 1.2, m * 0.95 + snow * 1.3], i * 3);
  }
  geo.setAttribute('aW1', new THREE.BufferAttribute(w1, 4));
  geo.setAttribute('aW2', new THREE.BufferAttribute(w2, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  if (skirt) addSkirt(geo, seg);
  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.receiveShadow = true;
  return mesh;
}

/** 가장자리 정점을 아래로 늘인 '치마'로 LOD 이음매 틈을 가린다 */
function addSkirt(geo, seg) {
  const idx = [...geo.index.array];
  const pos = geo.attributes.position;
  const extra = { position: [] };
  const edge = [];
  const s1 = seg + 1;
  for (let i = 0; i <= seg; i++) edge.push(i);
  for (let j = 1; j <= seg; j++) edge.push(j * s1 + seg);
  for (let i = seg - 1; i >= 0; i--) edge.push(seg * s1 + i);
  for (let j = seg - 1; j >= 1; j--) edge.push(j * s1);
  edge.push(0);
  const base = pos.count;
  edge.forEach((v) => {
    extra.position.push(pos.getX(v), pos.getY(v) - 3, pos.getZ(v));
  });
  // 속성 복사 (치마 정점은 원래 정점 값을 그대로)
  const names = ['aW1', 'aW2', 'color', 'normal', 'uv'];
  const merged = {};
  for (const nm of ['position', ...names]) {
    const a = geo.attributes[nm];
    const arr = new Float32Array((a.count + edge.length) * a.itemSize);
    arr.set(a.array);
    edge.forEach((v, k) => { for (let c = 0; c < a.itemSize; c++) arr[(a.count + k) * a.itemSize + c] = nm === 'position' ? extra.position[k * 3 + c] : a.array[v * a.itemSize + c]; });
    merged[nm] = new THREE.BufferAttribute(arr, a.itemSize);
  }
  for (let k = 0; k < edge.length - 1; k++) {
    const a = edge[k], b = edge[k + 1], c = base + k, d = base + k + 1;
    idx.push(a, c, b, b, c, d);
  }
  for (const [nm, a] of Object.entries(merged)) geo.setAttribute(nm, a);
  geo.setIndex(idx);
}

export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = new Map(); // key -> { mesh, seg, cx, cz }
    this.queue = [];
    this.listeners = { load: [], unload: [] };
    // 먼 배경 지형 (전체, 저해상도) — 가까운 청크 아래로 살짝 내려 겹침 방지
    const S = HARVEN.size + 400;
    this.far = buildPatch(-S / 2, -S / 2, S, 160, false, true);
    this.far.position.y = -0.6;
    this.far.receiveShadow = false;
    this.group.add(this.far);
  }

  on(ev, fn) { this.listeners[ev].push(fn); }

  ringOf(cx, cz, pcx, pcz) { return Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)); }

  /** 플레이어 위치 기준으로 청크 갱신 (프레임당 만들기 개수 제한) */
  update(focus, budget = 2) {
    const pcx = Math.floor(focus.x / CHUNK), pcz = Math.floor(focus.z / CHUNK);
    const want = new Map();
    for (let dz = -LOAD_R; dz <= LOAD_R; dz++) for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      const seg = (RINGS.find((r) => ring <= r.r) || RINGS[RINGS.length - 1]).seg;
      want.set(`${cx},${cz}`, { cx, cz, seg, ring });
    }
    // 필요 없는 청크 제거
    for (const [k, c] of this.chunks) {
      if (!want.has(k)) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); this.chunks.delete(k); this.listeners.unload.forEach((f) => f(c)); }
    }
    // 새로 만들거나 해상도 바꾸기 (가까운 것부터)
    const todo = [...want.values()].filter((w) => this.chunks.get(`${w.cx},${w.cz}`)?.seg !== w.seg).sort((a, b) => a.ring - b.ring);
    for (const w of todo.slice(0, budget)) {
      const k = `${w.cx},${w.cz}`;
      const old = this.chunks.get(k);
      const mesh = buildPatch(w.cx * CHUNK, w.cz * CHUNK, CHUNK, w.seg, true);
      this.group.add(mesh);
      if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); }
      const c = { mesh, seg: w.seg, cx: w.cx, cz: w.cz, ring: w.ring };
      this.chunks.set(k, c);
      if (!old) this.listeners.load.forEach((f) => f(c));
      else this.listeners.load.forEach((f) => f(c, true));
    }
    return todo.length;
  }
}
