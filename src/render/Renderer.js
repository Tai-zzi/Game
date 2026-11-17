import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

/** 씬/카메라/조명. 쿼터뷰 카메라는 대상(플레이어)을 부드럽게 따라간다. */
export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    const horizon = new THREE.Color('#f3d9b8');
    this.scene.fog = new THREE.Fog(horizon, 55, 150);
    this.scene.background = horizon;
    this.addSky();

    // 쿼터뷰: 남동쪽 위에서 내려다보는 원근 카메라
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 400);
    this.camDir = new THREE.Vector3(0.62, 1.0, 0.78).normalize();
    this.zoom = 24; this.zoomTarget = 24;
    this.zoomMin = 13; this.zoomMax = 34;
    this.focus = new THREE.Vector3();
    this.shake = 0;

    const hemi = new THREE.HemisphereLight('#ffe9c9', '#5a6b3a', 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#ffd7a0', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.sunOffset = new THREE.Vector3(-30, 52, 22);
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight('#9fb7ff', 0.35);
    fill.position.set(40, 30, -40);
    this.scene.add(fill);

    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomTarget = clamp(this.zoomTarget + Math.sign(e.deltaY) * 2.2, this.zoomMin, this.zoomMax);
    }, { passive: false });
  }

  addSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#7fa8d6') },
        mid: { value: new THREE.Color('#f6d7b0') },
        bottom: { value: new THREE.Color('#f3d9b8') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.02, 0.55, h)) : bottom; gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }

  /** 매 프레임: 대상 위치 추적 + 줌 보간 + 그림자 카메라 이동 */
  follow(target, dt) {
    const k = 1 - Math.exp(-dt * 8);
    this.focus.lerp(target, k);
    this.zoom = lerp(this.zoom, this.zoomTarget, 1 - Math.exp(-dt * 10));
    this.camera.position.copy(this.focus).addScaledVector(this.camDir, this.zoom);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    this.camera.lookAt(this.focus.x, this.focus.y + 0.8, this.focus.z);
    this.sun.position.copy(this.focus).add(this.sunOffset);
    this.sun.target.position.copy(this.focus);
    this.sky.position.copy(this.camera.position);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
