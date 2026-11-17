import * as THREE from 'three';

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
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
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

  /** 실뭉치 드롭 */
  loot(pos, getTarget) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8c87a', emissive: '#a87a2a', emissiveIntensity: 0.6 }));
    const start = pos.clone();
    this.add(ball, 1.1, (k) => {
      const tgt = getTarget();
      if (k < 0.45) { const t = k / 0.45; ball.position.set(start.x, start.y + 0.4 + Math.sin(t * Math.PI) * 1.2, start.z); }
      else { const t = (k - 0.45) / 0.55; ball.position.lerpVectors(start, tgt, t * t); ball.position.y += 1 - t * 0.2; }
      ball.rotation.y += 0.2;
    });
  }
}
