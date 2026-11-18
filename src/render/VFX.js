import * as THREE from 'three';
import { ITEM_AI } from '../data/aiAssets.js';

/**
 * 실(thread) 테마 이펙트. 모든 이펙트는 수명(life)을 가진 오브젝트로 관리된다.
 */
export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  add(obj, life, tick) {
    this.scene.add(obj);
    this.list.push({ obj, life, max: life, tick });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.life -= dt;
      const k = 1 - Math.max(0, e.life) / e.max; // 0 → 1
      e.tick(k, dt);
      if (e.life <= 0) {
        this.scene.remove(e.obj);
        e.obj.traverse((o) => { if (o.geometry && o.geometry !== this.ringGeo) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.list.splice(i, 1);
      }
    }
  }

  glowLineMat(color, opacity = 1) {
    return new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); // HDR 색 → 블룸
  }

  /** 곡선 실 가닥 하나의 점들 */
  curve(origin, dir, len, wobble, seg = 10) {
    const pts = [];
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const ph = Math.random() * 6;
    for (let i = 0; i <= seg; i++) {
      const k = i / seg;
      pts.push(new THREE.Vector3().copy(origin).addScaledVector(dir, len * k)
        .addScaledVector(side, Math.sin(ph + k * 5) * wobble * k).add(new THREE.Vector3(0, Math.cos(ph + k * 4) * wobble * k, 0)));
    }
    return pts;
  }

  /** 타격 시 실 튀김 */
  threadBurst(pos, color = '#ffd27a', count = 7, size = 1.2) {
    const g = new THREE.Group();
    g.position.copy(pos);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const geo = new THREE.BufferGeometry().setFromPoints(this.curve(new THREE.Vector3(), dir, size * (0.6 + Math.random() * 0.6), 0.25));
      g.add(new THREE.Line(geo, this.glowLineMat(color)));
    }
    this.add(g, 0.4, (k) => {
      g.scale.setScalar(0.4 + k * 1.2);
      g.children.forEach((l) => { l.material.opacity = 1 - k; });
    });
  }

  /** 끌어베기: 대상에게 걸린 실이 당겨진다 */
  pullLine(fromFn, toFn, color = '#ffe08a') {
    const g = new THREE.Group();
    const lines = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints(new Array(12).fill(0).map(() => new THREE.Vector3()));
      const l = new THREE.Line(geo, this.glowLineMat(color)); g.add(l); lines.push(l);
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
    this.add(g, 0.45, (k) => {
      a.copy(fromFn()); b.copy(toFn());
      lines.forEach((l, j) => {
        const pos = l.geometry.attributes.position;
        for (let i = 0; i < 12; i++) {
          const t = i / 11;
          p.lerpVectors(a, b, t);
          const sag = Math.sin(t * Math.PI) * (0.5 - k * 0.5) * (j - 1) * 0.6;
          pos.setXYZ(i, p.x + sag, p.y + Math.sin(t * Math.PI) * 0.3 * (1 - k), p.z - sag);
        }
        pos.needsUpdate = true;
        l.material.opacity = 1 - k * k;
      });
    });
  }

  /** 지면 링 (클릭 표식, 레벨업, 놓아치기) */
  ring(pos, color, radius, life = 0.5, opacity = 0.9) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos).y += 0.08;
    this.add(m, life, (k) => { m.scale.setScalar(0.2 + k * radius); m.material.opacity = opacity * (1 - k); });
  }

  /** 놓아치기: 전방 부채꼴로 실이 터져 나간다 */
  releaseWave(pos, facing, tension, range, arc) {
    const power = 0.4 + tension / 100;
    const color = tension > 75 ? '#ff9a5a' : '#ffd27a';
    const g = new THREE.Group();
    g.position.copy(pos).y += 0.9;
    const n = 10 + Math.round(tension / 6);
    for (let i = 0; i < n; i++) {
      const a = facing + (i / (n - 1) - 0.5) * arc;
      const dir = new THREE.Vector3(Math.sin(a), (Math.random() - 0.3) * 0.15, Math.cos(a));
      const geo = new THREE.BufferGeometry().setFromPoints(this.curve(new THREE.Vector3(), dir, range * (0.8 + Math.random() * 0.4), 0.35, 14));
      g.add(new THREE.Line(geo, this.glowLineMat(color)));
    }
    const fan = new THREE.Mesh(new THREE.CircleGeometry(range, 32, facing - Math.PI / 2 - arc / 2, arc),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 * power, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fan.rotation.x = -Math.PI / 2; fan.position.y = -0.8;
    g.add(fan);
    this.add(g, 0.5, (k) => {
      g.scale.set(0.3 + k * 0.9, 1, 0.3 + k * 0.9);
      g.children.forEach((c) => { c.material.opacity = (c === fan ? 0.35 * power : 1) * (1 - k); });
    });
    this.ring(pos, color, range * 1.1, 0.45);
  }

  /** 레벨업: 실이 나선으로 감겨 올라간다 */
  levelUp(getPos) {
    const g = new THREE.Group();
    for (let s = 0; s < 3; s++) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60, a = t * Math.PI * 6 + s * 2.09;
        pts.push(new THREE.Vector3(Math.cos(a) * (0.9 - t * 0.3), t * 3.2, Math.sin(a) * (0.9 - t * 0.3)));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.glowLineMat(s === 1 ? '#fff2c0' : '#ffc95a')));
    }
    this.add(g, 1.6, (k) => {
      g.position.copy(getPos());
      g.rotation.y += 0.08;
      g.scale.set(1, Math.min(1, k * 3), 1);
      g.children.forEach((l) => { l.material.opacity = k < 0.7 ? 1 : (1 - k) / 0.3; });
    });
    const p = getPos();
    this.ring(p, '#ffd27a', 4, 0.8);
    this.ring(p, '#fff2c0', 2.5, 0.6);
  }

  /** 사망: 몸이 실로 풀려 하늘로 흩어진다 */
  unravel(pos, color, height = 1) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const lines = [];
    for (let i = 0; i < 16; i++) {
      const base = new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * height, (Math.random() - 0.5) * 0.8);
      const dir = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4).normalize();
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.curve(base, dir, 0.8 + Math.random(), 0.3)), this.glowLineMat(color));
      l.userData.v = 0.8 + Math.random() * 1.2;
      g.add(l); lines.push(l);
    }
    this.add(g, 1.8, (k, dt) => {
      for (const l of lines) { l.position.y += l.userData.v * dt; l.rotation.y += dt; l.material.opacity = 1 - k; }
    });
  }

  /** 장력 끊어짐 */
  snap(pos) {
    this.threadBurst(new THREE.Vector3(pos.x, pos.y + 1.2, pos.z), '#ff6a5a', 14, 1.8);
    this.ring(pos, '#ff6a5a', 3, 0.5);
  }

  /** 질주 먼지 */
  dust(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: '#d8c8a8', transparent: true, opacity: 0.45, depthWrite: false }));
    m.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.1, pos.z + (Math.random() - 0.5) * 0.4);
    this.add(m, 0.5, (k) => { m.scale.setScalar(1 + k * 2); m.position.y += 0.01; m.material.opacity = 0.45 * (1 - k); });
  }

  /** 투사체: 빛나는 실 꼬리를 단 화살/문양 */
  projectile(fromV, toFn, speed, color = '#ffe08a', size = 0.12) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const tailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const tail = new THREE.Line(tailGeo, this.glowLineMat(color, 0.9));
    const g = new THREE.Group(); g.add(head, tail);
    const start = fromV.clone(), cur = start.clone(), prev = start.clone();
    const dist = Math.max(0.5, start.distanceTo(toFn()));
    this.add(g, dist / speed, (k) => {
      prev.copy(cur);
      cur.lerpVectors(start, toFn(), k);
      cur.y += Math.sin(k * Math.PI) * 0.3;
      head.position.copy(cur);
      const pos = tail.geometry.attributes.position;
      const back = cur.clone().addScaledVector(cur.clone().sub(prev).normalize(), -1.2);
      pos.setXYZ(0, cur.x, cur.y, cur.z); pos.setXYZ(1, back.x, back.y, back.z); pos.needsUpdate = true;
    });
  }

  /** 성벽 전개: 실로 짠 방벽 */
  wall(w, y) {
    const g = new THREE.Group();
    g.position.set(w.x, y, w.z); g.rotation.y = w.facing;
    const mat = new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w.width, 2.2), mat); plane.position.y = 1.1; g.add(plane);
    const lmat = this.glowLineMat('#cfe6ff', 0.9);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const x = -w.width / 2 + (i / 10) * w.width; pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 2.2, 0)); }
    for (let j = 0; j <= 4; j++) pts.push(new THREE.Vector3(-w.width / 2, j * 0.55, 0), new THREE.Vector3(w.width / 2, j * 0.55, 0));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lmat));
    const life = Math.max(0.1, (w.until - w.now));
    this.add(g, life, (k) => {
      const s = Math.min(1, k * life * 4);
      g.scale.set(1, s, 1);
      mat.opacity = 0.35 * (k > 0.85 ? (1 - k) / 0.15 : 1);
      lmat.opacity = 0.9 * (k > 0.85 ? (1 - k) / 0.15 : 1);
    });
  }

  /** 회복: 초록 안료 입자가 떠오른다 */
  heal(getPos, color = '#6ad08a') {
    const g = new THREE.Group();
    const lines = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.curve(new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), new THREE.Vector3(0, 1, 0), 0.6, 0.15)), this.glowLineMat(color));
      g.add(l); lines.push(l);
    }
    this.add(g, 0.9, (k) => { g.position.copy(getPos()); g.position.y += k * 1.6; lines.forEach((l) => { l.material.opacity = 1 - k; }); });
  }

  /** 바닥 경고 (적 공격 예고) */
  telegraph(pos, radius, time) {
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.25, depthWrite: false }));
    const edge = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ff5a3a', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    const g = new THREE.Group(); g.add(fill, edge);
    g.position.copy(pos); g.position.y += 0.06;
    edge.scale.setScalar(radius);
    this.add(g, time, (k) => { fill.scale.setScalar(Math.max(0.01, radius * k)); fill.material.opacity = 0.2 + k * 0.25; });
  }

  /** 원 범위 폭발 (완성 문양 확산, 번지는 빛) */
  burst(pos, radius, color) {
    this.ring(pos, color, radius, 0.5);
    const g = new THREE.Group(); g.position.copy(pos);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.curve(new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).normalize(), radius, 0.3)), this.glowLineMat(color)));
    }
    this.add(g, 0.5, (k) => { g.scale.setScalar(0.3 + k); g.children.forEach((l) => { l.material.opacity = 1 - k; }); });
  }

  /** 두 점을 잇는 순간 섬광선 (연결 사격, 호위 교대) */
  zap(a, b, color = '#ffe08a') {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.curve(a, b.clone().sub(a).normalize(), a.distanceTo(b), 0.2, 16)), this.glowLineMat(color));
    this.add(l, 0.35, (k) => { l.material.opacity = 1 - k; });
  }

  /** 타격 불꽃 + 실 튀김 (충돌 지점) */
  impact(pos, color, count = 8) {
    const n = Math.round(count);
    const pts = new Float32Array(n * 6);
    const dirs = [];
    for (let i = 0; i < n; i++) dirs.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 5));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, this.glowLineMat('#fff6d8'));
    lines.position.copy(pos);
    this.add(lines, 0.22, (k) => {
      const a = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        const d = dirs[i], s = k * 0.35;
        a.setXYZ(i * 2, d.x * s, d.y * s, d.z * s);
        a.setXYZ(i * 2 + 1, d.x * (s + 0.08), d.y * (s + 0.08), d.z * (s + 0.08));
      }
      a.needsUpdate = true;
      lines.material.opacity = 1 - k;
    });
    this.threadBurst(pos, color, Math.max(4, n * 0.6), 1.0);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.copy(pos);
    this.add(flash, 0.12, (k) => { flash.scale.setScalar(0.6 + k * 1.4); flash.material.opacity = 1 - k; });
  }

  /** 근접 궤적: 휘두른 방향으로 얇은 리본 호가 쓸고 지나간다 */
  slash(pos, facing, range, arc, color, stage = 0) {
    const segs = 20, inner = range * 0.35;
    const g = new THREE.BufferGeometry();
    const posArr = new Float32Array((segs + 1) * 2 * 3), alpha = new Float32Array((segs + 1) * 2);
    const idx = [];
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(2.6) }, uFade: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uFade); }',
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.copy(pos);
    const tilt = stage === 1 ? 0 : stage === 2 ? -0.35 : 0.35; // 연타마다 궤적 각도 변화
    const start = facing + (stage === 1 ? -arc / 2 : arc / 2), end = facing - (stage === 1 ? -arc / 2 : arc / 2);
    this.add(mesh, 0.22, (k) => {
      const head = Math.min(1, k * 2.2); // 앞부분이 먼저 쓸고, 꼬리가 따라 사라진다
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const a = start + (end - start) * u * head;
        const y = 1.0 + Math.sin(u * Math.PI) * tilt;
        posArr.set([Math.sin(a) * inner, y, Math.cos(a) * inner, Math.sin(a) * range, y + 0.05, Math.cos(a) * range], i * 6);
        const al = Math.max(0, u - (k - 0.3) * 1.4);
        alpha[i * 2] = al * 0.15; alpha[i * 2 + 1] = al;
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
      mat.uniforms.uFade.value = 1 - k * k;
    });
  }

  /** 찌르기·직선 궤적 */
  thrust(pos, facing, length, color, width = 0.25) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2).translate(0, 0, length / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos); m.position.y += 1.0; m.rotation.y = facing;
    this.add(m, 0.2, (k) => { m.scale.set(1 - k * 0.5, 1, 0.3 + k * 0.9); m.material.opacity = 1 - k; });
  }

  /** 적 공격 예고 (모양: cone | line | circle). 카운터 가능은 파란 테두리. id 로 취소 가능 */
  telegraphShape(tel, y) {
    this.tele = this.tele || new Map();
    this.cancelTelegraph(tel.id);
    const red = new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const edgeCol = tel.counterable ? new THREE.Color('#5ab8ff').multiplyScalar(2.5) : new THREE.Color('#ff5a3a');
    const edge = new THREE.MeshBasicMaterial({ color: edgeCol, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    let fillGeo, edgeGeo;
    if (tel.shape === 'cone') {
      const start = tel.facing - Math.PI / 2 - tel.angle / 2;
      fillGeo = new THREE.CircleGeometry(tel.range, 32, start, tel.angle);
      edgeGeo = new THREE.RingGeometry(tel.range * 0.96, tel.range, 32, 1, start, tel.angle);
    } else if (tel.shape === 'line') {
      fillGeo = new THREE.PlaneGeometry(tel.width, tel.length).translate(0, tel.length / 2, 0);
      edgeGeo = new THREE.EdgesGeometry(fillGeo);
    } else {
      fillGeo = new THREE.CircleGeometry(tel.radius, 40);
      edgeGeo = new THREE.RingGeometry(tel.radius * 0.95, tel.radius, 40);
    }
    const fill = new THREE.Mesh(fillGeo, red);
    const grow = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    const rim = tel.shape === 'line' ? new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: edgeCol, transparent: true })) : new THREE.Mesh(edgeGeo, edge);
    for (const o of [fill, grow, rim]) { o.rotation.x = -Math.PI / 2; if (tel.shape === 'line') o.rotation.z = tel.facing + Math.PI; g.add(o); }
    g.position.set(tel.x, y + 0.07, tel.z);
    this.tele.set(tel.id, g);
    this.add(g, tel.time, (k) => {
      if (tel.shape === 'line') grow.scale.set(1, Math.max(0.01, k), 1);
      else grow.scale.setScalar(Math.max(0.01, k));
      if (tel.counterable) rim.material.opacity = 0.5 + 0.5 * Math.sin(k * 40);
      if (k >= 0.999) this.tele.delete(tel.id);
    });
  }

  cancelTelegraph(id) {
    const g = this.tele?.get(id);
    if (!g) return;
    const e = this.list.find((x) => x.obj === g);
    if (e) e.life = 0;
    this.tele.delete(id);
  }

  /** 설치물 표시 (성벽은 wall 사용) */
  placed(o, y) {
    const colors = { markPost: '#ffd24a', fireZone: '#ff6a2a', frostCrystal: '#8fc8ff', pigmentPool: '#6ad08a' };
    const col = colors[o.kind] || '#ffffff';
    const g = new THREE.Group(); g.position.set(o.x, y + 0.05, o.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(o.radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(o.kind === 'fireZone' ? 1.6 : 1), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    const rim = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rim.scale.setScalar(o.radius);
    g.add(disc, rim);
    let core;
    if (o.kind === 'markPost') core = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#8a6440', emissive: '#ffb02a', emissiveIntensity: 0.6 }));
    else if (o.kind === 'frostCrystal') core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: '#cfe6ff', emissive: '#5a9cff', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
    if (core) { core.position.y = 0.8; core.castShadow = true; g.add(core); }
    const life = Math.max(0.1, o.until - o.now);
    this.add(g, life, (k, dt) => {
      const pulse = 0.5 + 0.5 * Math.sin(k * life * 6);
      disc.material.opacity = (o.kind === 'fireZone' ? 0.3 : 0.18) + pulse * 0.1;
      rim.material.opacity = 0.5 + pulse * 0.4;
      if (core) core.rotation.y += dt * 2;
      if (k > 0.9) g.scale.setScalar(1 - (k - 0.9) * 10 * 0.9);
      if (o.kind === 'fireZone' && Math.random() < 0.3) this.threadBurst(new THREE.Vector3(o.x + (Math.random() - 0.5) * o.radius, y + 0.2, o.z + (Math.random() - 0.5) * o.radius), '#ff7a2a', 2, 0.8);
    });
  }

  /** 열선 (유지 기술) */
  beam(pos, facing, length, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, length, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, length / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos); m.position.y += 1.2; m.rotation.y = facing;
    this.add(m, 0.32, (k) => { m.material.opacity = 0.9 * (1 - k); m.scale.set(1 + k, 1 + k, 1); });
  }

  /** 각성기: 하늘로 솟는 실기둥 */
  pillar(pos, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 14, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(pos); m.position.y += 7;
    this.add(m, 0.9, (k) => { m.scale.set(1 - k * 0.6, 0.3 + k, 1 - k * 0.6); m.material.opacity = 0.7 * (1 - k); });
    this.ring(pos, color, 8, 0.7);
  }

  /** 실뭉치 드롭 */
  /** 드롭: 바닥에서 빛나며 돌다가(AI 아이템 모델이 있으면 그 모델) 플레이어에게 날아간다 */
  loot(pos, getTarget, ai = null, itemId = null) {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8c87a', emissive: '#a87a2a', emissiveIntensity: 0.6 }));
    g.add(ball);
    const glow = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.scale.setScalar(0.6);
    g.add(glow);
    const aiId = itemId && ITEM_AI[itemId];
    if (ai && aiId) ai.instance(aiId).then((obj) => {
      if (!obj) return;
      const box = new THREE.Box3().setFromObject(obj);
      obj.scale.multiplyScalar(0.6 / Math.max(0.01, box.getSize(new THREE.Vector3()).length()));
      g.remove(ball); g.add(obj);
    });
    const start = pos.clone();
    this.add(g, 1.6, (k) => {
      const tgt = getTarget();
      if (k < 0.65) { const t = k / 0.65; g.position.set(start.x, start.y + 0.3 + Math.abs(Math.sin(t * Math.PI * 1.5)) * 0.6 * (1 - t), start.z); }
      else { const t = (k - 0.65) / 0.35; g.position.lerpVectors(start, tgt, t * t); g.position.y += 0.8 - t * 0.2; }
      g.children.forEach((c) => { if (c !== glow) c.rotation.y += 0.12; });
      glow.position.y = -0.25; glow.material.opacity = 0.7 * (1 - k);
    });
  }
}
