import * as THREE from 'three';

/** 절차적 저폴리 모델 (GLB 가 없을 때의 대체). 직업은 무기 실루엣으로 구분한다. */
// ================= 절차적 모델 빌더 =================
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const glowMat = (color, opacity = 0.9) => {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
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

// ───────────── 인간형 (파라미터식) ─────────────
/**
 * 공용 인간형 계층 리그: root → (다리 L/R) + spine → (머리, 팔 L/R → 아래팔 L/R(손)).
 * 절차적 키프레임 클립(CharacterModel)이 이 관절들을 움직인다. 직업·NPC 는 색과 장비로 구분.
 * o: { skin, top, bottom, hair, cape, apron, coat, hood, crouch }
 */
function buildHumanoid(root, o) {
  const skin = std(o.skin || '#f1c9a2'), top = std(o.top), bottom = std(o.bottom || '#4a3a2c'), boots = std('#5a3d26'), hair = std(o.hair || '#5a3a22');
  const legL = pivot(root, -0.15, 0.85, 0), legR = pivot(root, 0.15, 0.85, 0);
  for (const l of [legL, legR]) { l.add(mesh(new THREE.CapsuleGeometry(0.11, 0.55, 4, 8), bottom, 0, -0.42, 0)); l.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), boots, 0, -0.8, 0.04)); }
  if (o.coat) root.add(mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.95, 10, 1, true), std(o.coat, { side: THREE.DoubleSide }), 0, 0.82, 0));
  if (o.apron) { const ap = mesh(new THREE.BoxGeometry(0.42, 0.66, 0.04), std(o.apron), 0, 0.98, 0.2); ap.rotation.x = -0.08; root.add(ap); }
  const belt = mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 16), std('#6b4428'), 0, 0.98, 0); belt.rotation.x = Math.PI / 2; root.add(belt);
  const spine = pivot(root, 0, 0.95, 0);
  const torso = mesh(new THREE.CapsuleGeometry(0.26, 0.45, 4, 10), top, 0, 0.23, 0); torso.scale.z = 0.75; spine.add(torso);
  const head = pivot(spine, 0, 0.67, 0);
  head.add(mesh(new THREE.SphereGeometry(0.2, 14, 12), skin));
  head.add(mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), o.hood ? std(o.hood) : hair, 0, 0.03, -0.02));
  head.add(mesh(new THREE.SphereGeometry(0.025, 6, 6), std('#2a1d14'), -0.07, 0.01, 0.18), mesh(new THREE.SphereGeometry(0.025, 6, 6), std('#2a1d14'), 0.07, 0.01, 0.18));
  let capeP = null;
  if (o.cape) {
    capeP = pivot(spine, 0, 0.53, -0.18);
    const g = new THREE.PlaneGeometry(o.capeW || 0.62, o.capeL || 0.95, 1, 4); g.translate(0, -(o.capeL || 0.95) / 2, 0);
    capeP.add(mesh(g, std(o.cape, { side: THREE.DoubleSide })));
  }
  const armL = pivot(spine, -0.36, 0.47, 0), armR = pivot(spine, 0.36, 0.47, 0);
  const fores = [];
  for (const a of [armL, armR]) {
    a.add(mesh(new THREE.CapsuleGeometry(0.085, 0.2, 4, 8), top, 0, -0.14, 0));
    const fore = pivot(a, 0, -0.3, 0);
    fore.add(mesh(new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), top, 0, -0.12, 0));
    fore.add(mesh(new THREE.SphereGeometry(0.08, 8, 8), skin, 0, -0.27, 0));
    fores.push(fore);
  }
  if (o.crouch) root.scale.y = 0.95;
  return { legL, legR, spine, armL, armR, foreL: fores[0], foreR: fores[1], handL: fores[0], handR: fores[1], head, cape: capeP, rest: {} };
}
const metal = () => std('#cfd5dc', { metalness: 0.7, roughness: 0.35 });
const wood = () => std('#7a5634');

/** 수호기사: 대형 방패(왼팔) · 짧은 창(오른손) · 낮은 자세 */
function buildGuardian(root) {
  const p = buildHumanoid(root, { top: '#56677a', bottom: '#3c3a38', cape: '#2f4a6a', capeL: 0.8, hood: null, crouch: true });
  const shield = new THREE.Group();
  shield.add(mesh(new THREE.BoxGeometry(0.75, 1.05, 0.08), std('#8a6a3c'), 0, 0, 0));
  shield.add(mesh(new THREE.BoxGeometry(0.8, 0.08, 0.1), metal(), 0, 0.5, 0), mesh(new THREE.BoxGeometry(0.8, 0.08, 0.1), metal(), 0, -0.5, 0));
  shield.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.1), std('#c9a14a'), 0, 0, 0.03)); // 수리 자국 같은 덧댐
  shield.position.set(-0.08, -0.15, 0.28); p.handL.add(shield);
  p.rest = { armLX: -0.55, foreLX: -0.3 };
  const spear = new THREE.Group();
  spear.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), wood(), 0, 0, 0));
  spear.add(mesh(new THREE.ConeGeometry(0.06, 0.25, 6), metal(), 0, 0.85, 0));
  spear.position.set(0, -0.28, 0.15); spear.rotation.x = Math.PI / 2; p.handR.add(spear);
  return p;
}

/** 매듭궁수: 장궁 · 화살통 · 긴 조준선(빛나는 실) */
function buildArcher(root) {
  const p = buildHumanoid(root, { top: '#5d7a48', bottom: '#4b4134', hood: '#4d6a3c', cape: '#4d6a3c', capeL: 0.6, capeW: 0.5 });
  const bow = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 5, 24, Math.PI * 0.9), wood());
  arc.rotation.z = Math.PI / 2 + Math.PI * 0.05; bow.add(arc);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.45, 3), glowMat('#ffe39a', 0.8)); string.position.x = -0.0; bow.add(string);
  bow.position.set(0, -0.3, 0.05); bow.rotation.y = Math.PI / 2; p.handL.add(bow);
  const quiver = mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.6, 8), std('#6b4428'), 0.12, 1.3, -0.25); quiver.rotation.z = 0.35; root.add(quiver);
  for (let i = 0; i < 3; i++) root.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 3), std('#e8dcb8'), 0.2 + i * 0.03, 1.65, -0.27));
  const aim = mesh(new THREE.CylinderGeometry(0.008, 0.008, 3, 3), glowMat('#ffd27a', 0.35), 0, 1.3, 1.7); aim.rotation.x = Math.PI / 2; root.add(aim);
  p.glow = null;
  return p;
}

/** 원소직조사: 지팡이 · 회전 문양판 */
function buildElementalist(root) {
  const p = buildHumanoid(root, { top: '#7a3f4a', bottom: '#3a2f3a', coat: '#6a3442', hood: '#5a2f3a' });
  const staff = new THREE.Group();
  staff.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.7, 6), wood(), 0, 0, 0));
  staff.add(mesh(new THREE.OctahedronGeometry(0.12), std('#ff9a5a', { emissive: '#ff6a2a', emissiveIntensity: 0.8 }), 0, 0.92, 0));
  staff.position.set(0, -0.25, 0.1); staff.rotation.x = 0.25; p.handR.add(staff);
  const plate = new THREE.Group();
  plate.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 4, 32), glowMat('#ffb070', 0.8)));
  plate.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 4, 3), glowMat('#9fd0ff', 0.8)));
  plate.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 4, 3).rotateZ(Math.PI), glowMat('#ffb070', 0.6)));
  plate.position.set(0, 1.25, -0.55); root.add(plate);
  p.glow = plate; // 회전 (update 에서 y 회전 → 문양판은 z 로 돌도록 별도)
  p.spin = plate;
  return p;
}

/** 생명염색사: 염료병 · 도포봉 · 작업 앞치마 */
function buildDyer(root) {
  const p = buildHumanoid(root, { top: '#e8dcc0', bottom: '#5a6a5a', apron: '#4f8a6a', hair: '#3a2a20' });
  const rod = new THREE.Group();
  rod.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.8, 6), wood(), 0, 0, 0));
  rod.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), std('#6ad08a', { emissive: '#2a8a4a', emissiveIntensity: 0.7 }), 0, 0.42, 0));
  rod.position.set(0, -0.28, 0.05); rod.rotation.x = Math.PI / 2; p.handR.add(rod);
  const colors = ['#4fc06a', '#e8b04a', '#7a9cff', '#e86a5a'];
  colors.forEach((c, i) => {
    const b = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 8), std(c, { emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }), -0.2 + i * 0.13, 0.93, 0.24);
    root.add(b);
  });
  return p;
}

function buildHaila(root) {
  const p = buildHumanoid(root, { top: '#8a8c90', bottom: '#4a4a50', coat: '#7a7d82', hair: '#2a2420' });
  const ledger = mesh(new THREE.BoxGeometry(0.28, 0.36, 0.06), std('#5a3d26'), 0, -0.2, 0.12); ledger.rotation.x = -0.6; p.handL.add(ledger);
  p.rest = { armLX: -0.7, foreLX: -0.6 };
  return p;
}
function buildBelo(root) {
  const p = buildHumanoid(root, { top: '#6a5a48', bottom: '#3a332c', hair: '#6a6a66', cape: '#5a3a2a', capeL: 0.7 });
  const shield = new THREE.Group();
  shield.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 14), std('#7a5a3a'), 0, 0, 0));
  shield.add(mesh(new THREE.BoxGeometry(0.6, 0.06, 0.09), metal(), 0, 0.02, 0.05), mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), std('#b88a4a'), 0.1, 0.02, 0));
  shield.rotation.x = Math.PI / 2; shield.position.set(0, 1.25, -0.3); root.add(shield);
  return p;
}
function buildMora(root) {
  const p = buildHumanoid(root, { top: '#d8cfc0', bottom: '#5a4a5a', apron: '#6a5a8a', hair: '#7a3a2a' });
  ['#4fc06a', '#e86a5a', '#7a9cff'].forEach((c, i) => root.add(mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.12, 8), std(c, { emissive: c, emissiveIntensity: 0.3 }), -0.14 + i * 0.14, 0.93, 0.24)));
  const book = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.05), std('#4a3a2a'), 0, -0.2, 0.12); book.rotation.x = -0.6; p.handL.add(book); p.rest = { armLX: -0.6, foreLX: -0.6 };
  return p;
}
function buildMerchant(root) {
  const p = buildHumanoid(root, { top: '#b0703a', bottom: '#4a3a2a', apron: '#d8c39a', hood: '#8a4a2a' });
  root.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), std('#8a6a3c'), 0, 1.2, -0.35)); // 등짐
  return p;
}
function buildTrainer(root) {
  return buildHumanoid(root, { top: '#4a5a6a', bottom: '#3a3a3a', hair: '#1a1a1a', cape: '#6a5a3a', capeL: 0.5 });
}

// ───────────── 소품 (수레·채집·단서·작업대) ─────────────
function buildCart(root) {
  const w = wood();
  root.add(mesh(new THREE.BoxGeometry(1.5, 0.6, 2.4), w, 0, 0.75, 0));
  for (const [x, z] of [[-0.8, 0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]]) { const wh = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12), std('#5a3d26'), x, 0.42, z); wh.rotation.z = Math.PI / 2; root.add(wh); }
  for (let i = 0; i < 4; i++) root.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), std(['#d9b77a', '#c9a45a', '#e8dcb8', '#b48a5a'][i]), -0.35 + (i % 2) * 0.7, 1.2, -0.6 + Math.floor(i / 2) * 0.9));
  root.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), w, -0.4, 0.6, 1.8), mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), w, 0.4, 0.6, 1.8));
  return {};
}
function buildLumber(root) {
  for (let i = 0; i < 5; i++) { const b = mesh(new THREE.BoxGeometry(1.4, 0.14, 0.3), std('#b48a5a'), 0, 0.08 + Math.floor(i / 2) * 0.15, -0.3 + (i % 2) * 0.35); b.rotation.y = (i - 2) * 0.08; root.add(b); }
  return {};
}
function buildWreck(root) {
  const w = std('#6b4a30');
  const bed = mesh(new THREE.BoxGeometry(1.4, 0.5, 2), w, 0, 0.3, 0); bed.rotation.z = 0.35; root.add(bed);
  const wh = mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 12), std('#4a3424'), 0.7, 0.2, 0.6); wh.rotation.x = Math.PI / 2; root.add(wh);
  root.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), metal(), -0.3, 0.6, 0.3), mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), metal(), 0.3, 0.55, -0.4));
  return {};
}
function buildClue(root) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 4, 24).rotateX(Math.PI / 2), glowMat('#9fd0ff', 0.8)));
  g.add(mesh(new THREE.OctahedronGeometry(0.16), glowMat('#cfe6ff', 0.9), 0, 0.9, 0));
  root.add(g);
  return { glow: g };
}
function buildWorkbench(root) {
  const w = wood();
  root.add(mesh(new THREE.BoxGeometry(1.8, 0.12, 0.9), w, 0, 0.85, 0));
  for (const [x, z] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) root.add(mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), w, x, 0.42, z));
  root.add(mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), metal(), -0.4, 1.0, 0), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), std('#4a3424'), 0.4, 0.95, 0.1));
  return {};
}

export const MODEL_SPECS = {
  player_guardian: { height: 1.8, build: buildGuardian },
  player_archer: { height: 1.8, build: buildArcher },
  player_elementalist: { height: 1.8, build: buildElementalist },
  player_dyer: { height: 1.8, build: buildDyer },
  npc_haila: { height: 1.75, build: buildHaila },
  npc_belo: { height: 1.85, build: buildBelo },
  npc_mora: { height: 1.7, build: buildMora },
  npc_merchant: { height: 1.75, build: buildMerchant },
  npc_trainer: { height: 1.8, build: buildTrainer },
  mob_unravel_sheep: { height: 1.15, build: buildSheep, quadruped: true },
  mob_unravel_wolf: { height: 1.25, build: buildWolf, quadruped: true },
  prop_cart: { height: 1.5, build: buildCart, prop: true },
  prop_lumber: { height: 0.5, build: buildLumber, prop: true },
  prop_wreck: { height: 0.8, build: buildWreck, prop: true },
  prop_clue: { height: 1.0, build: buildClue, prop: true },
  prop_workbench: { height: 1.1, build: buildWorkbench, prop: true },
};
