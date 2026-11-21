import * as THREE from 'three';

/**
 * 셰이더 도우미 (외부 텍스처 없이 캔버스로 생성).
 *  applySplat: 지형 텍스처 스플래팅 — 정점 색(색조) × 풀/흙/모래 디테일을 aSplat 가중치로 혼합
 *  addWind:    인스턴스 식생 바람 흔들림
 *  makeWaterMaterial: 깊이 그라데이션 + 흐르는 물결 + 반짝임 + 안개
 */
function noiseTexture(draw, size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, size, size);
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let splatTex = null;
function splatTextures() {
  if (splatTex) return splatTex;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const grass = noiseTexture((g, s) => {
    for (let i = 0; i < 2600; i++) {
      const v = rnd(90, 175) | 0;
      g.strokeStyle = `rgb(${v},${v + 8},${v - 10})`; g.lineWidth = rnd(0.6, 1.6);
      const x = rnd(0, s), y = rnd(0, s);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - rnd(3, 8)); g.stroke();
    }
  });
  const dirt = noiseTexture((g, s) => {
    for (let i = 0; i < 900; i++) {
      const v = rnd(80, 185) | 0;
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.beginPath(); g.ellipse(rnd(0, s), rnd(0, s), rnd(1, 4), rnd(1, 3), rnd(0, 3), 0, 6.3); g.fill();
    }
  });
  const sand = noiseTexture((g, s) => {
    const img = g.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + rnd(-28, 28); img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 4; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(200,200,190,0.35)';
    for (let y = 0; y < s; y += 18) { g.beginPath(); for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x * 0.08) * 4); g.stroke(); }
  });
  return (splatTex = { grass, dirt, sand });
}

export function applySplat(mat) {
  const t = splatTextures();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tGrass = { value: t.grass }; sh.uniforms.tDirt = { value: t.dirt }; sh.uniforms.tSand = { value: t.sand };
    sh.vertexShader = 'attribute vec3 aSplat;\nvarying vec3 vSplat;\nvarying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvSplat = aSplat;\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D tGrass, tDirt, tSand;\nvarying vec3 vSplat;\nvarying vec2 vWXZ;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
      vec2 uvw = vWXZ * 0.22;
      vec3 detail = texture2D(tGrass, uvw).rgb * vSplat.x + texture2D(tDirt, uvw * 0.7).rgb * vSplat.y + texture2D(tSand, uvw * 1.4).rgb * vSplat.z;
      float far = smoothstep(30.0, 80.0, length(vViewPosition));
      diffuseColor.rgb *= mix(detail * 1.9, vec3(0.95), far);`);
  };
}

export function addWind(mat, uTime, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
      transformed.x += sin(uTime * 1.3 + wph) * ${amp.toFixed(3)} * (position.y + 1.5);
      transformed.z += cos(uTime * 1.1 + wph) * ${(amp * 0.6).toFixed(3)} * (position.y + 1.5);`);
  };
}

export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#2f6f86') }, uShallow: { value: new THREE.Color('#7cc4c4') }, uFoam: { value: new THREE.Color('#f2fbff') },
    }]),
    vertexShader: `varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uDeep, uShallow, uFoam; varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float edge = abs(vUv.x - 0.5) * 2.0;
        vec3 col = mix(uDeep, uShallow, smoothstep(0.2, 0.95, edge));
        vec2 flow = vec2(vW.x * 0.35, vW.z * 0.12 - uTime * 0.35);
        float n = noise(flow * 3.0) * 0.6 + noise(flow * 7.0 + 3.1) * 0.4;
        float streak = smoothstep(0.72, 0.9, n);
        col = mix(col, uFoam, streak * 0.35 + smoothstep(0.85, 1.0, edge) * 0.45);
        float glint = pow(max(0.0, noise(vW.xz * 1.7 + uTime * 0.6) - 0.6) * 2.5, 6.0);
        col += vec3(1.0, 0.95, 0.8) * glint * 1.5;
        gl_FragColor = vec4(col, 0.86 - smoothstep(0.9, 1.0, edge) * 0.4);
        #include <fog_fragment>
      }`,
  });
}

/** 캐릭터 림 라이트 (윤곽 강조) — MeshStandardMaterial 에 주입 */
export function addRim(mat, color = '#ffe2b0', strength = 0.35) {
  if (mat.userData.rim) return;
  mat.userData.rim = true;
  mat.userData.dissolve ||= { value: 0 };
  mat.userData.hitRim ||= { value: new THREE.Color(0, 0, 0) };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uRimColor = { value: new THREE.Color(color) };
    sh.uniforms.uRimStrength = { value: strength };
    sh.uniforms.uDissolve = mat.userData.dissolve || (mat.userData.dissolve = { value: 0 });
    sh.uniforms.uHitRim = mat.userData.hitRim || (mat.userData.hitRim = { value: new THREE.Color(0, 0, 0) });
    sh.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uDissolve;\nuniform vec3 uHitRim;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (uDissolve > 0.0) { float n = fract(sin(dot(floor(gl_FragCoord.xy / 3.0), vec2(12.9898, 78.233))) * 43758.5453); if (n < uDissolve) discard; }').replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimF = pow(1.0 - max(0.0, dot(normalize(normal), normalize(vViewPosition))), 2.5);
      totalEmissiveRadiance += uRimColor * rimF * uRimStrength + uHitRim * rimF * 3.0;`);
  };
  mat.customProgramCacheKey = () => 'rim';
}
