import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * 캐릭터 모델.
 * 1) public/models/<modelId>.glb 가 있으면 GLB 사용 (애니메이션 idle/run/attack 자동 매핑)
 * 2) 없으면 절차적 저폴리 모델로 대체 (밥/스윙 절차적 애니메이션)
 * 절차적 모델은 즉시 표시되고, GLB가 로드되면 교체된다.
 */
const MODEL_SPECS = {
  player_mender: { height: 1.8, build: buildMender },
  npc_elder: { height: 1.75, build: buildElder },
  mob_unravel_sheep: { height: 1.15, build: buildSheep, quadruped: true },
  mob_unravel_wolf: { height: 1.25, build: buildWolf, quadruped: true },
};

const glbCache = new Map();
const loader = new GLTFLoader();

async function loadGLB(id) {
  if (!glbCache.has(id)) {
    glbCache.set(id, (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}models/${id}.glb`);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        // 개발 서버는 없는 파일에 index.html 을 돌려줄 수 있으므로 매직 넘버 확인
        if (buf.byteLength < 12 || new DataView(buf).getUint32(0, true) !== 0x46546c67) return null;
        const gltf = await loader.parseAsync(buf, `${import.meta.env.BASE_URL}models/`);
        console.info(`[CharacterModel] GLB 로드: ${id}.glb`);
        return gltf;
      } catch (e) {
        console.warn(`[CharacterModel] ${id}.glb 로드 실패 → 절차적 모델 사용`, e);
        return null;
      }
    })());
  }
  return glbCache.get(id);
}

export class CharacterModel {
  constructor(modelId) {
    this.modelId = modelId;
    this.spec = MODEL_SPECS[modelId] || MODEL_SPECS.player_mender;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.parts = {};
    this.state = 'idle';
    this.actionT = -1; // 공격 동작 진행 (0..1), -1 = 없음
    this.flashT = 0;
    this.phase = Math.random() * 10;
    this.mixer = null;
    this.actions = {};
    this.parts = this.spec.build(this.body);
    this.collectMaterials();
    loadGLB(modelId).then((g) => { if (g && !this.disposed) this.useGLB(g); });
  }

  get height() { return this.spec.height; }

  collectMaterials() {
    this.mats = [];
    this.body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m.emissive && !m.userData.glow) { m.userData.baseEmissive = m.emissive.clone(); this.mats.push(m); }
      }
    });
  }

  useGLB(gltf) {
    const scene = SkeletonUtils.clone(gltf.scene);
    scene.traverse((o) => {
      if (o.isMesh) {
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    // 키 정규화 + 발을 원점에
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? this.spec.height / size.y : 1;
    scene.scale.setScalar(s);
    box.setFromObject(scene);
    const c = box.getCenter(new THREE.Vector3());
    scene.position.set(-c.x, -box.min.y, -c.z);
    this.body.clear();
    this.body.add(scene);
    this.parts = {};
    this.collectMaterials();
    if (gltf.animations?.length) {
      this.mixer = new THREE.AnimationMixer(scene);
      const find = (...keys) => gltf.animations.find((a) => keys.some((k) => a.name.toLowerCase().includes(k)));
      const map = { idle: find('idle'), run: find('run', 'walk'), attack: find('attack', 'slash', 'hit') };
      for (const [k, clip] of Object.entries(map)) if (clip) this.actions[k] = this.mixer.clipAction(clip);
      if (this.actions.attack) { this.actions.attack.setLoop(THREE.LoopOnce); this.actions.attack.clampWhenFinished = false; }
      this.current = null;
      this.playLoop(this.state);
    }
  }

  playLoop(name) {
    const a = this.actions[name] || this.actions.idle;
    if (!a || this.current === a) return;
    a.reset().fadeIn(0.18).play();
    if (this.current) this.current.fadeOut(0.18);
    this.current = a;
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    if (this.mixer) this.playLoop(state);
  }

  triggerAttack() {
    this.actionT = 0;
    const a = this.actions.attack;
    if (a) { a.reset().setEffectiveWeight(1).fadeIn(0.05).play(); }
  }

  flash() { this.flashT = 1; }

  update(dt, t) {
    if (this.mixer) this.mixer.update(dt);
    if (this.actionT >= 0) { this.actionT += dt / 0.32; if (this.actionT >= 1) this.actionT = -1; }
    if (!this.mixer) this.animateProcedural(dt, t + this.phase);
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 5);
      for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive).lerp(FLASH, this.flashT);
    }
    const p = this.parts;
    if (p.glow) p.glow.rotation.y += dt * 1.5;
  }

  animateProcedural(dt, t) {
    const p = this.parts, run = this.state === 'run';
    const a = this.actionT >= 0 ? Math.sin(this.actionT * Math.PI) : 0;
    if (this.spec.quadruped) {
      const f = run ? 12 : 0;
      const sw = run ? Math.sin(t * f) * 0.7 : 0;
      if (p.legs) { p.legs[0].rotation.x = sw; p.legs[3].rotation.x = sw; p.legs[1].rotation.x = -sw; p.legs[2].rotation.x = -sw; }
      this.body.position.y = run ? Math.abs(Math.sin(t * f)) * 0.08 : Math.sin(t * 2) * 0.015;
      this.body.position.z = a * 0.45;
      this.body.rotation.x = -a * 0.25;
      if (p.head) p.head.rotation.x = Math.sin(t * 1.3) * 0.08 + a * 0.4;
      if (p.tail) p.tail.rotation.y = Math.sin(t * (run ? 14 : 3)) * 0.4;
    } else {
      const f = run ? 10 : 0;
      const sw = run ? Math.sin(t * f) * 0.8 : 0;
      if (p.legL) { p.legL.rotation.x = sw; p.legR.rotation.x = -sw; }
      if (p.armL) p.armL.rotation.x = -sw * 0.7;
      if (p.armR) {
        // 공격: 위로 들었다가 내려 찌르기
        const atk = this.actionT >= 0 ? (this.actionT < 0.35 ? -this.actionT / 0.35 * 2.4 : -2.4 + (this.actionT - 0.35) / 0.65 * 1.5) : sw * 0.7;
        p.armR.rotation.x = atk;
      }
      this.body.position.y = run ? Math.abs(Math.sin(t * f)) * 0.07 : Math.sin(t * 1.8) * 0.02;
      this.body.rotation.x = run ? 0.08 : 0;
      this.body.rotation.y = a * 0.35;
      if (p.cape) p.cape.rotation.x = 0.12 + (run ? 0.35 + Math.sin(t * f) * 0.08 : Math.sin(t * 1.5) * 0.04);
      if (p.head) p.head.rotation.y = Math.sin(t * 0.5) * 0.12;
    }
  }

  dispose() {
    this.disposed = true;
    this.root.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); } });
  }
}

const FLASH = new THREE.Color('#ffffff');

// ================= 절차적 모델 빌더 =================
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const glowMat = (color, opacity = 0.9) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  m.userData.glow = true;
  return m;
};
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

/** 팔·몸에 감기는 빛나는 실 (나선) */
function helixThread(radius, height, turns, color) {
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, (i / 48) * height - height / 2, Math.sin(a) * radius));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.018, 4), glowMat(color));
}

/** 몸에서 풀려나온 실 가닥 */
function looseStrand(from, dir, len, color, seed) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    pts.push(new THREE.Vector3(
      from.x + dir.x * len * k + Math.sin(seed + k * 6) * 0.12 * k,
      from.y + dir.y * len * k - k * k * 0.25,
      from.z + dir.z * len * k + Math.cos(seed + k * 5) * 0.12 * k));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.02, 4), glowMat(color, 0.75));
}

function buildMender(root) {
  const skin = std('#f1c9a2'), tunic = std('#3f6e8c'), pants = std('#4a3a2c'), apron = std('#dcc59a'), cape = std('#a8432f', { side: THREE.DoubleSide }), hair = std('#5a3a22'), leather = std('#6b4428');
  const legL = pivot(root, -0.15, 0.85, 0), legR = pivot(root, 0.15, 0.85, 0);
  for (const l of [legL, legR]) { l.add(mesh(new THREE.CapsuleGeometry(0.11, 0.55, 4, 8), pants, 0, -0.42, 0)); l.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), leather, 0, -0.8, 0.04)); }
  const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.45, 4, 10), tunic, 0, 1.18, 0); torso.scale.z = 0.75; root.add(torso);
  const ap = mesh(new THREE.BoxGeometry(0.42, 0.62, 0.04), apron, 0, 1.0, 0.2); ap.rotation.x = -0.08; root.add(ap);
  const belt = mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), leather, 0, 0.98, 0);
  belt.rotation.x = Math.PI / 2; root.add(belt);
  root.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), std('#e8b04a'), 0.24, 0.92, 0.12)); // 실패(스풀)
  const head = pivot(root, 0, 1.62, 0);
  head.add(mesh(new THREE.SphereGeometry(0.2, 14, 12), skin));
  const h = mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.03, -0.02); head.add(h);
  head.add(mesh(new THREE.SphereGeometry(0.025, 6, 6), std('#2a1d14'), -0.07, 0.01, 0.18), mesh(new THREE.SphereGeometry(0.025, 6, 6), std('#2a1d14'), 0.07, 0.01, 0.18));
  const capeP = pivot(root, 0, 1.48, -0.18);
  const capeGeo = new THREE.PlaneGeometry(0.62, 0.95, 1, 4); capeGeo.translate(0, -0.47, 0);
  capeP.add(mesh(capeGeo, cape));
  capeP.add(mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12, Math.PI), cape, 0, 0.0, 0.12));
  const armL = pivot(root, -0.36, 1.42, 0), armR = pivot(root, 0.36, 1.42, 0);
  for (const a of [armL, armR]) {
    a.add(mesh(new THREE.CapsuleGeometry(0.085, 0.45, 4, 8), tunic, 0, -0.27, 0));
    a.add(mesh(new THREE.SphereGeometry(0.08, 8, 8), skin, 0, -0.56, 0));
    const th = helixThread(0.13, 0.42, 3, '#ffd27a'); th.position.y = -0.3; a.add(th);
  }
  // 수선 바늘 (무기)
  const needle = new THREE.Group();
  needle.add(mesh(new THREE.CylinderGeometry(0.025, 0.012, 1.05, 8), std('#d9dde3', { metalness: 0.8, roughness: 0.3 }), 0, 0.5, 0));
  needle.add(mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 10), std('#d9dde3', { metalness: 0.8, roughness: 0.3 }), 0, -0.05, 0));
  needle.position.set(0, -0.58, 0.05); needle.rotation.x = Math.PI / 2; armR.add(needle);
  const glow = helixThread(0.42, 0.25, 1.2, '#ffe39a'); glow.position.y = 1.0; root.add(glow);
  return { legL, legR, armL, armR, head, cape: capeP, glow };
}

function buildElder(root) {
  const robe = std('#6b5b8a'), skin = std('#e6bf98'), beard = std('#eeeae0'), wood = std('#7a5634'), sash = std('#c9a14a');
  const r = mesh(new THREE.CylinderGeometry(0.25, 0.48, 1.3, 10), robe, 0, 0.65, 0); root.add(r);
  root.add(mesh(new THREE.CapsuleGeometry(0.25, 0.3, 4, 10), robe, 0, 1.3, -0.03));
  const belt = mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 14), sash, 0, 1.05, 0);
  belt.rotation.x = Math.PI / 2; root.add(belt);
  const head = pivot(root, 0, 1.6, 0.04);
  head.add(mesh(new THREE.SphereGeometry(0.19, 14, 12), skin));
  const b = mesh(new THREE.ConeGeometry(0.15, 0.45, 8), beard, 0, -0.24, 0.1); b.rotation.x = Math.PI + 0.25; head.add(b);
  head.add(mesh(new THREE.SphereGeometry(0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), robe, 0, 0.02, -0.03)); // 두건
  const armL = pivot(root, -0.3, 1.38, 0), armR = pivot(root, 0.3, 1.38, 0);
  for (const a of [armL, armR]) a.add(mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), robe, 0, -0.25, 0.05));
  armR.rotation.x = -0.5;
  // 물렛가락 지팡이 + 빛나는 실
  const staff = new THREE.Group();
  staff.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.9, 6), wood, 0, 0, 0));
  staff.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), sash, 0, 0.95, 0));
  const th = helixThread(0.14, 0.35, 4, '#ffd98a'); th.position.y = 0.95; staff.add(th);
  staff.position.set(0.05, -0.45, 0.25); staff.rotation.x = 0.5; armR.add(staff);
  return { armL, armR, head, glow: th };
}

function buildSheep(root) {
  const wool = std('#f2ece0', { flatShading: true, roughness: 1 }), dark = std('#3b3330'), legM = std('#2f2926');
  const bodyG = new THREE.Group(); bodyG.position.y = 0.62; root.add(bodyG);
  const blobs = [[0, 0, 0, 0.42], [0.2, 0.08, 0.18, 0.3], [-0.2, 0.08, 0.15, 0.3], [0.18, 0.05, -0.22, 0.3], [-0.16, 0.12, -0.2, 0.28], [0, 0.22, 0, 0.3]];
  for (const [x, y, z, r] of blobs) bodyG.add(mesh(new THREE.IcosahedronGeometry(r, 0), wool, x, y, z));
  // 풀려버린 옆구리: 실 나선이 드러남
  const coil = helixThread(0.28, 0.4, 5, '#ffd27a'); coil.rotation.z = Math.PI / 2; coil.position.set(0.05, 0.02, -0.38); bodyG.add(coil);
  const head = pivot(root, 0, 0.78, 0.45);
  head.add(mesh(new THREE.BoxGeometry(0.24, 0.26, 0.32), dark, 0, 0, 0.08));
  head.add(mesh(new THREE.IcosahedronGeometry(0.16, 0), wool, 0, 0.16, 0));
  const eye = glowMat('#cfe0ff');
  head.add(mesh(new THREE.SphereGeometry(0.035, 6, 6), eye, -0.09, 0.04, 0.2), mesh(new THREE.SphereGeometry(0.035, 6, 6), eye, 0.09, 0.04, 0.2));
  // 실로 된 뿔
  for (const s of [-1, 1]) { const horn = helixThread(0.05, 0.18, 2, '#e8c87a'); horn.position.set(s * 0.15, 0.12, 0); horn.rotation.z = s * 1.0; head.add(horn); }
  const legs = [];
  for (const [x, z] of [[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.25], [0.2, -0.25]]) {
    const l = pivot(root, x, 0.42, z); l.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 6), legM, 0, -0.21, 0)); legs.push(l);
  }
  for (let i = 0; i < 3; i++) root.add(looseStrand(new THREE.Vector3(0.1 * (i - 1), 0.75, -0.5), new THREE.Vector3(0.2 * (i - 1), -0.3, -1), 0.9, '#ffd98a', i * 2));
  return { head, legs };
}

function buildWolf(root) {
  const fur = std('#6f6a66', { flatShading: true }), dark = std('#3e3a38', { flatShading: true }), legM = std('#55504c');
  const bodyG = new THREE.Group(); bodyG.position.y = 0.72; root.add(bodyG);
  const torso = mesh(new THREE.CapsuleGeometry(0.28, 0.75, 4, 8), fur); torso.rotation.x = Math.PI / 2; bodyG.add(torso);
  bodyG.add(mesh(new THREE.IcosahedronGeometry(0.34, 0), dark, 0, 0.08, 0.32));
  // 풀려 비어버린 허리: 실 고리만 남음
  for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.015, 4, 18), glowMat('#b8c8ff', 0.8)); ring.position.z = -0.15 - i * 0.14; bodyG.add(ring); }
  const head = pivot(root, 0, 0.92, 0.62);
  head.add(mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), fur, 0, 0, 0));
  const snout = mesh(new THREE.ConeGeometry(0.12, 0.32, 4), dark, 0, -0.05, 0.28); snout.rotation.x = Math.PI / 2; snout.rotation.y = Math.PI / 4; head.add(snout);
  for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark, s * 0.1, 0.2, -0.05));
  const eye = glowMat('#9fd0ff');
  head.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), eye, -0.08, 0.05, 0.15), mesh(new THREE.SphereGeometry(0.03, 6, 6), eye, 0.08, 0.05, 0.15));
  const tail = pivot(root, 0, 0.82, -0.62);
  const tm = mesh(new THREE.ConeGeometry(0.09, 0.55, 5), fur, 0, 0, -0.25); tm.rotation.x = -Math.PI / 2 - 0.4; tail.add(tm);
  const legs = [];
  for (const [x, z] of [[-0.17, 0.35], [0.17, 0.35], [-0.17, -0.35], [0.17, -0.35]]) {
    const l = pivot(root, x, 0.55, z); l.add(mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.55, 6), legM, 0, -0.27, 0)); legs.push(l);
  }
  for (let i = 0; i < 4; i++) root.add(looseStrand(new THREE.Vector3(0.12 * (i - 1.5), 0.8, -0.55), new THREE.Vector3(0.25 * (i - 1.5), -0.2, -1), 1.1, '#b8c8ff', i * 1.7));
  return { head, legs, tail };
}
