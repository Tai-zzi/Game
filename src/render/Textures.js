import * as THREE from 'three';

/**
 * 실사 PBR 텍스처 (Poly Haven CC0, public/assets/polyhaven/textures/<역할>/{diff,nor,arm}.jpg)
 * arm = AO(R) · Roughness(G) · Metalness(B)
 * 텍스처는 역할별로 한 번만 불러와 캐시. 재질은 반복(repeat)만 다르게 복제해서 쓴다.
 */
const BASE = (import.meta.env?.BASE_URL || './') + 'assets/polyhaven/textures/';
const loader = new THREE.TextureLoader();
const cache = new Map();
let maxAniso = 8;
let quality = 'high';

export const TexSettings = {
  setRenderer(r) { maxAniso = Math.min(8, r.capabilities.getMaxAnisotropy()); },
  setQuality(q) { quality = q; },
};

function load(role, map) {
  const key = `${role}/${map}`;
  if (!cache.has(key)) {
    const t = loader.load(`${BASE}${role}/${map}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (map === 'diff') t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return cache.get(key);
}

/** 반복 설정이 다른 텍스처 사본 (이미지는 공유) */
function rep(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); return c; }

/**
 * PBR 재질. repeat: [rx, ry] (UV 가 미터 단위면 1m 당 반복 수), opts: color(틴트), normalScale, roughness 배율
 */
export function pbr(role, { repeat = [1, 1], color = '#ffffff', normalScale = 1, side = THREE.FrontSide, envIntensity = 1 } = {}) {
  const [rx, ry] = repeat;
  const m = new THREE.MeshStandardMaterial({
    map: rep(load(role, 'diff'), rx, ry),
    color, side, envMapIntensity: envIntensity,
    roughness: 1, metalness: 0,
  });
  if (quality === 'high') {
    m.normalMap = rep(load(role, 'nor'), rx, ry);
    m.normalScale.set(normalScale, normalScale);
  }
  const arm = rep(load(role, 'arm'), rx, ry);
  m.aoMap = arm; m.roughnessMap = arm; m.metalnessMap = arm;
  m.aoMapIntensity = 0.8;
  m.userData.role = role;
  return m;
}

/** 지형 스플랫용 원본 텍스처 (반복은 셰이더에서) */
export function rawTex(role, map = 'diff') { return load(role, map); }

/** 상자 UV 를 실제 크기(미터)에 맞춤: 텍스처가 늘어나지 않게 */
export function boxUV(geo, w, h, d, perMeter = 0.5) {
  const uv = geo.attributes.uv;
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (면당 4정점)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] * perMeter, uv.getY(k) * dims[f][1] * perMeter);
  }
  uv.needsUpdate = true;
  return geo;
}

/** 원기둥/원뿔 UV: 둘레 × 높이 (미터) */
export function cylUV(geo, radius, height, perMeter = 0.5) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * radius * perMeter, uv.getY(i) * height * perMeter);
  uv.needsUpdate = true;
  return geo;
}

/** 평면 UV (미터) */
export function planeUV(geo, w, h, perMeter = 0.5) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * perMeter, uv.getY(i) * h * perMeter);
  uv.needsUpdate = true;
  return geo;
}
