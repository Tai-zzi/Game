import * as THREE from 'three';
import { HARVEN, heightAt, riverX } from '../data/zones.js';
import { makeRng, smoothstep } from '../core/math.js';
import { Terrain } from './Terrain.js';
import { Nature } from './Nature.js';
import { Water } from './Water.js';
import { Castle } from './Castle.js';
import { pbr, boxUV, cylUV } from './Textures.js';

/**
 * 하르벤 계곡의 시각 요소 전부. 로직과 공유하는 것은 zones.js 의 데이터/높이 함수뿐.
 */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(1903);
    this.animated = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    // 실사풍 넓은 계곡: 조각 지형(스트리밍) · 자연 · 물 · 성채 마을
    this.terrainSys = new Terrain(scene);
    this.nature = new Nature(scene, this.terrainSys);
    this.water = new Water(scene);
    this.castle = new Castle(scene);
    this.terrain = null; // 클릭 지점은 높이 함수로 계산 (Input)
    this.buildLoom();
    this.buildWaterWheel();
    this.buildLooseThreads();
    this.buildBridge();
    this.buildDepot();
    this.buildSignposts();
    this.buildAnchors();
    this.focus = new THREE.Vector3();
  }

  /** 매 프레임: 스트리밍(플레이어 주변 청크) · 바람 · 물 · 밤 불빛 */
  update(t, dt, focus = null, night = 0) {
    if (focus) this.focus.copy(focus);
    this.terrainSys.update(this.focus, 2);
    this.nature.updateGrass(this.focus, this.grassScale ?? 1);
    this.nature.update(t);
    this.water.update(t, dt);
    this.castle.setNight(night);
    for (const f of this.animated) f(t, dt);
  }

  /** 길 표지판 (갈림길·지역 경계) */
  buildSignposts() {
    const T = pbr('timber'), P = pbr('planks');
    for (const road of HARVEN.roads) {
      for (const [i, [x, z]] of road.entries()) {
        if (i === 0 || Math.hypot(x, z) < 45) continue;
        const nx = road[Math.min(i + 1, road.length - 1)], dx = nx[0] - x, dz = nx[1] - z;
        const sx = x + 3, sz = z + 3, y = heightAt(sx, sz);
        const post = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 8), 0.1, 2.4), T); post.position.set(sx, y + 1.2, sz);
        const board = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.1, 0.3, 0.06), 1.1, 0.3, 0.06), P); board.position.set(sx, y + 2.0, sz); board.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        post.castShadow = board.castShadow = true;
        this.group.add(post, board);
      }
    }
  }

  /** 실 매듭돌: 선 돌 + 빛나는 매듭 (빠른 이동 지점) */
  buildAnchors() {
    this.anchorObjs = {};
    const rock = pbr('rock');
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const a of HARVEN.anchors) {
      const y = heightAt(a.x, a.z);
      const g = new THREE.Group(); g.position.set(a.x, y, a.z);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 2.6, 7), rock); stone.position.y = 1.2; stone.rotation.y = a.x; stone.castShadow = true;
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.32, 0.05, 64, 6, 2, 3), glow.clone()); knot.position.y = 3.0;
      g.add(stone, knot);
      this.group.add(g);
      this.anchorObjs[a.id] = knot;
      this.animated.push((t) => { knot.rotation.y = t * 0.8; knot.position.y = 3.0 + Math.sin(t * 1.5 + a.x) * 0.12; });
    }
  }
  setAnchorsFound(list) { for (const [id, k] of Object.entries(this.anchorObjs)) k.material.opacity = list.includes(id) ? 0.95 : 0.25; }

  // ---------------- 공동 베틀 ----------------
  buildLoom() {
    const L = HARVEN.loom;
    const g = new THREE.Group();
    g.position.set(L.x, heightAt(L.x, L.z), L.z);
    const wood = pbr('timber');
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
    const wood = pbr('timber');
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

  // ---------------- 끊어진 다리 (공공 결산에 따라 모습이 바뀐다) ----------------
  buildBridge() {
    const B = HARVEN.bridge, cx = riverX(B.z), half = 9, y = B.deckY;
    const plankMat = pbr('planks');
    const darkMat = pbr('timber');
    const stoneMat = pbr('castle_wall');
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
    const body = new THREE.Mesh(boxUV(new THREE.BoxGeometry(6, 5, 5), 6, 5, 5), pbr('castle_brick')); body.position.y = 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), pbr('roof_slate'));
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
