import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MODEL_SPECS } from './ProceduralModels.js';
import { RIG_FILES, MODEL_RIGS, STYLES, SKILL_ANIMS, BODY_PART, REALISTIC_FILES, REALISTIC_ANIMS, REALISTIC_STYLE, KAYKIT_PROPORTION, MIXAMO_DIR, MIXAMO_SKINS, MIXAMO_SETS, MIXAMO_CLASS_SET, MIXAMO_PROC } from '../data/animations.js';
import { NPC_AI, PROP_AI } from '../data/aiAssets.js';
import { AiAssets } from './AiAssets.js';
import { addRim } from './shaders.js';

/**
 * 캐릭터 모델 — 세 가지 구현이 같은 상태 인터페이스를 쓴다.
 *  1) rig    : 리그 GLB (public/models/<id>.glb 또는 KayKit) + AnimationMixer 크로스페이드
 *  2) static : AI 생성 정적 메시 (NPC·소품) — 숨쉬기/흔들림 정도의 절차적 움직임
 *  3) proc   : 절차적 계층 리그 + 키프레임 포즈 클립 (대체)
 * 인터페이스: setLocomotion(idle|run|block) · playSkill(skillId,{windup,recovery,combo}) · hitReact(weight,knockdown)
 *            die() · revive() · flash() · update(dt,t) · root · height
 * 절차적 모델이 즉시 보이고, 더 나은 모델이 로드되면 교체된다.
 */
const BASE = import.meta.env.BASE_URL;
const gltfLoader = new GLTFLoader();
const glbCache = new Map();

async function fetchGLB(url) {
  if (!glbCache.has(url)) {
    glbCache.set(url, (async () => {
      try {
        const res = await fetch(BASE + url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 12 || new DataView(buf).getUint32(0, true) !== 0x46546c67) return null;
        return await gltfLoader.parseAsync(buf, BASE + url.replace(/[^/]+$/, ''));
      } catch (e) { console.warn('[CharacterModel] GLB 실패', url, e); return null; }
    })());
  }
  return glbCache.get(url);
}

const fbxLoader = new FBXLoader();
const fbxCache = new Map();
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
/** FBX 1회 로드·캐시. 스킨은 Phong → PBR(Standard) 재질로 바꿔 둔다 */
function fetchFBX(path, skin = false) {
  if (!fbxCache.has(path)) {
    fbxCache.set(path, (async () => {
      try {
        const obj = await fbxLoader.loadAsync(BASE + encPath(MIXAMO_DIR + path));
        if (skin) obj.traverse((o) => {
          if (!o.isMesh) return;
          const conv = (m) => {
            const metal = /armor|helmet|knight|paladin|metal/i.test(o.name + m.name);
            const n = new THREE.MeshStandardMaterial({ name: m.name, map: m.map || null, normalMap: m.normalMap || null, color: m.map ? 0xffffff : m.color,
              roughness: metal ? 0.48 : 0.82, metalness: metal ? 0.55 : 0.04, transparent: m.transparent && m.opacity < 1, opacity: m.opacity, alphaTest: m.alphaTest || (m.map && m.transparent ? 0.4 : 0), side: m.side });
            if (n.map) n.map.colorSpace = THREE.SRGBColorSpace;
            m.dispose();
            return n;
          };
          o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
        });
        return obj;
      } catch (e) { console.warn('[CharacterModel] FBX 실패', path, e); return null; }
    })());
  }
  return fbxCache.get(path);
}
const mixClipCache = new Map();
/** 동작 클립을 '제자리'로: 엉덩이 XZ 는 스킨의 기본 위치로 고정, Y 는 뼈대 키 비율로 맞춤 */
async function mixamoClip(animPath, skinPath, skinHips) {
  const key = animPath + '|' + skinPath;
  if (!mixClipCache.has(key)) {
    mixClipCache.set(key, (async () => {
      const a = await fetchFBX(animPath);
      const src = a?.animations?.[0];
      if (!src) return null;
      const clip = src.clone();
      const hipsA = a.getObjectByName('mixamorigHips');
      const ratio = hipsA && hipsA.position.y ? skinHips.y / hipsA.position.y : 1;
      for (const t of clip.tracks) {
        if (t.name !== 'mixamorigHips.position') continue;
        const v = t.values;
        for (let i = 0; i < v.length; i += 3) { v[i] = skinHips.x; v[i + 1] *= ratio; v[i + 2] = skinHips.z; }
      }
      return clip;
    })());
  }
  return mixClipCache.get(key);
}

let useRigs = true; // 저품질에서도 리그는 사용 (AI 정적 메시만 끔)
export const ModelSettings = { set aiEnabled(v) { AiAssets.enabled = v; }, get aiEnabled() { return AiAssets.enabled; }, set rigs(v) { useRigs = v; } };

const FLASH = new THREE.Color('#ffffff');
const ZERO = {};
const JOINTS = ['spineX', 'spineY', 'spineZ', 'headX', 'armLX', 'armLZ', 'foreLX', 'armRX', 'armRZ', 'foreRX', 'legLX', 'legRX', 'bodyY', 'bodyZ', 'tiltX', 'tiltZ'];

/** 절차적 키프레임 클립: [시간비율(0~1, S=타격 시점), 포즈]. 'S' 는 타격 시점으로 치환된다 */
const PROC_CLIPS = {
  melee: [
    [[0, ZERO], [0.8, { armRX: -2.3, armRZ: 0.3, foreRX: -0.8, spineY: 0.45, spineX: -0.1 }], [1, { armRX: -0.9, armRZ: -0.2, foreRX: -0.1, spineY: -0.5, spineX: 0.25, bodyZ: 0.3, legLX: -0.4, legRX: 0.3 }], [1.6, { armRX: -0.7, spineY: -0.3, spineX: 0.15, bodyZ: 0.15 }], [99, ZERO]],
    [[0, ZERO], [0.8, { armRX: -1.2, armRZ: 1.2, spineY: 0.8 }], [1, { armRX: -1.3, armRZ: -0.6, spineY: -0.8, bodyZ: 0.3 }], [1.6, { armRZ: -0.4, spineY: -0.5 }], [99, ZERO]],
    [[0, ZERO], [0.8, { armRX: -0.6, foreRX: -1.6, spineY: 0.3, bodyZ: -0.15 }], [1, { armRX: -1.6, foreRX: 0, spineY: -0.2, bodyZ: 0.5, legLX: -0.6, legRX: 0.4 }], [1.7, { armRX: -1.4, bodyZ: 0.3 }], [99, ZERO]],
  ],
  shoot: [[0, ZERO], [0.85, { armLX: -1.55, armRX: -1.45, foreRX: -0.9, spineY: 0.6 }], [1, { armLX: -1.55, armRX: -1.2, foreRX: 0, spineY: 0.6, spineX: -0.12 }], [1.5, { armLX: -1.4, armRX: -1.0, spineY: 0.4 }], [99, ZERO]],
  cast: [[0, ZERO], [0.85, { armRX: -2.7, armLX: -2.5, spineX: -0.2, bodyY: 0.05 }], [1, { armRX: -1.5, armLX: -1.4, spineX: 0.25, bodyZ: 0.15 }], [1.6, { armRX: -1.2, armLX: -1.0, spineX: 0.1 }], [99, ZERO]],
  use: [[0, ZERO], [0.8, { armRX: -1.3, foreRX: -1.0 }], [1, { armRX: -1.6, foreRX: -0.2, armLX: -1.0 }], [99, ZERO]],
  block: [[0, ZERO], [1, { armLX: -1.35, armLZ: 0.35, foreLX: -0.6, spineX: 0.15, bodyY: -0.08 }], [99, { armLX: -1.35, armLZ: 0.35, foreLX: -0.6, spineX: 0.15, bodyY: -0.08 }]],
  dodge: [[0, ZERO], [0.15, { bodyY: -0.3, tiltX: 0.8 }], [0.6, { bodyY: -0.35, tiltX: 4.5 }], [1, { tiltX: 6.283 }], [99, { tiltX: 6.283 }]],
  lunge: [[0, ZERO], [0.85, { bodyZ: -0.2, tiltX: 0.2 }], [1, { bodyZ: 0.55, tiltX: -0.25 }], [1.6, { bodyZ: 0.2 }], [99, ZERO]],
};
const BLOCK_POSE = PROC_CLIPS.block[1][1];

function samplePose(keys, u, out) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= u) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[Math.min(i + 1, keys.length - 1)];
  const k = t1 > t0 ? Math.min(1, Math.max(0, (u - t0) / (t1 - t0))) : 1;
  const e = k * k * (3 - 2 * k);
  for (const j of JOINTS) out[j] = (p0[j] || 0) + ((p1[j] || 0) - (p0[j] || 0)) * e;
  return out;
}

export class CharacterModel {
  /** @param {string} modelId  @param {{ npcId?: string }} opts */
  constructor(modelId, opts = {}) {
    this.modelId = modelId;
    this.spec = MODEL_SPECS[modelId] || MODEL_SPECS.player_guardian;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.kind = 'proc';
    this.loco = 'idle';
    this.action = null; // { start, strikeAt, end, clip|keys }
    this.hit = 0; this.squash = 0; this.flashT = 0; this.dead = false; this.downT = 0;
    this.phase = Math.random() * 10;
    this.pose = Object.fromEntries(JOINTS.map((j) => [j, 0]));
    this.target = { ...this.pose };
    this.clock = 0;
    this.parts = this.spec.build(this.body);
    this.collectMaterials();
    this.upgrade(opts);
  }

  get height() { return this.spec.height; }

  async upgrade(opts) {
    // 1) 직접 넣은 GLB (Higgsfield 등) 2) KayKit 리그 3) AI 정적 메시(NPC·소품)
    const own = await fetchGLB(`models/${this.modelId}.glb`);
    if (this.disposed) return;
    if (own) return this.useGLB(own);
    // 실사 리그 (Mixamo 등) + 별도 애니메이션 파일
    const realKey = REALISTIC_FILES[this.modelId];
    if (realKey) {
      const real = await fetchGLB(`models/realistic/${realKey}.glb`);
      if (this.disposed) return;
      if (real) {
        const anims = [...(real.animations || [])];
        for (const a of REALISTIC_ANIMS) {
          const g = await fetchGLB(`models/realistic/anims/${a}.glb`);
          if (g?.animations?.[0]) { const c = g.animations[0].clone(); c.name = a; anims.push(c); }
        }
        return this.useGLB({ scene: real.scene, animations: anims }, null, REALISTIC_STYLE);
      }
    }
    // Mixamo FBX 실사 캐릭터 (스킨 + 공용 동작 묶음)
    const mixSkin = MIXAMO_SKINS[this.modelId];
    if (mixSkin && useRigs) {
      const skin = await fetchFBX(mixSkin, true);
      if (this.disposed) return;
      if (skin) return this.useMixamo(skin, mixSkin, MIXAMO_SETS[MIXAMO_CLASS_SET[this.modelId] || 'sword']);
    }
    // NPC: 실사 AI 정적 모델이 있으면 우선 (귀여운 리그보다 실사 느낌)
    const npc = opts.npcId && NPC_AI[opts.npcId];
    if (npc) {
      const r = await AiAssets.first(npc.ids);
      if (this.disposed) return;
      if (r) {
        if (r.id !== npc.ids[0]) r.obj.traverse((o) => { if (o.isMesh && o.material.color) o.material.color.multiply(new THREE.Color(npc.tint)); });
        return this.useStatic(r.obj);
      }
    }
    const rig = MODEL_RIGS[this.modelId];
    if (rig && useRigs) {
      const g = await fetchGLB(RIG_FILES[rig.rig]);
      if (this.disposed) return;
      if (g) return this.useGLB(g, rig);
    }
    const aiIds = PROP_AI[this.modelId] ? [PROP_AI[this.modelId]] : null;
    if (aiIds) {
      const r = await AiAssets.first(aiIds);
      if (this.disposed || !r) return;
      this.useStatic(r.obj);
    }
  }

  collectMaterials() {
    this.mats = [];
    this.rimMats = [];
    this.body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m.isMeshStandardMaterial) { addRim(m, '#ffe2b0', this.spec.prop ? 0.12 : 0.3); this.rimMats.push(m); }
        if (m.emissive && !m.userData.glow) { m.userData.baseEmissive = m.emissive.clone(); this.mats.push(m); }
      }
    });
  }

  useStatic(obj) {
    this.body.clear();
    this.body.position.set(0, 0, 0);
    this.body.add(obj);
    this.kind = 'static';
    this.parts = {};
    this.collectMaterials();
  }

  useGLB(gltf, rig = null, styleOverride = null) {
    const scene = SkeletonUtils.clone(gltf.scene);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (rig) o.visible = BODY_PART.test(o.name) || rig.show.includes(o.name) || rig.show.includes(o.parent?.name);
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      if (rig?.tint && o.material.color) o.material.color.multiply(new THREE.Color(rig.tint));
      o.castShadow = true; o.receiveShadow = true;
      o.frustumCulled = false; // 스킨 메시 경계상자 문제 회피
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    scene.scale.setScalar(size.y > 0 ? this.spec.height / size.y : 1);
    box.setFromObject(scene);
    const c = box.getCenter(new THREE.Vector3());
    scene.position.set(-c.x, -box.min.y, -c.z);
    this.body.clear();
    this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0);
    this.body.add(scene);
    this.parts = {};
    this.collectMaterials();
    this.mixer = new THREE.AnimationMixer(scene);
    this.clips = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));
    this.style = styleOverride || STYLES[rig?.style] || STYLES.swordShield;
    // KayKit 비율 완화용 뼈 (애니메이션 뒤에 배율 적용)
    this.propBones = [];
    if (rig) scene.traverse((o) => { if (o.isBone && KAYKIT_PROPORTION[o.name]) this.propBones.push([o, KAYKIT_PROPORTION[o.name]]); });
    this.kind = 'rig';
    this.current = null;
    this.playLoop(this.loco);
  }

  /** Mixamo 스킨 사용: 즉시 교체 후 동작 클립은 도착하는 대로 붙인다 (대기 → 이동 → 나머지 순) */
  useMixamo(skin, skinPath, set) {
    const npc = this.modelId.startsWith('npc_');
    const style = { idle: 'idle', run: npc ? 'walk' : 'run', walk: 'walk', sprint: 'sprint', block: 'block', death: 'death', dodge: 'dodge', cast: 'cast', shoot: 'shoot', heavy: 'heavy', talk: 'talk', hit: [], combo: [] };
    this.useGLB({ scene: skin, animations: [] }, null, style);
    this.mixamo = set;
    const hips = skin.getObjectByName('mixamorigHips')?.position.clone() || new THREE.Vector3();
    const jobs = [];
    for (const [state, v] of Object.entries(set)) {
      if (state === 'dir') continue;
      const files = Array.isArray(v) ? v : [v];
      files.forEach((f, i) => jobs.push([Array.isArray(v) ? state + i : state, state, Array.isArray(v), f]));
    }
    const prio = (st) => (st === 'idle' ? 0 : st === 'run' || st === 'walk' ? 1 : 2);
    jobs.sort((a, b) => prio(a[1]) - prio(b[1]));
    const mixer = this.mixer;
    (async () => {
      for (const [name, state, isList, f] of jobs) {
        const clip = await mixamoClip(set.dir + f, skinPath, hips);
        if (this.disposed || this.mixer !== mixer) return;
        if (!clip) continue;
        this.clips[name] = clip;
        if (isList) this.style[state].push(name);
        if (!this.action && !this.dead && (name === 'idle' || name === this.style[this.loco])) { this.current = null; this.playLoop(this.loco); }
      }
    })();
  }

  clipAction(name) { const c = this.clips?.[name]; return c ? this.mixer.clipAction(c) : null; }

  playLoop(state) {
    if (this.kind !== 'rig' || this.dead) return;
    const name = state === 'activity' ? this.activityAnims[this.activityIdx % this.activityAnims.length] : (this.style[state] || (state === 'sprint' ? this.style.run : this.style.idle));
    const a = this.clipAction(name) || this.clipAction(this.style.idle);
    if (!a || this.current === a) return;
    a.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).setLoop(THREE.LoopRepeat).fadeIn(0.18).play();
    if (this.current) this.current.fadeOut(0.18);
    this.current = a;
  }

  /** 일과 활동 애니메이션 (번갈아 반복). null 이면 기본 이동 상태 */
  setActivity(anims) {
    const key = anims ? anims.join('|') : '';
    if (key === this.activityKey) return;
    this.activityKey = key; this.activityAnims = anims; this.activityIdx = 0; this.activityT = 0;
    if (!anims && this.kind === 'rig' && !this.action) { this.current = null; this.playLoop(this.loco); }
  }

  setLocomotion(state) {
    if (state === this.loco) return;
    this.loco = state;
    if (!this.action) this.playLoop(state);
  }

  /**
   * 기술 동작: 예비 동작(windup) 끝에 타격 프레임이 오도록 재생 속도를 맞춘다.
   * combo: 연속 공격 단계(0,1,2)
   */
  playSkill(skillId, { windup = 0.2, recovery = 0.2, combo = 0 } = {}) {
    if (this.dead) return;
    const map = SKILL_ANIMS[skillId] || SKILL_ANIMS.mob_attack;
    const now = this.clock;
    const dur = map.duration || windup + recovery;
    this.action = { start: now, strikeAt: now + (windup || dur * 0.4), end: now + Math.max(dur, windup + recovery) + 0.12, proc: map.proc || 'melee', combo, windup: windup || dur * 0.4 };
    if (this.kind === 'rig') {
      let name = map.combo ? this.style.combo[combo % this.style.combo.length] : map.clip;
      let ratio = Array.isArray(map.strike) ? map.strike[combo % map.strike.length] : map.strike;
      if (this.mixamo) {
        const [st, r] = MIXAMO_PROC[map.proc] || MIXAMO_PROC.melee;
        if (!map.combo) { name = this.style[st] || this.style.combo[0]; ratio = r; }
        if (map.proc === 'dodge') ratio = 0;
      }
      const a = this.clipAction(name);
      if (!a) return;
      const len = a.getClip().duration;
      const ts = ratio > 0 && windup > 0 ? (len * ratio) / windup : len / (map.duration || dur);
      a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1);
      a.clampWhenFinished = true;
      a.setEffectiveTimeScale(Math.min(4, Math.max(0.4, ts)));
      a.fadeIn(0.06).play();
      if (this.current && this.current !== a) this.current.fadeOut(0.08);
      this.current = a;
    }
  }

  /** 피격: 흰 섬광 → 직업색 테두리, 찌그러짐, 흔들림 */
  hitReact(weight = 'light', knockdown = false, rimColor = null) {
    this.flashT = 1;
    this.rimT = 1; if (rimColor) (this.rimColor ||= new THREE.Color()).set(rimColor);
    this.wobble = weight === 'heavy' ? 1 : weight === 'medium' ? 0.6 : 0.3;
    this.squash = weight === 'heavy' ? 1 : weight === 'medium' ? 0.7 : 0.45;
    this.hit = 1;
    if (knockdown) this.downT = 1.0;
    if (this.kind === 'rig' && !this.action && !this.dead) {
      const list = this.style.hit;
      const a = this.clipAction(list[(Math.random() * list.length) | 0]);
      if (a) {
        a.reset().setLoop(THREE.LoopOnce, 1).setEffectiveTimeScale(1.5).fadeIn(0.05).play();
        a.clampWhenFinished = false;
        if (this.current && this.current !== a) this.current.fadeOut(0.05);
        this.current = a;
        this.action = { start: this.clock, strikeAt: this.clock, end: this.clock + 0.35, proc: 'hit' };
      }
    }
  }

  flash() { this.flashT = 1; }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.action = null;
    if (this.kind === 'rig') {
      const a = this.clipAction(this.style.death);
      if (a) { a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.fadeIn(0.1).play(); if (this.current) this.current.fadeOut(0.1); this.current = a; }
    }
  }

  /** 사망 디졸브 (0~1): 화면 점묘로 사라짐 */
  dissolve(k) { for (const m of this.rimMats) if (m.userData.dissolve) m.userData.dissolve.value = k; }

  revive() {
    this.dissolve(0);
    this.dead = false; this.downT = 0;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
    this.current = null;
    if (this.mixer) this.mixer.stopAllAction();
    this.playLoop(this.loco);
  }

  update(dt, t) {
    this.clock += dt;
    if (this.action && this.clock >= this.action.end) {
      this.action = null;
      if (this.kind === 'rig' && !this.dead) { this.current = null; this.playLoop(this.loco); }
    }
    // 일과 활동: 서 있을 때 클립을 몇 초마다 바꿔 가며 반복
    if (this.activityAnims && this.loco === 'idle' && !this.action && this.kind === 'rig') {
      this.activityT -= dt;
      if (this.activityT <= 0) { this.activityT = 3 + Math.random() * 3; this.activityIdx++; this.current = null; this.playLoop('activity'); }
    }
    if (this.current && this.loco === 'sprint' && !this.style.sprint) this.current.setEffectiveTimeScale(1.4);
    if (this.mixer) this.mixer.update(dt);
    if (this.propBones) for (const [b, s] of this.propBones) { if (b.name === 'head') b.scale.setScalar(s); else b.scale.y = s; }
    if (this.kind === 'proc') this.animateProcedural(dt, t + this.phase);
    else if (this.kind === 'static') this.animateStatic(dt, t + this.phase);
    // 피격 찌그러짐(squash) + 섬광
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 6);
      const s = this.squash * 0.16;
      this.root.scale.set(this.root.scale.x * (1 + s * 0.5) / (1 + (this.lastS || 0) * 0.5), this.root.scale.y * (1 - s) / (1 - (this.lastS || 0)), this.root.scale.z * (1 + s * 0.5) / (1 + (this.lastS || 0) * 0.5));
      this.lastS = s;
    } else if (this.lastS) {
      this.root.scale.set(this.root.scale.x / (1 + this.lastS * 0.5), this.root.scale.y / (1 - this.lastS), this.root.scale.z / (1 + this.lastS * 0.5));
      this.lastS = 0;
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 7);
      for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive).lerp(FLASH, this.flashT * 0.9);
    }
    if (this.parts.glow) this.parts.glow.rotation.y += dt * 1.5;
    if (this.rimT > 0) {
      this.rimT = Math.max(0, this.rimT - dt * 3.5);
      const k = this.flashT > 0.3 ? 0 : this.rimT; // 흰 섬광이 먼저, 뒤이어 직업색 테두리
      for (const m of this.rimMats) m.userData.hitRim?.value.copy(this.rimColor || FLASH).multiplyScalar(k);
    }
    if (this.wobble > 0) { this.wobble = Math.max(0, this.wobble - dt * 4); this.root.rotation.z = Math.sin(this.clock * 45) * 0.1 * this.wobble; }
    else if (this.root.rotation.z) this.root.rotation.z = 0;
  }

  animateStatic(dt, t) {
    if (this.spec.prop) return;
    // 숨쉬기 (세로 ±1%) + 피격 시 뒤로 젖힘
    this.body.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
    this.hit = Math.max(0, this.hit - dt * 4);
    this.body.rotation.x = -this.hit * 0.15;
    if (this.dead) this.body.rotation.x = Math.max(-1.5, this.body.rotation.x - dt * 4);
  }

  animateProcedural(dt, t) {
    if (this.spec.prop) return;
    const p = this.parts, run = this.loco === 'run' || this.loco === 'sprint';
    const tgt = this.target;
    for (const j of JOINTS) tgt[j] = 0;
    // 기본 이동 상태
    if (this.spec.quadruped) {
      const f = run ? 12 : 0, sw = run ? Math.sin(t * f) * 0.7 : 0;
      tgt.legLX = sw; tgt.legRX = -sw;
      tgt.bodyY = run ? Math.abs(Math.sin(t * f)) * 0.08 : Math.sin(t * 2) * 0.015;
    } else {
      const f = run ? 10 : 0, sw = run ? Math.sin(t * f) * 0.8 : 0;
      tgt.legLX = sw; tgt.legRX = -sw; tgt.armLX = -sw * 0.7; tgt.armRX = sw * 0.7;
      tgt.foreLX = -0.25; tgt.foreRX = -0.25;
      tgt.bodyY = run ? Math.abs(Math.sin(t * f)) * 0.07 : Math.sin(t * 1.8) * 0.02;
      tgt.spineX = run ? 0.12 : 0;
      if (this.loco === 'block') for (const [k, v] of Object.entries(BLOCK_POSE)) tgt[k] = v;
      for (const [k, v] of Object.entries(p.rest || {})) tgt[k] += v;
    }
    // 동작 클립 (예비 동작 → 타격 → 회수)
    if (this.action && this.action.proc !== 'hit') {
      const a = this.action;
      let keys = PROC_CLIPS[this.spec.quadruped ? 'lunge' : a.proc] || PROC_CLIPS.melee;
      if (Array.isArray(keys[0][0])) keys = keys[a.combo % keys.length];
      const u = (this.clock - a.start) / Math.max(0.05, a.windup); // 1 = 타격 순간
      const pose = samplePose(keys, a.proc === 'dodge' ? (this.clock - a.start) / Math.max(0.1, a.end - a.start - 0.12) : u, {});
      for (const j of JOINTS) tgt[j] += pose[j];
    }
    // 피격 반응 (가산)
    if (this.hit > 0) { tgt.spineX -= this.hit * 0.35; tgt.headX -= this.hit * 0.3; tgt.bodyZ -= this.hit * 0.12; this.hit = Math.max(0, this.hit - dt * 5); }
    // 넘어짐 / 사망
    if (this.downT > 0) { this.downT -= dt; tgt.tiltZ += Math.min(1, this.downT * 3) * 1.4; tgt.bodyY -= 0.3 * Math.min(1, this.downT * 3); }
    if (this.dead) { if (this.spec.quadruped) tgt.tiltZ = 1.5; else { tgt.tiltX = -1.45; tgt.bodyY = 0.1; } }
    // 부드럽게 따라가기 (크로스페이드 효과). 구르기 회전은 즉시
    const k = 1 - Math.exp(-dt * 20);
    for (const j of JOINTS) this.pose[j] += (tgt[j] - this.pose[j]) * (j === 'tiltX' && this.action?.proc === 'dodge' ? 1 : k);
    const q = this.pose;
    if (p.spine) p.spine.rotation.set(q.spineX, q.spineY, q.spineZ);
    if (p.head) p.head.rotation.x = q.headX + (this.spec.quadruped ? Math.sin(t * 1.3) * 0.08 : 0);
    if (p.armL) p.armL.rotation.set(q.armLX, 0, q.armLZ);
    if (p.armR) p.armR.rotation.set(q.armRX, 0, q.armRZ);
    if (p.foreL) p.foreL.rotation.x = q.foreLX;
    if (p.foreR) p.foreR.rotation.x = q.foreRX;
    if (p.legL) { p.legL.rotation.x = q.legLX; p.legR.rotation.x = q.legRX; }
    if (p.legs) { p.legs[0].rotation.x = q.legLX; p.legs[3].rotation.x = q.legLX; p.legs[1].rotation.x = q.legRX; p.legs[2].rotation.x = q.legRX; }
    if (p.tail) p.tail.rotation.y = Math.sin(t * (run ? 14 : 3)) * 0.4;
    if (p.cape) p.cape.rotation.x = 0.12 + (run ? 0.35 + Math.sin(t * 10) * 0.08 : Math.sin(t * 1.5) * 0.04);
    this.body.position.set(0, q.bodyY, q.bodyZ);
    this.body.rotation.set(q.tiltX, 0, q.tiltZ);
  }

  dispose() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && this.kind === 'proc') o.geometry?.dispose(); });
  }
}
