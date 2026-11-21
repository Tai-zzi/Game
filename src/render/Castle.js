import * as THREE from 'three';
import { HARVEN, heightAt } from '../data/zones.js';
import { pbr, boxUV, cylUV, planeUV } from './Textures.js';

/**
 * 성채 마을 (실사풍 모듈식 건축): 성벽·탑·성문·성채(keep)·목조 골조 집·공동 베틀 회관·물레방앗간·잡화점.
 * 모든 면은 실제 크기에 맞춘 UV 로 PBR 텍스처(돌·벽돌·회벽·목재·슬레이트)를 입힌다.
 */
export class Castle {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.windows = []; // 밤에 켜지는 창
    const M = this.mat = {
      wall: pbr('castle_wall'), brick: pbr('castle_brick'), plaster: pbr('plaster', { color: '#efe8dc' }),
      timber: pbr('timber', { color: '#8a7058' }), roof: pbr('roof_slate', { color: '#9aa0a8' }), planks: pbr('planks'),
      win: new THREE.MeshStandardMaterial({ color: '#2a2a30', emissive: '#ffb050', emissiveIntensity: 0, roughness: 0.2, metalness: 0.1 }),
    };
    this.walls();
    this.keep();
    for (const h of HARVEN.houses) { if (h.shop) this.shop(h); else if (h.mill) this.stoneHouse(h, true); else this.timberHouse(h); }
    this.loomHall();
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  box(w, h, d, mat, x, y, z, ry = 0, per = 0.5) {
    const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, per), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    this.group.add(m);
    return m;
  }

  /** 성벽 고리 + 총안(톱니) + 탑 + 성문 */
  walls() {
    const W = HARVEN.walls, N = 28, R = W.r;
    const inGate = (a) => W.gates.find((g) => Math.abs(Math.atan2(Math.sin(a - g.a), Math.cos(a - g.a))) < g.w / 2);
    const merlons = [];
    const towerAt = [];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      const segGate = inGate(am) || inGate(a0 + 0.02) || inGate(a1 - 0.02);
      if (!segGate) {
        const p0 = [Math.cos(a0) * R, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, Math.sin(a1) * R];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.3, cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
        const y0 = Math.min(heightAt(p0[0], p0[1]), heightAt(p1[0], p1[1])) - 1.5;
        const rot = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        this.box(len, W.height + 1.5, W.thick, this.mat.wall, cx, y0 + (W.height + 1.5) / 2, cz, rot);
        // 성벽 위 총안 (바깥쪽 가장자리)
        for (let k = 0; k < Math.floor(len / 1.3); k++) {
          const t = (k + 0.5) / Math.floor(len / 1.3);
          const ox = Math.cos(am) * (W.thick / 2 - 0.25), oz = Math.sin(am) * (W.thick / 2 - 0.25);
          merlons.push({ x: p0[0] + (p1[0] - p0[0]) * t + ox, z: p0[1] + (p1[1] - p0[1]) * t + oz, y: y0 + W.height + 1.5 + 0.45, rot });
        }
      }
      if (i % 4 === 0 && !inGate(a0)) towerAt.push(a0);
    }
    // 성문 양옆 탑 + 아치
    for (const g of W.gates) {
      for (const s of [-1, 1]) towerAt.push(g.a + s * (g.w / 2 + 0.035));
      const gap = R * g.w;
      if (gap < 12) {
        const cx = Math.cos(g.a) * R, cz = Math.sin(g.a) * R, y = heightAt(cx, cz);
        const lint = this.box(gap + 2, 2.4, W.thick + 0.6, this.mat.wall, cx, y + W.height - 0.2, cz, -g.a + Math.PI / 2);
        for (let k = -2; k <= 2; k++) merlons.push({ x: cx + Math.cos(g.a + Math.PI / 2) * k * 1.6, z: cz + Math.sin(g.a + Math.PI / 2) * k * 1.6, y: y + W.height + 1.45, rot: -g.a + Math.PI / 2 });
        lint.userData.gate = g.name;
      }
    }
    for (const a of towerAt) this.tower(Math.cos(a) * R, Math.sin(a) * R, 2.5, W.height + 4);
    const mg = boxUV(new THREE.BoxGeometry(0.8, 0.9, 0.5), 0.8, 0.9, 0.5);
    const inst = new THREE.InstancedMesh(mg, this.mat.wall, merlons.length);
    const d = new THREE.Object3D();
    merlons.forEach((m, i) => { d.position.set(m.x, m.y, m.z); d.rotation.set(0, m.rot, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
    inst.computeBoundingSphere();
    this.group.add(inst);
  }

  /** 둥근 탑: 돌 원기둥 + 총안 고리 + 슬레이트 원뿔 지붕 */
  tower(x, z, r, h) {
    const y = heightAt(x, z) - 1.5;
    const body = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(r, r * 1.08, h + 1.5, 20, 1, false), r, h + 1.5), this.mat.wall);
    body.position.set(x, y + (h + 1.5) / 2, z); this.group.add(body);
    const ring = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.8, 20), r * 1.12, 0.8), this.mat.wall);
    ring.position.set(x, y + h + 1.9, z); this.group.add(ring);
    const roof = new THREE.Mesh(cylUV(new THREE.ConeGeometry(r * 1.3, r * 2.4, 20, 1), r * 1.3, r * 2.6, 0.6), this.mat.roof);
    roof.position.set(x, y + h + 2.3 + r * 1.2, z); this.group.add(roof);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + x; const w = this.box(0.35, 0.9, 0.2, this.mat.win, x + Math.cos(a) * (r + 0.02), y + h * 0.6, z + Math.sin(a) * (r + 0.02), -a + Math.PI / 2); this.windows.push(w); }
  }

  /** 성채(keep): 언덕 위 사각 탑 + 모서리 망루 + 총안 */
  keep() {
    const K = HARVEN.keep, y = heightAt(K.x, K.z) - 2;
    this.box(K.w, K.h + 2, K.d, this.mat.brick, K.x, y + (K.h + 2) / 2, K.z);
    this.box(K.w + 0.6, 0.6, K.d + 0.6, this.mat.wall, K.x, y + K.h + 2.2, K.z);
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, sz = i < 2 ? 1 : -1;
      this.tower(K.x + sx * K.w / 2, K.z + sz * K.d / 2, 1.3, K.h + 2.5);
    }
    for (let k = -3; k <= 3; k++) for (const s of [-1, 1]) {
      this.box(0.7, 0.9, 0.5, this.mat.wall, K.x + k * 1.2, y + K.h + 2.9, K.z + s * (K.d / 2 + 0.05));
      this.box(0.5, 0.9, 0.7, this.mat.wall, K.x + s * (K.w / 2 + 0.05), y + K.h + 2.9, K.z + k * 1.2);
    }
    this.box(2.2, 3.4, 0.3, this.mat.planks, K.x, y + 3.7, K.z + K.d / 2 + 0.1);
    for (let f = 0; f < 3; f++) for (const s of [-1, 1]) this.windows.push(this.box(0.6, 1.2, 0.15, this.mat.win, K.x + s * 2.4, y + 6 + f * 3.4, K.z + K.d / 2 + 0.06));
  }

  /** 박공지붕: 긴 축을 따라 용마루, 처마 돌출, 박공 삼각벽 */
  gableRoof(cx, baseY, cz, w, d, pitch = 0.75) {
    const along = w >= d; // 용마루 방향
    const span = along ? d : w, len = (along ? w : d) + 0.9;
    const rise = span / 2 * pitch, slope = Math.hypot(span / 2 + 0.45, rise);
    const ang = Math.atan2(rise, span / 2 + 0.45);
    for (const s of [-1, 1]) {
      const geo = boxUV(new THREE.BoxGeometry(along ? len : slope, 0.18, along ? slope : len), along ? len : slope, 0.18, along ? slope : len, 0.6);
      const m = new THREE.Mesh(geo, this.mat.roof);
      if (along) { m.position.set(cx, baseY + rise / 2, cz + s * (span / 4 + 0.1)); m.rotation.x = s * ang; }
      else { m.position.set(cx + s * (span / 4 + 0.1), baseY + rise / 2, cz); m.rotation.z = -s * ang; }
      this.group.add(m);
    }
    // 박공 삼각벽
    const tri = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
    for (const s of [-1, 1]) {
      const g = planeUV(new THREE.ShapeGeometry(tri), 1, 1, 0.5);
      const m = new THREE.Mesh(g, this.mat.plaster);
      m.material = this.mat.plaster; m.material.side = THREE.DoubleSide;
      if (along) { m.position.set(cx + s * (w / 2), baseY, cz); m.rotation.y = Math.PI / 2; }
      else m.position.set(cx, baseY, cz + s * (d / 2));
      this.group.add(m);
    }
    this.box(along ? len : 0.25, 0.25, along ? 0.25 : len, this.mat.timber, cx, baseY + rise + 0.05, cz);
    return rise;
  }

  /** 목조 골조 집: 돌 기단 + 회벽 + 들보·기둥·가새 + 슬레이트 박공지붕 + 굴뚝 + 창 */
  timberHouse(h) {
    const y = heightAt(h.x, h.z);
    const base = 0.9;
    this.box(h.w + 0.2, base + 2, h.d + 0.2, this.mat.wall, h.x, y - 1 + base / 2, h.z);
    this.box(h.w, h.h, h.d, this.mat.plaster, h.x, y + base + h.h / 2, h.z);
    const T = this.mat.timber, top = y + base + h.h;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.26, h.h, 0.26, T, h.x + sx * h.w / 2, y + base + h.h / 2, h.z + sz * h.d / 2);
    for (const yy of [y + base + 0.1, y + base + h.h * 0.52, top - 0.1]) {
      this.box(h.w + 0.1, 0.22, 0.12, T, h.x, yy, h.z + h.d / 2 + 0.05);
      this.box(h.w + 0.1, 0.22, 0.12, T, h.x, yy, h.z - h.d / 2 - 0.05);
      this.box(0.12, 0.22, h.d + 0.1, T, h.x + h.w / 2 + 0.05, yy, h.z);
      this.box(0.12, 0.22, h.d + 0.1, T, h.x - h.w / 2 - 0.05, yy, h.z);
    }
    // 가새 (정면)
    for (const s of [-1, 1]) {
      const br = this.box(0.14, h.h * 0.62, 0.1, T, h.x + s * h.w * 0.32, y + base + h.h * 0.26, h.z + h.d / 2 + 0.07);
      br.rotation.z = s * 0.55;
    }
    this.box(1.0, 1.9, 0.12, this.mat.planks, h.x - h.w * 0.22, y + base + 0.95, h.z + h.d / 2 + 0.08);
    for (const wx of [h.w * 0.22, -h.w * 0.3]) this.windows.push(this.box(0.8, 0.9, 0.1, this.mat.win, h.x + wx, y + base + h.h * 0.75, h.z + h.d / 2 + 0.08));
    this.windows.push(this.box(0.1, 0.9, 0.8, this.mat.win, h.x + h.w / 2 + 0.08, y + base + h.h * 0.72, h.z));
    const rise = this.gableRoof(h.x, top, h.z, h.w, h.d);
    this.box(0.8, rise + 1.4, 0.8, this.mat.brick, h.x + h.w * 0.28, top + (rise + 1.4) / 2, h.z - h.d * 0.18);
  }

  /** 돌집 (물레방앗간) */
  stoneHouse(h) {
    const y = heightAt(h.x, h.z) - 1.2;
    this.box(h.w, h.h + 1.2, h.d, this.mat.wall, h.x, y + (h.h + 1.2) / 2, h.z);
    this.box(1.0, 1.9, 0.12, this.mat.planks, h.x - h.w * 0.2, y + 2.1, h.z + h.d / 2 + 0.07);
    this.windows.push(this.box(0.7, 0.8, 0.1, this.mat.win, h.x + h.w * 0.25, y + 3, h.z + h.d / 2 + 0.07));
    this.gableRoof(h.x, y + h.h + 1.2, h.z, h.w, h.d, 0.8);
  }

  /** 잡화점: 돌 창고 + 목재 차양 + 계산대 + 선반 + 간판 (앞이 트여 손님이 다가간다) */
  shop(h) {
    const y = heightAt(h.x, h.z + 2);
    this.box(h.w, h.h + 1, h.d, this.mat.wall, h.x, y + (h.h + 1) / 2 - 0.5, h.z);
    this.gableRoof(h.x, y + h.h + 0.5, h.z, h.w, h.d, 0.6);
    const D = 3.2, T = this.mat.timber;
    for (const sx of [-1, 1]) this.box(0.24, h.h - 0.3, 0.24, T, h.x + sx * (h.w / 2 - 0.2), y + (h.h - 0.3) / 2, h.z + h.d / 2 + D);
    this.box(h.w + 0.3, 0.2, 0.24, T, h.x, y + h.h - 0.3, h.z + h.d / 2 + D);
    const awn = this.box(h.w + 0.5, 0.12, D + 0.6, this.mat.roof, h.x, y + h.h - 0.05, h.z + h.d / 2 + D / 2);
    awn.rotation.x = 0.22;
    this.box(h.w - 1, 1.0, 0.7, this.mat.planks, h.x, y + 0.5, h.z + h.d / 2 + 0.9);
    for (let k = 0; k < 2; k++) this.box(h.w - 1, 0.08, 0.5, this.mat.planks, h.x, y + 1.3 + k * 0.7, h.z + h.d / 2 + 0.25);
    const goods = ['#b0503a', '#c8a050', '#7aa05a', '#d8c08a', '#8a9098', '#e0d0a0'];
    for (let i = 0; i < 12; i++) {
      const it = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.24, 10), new THREE.MeshStandardMaterial({ color: goods[i % 6], roughness: 0.4 }));
      it.position.set(h.x - h.w / 2 + 0.9 + (i % 6) * 0.9, y + 1.12, h.z + h.d / 2 + 0.9 + (i < 6 ? -0.15 : 0.15));
      this.group.add(it);
    }
    const sign = this.box(1.8, 0.7, 0.08, this.mat.planks, h.x - h.w / 2 - 0.15, y + h.h - 1, h.z + h.d / 2 + D + 0.25, Math.PI / 2);
    sign.userData.sign = '잡화점';
    const lamp = new THREE.PointLight('#ffc070', 4, 9, 1.8); lamp.position.set(h.x, y + h.h - 0.9, h.z + h.d / 2 + 1.5); this.group.add(lamp);
    this.lamps = [...(this.lamps || []), lamp];
  }

  /** 공동 베틀 회관: 목조 기둥 + 박공지붕 (베틀은 World 가 그 아래에 둔다) */
  loomHall() {
    const L = HARVEN.loom, y = heightAt(L.x, L.z), w = L.w + 3, d = L.d + 3, h = 4.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.34, h, 0.34, this.mat.timber, L.x + sx * w / 2, y + h / 2, L.z + sz * d / 2);
    for (const sz of [-1, 1]) this.box(w + 0.4, 0.3, 0.3, this.mat.timber, L.x, y + h, L.z + sz * d / 2);
    for (const sx of [-1, 1]) this.box(0.3, 0.3, d + 0.4, this.mat.timber, L.x + sx * w / 2, y + h, L.z);
    this.box(w + 1.2, 0.3, d + 1.2, this.mat.wall, L.x, y + 0.05, L.z, 0, 0.6);
    this.gableRoof(L.x, y + h + 0.15, L.z, w, d, 0.55);
  }

  /** 밤에 창문 불빛 */
  setNight(k) {
    this.mat.win.emissiveIntensity = k * 1.6;
    for (const l of this.lamps || []) l.intensity = 1.5 + k * 4;
  }
}
