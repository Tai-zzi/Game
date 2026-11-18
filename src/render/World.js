import * as THREE from 'three';
import { HARVEN, heightAt, riverX } from '../data/zones.js';
import { makeRng, smoothstep } from '../core/math.js';
import { applySplat, addWind, makeWaterMaterial } from './shaders.js';

/**
 * 하르벤 계곡의 시각 요소 전부. 로직과 공유하는 것은 zones.js 의 데이터/높이 함수뿐.
 */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(1903);
    this.animated = []; // (t, dt) => void
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildTerrain();
    this.buildWater();
    this.buildVillage();
    this.buildLoom();
    this.buildWaterWheel();
    this.buildFences();
    this.buildTrees();
    this.buildGrass();
    this.buildProps();
    this.buildLooseThreads();
    this.buildBridge();
    this.buildDepot();
  }

  update(t, dt) { if (this.windTime) this.windTime.value = t; for (const f of this.animated) f(t, dt); }

  // ---------------- 지형 ----------------
  buildTerrain() {
    const S = HARVEN.size, seg = 200;
    const geo = new THREE.PlaneGeometry(S, S, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const splat = new Float32Array(pos.count * 3); // (풀, 흙, 모래) 가중치
    const c = new THREE.Color();
    const grassA = new THREE.Color('#79a847'), grassB = new THREE.Color('#b0c45c'), hill = new THREE.Color('#9caf62');
    const sand = new THREE.Color('#d9c38e'), dirt = new THREE.Color('#c49a63'), ash = new THREE.Color('#8e8f86');
    const { hollow } = HARVEN;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.13);
      c.copy(grassA).lerp(grassB, n * 0.7);
      c.lerp(hill, smoothstep(2, 9, h) * 0.6);
      // 마을 광장/길
      const vr = Math.hypot(x, z);
      const road = Math.min(Math.abs(z - 3 - Math.sin(x * 0.08) * 2), 99);
      const roadMask = (1 - smoothstep(1.6, 3.2, road)) * (x > -20 && x < 40 ? 1 : 0);
      c.lerp(dirt, Math.max(1 - smoothstep(7, 11, vr), roadMask * 0.85));
      // 강변 모래
      const rd = Math.abs(x - riverX(z));
      c.lerp(sand, 1 - smoothstep(5, 9, rd));
      // 잿빛 숲: 색이 빠져나간다
      const hd = Math.hypot(x - hollow.x, z - hollow.z);
      c.lerp(ash, (1 - smoothstep(hollow.radius * 0.4, hollow.radius, hd)) * 0.75);
      colors.set([c.r, c.g, c.b], i * 3);
      const wd = Math.max(1 - smoothstep(7, 11, vr), roadMask * 0.85), ws = 1 - smoothstep(5, 9, rd);
      const wg = Math.max(0, 1 - wd - ws), sum = wg + wd + ws || 1;
      splat.set([wg / sum, wd / sum, ws / sum], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    applySplat(mat);
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.name = 'terrain';
    this.group.add(this.terrain);
  }

  // ---------------- 강 ----------------
  buildWater() {
    const verts = [], uvs = [], idx = [];
    const y = HARVEN.waterLevel, half = HARVEN.size / 2;
    let row = 0;
    for (let z = -half; z <= half; z += 2, row++) {
      const cx = riverX(z);
      verts.push(cx - 8, y, z, cx + 8, y, z);
      uvs.push(0, z / 12, 1, z / 12);
      if (row > 0) { const a = (row - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = makeWaterMaterial();
    const water = new THREE.Mesh(geo, mat);
    this.group.add(water);
    this.animated.push((t) => { mat.uniforms.uTime.value = t; });

    // 상류 여울 징검돌 (다리 상태와 무관하게 늘 건널 수 있음)
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#a8a294', roughness: 0.9 });
    const stoneGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.5, 7);
    const fz = HARVEN.ford.z;
    for (let i = -3; i <= 3; i++) {
      const z = fz + Math.sin(i) * 0.6;
      const s = new THREE.Mesh(stoneGeo, stoneMat);
      s.position.set(riverX(z) + i * 1.9, HARVEN.waterLevel + 0.05, z);
      s.rotation.y = i;
      s.castShadow = s.receiveShadow = true;
      this.group.add(s);
    }
  }

  // ---------------- 마을 ----------------
  buildVillage() {
    const wall = new THREE.MeshStandardMaterial({ color: '#efdfbf', roughness: 0.9 });
    const timber = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.85 });
    const windowMat = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb24a', emissiveIntensity: 1.2 });
    const stone = new THREE.MeshStandardMaterial({ color: '#9b9285', roughness: 0.95 });
    const houses = HARVEN.houses;
    for (const h of houses) {
      const g = new THREE.Group();
      const y = heightAt(h.x, h.z);
      g.position.set(h.x, y, h.z);
      const sink = 2.5;
      const body = new THREE.Mesh(new THREE.BoxGeometry(h.w, h.h + sink, h.d), wall);
      body.position.y = (h.h - sink) / 2;
      g.add(body);
      // 목조 기둥
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, h.h + sink, 0.28), timber);
        b.position.set(sx * (h.w / 2), (h.h - sink) / 2, sz * (h.d / 2));
        g.add(b);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.2, 0.25, h.d + 0.2), timber);
      beam.position.y = h.h * 0.55; g.add(beam);
      // 지붕 (사각뿔)
      const roofH = Math.max(h.w, h.d) * 0.42;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2 * 1.0, 1, 4, 1), new THREE.MeshStandardMaterial({ color: h.roof, roughness: 0.8, flatShading: true }));
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(h.w + 1.2, roofH, h.d + 1.2);
      roof.position.y = h.h + roofH / 2;
      g.add(roof);
      // 문과 창 (남쪽 = +z, 카메라 쪽)
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.12), timber);
      door.position.set(-h.w * 0.2, 0.9, h.d / 2 + 0.05); g.add(door);
      for (const wx of [h.w * 0.22]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), windowMat);
        win.position.set(wx, 1.6, h.d / 2 + 0.06); g.add(win);
      }
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.9), windowMat);
      win2.position.set(h.w / 2 + 0.06, 1.6, 0); g.add(win2);
      const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), stone);
      chim.position.set(h.w * 0.25, h.h + roofH * 0.6, -h.d * 0.2); g.add(chim);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      (this.houseGroups ||= []).push({ g, h });
    }
  }

  // ---------------- 공동 베틀 ----------------
  buildLoom() {
    const L = HARVEN.loom;
    const g = new THREE.Group();
    g.position.set(L.x, heightAt(L.x, L.z), L.z);
    const wood = new THREE.MeshStandardMaterial({ color: '#7c4f2a', roughness: 0.8 });
    const W = L.w, H = 3.4;
    const post = new THREE.BoxGeometry(0.3, H, 0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(post, wood); m.position.set(sx * W / 2, H / 2, sz * L.d / 2.4); g.add(m);
    }
    for (const y of [0.6, H - 0.2]) for (const sz of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.22, 0.22), wood); b.position.set(0, y, sz * L.d / 2.4); g.add(b);
    }
    // 짜다 만 직물 (아래 절반)
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const cx = cv.getContext('2d');
    const dyes = ['#c8553d', '#e8b04a', '#4f7cac', '#e9dcc0', '#7a9e5a'];
    for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
      cx.fillStyle = dyes[((x >> 2) + (y >> 3)) % dyes.length]; cx.fillRect(x, y, 4, 4);
      cx.fillStyle = 'rgba(0,0,0,0.12)'; cx.fillRect(x, y + ((x >> 2) % 2 ? 0 : 2), 4, 2);
    }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 1.3), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    cloth.position.set(0, 1.35, 0); g.add(cloth);
    // 빛나는 날실
    const pts = [];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.3 + (i / (n - 1)) * (W - 0.6);
      pts.push(x, 2.0, 0, x, H - 0.3, 0);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lmat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd98a').multiplyScalar(2.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    g.add(new THREE.LineSegments(lg, lmat));
    // 씨실 북(셔틀)이 왕복한다
    const shuttle = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: '#d9a35a', emissive: '#ff9e40', emissiveIntensity: 0.6 }));
    shuttle.rotation.z = Math.PI / 2; g.add(shuttle);
    const glow = new THREE.PointLight('#ffc070', 6, 12, 1.6);
    glow.position.set(0, 2.6, 1.2); g.add(glow);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    this.loomGroup = g;
    this.animated.push((t) => {
      lmat.opacity = 0.65 + 0.3 * Math.sin(t * 2.2);
      shuttle.position.set(Math.sin(t * 1.4) * (W / 2 - 0.5), 2.05, 0.05);
      glow.intensity = 5 + Math.sin(t * 2.2) * 1.5;
    });
  }

  // ---------------- 물레방아 ----------------
  buildWaterWheel() {
    const z = HARVEN.wheelZ, x = riverX(z) - 3.2;
    const wheel = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4526', roughness: 0.85 });
    const R = 2.7;
    for (const sx of [-0.55, 0.55]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 28), wood);
      rim.rotation.y = Math.PI / 2; rim.position.x = sx; wheel.add(rim);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.7), wood);
      paddle.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
      paddle.rotation.x = -a; wheel.add(paddle);
      if (i % 2 === 0) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, R * 2, 0.12), wood);
        spoke.rotation.x = a; wheel.add(spoke);
      }
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.6, 8), wood);
    axle.rotation.z = Math.PI / 2; axle.position.x = -1; wheel.add(axle);
    wheel.position.set(x, HARVEN.waterLevel + R - 0.6, z);
    wheel.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.group.add(wheel);
    this.wheelGroup = wheel;
    this.animated.push((t, dt) => { wheel.rotation.x -= dt * 0.7; });
  }

  // ---------------- 울타리 (인스턴싱) ----------------
  buildFences() {
    const lines = [];
    // 동쪽 목초지 울타리 (원형, 마을 쪽으로 출입구)
    const m = HARVEN.spawns[0];
    const ring = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      if (a > 3.6 && a < 4.2) { if (ring.length) lines.push(ring.splice(0)); continue; }
      ring.push({ x: m.x + Math.cos(a) * (m.radius + 4), z: m.z + Math.sin(a) * (m.radius + 4) });
    }
    if (ring.length) lines.push(ring);
    // 마을 길 울타리
    lines.push([{ x: 20, z: 6.5 }, { x: 26, z: 7.2 }, { x: 32, z: 7.8 }, { x: 37, z: 8.2 }]);
    lines.push([{ x: 20, z: -0.5 }, { x: 26, z: -0.4 }, { x: 32, z: 0.2 }]);

    const posts = [], rails = [];
    for (const line of lines) {
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        if (Math.abs(p.x - riverX(p.z)) < 9) continue;
        posts.push(p);
        const q = line[i + 1];
        if (q && Math.abs(q.x - riverX(q.z)) >= 9) rails.push([p, q]);
      }
    }
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9 });
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.3, 0.22), wood, posts.length);
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.12, 1), wood, rails.length * 2);
    const d = new THREE.Object3D();
    posts.forEach((p, i) => { d.position.set(p.x, heightAt(p.x, p.z) + 0.55, p.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); postMesh.setMatrixAt(i, d.matrix); });
    let k = 0;
    for (const [a, b] of rails) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (const hy of [0.45, 0.9]) {
        const ya = heightAt(a.x, a.z) + hy, yb = heightAt(b.x, b.z) + hy;
        d.position.set((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
        d.scale.set(1, 1, len);
        d.lookAt(b.x, yb, b.z);
        d.updateMatrix(); railMesh.setMatrixAt(k++, d.matrix);
      }
    }
    postMesh.castShadow = railMesh.castShadow = true;
    this.group.add(postMesh, railMesh);
  }

  /** 나무/풀 배치 가능 여부 */
  freeSpot(x, z, clearVillage = 24) {
    if (Math.hypot(x, z) < clearVillage) return false;
    if (Math.abs(x - riverX(z)) < 8) return false;
    for (const h of HARVEN.houses) if (Math.abs(x - h.x) < h.w / 2 + 2 && Math.abs(z - h.z) < h.d / 2 + 2) return false;
    if (Math.abs(z - 3) < 4 && x > -20 && x < 40) return false;
    for (const s of HARVEN.spawns) if (Math.hypot(x - s.x, z - s.z) < s.radius * 0.8) return false;
    for (const p of [...HARVEN.cartRoute, ...HARVEN.nodes, ...HARVEN.clues, HARVEN.depot]) if (Math.hypot(x - p.x, z - p.z) < 6) return false;
    return Math.hypot(x, z) < HARVEN.size / 2 - 4;
  }

  // ---------------- 나무 (인스턴싱) ----------------
  buildTrees() {
    const rng = this.rng, H = HARVEN.hollow;
    const spots = [];
    for (let tries = 0; tries < 3000 && spots.length < 340; tries++) {
      const x = (rng() - 0.5) * (HARVEN.size - 10), z = (rng() - 0.5) * (HARVEN.size - 10);
      if (!this.freeSpot(x, z)) continue;
      const inHollow = Math.hypot(x - H.x, z - H.z) < H.radius;
      // 외곽과 잿빛 숲은 빽빽하게, 들판은 듬성듬성
      const density = inHollow ? 0.8 : 0.25 + smoothstep(50, 100, Math.hypot(x, z)) * 0.7;
      if (rng() > density) continue;
      spots.push({ x, z, s: 0.8 + rng() * 0.7, hollow: inHollow, r: rng() * 6.28 });
    }
    const n = spots.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 }), n);
    const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.windTime = this.windTime || { value: 0 };
    addWind(leafMat, this.windTime, 0.06);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, n * 2);
    const d = new THREE.Object3D(), c = new THREE.Color();
    const greens = ['#5f8f3a', '#4f7d34', '#7aa046', '#8fa84c', '#c9a14a'];
    spots.forEach((p, i) => {
      const y = heightAt(p.x, p.z);
      d.position.set(p.x, y - 0.1, p.z); d.rotation.set(0, p.r, 0); d.scale.setScalar(p.s); d.updateMatrix();
      trunk.setMatrixAt(i, d.matrix);
      for (let j = 0; j < 2; j++) {
        d.position.set(p.x + (j ? 0.3 : 0), y + (2.3 + j * 1.1) * p.s, p.z + (j ? -0.2 : 0));
        d.scale.setScalar(p.s * (j ? 0.75 : 1.05)); d.rotation.set(p.r, p.r * 2 + j, 0); d.updateMatrix();
        leaves.setMatrixAt(i * 2 + j, d.matrix);
        if (p.hollow) c.set(j ? '#9a9a90' : '#7f8079').offsetHSL(0, 0, (this.rng() - 0.5) * 0.06);
        else c.set(greens[Math.floor(this.rng() * greens.length)]);
        leaves.setColorAt(i * 2 + j, c);
      }
    });
    trunk.castShadow = leaves.castShadow = true;
    leaves.receiveShadow = true;
    this.group.add(trunk, leaves);
  }

  // ---------------- 풀 (인스턴싱 + 바람 셰이더) ----------------
  buildGrass() {
    const blade = new THREE.BufferGeometry();
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.25, cz = Math.sin(a) * 0.25;
      v.push(-cx, 0, -cz, cx, 0, cz, 0, 0.7, 0);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const uTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
        transformed.x += sin(uTime * 1.8 + ph) * 0.18 * position.y;
        transformed.z += cos(uTime * 1.3 + ph) * 0.1 * position.y;`);
    };
    const count = 9000;
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    const d = new THREE.Object3D(), c = new THREE.Color(), H = HARVEN.hollow;
    let i = 0;
    for (let tries = 0; tries < count * 4 && i < count; tries++) {
      const r = Math.sqrt(this.rng()) * 105, a = this.rng() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 10 || Math.abs(x - riverX(z)) < 6) continue;
      const y = heightAt(x, z);
      d.position.set(x, y, z); d.rotation.set(0, this.rng() * 6.28, 0); d.scale.setScalar(0.6 + this.rng() * 0.9); d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      const hollow = Math.hypot(x - H.x, z - H.z) < H.radius * 0.8;
      c.setHSL(hollow ? 0.15 : 0.2 + this.rng() * 0.08, hollow ? 0.08 : 0.45, 0.32 + this.rng() * 0.15);
      mesh.setColorAt(i, c);
      i++;
    }
    mesh.count = i;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.animated.push((t) => { uTime.value = t; });

    // 염료 꽃
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial(), 500);
    const dyes = ['#e86a5a', '#f2c14e', '#f6f0e0', '#9d7cc9', '#5aa0d8'];
    let fi = 0;
    for (let tries = 0; tries < 4000 && fi < 500; tries++) {
      const x = (this.rng() - 0.5) * 200, z = (this.rng() - 0.5) * 200;
      if (Math.hypot(x, z) < 12 || Math.abs(x - riverX(z)) < 6 || Math.hypot(x - H.x, z - H.z) < H.radius) continue;
      d.position.set(x, heightAt(x, z) + 0.35, z); d.scale.setScalar(0.8 + this.rng()); d.updateMatrix();
      fl.setMatrixAt(fi, d.matrix); fl.setColorAt(fi, c.set(dyes[fi % dyes.length])); fi++;
    }
    fl.count = fi;
    this.group.add(fl);
  }

  // ---------------- 소품 ----------------
  buildProps() {
    // 털뭉치 더미, 등불, 공백의 구멍
    const baleMat = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 1 });
    const bales = [[8, 5], [9.2, 5.6], [-8, -2], [24, 28], [26, 27]];
    for (const [x, z] of bales) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), baleMat);
      b.scale.y = 0.8; b.position.set(x, heightAt(x, z) + 0.5, z); b.castShadow = true; this.group.add(b);
    }
    const lampPost = new THREE.MeshStandardMaterial({ color: '#4a3424' });
    const lampGlow = new THREE.MeshStandardMaterial({ color: '#ffd38a', emissive: '#ffae42', emissiveIntensity: 2 });
    for (const [x, z] of [[-6, 2], [7, 2], [-6, -10], [7, -8], [18, 4], [-1, 12]]) {
      const y = heightAt(x, z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), lampPost); p.position.set(x, y + 1.2, z); p.castShadow = true;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampGlow); l.position.set(x, y + 2.5, z);
      this.group.add(p, l);
    }
    const H = HARVEN.hollow;
    const voidMat = new THREE.MeshBasicMaterial({ color: '#141418', transparent: true, opacity: 0.85 });
    const rimMat = new THREE.MeshBasicMaterial({ color: '#b9c6ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const rims = [];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7, r = 6 + i * 4;
      const x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r, s = 0.8 + (i % 3) * 0.5;
      const y = heightAt(x, z) + 0.04;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(s, 18), voidMat); hole.rotation.x = -Math.PI / 2; hole.position.set(x, y, z);
      const rim = new THREE.Mesh(new THREE.RingGeometry(s, s + 0.15, 24), rimMat); rim.rotation.x = -Math.PI / 2; rim.position.set(x, y + 0.01, z);
      this.group.add(hole, rim); rims.push(rim);
    }
    this.animated.push((t) => { rimMat.opacity = 0.25 + 0.2 * Math.sin(t * 1.3); });
  }

  // ---------------- 끊어진 다리 (공공 결산에 따라 모습이 바뀐다) ----------------
  buildBridge() {
    const B = HARVEN.bridge, cx = riverX(B.z), half = 9, y = B.deckY;
    const plankMat = new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#9b9285', roughness: 0.95 });
    const braceMat = new THREE.MeshStandardMaterial({ color: '#d9a35a', emissive: '#6a4a1a', emissiveIntensity: 0.3 });
    const groups = {};
    const make = (name) => { const g = new THREE.Group(); g.visible = false; this.group.add(g); groups[name] = g; return g; };
    const plank = (g, x, yy, rotZ = 0, rotY = 0, mat = plankMat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, B.halfWidth * 2), mat); m.position.set(x, yy, B.z); m.rotation.set(0, rotY, rotZ); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    for (const s of [-1, 1]) { // 양쪽 교대(돌)
      const ab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, B.halfWidth * 2 + 0.8), stoneMat);
      ab.position.set(cx + s * (half + 0.6), y - 1.1, B.z); ab.castShadow = ab.receiveShadow = true; this.group.add(ab);
    }
    // 끊어짐: 양끝만 남고 가운데가 무너짐
    const broken = make('broken');
    for (let x = -half; x <= half; x += 1) {
      if (Math.abs(x) < 4.5) continue;
      plank(broken, cx + x, y - (Math.abs(x) < 6 ? 0.25 : 0), Math.abs(x) < 6 ? Math.sign(x) * 0.25 : 0);
    }
    for (let i = 0; i < 4; i++) plank(broken, cx - 2 + i * 1.3, HARVEN.waterLevel + 0.02, 0.1 * i, i * 0.6, darkMat);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.6, 6), darkMat); p.position.set(cx + s * 3, -0.6, B.z + s * 0.6); p.rotation.z = s * 0.4; broken.add(p); }
    // 임시 우회로: 끊어진 다리 그대로 + 여울 쪽 표지·등불
    const detour = make('detour');
    detour.add(broken.clone());
    const signMat = new THREE.MeshStandardMaterial({ color: '#e8dcb8' });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffd38a', emissive: '#ffae42', emissiveIntensity: 2 });
    for (const wp of HARVEN.cartRoute.slice(1, 6)) {
      const yy = heightAt(wp.x - 2, wp.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2, 6), darkMat); post.position.set(wp.x - 2, yy + 1, wp.z);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.05), signMat); sign.position.set(wp.x - 2, yy + 1.7, wp.z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), glow); lamp.position.set(wp.x - 2, yy + 2.1, wp.z);
      detour.add(post, sign, lamp);
    }
    // 임시 교량: 처진 판자 + 보강 부품 + 밧줄 난간
    const temp = make('temp_bridge');
    for (let x = -half; x <= half; x += 1) plank(temp, cx + x, y - Math.cos((x / half) * Math.PI / 2) * 0.25, 0, Math.sin(x * 7) * 0.03);
    for (let x = -4; x <= 4; x += 2) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, B.halfWidth * 2 + 0.4), braceMat); b.position.set(cx + x, y - 0.45, B.z); temp.add(b); }
    for (const s of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(cx - half + t * half * 2, y + 0.9 - Math.sin(t * Math.PI) * 0.35, B.z + s * B.halfWidth)); }
      temp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.03, 4), darkMat));
    }
    // 정식 복구: 상판 + 돌 교각 + 난간
    const fixed = make('repaired');
    const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1, 0.3, B.halfWidth * 2 + 0.3), plankMat); deck.position.set(cx, y - 0.1, B.z); deck.castShadow = deck.receiveShadow = true; fixed.add(deck);
    for (const x of [-3.5, 3.5]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, B.halfWidth * 2), stoneMat); pier.position.set(cx + x, y - 1.3, B.z); fixed.add(pier); }
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1, 0.1, 0.1), darkMat); rail.position.set(cx, y + 0.85, B.z + s * B.halfWidth); fixed.add(rail);
      for (let x = -half; x <= half; x += 2) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), darkMat); p.position.set(cx + x, y + 0.42, B.z + s * B.halfWidth); fixed.add(p); }
    }
    this.bridgeGroups = groups;
    this.setBridgeState('broken');
  }

  setBridgeState(state) {
    for (const [k, g] of Object.entries(this.bridgeGroups)) g.visible = k === state;
    this.bridgeState = state;
    // AI 끊어진 다리 모델이 있으면 끊어짐/우회로 상태에서 절차적 잔해 대신 사용
    if (this.aiBridge) {
      const brokenish = state === 'broken' || state === 'detour';
      this.aiBridge.visible = brokenish;
      if (brokenish) { this.bridgeGroups.broken.visible = false; if (this.bridgeGroups.detour.children[0]) this.bridgeGroups.detour.children[0].visible = false; }
    }
  }

  /**
   * AI 생성 소품 (있을 때만). 절차적 버전은 숨기기만 하고 남겨 둔다 (대체용).
   * 무거운 메시 상한 때문에 집은 거점 중심 쪽 3채만 교체.
   */
  async loadAiProps(ai) {
    if (!ai.enabled) return;
    const place = (obj, x, z, rotY = 0) => { obj.position.set(x, heightAt(x, z), z); obj.rotation.y = rotY; this.group.add(obj); return obj; };
    const loom = await ai.instance('prop_loom');
    if (loom && this.loomGroup) { place(loom, HARVEN.loom.x, HARVEN.loom.z); this.loomGroup.children.forEach((c) => { if (c.isMesh && !c.material.blending) c.visible = false; }); }
    const wheel = await ai.instance('prop_waterwheel');
    if (wheel && this.wheelGroup) {
      wheel.position.copy(this.wheelGroup.position); wheel.position.y = HARVEN.waterLevel - 0.6; wheel.rotation.y = Math.PI / 2;
      this.group.add(wheel); this.wheelGroup.visible = false;
    }
    const house = await ai.load('prop_house');
    if (house && this.houseGroups) {
      const near = this.houseGroups.filter(({ h }) => !h.mill).sort((a, b) => Math.hypot(a.h.x, a.h.z) - Math.hypot(b.h.x, b.h.z)).slice(0, 3);
      for (const { g, h } of near) {
        const obj = await ai.instance('prop_house');
        if (!obj) break;
        const s = Math.min(h.w, h.d) / 4.2;
        obj.scale.setScalar(s);
        place(obj, h.x, h.z, Math.PI);
        g.visible = false;
      }
    }
    const bridge = await ai.instance('prop_broken_bridge');
    if (bridge) {
      const B = HARVEN.bridge;
      this.aiBridge = place(bridge, riverX(B.z), B.z);
      this.aiBridge.position.y = HARVEN.waterLevel - 0.2;
      this.setBridgeState(this.bridgeState || 'broken');
    }
  }

  buildDepot() {
    const d = HARVEN.depot, x = d.x + 5, z = d.z - 3, y = heightAt(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 5), new THREE.MeshStandardMaterial({ color: '#d9c7a0' })); body.position.y = 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), new THREE.MeshStandardMaterial({ color: '#6a4a33', flatShading: true }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(7, 2.2, 6); roof.position.y = 5.1;
    g.add(body, roof);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: '#8a6440' })); c.position.set(-3.8, 0.45 + (i === 2 ? 0.9 : 0), -1 + (i % 2) * 1.0); g.add(c); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    this.group.add(g);
  }

  // ---------------- 떠다니는 풀린 실 (분위기 연출) ----------------
  buildLooseThreads() {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe0a0').multiplyScalar(2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const coldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8c8ff').multiplyScalar(2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const threads = [];
    const areas = [[HARVEN.spawns[0], mat, 8], [HARVEN.hollow, coldMat, 12], [{ x: 0, z: 0, radius: 14 }, mat, 5]];
    for (const [area, m, n] of areas) {
      for (let i = 0; i < n; i++) {
        const a = this.rng() * 6.28, r = this.rng() * (area.radius || 12);
        const x = area.x + Math.cos(a) * r, z = area.z + Math.sin(a) * r;
        const y = heightAt(x, z) + 1.5 + this.rng() * 2.5;
        const pts = [];
        for (let k = 0; k < 6; k++) pts.push(new THREE.Vector3(Math.sin(k * 1.1 + i) * 0.8, k * 0.5 - 1.2, Math.cos(k * 0.9 + i) * 0.8));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 4), m);
        tube.position.set(x, y, z);
        tube.userData.base = y; tube.userData.ph = this.rng() * 6.28;
        this.group.add(tube); threads.push(tube);
      }
    }
    this.animated.push((t) => {
      for (const th of threads) {
        th.position.y = th.userData.base + Math.sin(t * 0.6 + th.userData.ph) * 0.4;
        th.rotation.y = t * 0.15 + th.userData.ph;
      }
    });
  }
}
