import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { clamp, lerp } from '../core/math.js';

/**
 * 씬·카메라·조명·후처리.
 * - 쿼터뷰 카메라: 부드러운 추적, 휠 줌 제한, 트라우마 기반 흔들림, 강타 시 펀치 줌
 * - 후처리(고품질): 블룸(빛나는 실만 넘도록 임계값 1.1) → ACES 톤매핑(OutputPass) → 색보정·비네트·가장자리 섬광
 * - 저품질: 후처리 없이 직접 렌더, 픽셀 비율 1, 그림자 1024
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.28 },
    uSaturation: { value: 0.92 },
    uWarmth: { value: 0.012 },
    uContrast: { value: 1.06 },
    uFlash: { value: 0 },
    uChroma: { value: 0 },
    uBlur: { value: 0 },
    uRipple: { value: new THREE.Vector4(0.5, 0.5, 9, 0) },
    uImpact: { value: 0 },
    uDesat: { value: 0 },
    uRed: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ffd24a') },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uSaturation, uWarmth, uContrast, uFlash, uChroma, uBlur, uImpact, uDesat, uRed; uniform vec4 uRipple; uniform vec3 uFlashColor; varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      // 충격파 굴절 물결 (화면 공간)
      if (uRipple.w > 0.001) { vec2 rd = uv - uRipple.xy; float rl = length(rd); float wave = sin(rl * 60.0 - uRipple.z * 30.0) * exp(-abs(rl - uRipple.z * 0.6) * 18.0); uv += normalize(rd + 1e-5) * wave * 0.012 * uRipple.w; }
      vec2 dir = uv - 0.5;
      float ca = uChroma * 0.018 * length(dir);
      vec4 c = texture2D(tDiffuse, uv);
      // 방사 흐림 (치명타·강타)
      if (uBlur > 0.001) { vec3 acc = c.rgb; for (int i = 1; i < 6; i++) acc += texture2D(tDiffuse, uv - dir * uBlur * 0.03 * float(i)).rgb; c.rgb = acc / 6.0; }
      if (uChroma > 0.001) { c.r = texture2D(tDiffuse, vUv + dir * ca).r; c.b = texture2D(tDiffuse, vUv - dir * ca).b; }
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSaturation * (1.0 - uDesat));
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      c.rgb += vec3(uWarmth, uWarmth * 0.4, -uWarmth);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, d);
      float edge = smoothstep(0.3, 0.75, d);
      c.rgb = mix(c.rgb, uFlashColor, uFlash * edge * 0.75);
      c.rgb = mix(c.rgb, vec3(0.85, 0.05, 0.05), uRed * smoothstep(0.25, 0.8, d) * 0.6);
      // 충격 프레임: 고대비 흑백 (각성기 1~2프레임)
      if (uImpact > 0.5) { float lum = dot(c.rgb, vec3(0.3, 0.6, 0.1)); c.rgb = vec3(step(0.45, lum)); }
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
};

export class Renderer {
  constructor(container, { quality = 'high' } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    const horizon = new THREE.Color('#f3d9b8');
    this.scene.fog = new THREE.FogExp2(new THREE.Color('#b9c4cc'), 0.0032); // 대기 원근
    this.scene.background = horizon;
    this.addSky();

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 2600);
    this.camDir = new THREE.Vector3(0.62, 1.0, 0.78).normalize();
    this.zoom = 24; this.zoomTarget = 24;
    this.zoomMin = 13; this.zoomMax = 34;
    this.focus = new THREE.Vector3();
    this.trauma = 0; this.punch = 0; this.t = 0;
    this.flash = 0;

    this.hemi = new THREE.HemisphereLight('#dfe8f0', '#4a5238', 0.25); // 환경광(HDRI)이 주 간접광
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0dc', 3.0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 3;
    this.sunOffset = new THREE.Vector3(-30, 52, 22);
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#9fb7ff', 0.55); // 역광 림 라이트
    rim.position.set(40, 25, -45);
    this.scene.add(rim);

    this.buildEnvironment();
    this.loadHDRI();
    this.setupComposer();
    this.setQuality(quality);

    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomTarget = clamp(this.zoomTarget + Math.sign(e.deltaY) * 2.2, this.zoomMin, this.zoomMax);
    }, { passive: false });
  }

  addSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#6f9fd6') }, mid: { value: new THREE.Color('#f6d7b0') }, bottom: { value: new THREE.Color('#f3d9b8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.02, 0.55, h)) : bottom; gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  /** 생성된 하늘을 PMREM 으로 구워 환경광(반사)으로 사용 */
  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6a7a42' }));
    ground.position.y = -1; envScene.add(ground);
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
  }

  /** 실제 하늘 HDRI (Poly Haven CC0): 배경 + 환경광 반사 */
  loadHDRI() {
    const url = (import.meta.env?.BASE_URL || './') + 'assets/polyhaven/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
    new RGBELoader().load(url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
      this.hdr = tex;
      this.scene.background = tex;
      this.sky.visible = false;
      this.setTimeOfDay(this.lastHour ?? 9);
    }, undefined, (e) => console.warn('[Renderer] HDRI 로드 실패 → 그라데이션 하늘', e));
  }

  setupComposer() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.blendIntensity = 0.85;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(size, 0.65, 0.45, 1.1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setQuality(q) {
    this.quality = q;
    const high = q === 'high';
    const pr = high ? Math.min(window.devicePixelRatio, 2) : 1;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.gtao) this.gtao.enabled = high;
    this.resize();
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * 시간대 조명 (0~24시): 해·하늘·안개·반구광. 밤에도 완전히 어둡지 않게(달빛).
   */
  setTimeOfDay(h) {
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const day = ss(5, 7.5, h) * (1 - ss(17.5, 20, h));
    const dusk = Math.max(ss(5, 6.5, h) * (1 - ss(6.5, 8.5, h)), ss(16.5, 18.5, h) * (1 - ss(18.5, 20.5, h)));
    const c = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const night = 1 - day;
    this.sun.intensity = 0.25 + day * 2.4;
    this.sun.color.copy(c('#9fb0ff', '#ffd7a0', day)).lerp(new THREE.Color('#ff9a5a'), dusk * 0.6);
    this.hemi.intensity = 0.28 + day * 0.45;
    const top = c('#0e1530', '#6f9fd6', day).lerp(new THREE.Color('#5a4a8a'), dusk * 0.5);
    const mid = c('#2a2a48', '#f6d7b0', day).lerp(new THREE.Color('#ff9a6a'), dusk * 0.6);
    this.lastHour = h;
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.mid.value.copy(mid);
    this.skyMat.uniforms.bottom.value.copy(mid);
    if (this.hdr) {
      this.scene.background = this.hdr;
      this.scene.backgroundIntensity = 0.06 + day * 0.94;
      this.scene.environmentIntensity = 0.12 + day * 0.88;
      this.scene.fog.color.copy(c('#141a26', '#b9c4cc', day)).lerp(new THREE.Color('#d8a080'), dusk * 0.45);
    } else { this.scene.fog.color.copy(mid); this.scene.background = this.scene.fog.color; }
    this.renderer.toneMappingExposure = 0.75 + day * 0.25;
    // 해의 방향: 아침 동쪽 → 저녁 서쪽 (그림자 길이 변화)
    const a = ((h - 6) / 12) * Math.PI;
    this.sunOffset.set(Math.cos(a) * -40, 20 + Math.sin(Math.max(0.15, Math.min(Math.PI - 0.15, a))) * 40, 22);
    this.night = night;
  }

  /** 가벼운 타격: 맞은 방향으로 카메라 살짝 밀림 */
  kick(dir, a) { this.kickV = this.kickV || new THREE.Vector3(); this.kickV.x += dir.x * a; this.kickV.z += dir.z * a; }
  /** 화면 공간 충격파 물결 (월드 좌표 기준) */
  ripple(worldPos, strength = 1) {
    const v = worldPos.clone().project(this.camera);
    this.grade.uniforms.uRipple.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, 0, strength);
  }
  blurPulse(a) { this.blur = Math.max(this.blur || 0, a); }
  impactFrame(frames = 2) { this.impactN = frames; }
  setDesaturate(v) { this.desat = v; }
  setLowHp(a) { this.lowHp = a; }

  /** 질주 시 시야 살짝 넓힘 */
  setFovKick(k) { this.fovKick = k; }

  /** 트라우마 누적 (0~1). 실제 흔들림은 trauma² 에 비례 */
  addShake(a) { this.trauma = Math.min(1, this.trauma + a); }
  /** 강타 시 잠깐 확대 */
  addPunch(a) { this.punch = Math.min(2.5, this.punch + a); }
  /** 화면 가장자리 섬광 (치명타: 금색, 피격: 적색) */
  /** 큰 타격 색수차 펄스 */
  pulseChroma(a) { this.chroma = Math.max(this.chroma || 0, a); }
  flashEdge(color, a = 1) { this.grade.uniforms.uFlashColor.value.set(color); this.flash = Math.max(this.flash, a); }

  follow(target, dt) {
    this.t += dt;
    this.focus.lerp(target, 1 - Math.exp(-dt * 8));
    this.zoom = lerp(this.zoom, this.zoomTarget, 1 - Math.exp(-dt * 10));
    this.punch = Math.max(0, this.punch - dt * 9);
    this.camera.position.copy(this.focus).addScaledVector(this.camDir, this.zoom - this.punch);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.6, t = this.t * 38;
      this.camera.position.x += s * (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.6;
      this.camera.position.y += s * (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5) * 0.6;
      this.camera.position.z += s * Math.sin(t * 1.3 + 2) * 0.4;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    if (this.kickV) { this.camera.position.add(this.kickV); this.kickV.multiplyScalar(Math.exp(-dt * 14)); }
    this.camera.lookAt(this.focus.x, this.focus.y + 0.8, this.focus.z);
    const U = this.grade.uniforms;
    U.uRipple.value.z += dt; if (U.uRipple.value.z > 0.8) U.uRipple.value.w = 0;
    this.blur = Math.max(0, (this.blur || 0) - dt * 5); U.uBlur.value = this.quality === 'high' ? this.blur : 0;
    U.uImpact.value = this.impactN > 0 ? 1 : 0; if (this.impactN > 0) this.impactN--;
    U.uDesat.value += ((this.desat || 0) - U.uDesat.value) * Math.min(1, dt * 8);
    U.uRed.value = this.lowHp ? (0.35 + 0.35 * Math.sin(this.t * 6.5)) * this.lowHp : 0;
    const fov = 38 + (this.fovKick || 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6); this.camera.updateProjectionMatrix(); }
    this.sun.position.copy(this.focus).add(this.sunOffset);
    this.sun.target.position.copy(this.focus);
    this.sky.position.copy(this.camera.position);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.grade.uniforms.uFlash.value = this.flash;
    this.chroma = Math.max(0, (this.chroma || 0) - dt * 4);
    this.grade.uniforms.uChroma.value = this.chroma;
  }

  render() {
    if (this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
