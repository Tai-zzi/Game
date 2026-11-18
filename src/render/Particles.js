import * as THREE from 'three';
import { FEEL } from '../data/feel.js';

/**
 * 풀(pool) 기반 입자 — 타격마다 새 객체를 만들지 않는다 (60fps 유지).
 *  streaks : 속도 방향으로 늘어나는 불꽃·파편 (중력·바닥 튕김) — LineSegments 한 개
 *  threads : 끊어져 말리는 금빛 실 조각 (이 세계의 상징) — LineSegments 한 개, 조각당 3마디
 *  puffs   : 먼지·털뭉치·염료 방울 — Points 한 개 (크기·색 개별)
 *  sprites : 충돌 섬광 별 / 바닥 충격파 고리 / 미끄러짐 자국 / 염료 얼룩 — 고정 개수 메시 순환
 * 저품질: 개수 배율 FEEL.fx.lowQualityScale
 */
const SEG = 3;

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,240,200,0.8)'); grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 10], [10, 128]]) { const l = g.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2); g.fillStyle = 'rgba(255,250,230,0.9)'; g.fillRect(64 - w / 2, 64 - h / 2, w, h); }
  g.translate(64, 64); g.rotate(Math.PI / 4); g.fillStyle = 'rgba(255,230,180,0.5)'; g.fillRect(-48, -3, 96, 6); g.fillRect(-3, -48, 6, 96);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function blotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.25})`; g.beginPath(); g.arc(64 + (Math.random() - 0.5) * 50, 64 + (Math.random() - 0.5) * 50, 10 + Math.random() * 26, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c); return t;
}

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.scale = 1;
    const F = FEEL.fx;
    // ── 늘어나는 불꽃
    this.sN = F.maxStreaks;
    this.s = { pos: new Float32Array(this.sN * 3), vel: new Float32Array(this.sN * 3), life: new Float32Array(this.sN), max: new Float32Array(this.sN), col: new Float32Array(this.sN * 3), grav: new Float32Array(this.sN), i: 0 };
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sN * 6), 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.sN * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.streakGeo = sg;
    this.streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.streaks.frustumCulled = false;
    // ── 실 조각 (말림)
    this.tN = F.maxThreads;
    this.t = { pos: new Float32Array(this.tN * 3), vel: new Float32Array(this.tN * 3), life: new Float32Array(this.tN), max: new Float32Array(this.tN), col: new Float32Array(this.tN * 3), curl: new Float32Array(this.tN), ang: new Float32Array(this.tN), len: new Float32Array(this.tN), i: 0 };
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.tN * SEG * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.tN * SEG * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.threadGeo = tg;
    this.threads = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.threads.frustumCulled = false;
    // ── 뭉게 (먼지·털·방울)
    this.pN = F.maxPuffs;
    this.p = { pos: new Float32Array(this.pN * 3), vel: new Float32Array(this.pN * 3), life: new Float32Array(this.pN), max: new Float32Array(this.pN), size: new Float32Array(this.pN), grav: new Float32Array(this.pN), i: 0 };
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pN * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.pN * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(this.pN), 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(this.pN), 1).setUsage(THREE.DynamicDrawUsage));
    this.puffGeo = pg;
    this.puffs = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard; gl_FragColor = vec4(vC, vA * (1.0 - r * 3.2)); }',
    }));
    this.puffs.frustumCulled = false;
    scene.add(this.streaks, this.threads, this.puffs);
    // ── 고정 개수 스프라이트/데칼
    const star = starTexture(), blot = blotTexture();
    this.flashes = this.makePool(F.maxFlashes, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
    this.rings = this.makePool(F.maxRings, () => new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decals = this.makePool(F.maxDecals, () => new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: blot, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    this.ghosts = this.makePool(F.maxGhosts, () => new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.tmpC = new THREE.Color();
  }

  makePool(n, make) {
    const items = [];
    for (let i = 0; i < n; i++) { const o = make(); o.visible = false; o.userData = { life: 0, max: 1, kind: '' }; this.scene.add(o); items.push(o); }
    return { items, i: 0 };
  }
  take(pool) { const o = pool.items[pool.i]; pool.i = (pool.i + 1) % pool.items.length; o.visible = true; return o; }

  setQuality(q) { this.scale = q === 'high' ? 1 : FEEL.fx.lowQualityScale; }
  n(count) { return Math.max(1, Math.round(count * this.scale)); }

  /** 늘어나는 불꽃/파편: dir 방향으로 퍼짐, 중력·튕김 */
  sparks(pos, dir, count, color, { speed = 7, spread = 0.9, gravity = 14, life = 0.45 } = {}) {
    const S = this.s, c = this.tmpC.set(color);
    for (let k = 0; k < this.n(count); k++) {
      const i = S.i; S.i = (S.i + 1) % this.sN;
      const vx = (dir?.x || 0) + (Math.random() - 0.5) * spread * 2, vy = 0.4 + Math.random() * 0.9, vz = (dir?.z || 0) + (Math.random() - 0.5) * spread * 2;
      const l = Math.hypot(vx, vy, vz) || 1, sp = speed * (0.5 + Math.random() * 0.8);
      S.pos.set([pos.x, pos.y, pos.z], i * 3); S.vel.set([(vx / l) * sp, (vy / l) * sp, (vz / l) * sp], i * 3);
      S.life[i] = S.max[i] = life * (0.6 + Math.random() * 0.6); S.grav[i] = gravity;
      S.col.set([c.r * 2.5, c.g * 2.5, c.b * 2.5], i * 3);
    }
  }

  /** 금빛 실 조각: 끊어져 말리며 흩날림 */
  threadBits(pos, count, color, { speed = 3.2, life = 1.1 } = {}) {
    const T = this.t, c = this.tmpC.set(color);
    for (let k = 0; k < this.n(count); k++) {
      const i = T.i; T.i = (T.i + 1) % this.tN;
      const a = Math.random() * Math.PI * 2;
      T.pos.set([pos.x, pos.y, pos.z], i * 3);
      T.vel.set([Math.cos(a) * speed * (0.4 + Math.random()), 1 + Math.random() * 2.2, Math.sin(a) * speed * (0.4 + Math.random())], i * 3);
      T.life[i] = T.max[i] = life * (0.7 + Math.random() * 0.6);
      T.curl[i] = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6); T.ang[i] = Math.random() * 6.28; T.len[i] = 0.12 + Math.random() * 0.16;
      T.col.set([c.r * 2.4, c.g * 2.4, c.b * 2.4], i * 3);
    }
  }

  /** 먼지·털뭉치·염료 방울 */
  puff(pos, count, color, { size = 0.5, speed = 1.2, rise = 0.6, gravity = 0, life = 0.7 } = {}) {
    const P = this.p, c = this.tmpC.set(color);
    const col = this.puffGeo.attributes.color.array;
    for (let k = 0; k < this.n(count); k++) {
      const i = P.i; P.i = (P.i + 1) % this.pN;
      const a = Math.random() * Math.PI * 2, sp = speed * Math.random();
      P.pos.set([pos.x + Math.cos(a) * 0.2, pos.y, pos.z + Math.sin(a) * 0.2], i * 3);
      P.vel.set([Math.cos(a) * sp, rise * (0.5 + Math.random()), Math.sin(a) * sp], i * 3);
      P.life[i] = P.max[i] = life * (0.7 + Math.random() * 0.6); P.size[i] = size * (0.6 + Math.random() * 0.8); P.grav[i] = gravity;
      col.set([c.r, c.g, c.b], i * 3);
    }
  }

  /** 충돌 섬광 별 (피해량에 비례한 크기) */
  flash(pos, color, size = 1) {
    const o = this.take(this.flashes);
    o.position.copy(pos); o.material.color.set(color).multiplyScalar(2.2); o.material.rotation = Math.random() * 3;
    o.userData.life = o.userData.max = 0.14; o.userData.size = size; o.userData.kind = 'flash';
  }

  /** 바닥 충격파 고리 */
  shockwave(pos, color, radius = 3, life = 0.45) {
    const o = this.take(this.rings);
    o.position.copy(pos); o.position.y += 0.08; o.material.color.set(color).multiplyScalar(2);
    o.userData.life = o.userData.max = life; o.userData.radius = radius; o.userData.kind = 'ring';
  }

  /** 바닥 자국: 미끄러짐(slide) · 염료 얼룩(dye) */
  decal(pos, color, w, l, rot, life = 3, opacity = 0.5) {
    const o = this.take(this.decals);
    o.position.copy(pos); o.position.y += 0.05; o.rotation.y = rot; o.scale.set(w, 1, l);
    o.material.color.set(color); o.userData.life = o.userData.max = life; o.userData.opacity = opacity; o.userData.kind = 'decal';
  }

  /** 잔상: 돌진·도약·구르기 경로의 반투명 실루엣 */
  ghost(pos, rot, color) {
    const o = this.take(this.ghosts);
    o.position.copy(pos); o.position.y += 0.9; o.rotation.y = rot; o.material.color.set(color);
    o.userData.life = o.userData.max = 0.35; o.userData.kind = 'ghost';
  }

  update(dt, groundAt) {
    // 불꽃
    const S = this.s, sp = this.streakGeo.attributes.position.array, sc = this.streakGeo.attributes.color.array;
    for (let i = 0; i < this.sN; i++) {
      const o = i * 6;
      if (S.life[i] <= 0) { if (sc[o] || sc[o + 3]) { sc.fill(0, o, o + 6); } continue; }
      S.life[i] -= dt;
      const j = i * 3;
      S.vel[j + 1] -= S.grav[i] * dt;
      S.pos[j] += S.vel[j] * dt; S.pos[j + 1] += S.vel[j + 1] * dt; S.pos[j + 2] += S.vel[j + 2] * dt;
      const gy = groundAt(S.pos[j], S.pos[j + 2]);
      if (S.pos[j + 1] < gy) { S.pos[j + 1] = gy; S.vel[j + 1] *= -0.35; S.vel[j] *= 0.6; S.vel[j + 2] *= 0.6; } // 튕김
      const k = Math.max(0, S.life[i] / S.max[i]);
      const st = 0.035; // 속도 방향으로 늘림
      sp[o] = S.pos[j]; sp[o + 1] = S.pos[j + 1]; sp[o + 2] = S.pos[j + 2];
      sp[o + 3] = S.pos[j] - S.vel[j] * st; sp[o + 4] = S.pos[j + 1] - S.vel[j + 1] * st; sp[o + 5] = S.pos[j + 2] - S.vel[j + 2] * st;
      for (let q = 0; q < 3; q++) { sc[o + q] = S.col[j + q] * k; sc[o + 3 + q] = S.col[j + q] * k * 0.2; }
    }
    this.streakGeo.attributes.position.needsUpdate = true; this.streakGeo.attributes.color.needsUpdate = true;
    // 실 조각
    const T = this.t, tp = this.threadGeo.attributes.position.array, tc = this.threadGeo.attributes.color.array;
    for (let i = 0; i < this.tN; i++) {
      const o = i * SEG * 6, j = i * 3;
      if (T.life[i] <= 0) { if (tc[o]) tc.fill(0, o, o + SEG * 6); continue; }
      T.life[i] -= dt;
      T.vel[j + 1] -= 2.2 * dt; T.vel[j] *= 1 - dt * 1.5; T.vel[j + 2] *= 1 - dt * 1.5;
      T.pos[j] += T.vel[j] * dt; T.pos[j + 1] += T.vel[j + 1] * dt; T.pos[j + 2] += T.vel[j + 2] * dt;
      T.ang[i] += T.curl[i] * dt;
      const k = Math.max(0, T.life[i] / T.max[i]);
      let x = T.pos[j], y = T.pos[j + 1], z = T.pos[j + 2], a = T.ang[i];
      for (let s = 0; s < SEG; s++) { // 마디마다 각도가 조금씩 더 꺾여 말린 모양
        const nx = x + Math.cos(a) * T.len[i], ny = y + Math.sin(a * 0.7) * T.len[i] * 0.6, nz = z + Math.sin(a) * T.len[i];
        const b = o + s * 6;
        tp[b] = x; tp[b + 1] = y; tp[b + 2] = z; tp[b + 3] = nx; tp[b + 4] = ny; tp[b + 5] = nz;
        for (let q = 0; q < 3; q++) { tc[b + q] = T.col[j + q] * k; tc[b + 3 + q] = T.col[j + q] * k; }
        x = nx; y = ny; z = nz; a += T.curl[i] * 0.12 * (1 - k + 0.3);
      }
    }
    this.threadGeo.attributes.position.needsUpdate = true; this.threadGeo.attributes.color.needsUpdate = true;
    // 뭉게
    const P = this.p, pp = this.puffGeo.attributes.position.array, ps = this.puffGeo.attributes.size.array, pa = this.puffGeo.attributes.alpha.array;
    for (let i = 0; i < this.pN; i++) {
      if (P.life[i] <= 0) { pa[i] = 0; continue; }
      P.life[i] -= dt;
      const j = i * 3;
      P.vel[j + 1] -= P.grav[i] * dt;
      P.pos[j] += P.vel[j] * dt; P.pos[j + 1] += P.vel[j + 1] * dt; P.pos[j + 2] += P.vel[j + 2] * dt;
      P.vel[j] *= 1 - dt * 2; P.vel[j + 2] *= 1 - dt * 2;
      const k = Math.max(0, P.life[i] / P.max[i]);
      pp[j] = P.pos[j]; pp[j + 1] = P.pos[j + 1]; pp[j + 2] = P.pos[j + 2];
      ps[i] = P.size[i] * (1.6 - k * 0.6); pa[i] = k * 0.7;
    }
    for (const n of ['position', 'size', 'alpha', 'color']) this.puffGeo.attributes[n].needsUpdate = true;
    // 스프라이트·데칼
    for (const pool of [this.flashes, this.rings, this.decals, this.ghosts]) for (const o of pool.items) {
      if (!o.visible) continue;
      const u = o.userData;
      u.life -= dt;
      if (u.life <= 0) { o.visible = false; continue; }
      const k = 1 - u.life / u.max;
      if (u.kind === 'flash') { o.scale.setScalar(u.size * (0.6 + k * 1.6)); o.material.opacity = 1 - k; }
      else if (u.kind === 'ring') { o.scale.setScalar(0.2 + k * u.radius); o.material.opacity = 0.9 * (1 - k); }
      else if (u.kind === 'decal') o.material.opacity = u.opacity * Math.min(1, u.life / 0.8);
      else if (u.kind === 'ghost') o.material.opacity = 0.35 * (1 - k);
    }
  }
}
