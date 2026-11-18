import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AI_ASSETS, AI_DIR, AI_MAX_HEAVY, AI_WARN_BYTES, placementFor, resolveFirst } from '../data/aiAssets.js';

/**
 * AI 생성 정적 에셋 로더.
 * - 있으면 불러오고, 없으면 조용히 null (절차적 대체 사용)
 * - 한 번만 불러와 템플릿으로 캐시, 사용할 때마다 clone (지오메트리·텍스처 공유)
 * - 무거운 메시 종류 수 상한(AI_MAX_HEAVY), 5MB 초과 파일 경고
 * - 저품질 설정에서는 비활성 (enabled = false)
 */
const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : './';

export class AiAssetLoader {
  constructor({ fetchFn = (u) => fetch(u), parse = null } = {}) {
    this.fetchFn = fetchFn;
    this.parse = parse || ((buf) => new GLTFLoader().parseAsync(buf, base + AI_DIR));
    this.templates = new Map(); // id -> Promise<Object3D|null>
    this.present = new Set();
    this.missing = new Set();
    this.enabled = true;
    this.heavyCount = 0;
    this.icons = new Map();
    this.renderer = null;
  }

  /** 파일 존재 여부만 확인할 때 (HEAD 대신 결과 캐시 활용) */
  has(id) { return this.present.has(id); }

  load(id) {
    if (!AI_ASSETS[id]) return Promise.resolve(null);
    if (!this.templates.has(id)) this.templates.set(id, this._load(id));
    return this.templates.get(id);
  }

  async _load(id) {
    try {
      const res = await this.fetchFn(`${base}${AI_DIR}${id}.glb`);
      if (!res?.ok) { this.missing.add(id); return null; }
      const buf = await res.arrayBuffer();
      // 개발 서버는 없는 파일에 index.html 을 돌려줄 수 있다 → glTF 매직 확인
      if (buf.byteLength < 12 || new DataView(buf).getUint32(0, true) !== 0x46546c67) { this.missing.add(id); return null; }
      if (buf.byteLength > AI_WARN_BYTES) console.warn(`[AiAssets] ${id}.glb 가 ${(buf.byteLength / 1048576).toFixed(1)}MB 입니다 (5MB 초과 — 압축 검토)`);
      if (this.heavyCount >= AI_MAX_HEAVY) { console.info(`[AiAssets] 상한(${AI_MAX_HEAVY}) 초과로 ${id} 생략`); return null; }
      this.heavyCount++;
      const gltf = await this.parse(buf);
      const tpl = this.normalize(id, gltf.scene);
      this.present.add(id);
      return tpl;
    } catch (e) {
      console.warn(`[AiAssets] ${id} 로드 실패 → 대체 모델 사용`, e);
      this.missing.add(id);
      return null;
    }
  }

  /** 높이/폭 맞춤 + 바닥 맞춤 + 그림자 */
  normalize(id, scene) {
    const box = new THREE.Box3().setFromObject(scene);
    const pl = placementFor(id, box);
    const holder = new THREE.Group();
    scene.scale.multiplyScalar(pl.scale);
    scene.position.y += pl.y;
    holder.rotation.y = pl.rotY;
    holder.add(scene);
    const outer = new THREE.Group();
    outer.add(holder);
    outer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    outer.userData.aiId = id;
    return outer;
  }

  /** 복제본 (재질은 색조를 바꿀 수 있도록 복제) */
  async instance(id, { tint = null } = {}) {
    if (!this.enabled) return null;
    const tpl = await this.load(id);
    if (!tpl) return null;
    const obj = tpl.clone(true);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (tint && o.material.color) o.material.color.multiply(new THREE.Color(tint));
      }
    });
    return obj;
  }

  /** 우선순위 목록에서 실제로 있는 첫 에셋 인스턴스 */
  async first(ids, opts) {
    for (const id of ids) {
      const obj = await this.instance(id, opts);
      if (obj) return { id, obj };
    }
    return null;
  }

  resolvePresent(ids) { return resolveFirst(ids, this.present); }

  /** 3D 아이콘: 한 번 렌더해 dataURL 로 캐시 (메인 렌더러를 렌더 타깃으로 재사용) */
  async icon(id, size = 96) {
    if (this.icons.has(id)) return this.icons.get(id);
    const p = (async () => {
      const obj = await this.instance(id);
      if (!obj || !this.renderer) return null;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#fff4e0', '#404050', 2.2));
      const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(2, 3, 4); scene.add(d);
      scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
      const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      cam.position.set(c.x + s * 0.9, c.y + s * 0.5, c.z + s * 1.6);
      cam.lookAt(c);
      const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
      const r = this.renderer;
      const prevRT = r.getRenderTarget(), prevTM = r.toneMapping;
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear();
      r.render(scene, cam);
      const px = new Uint8Array(size * size * 4);
      r.readRenderTargetPixels(rt, 0, 0, size, size, px);
      r.setRenderTarget(prevRT); r.toneMapping = prevTM;
      rt.dispose();
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d');
      const img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4); // 상하 반전
      g.putImageData(img, 0, 0);
      return cv.toDataURL();
    })();
    this.icons.set(id, p);
    return p;
  }
}

export const AiAssets = new AiAssetLoader();
