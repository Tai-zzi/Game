import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HARVEN, heightAt, riverX, fbm } from '../data/zones.js';
import { makeRng, smoothstep } from '../core/math.js';
import { CHUNK, roadDist } from './Terrain.js';
import { pbr, cylUV } from './Textures.js';

/**
 * 자연: 청크 단위 인스턴싱 + 거리 컬링.
 *  - 나무(활엽수·전나무): 껍질 PBR 텍스처 줄기 + 잎 카드(알파). 청크 링 ≤3
 *  - 덤불·고사리·바위·그루터기·쓰러진 고목: Poly Haven CC0 모델. 링 ≤2
 *  - 풀: 교차 카드 + 바람. 링 ≤1 (가까운 곳만)
 */
const PH = (import.meta.env?.BASE_URL || './') + 'assets/polyhaven/models/';
const gltf = new GLTFLoader();

// ───── 잎·풀 알파 텍스처 (캔버스 생성) ─────
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const leafTex = () => canvasTex(256, (g, s) => {
  for (let i = 0; i < 260; i++) {
    const x = 20 + Math.random() * (s - 40), y = 20 + Math.random() * (s - 40), a = Math.random() * 6.28, l = 9 + Math.random() * 9;
    const sh = 70 + Math.random() * 60;
    g.fillStyle = `rgb(${sh * 0.55 | 0},${sh | 0},${sh * 0.35 | 0})`;
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath(); g.ellipse(0, 0, l, l * 0.42, 0, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(30,50,20,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-l, 0); g.lineTo(l, 0); g.stroke();
    g.restore();
  }
});
const needleTex = () => canvasTex(256, (g, s) => {
  g.strokeStyle = '#4a3a28'; g.lineWidth = 3; g.beginPath(); g.moveTo(s / 2, s); g.lineTo(s / 2, 0); g.stroke();
  for (let y = 4; y < s; y += 3) {
    const w = (s / 2 - 8) * (0.35 + 0.65 * (y / s));
    for (const side of [-1, 1]) {
      const sh = 50 + Math.random() * 45;
      g.strokeStyle = `rgb(${sh * 0.45 | 0},${sh | 0},${sh * 0.55 | 0})`; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(s / 2, y); g.lineTo(s / 2 + side * w * (0.7 + Math.random() * 0.3), y + 10 + Math.random() * 8); g.stroke();
    }
  }
});
const grassTex = () => canvasTex(256, (g, s) => {
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * s, h = s * (0.45 + Math.random() * 0.55), bend = (Math.random() - 0.5) * 40;
    const sh = 80 + Math.random() * 70;
    g.strokeStyle = `rgb(${sh * 0.62 | 0},${sh | 0},${sh * 0.32 | 0})`; g.lineWidth = 2 + Math.random() * 2;
    g.beginPath(); g.moveTo(x, s); g.quadraticCurveTo(x + bend * 0.3, s - h * 0.6, x + bend, s - h); g.stroke();
  }
});

/** 인스턴스 바람 흔들림 (높이에 비례) */
function windify(mat, uTime, amp, key, upNormal = false) {
  mat.onBeforeCompile = (sh) => {
    // 양면 카드의 뒷면이 검게 보이지 않도록 법선을 뒤집지 않는다 (풀은 항상 위를 향한 법선)
    if (upNormal === true) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
 normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
    else if (upNormal !== 'none') sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
 normal = normalize(vNormal);`);
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float wph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
      float wk = max(0.0, position.y) * ${amp.toFixed(4)};
      transformed.x += (sin(uTime * 1.4 + wph) + 0.4 * sin(uTime * 3.1 + wph * 2.0)) * wk;
      transformed.z += cos(uTime * 1.1 + wph) * wk * 0.6;`);
  };
  mat.customProgramCacheKey = () => key;
}

/** 잎 카드 묶음: 중심에서 바깥쪽으로 향하는 법선으로 부드러운 덩어리 음영 */
function canopy(count, center, radii, cardSize, rng) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const p = new THREE.PlaneGeometry(cardSize, cardSize);
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2, rr = Math.cbrt(rng());
    const s = Math.sqrt(1 - u * u);
    const off = new THREE.Vector3(Math.cos(th) * s * radii.x * rr, u * radii.y * rr, Math.sin(th) * s * radii.z * rr);
    p.rotateX(rng() * Math.PI); p.rotateY(rng() * Math.PI); p.rotateZ(rng() * Math.PI);
    p.translate(center.x + off.x, center.y + off.y, center.z + off.z);
    const n = p.attributes.normal, ps = p.attributes.position;
    for (let k = 0; k < n.count; k++) {
      const d = new THREE.Vector3(ps.getX(k) - center.x, (ps.getY(k) - center.y) * 0.7 + radii.y * 0.3, ps.getZ(k) - center.z).normalize();
      n.setXYZ(k, d.x, d.y, d.z);
    }
    geos.push(p);
  }
  return mergeGeometries(geos);
}

export class Nature {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.uTime = { value: 0 };
    this.chunkObjs = new Map();
    this.grassObjs = new Map();
    this.models = {};
    this.buildTreeTypes();
    this.loadModels();
    terrain.on('load', (c, rebuilt) => { if (!rebuilt) this.populate(c); });
    terrain.on('unload', (c) => this.clear(c));
  }

  buildTreeTypes() {
    const rng = makeRng(77);
    const bark = pbr('bark', { repeat: [1, 1] });
    // 활엽수
    const trunk = cylUV(new THREE.CylinderGeometry(0.22, 0.42, 5.2, 9, 3).translate(0, 2.6, 0), 0.32, 5.2, 0.6);
    const branches = [];
    for (let i = 0; i < 5; i++) {
      const b = cylUV(new THREE.CylinderGeometry(0.06, 0.14, 2.6, 6).translate(0, 1.3, 0), 0.1, 2.6, 0.6);
      b.rotateZ(0.7 + rng() * 0.4); b.rotateY((i / 5) * Math.PI * 2 + rng()); b.translate(0, 3.4 + rng() * 1.2, 0);
      branches.push(b);
    }
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: '#c8d8a8' });
    windify(leafMat, this.uTime, 0.012, 'leaf');
    this.trees = {
      broad: { trunk: mergeGeometries([trunk, ...branches]), trunkMat: bark, leaves: canopy(70, new THREE.Vector3(0, 6.4, 0), new THREE.Vector3(3.2, 2.4, 3.2), 2.4, rng), leafMat },
    };
    // 전나무: 층층이 처진 가지 카드
    const ftrunk = cylUV(new THREE.CylinderGeometry(0.12, 0.38, 11, 8).translate(0, 5.5, 0), 0.25, 11, 0.6);
    const cards = [];
    for (let y = 1.6; y < 10.6; y += 0.62) {
      const k = 1 - (y - 1.6) / 9.6, len = 0.6 + k * 3.2;
      const n = 5 + Math.round(k * 3);
      for (let i = 0; i < n; i++) {
        const c = new THREE.PlaneGeometry(len * 0.75, len);
        c.translate(0, len / 2, 0); c.rotateX(Math.PI / 2 - 0.35 - k * 0.2); c.rotateY((i / n) * Math.PI * 2 + y * 1.7);
        c.translate(0, y, 0);
        cards.push(c);
      }
    }
    const needleMat = new THREE.MeshStandardMaterial({ map: needleTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, color: '#a8c0a0' });
    windify(needleMat, this.uTime, 0.006, 'needle');
    this.trees.fir = { trunk: ftrunk, trunkMat: bark, leaves: mergeGeometries(cards), leafMat: needleMat };
    // 풀
    const g1 = new THREE.PlaneGeometry(0.9, 0.7).translate(0, 0.35, 0), g2 = g1.clone().rotateY(Math.PI / 2), g3 = g1.clone().rotateY(Math.PI / 4);
    this.grassGeo = mergeGeometries([g1, g2, g3]);
    const gn = this.grassGeo.attributes.normal; for (let i = 0; i < gn.count; i++) gn.setXYZ(i, 0, 1, 0); // 위를 향한 법선 → 지면과 같은 밝기
    this.grassMat = new THREE.MeshStandardMaterial({ map: grassTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: '#d8e0b0' });
    windify(this.grassMat, this.uTime, 0.16, 'grass', true);
  }

  async loadModels() {
    const want = { shrub_01: 1.6, shrub_02: 1.2, shrub_04: 1.1, fern_02: 0.9, boulder_01: 2.4, rock_moss_set_01: 1.4, dead_tree_trunk: 5, tree_stump_01: 0.9 };
    await Promise.all(Object.entries(want).map(async ([id, size]) => {
      try {
        const g = await gltf.loadAsync(`${PH}${id}/${id}.gltf`);
        const variants = [];
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          geo.computeBoundingBox();
          const b = geo.boundingBox, sz = new THREE.Vector3(); b.getSize(sz);
          const s = size / Math.max(sz.x, sz.y, sz.z);
          geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(s, s, s);
          const mat = o.material;
          if (mat.map) mat.map.anisotropy = 4;
          if (/shrub|fern/.test(id)) { mat.alphaTest = Math.max(mat.alphaTest || 0, 0.4); mat.side = THREE.DoubleSide; windify(mat, this.uTime, 0.04, `plant_${id}`, 'none'); }
          variants.push({ geo, mat });
        });
        this.models[id] = variants.slice(0, 4);
      } catch (e) { console.warn('[Nature] 모델 로드 실패', id, e.message); }
    }));
    // 이미 로드된 청크에도 소품 채우기
    for (const c of this.terrain.chunks.values()) { this.clear(c); this.populate(c); }
  }

  /** 이 자리에 식생을 둘 수 있는가 + 숲 밀도 */
  density(x, z) {
    const r = Math.hypot(x, z);
    if (r < 46 || r > HARVEN.boundsRadius + 60) return 0;
    if (roadDist(x, z) < 4.5) return 0;
    if (Math.abs(z) < 720 && Math.abs(x - riverX(z)) < 10) return 0;
    if (Math.hypot(x - HARVEN.lake.x, z - HARVEN.lake.z) < HARVEN.lake.r * 1.05) return 0;
    const h = heightAt(x, z);
    if (h > 95) return 0;
    const forest = Math.max(1 - smoothstep(110, 250, Math.hypot(x + 40, z - 380)), (1 - smoothstep(40, 110, Math.hypot(x + 120, z + 120))) * 0.8);
    const patches = smoothstep(0.15, 0.55, fbm(x * 0.012 + 3, z * 0.012 - 5, 3));
    const hills = (1 - smoothstep(120, 300, Math.hypot(x + 380, z + 300))) * 0.35;
    return Math.min(1, forest * 0.95 + patches * 0.35 + hills + 0.03);
  }

  populate(c) {
    const key = `${c.cx},${c.cz}`;
    if (this.chunkObjs.has(key)) return;
    const rng = makeRng(((c.cx * 73856093) ^ (c.cz * 19349663)) >>> 0);
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const objs = [];
    const d = new THREE.Object3D();
    // 나무
    const lists = { broad: [], fir: [] };
    for (let i = 0; i < 90; i++) {
      const x = x0 + rng() * CHUNK, z = z0 + rng() * CHUNK;
      const den = this.density(x, z);
      if (rng() > den * 0.75) continue;
      const fir = Math.hypot(x, z) > 500 || rng() < 0.35 + (Math.hypot(x + 380, z + 300) < 300 ? 0.4 : 0);
      lists[fir ? 'fir' : 'broad'].push({ x, z, s: 0.75 + rng() * 0.6, r: rng() * 6.28 });
    }
    for (const [type, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const T = this.trees[type];
      const trunks = new THREE.InstancedMesh(T.trunk, T.trunkMat, list.length);
      const leaves = new THREE.InstancedMesh(T.leaves, T.leafMat, list.length);
      list.forEach((t, i) => {
        d.position.set(t.x, heightAt(t.x, t.z) - 0.15, t.z); d.rotation.set(0, t.r, 0); d.scale.setScalar(t.s); d.updateMatrix();
        trunks.setMatrixAt(i, d.matrix); leaves.setMatrixAt(i, d.matrix);
      });
      trunks.castShadow = leaves.castShadow = true; trunks.receiveShadow = leaves.receiveShadow = true;
      objs.push(trunks, leaves);
    }
    // Poly Haven 소품
    const place = (id, count, scaleR, cond) => {
      const vars = this.models[id];
      if (!vars) return;
      const per = vars.map(() => []);
      for (let i = 0; i < count; i++) {
        const x = x0 + rng() * CHUNK, z = z0 + rng() * CHUNK;
        if (!cond(x, z)) continue;
        per[(rng() * vars.length) | 0].push({ x, z, s: scaleR[0] + rng() * (scaleR[1] - scaleR[0]), r: rng() * 6.28 });
      }
      vars.forEach((v, vi) => {
        if (!per[vi].length) return;
        const m = new THREE.InstancedMesh(v.geo, v.mat, per[vi].length);
        per[vi].forEach((t, i) => { d.position.set(t.x, heightAt(t.x, t.z) - 0.05, t.z); d.rotation.set(0, t.r, 0); d.scale.setScalar(t.s); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
        m.castShadow = m.receiveShadow = true;
        objs.push(m);
      });
    };
    const veg = (x, z) => this.density(x, z) > 0.05;
    place('shrub_01', 14, [0.6, 1.3], veg);
    place('shrub_02', 10, [0.6, 1.2], veg);
    place('shrub_04', 8, [0.7, 1.3], veg);
    place('fern_02', 18, [0.7, 1.4], (x, z) => this.density(x, z) > 0.35);
    place('boulder_01', 3, [0.5, 1.6], (x, z) => Math.hypot(x, z) > 50 && roadDist(x, z) > 5);
    place('rock_moss_set_01', 6, [0.6, 1.5], (x, z) => Math.hypot(x, z) > 48 && roadDist(x, z) > 4);
    place('tree_stump_01', 2, [0.8, 1.3], (x, z) => this.density(x, z) > 0.3);
    place('dead_tree_trunk', 1, [0.8, 1.2], (x, z) => this.density(x, z) > 0.5);
    for (const o of objs) { o.computeBoundingSphere(); this.scene.add(o); }
    this.chunkObjs.set(key, objs);
  }

  clear(c) {
    const key = `${c.cx},${c.cz}`;
    const objs = this.chunkObjs.get(key);
    if (objs) { for (const o of objs) { this.scene.remove(o); o.dispose?.(); } this.chunkObjs.delete(key); }
    const g = this.grassObjs.get(`${c.cx},${c.cz}`);
    if (g) { this.scene.remove(g); g.dispose(); this.grassObjs.delete(`${c.cx},${c.cz}`); }
  }

  /** 풀: 플레이어 주변 링 ≤1 청크만 (가까운 곳의 밀도) */
  updateGrass(focus, grassScale = 1) {
    const pcx = Math.floor(focus.x / CHUNK), pcz = Math.floor(focus.z / CHUNK);
    const keep = new Set();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) keep.add(`${pcx + dx},${pcz + dz}`);
    for (const [k, m] of this.grassObjs) if (!keep.has(k)) { this.scene.remove(m); m.dispose(); this.grassObjs.delete(k); }
    for (const k of keep) {
      if (this.grassObjs.has(k)) continue;
      const [cx, cz] = k.split(',').map(Number);
      const rng = makeRng(((cx * 83492791) ^ (cz * 2971215073)) >>> 0);
      const N = Math.round(1800 * grassScale), m = new THREE.InstancedMesh(this.grassGeo, this.grassMat, N);
      const d = new THREE.Object3D(), col = new THREE.Color();
      let n = 0;
      for (let i = 0; i < N * 1.6 && n < N; i++) {
        const x = cx * CHUNK + rng() * CHUNK, z = cz * CHUNK + rng() * CHUNK;
        const r = Math.hypot(x, z);
        if ((r < 31) || roadDist(x, z) < 2.4 || (Math.abs(z) < 720 && Math.abs(x - riverX(z)) < 6)) continue;
        if (Math.hypot(x - HARVEN.lake.x, z - HARVEN.lake.z) < HARVEN.lake.r * 0.95) continue;
        const h = heightAt(x, z);
        if (h > 90) continue;
        d.position.set(x, h - 0.05, z); d.rotation.set(0, rng() * 6.28, 0); d.scale.setScalar(0.6 + rng() * 0.9); d.updateMatrix();
        m.setMatrixAt(n, d.matrix);
        col.setHSL(0.2 + rng() * 0.06, 0.35 + rng() * 0.2, 0.55 + rng() * 0.2); m.setColorAt(n, col);
        n++;
      }
      m.count = n;
      m.computeBoundingSphere();
      m.receiveShadow = true;
      this.scene.add(m);
      this.grassObjs.set(k, m);
    }
  }

  update(t) { this.uTime.value = t; }
}
