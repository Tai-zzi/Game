import * as THREE from 'three';
import { HARVEN, riverX } from '../data/zones.js';

/**
 * 강·호수: 환경광(HDRI)을 반사하는 물 재질 + 흐르는 법선 무늬 + 가장자리 투명.
 * 법선 텍스처는 캔버스 노이즈로 만들고, 강은 흐름 방향(z)으로, 호수는 천천히 돈다.
 */
function normalNoiseTex(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const h = new Float32Array(size * size);
  // 여러 겹의 사인 물결 + 잡음 → 높이 → 법선
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (let k = 1; k <= 4; k++) { const f = k * 2 * Math.PI / size; v += Math.sin(x * f * (1.3 + k * 0.4) + y * f * 0.7 + k) * Math.cos(y * f * (1.1 + k * 0.3) - x * f * 0.5) / k; }
    h[y * size + x] = v + Math.random() * 0.15;
  }
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
    const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
    const o = (y * size + x) * 4;
    img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Water {
  constructor(scene) {
    this.scene = scene;
    const nt = normalNoiseTex();
    const base = { color: '#1d3c40', roughness: 0.14, metalness: 0.0, transparent: true, opacity: 0.8, envMapIntensity: 0.55, normalScale: new THREE.Vector2(0.3, 0.3) };
    // 강: 긴 띠 (가장자리 정점 알파 → 물가가 자연스럽게)
    const riverN = nt.clone(); riverN.repeat.set(2, 1); riverN.needsUpdate = true;
    this.riverMat = new THREE.MeshStandardMaterial({ ...base, normalMap: riverN, vertexColors: true });
    this.riverMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vColor.r;\n diffuseColor.rgb = mix(vec3(0.06, 0.13, 0.14), vec3(0.16, 0.24, 0.2), 1.0 - vColor.r);'); };
    const verts = [], uvs = [], cols = [], idx = [];
    const y = HARVEN.waterLevel;
    let row = 0;
    for (let z = -730; z <= 730; z += 4, row++) {
      const cx = riverX(z);
      for (const [dx, a] of [[-8, 0], [-5, 1], [5, 1], [8, 0]]) { verts.push(cx + dx, y, z); uvs.push((dx + 8) / 16, z / 14); cols.push(a, a, a); }
      if (row > 0) { const b = (row - 1) * 4; for (let k = 0; k < 3; k++) idx.push(b + k, b + 4 + k, b + 1 + k, b + 1 + k, b + 4 + k, b + 5 + k); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    rg.setIndex(idx); rg.computeVertexNormals();
    this.river = new THREE.Mesh(rg, this.riverMat);
    this.river.receiveShadow = true;
    // 호수
    const lakeN = nt.clone(); lakeN.repeat.set(12, 12); lakeN.needsUpdate = true;
    this.lakeMat = new THREE.MeshStandardMaterial({ ...base, normalMap: lakeN, opacity: 0.92 });
    const L = HARVEN.lake;
    const lg = new THREE.CircleGeometry(L.r * 1.02, 96).rotateX(-Math.PI / 2);
    this.lake = new THREE.Mesh(lg, this.lakeMat);
    this.lake.position.set(L.x, y, L.z);
    this.lake.receiveShadow = true;
    scene.add(this.river, this.lake);
  }

  update(t, dt) {
    this.riverMat.normalMap.offset.y -= dt * 0.18; // 흐름
    this.lakeMat.normalMap.offset.set(Math.sin(t * 0.03) * 0.5, t * 0.004);
  }
}
