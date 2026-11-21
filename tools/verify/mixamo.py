"""Mixamo FBX 확인: 스킨 + 동작 FBX 를 AnimationMixer 로 재생해 몇 프레임 렌더. 뼈 중복/이름 정보 출력.
사용: python tools/verify/mixamo.py [URL] [스킨] [동작(_src 기준 경로)]
"""
import sys, os, base64, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5199/"
SKIN = sys.argv[2] if len(sys.argv) > 2 else "Paladin J Nordstrom.fbx"
ANIM = sys.argv[3] if len(sys.argv) > 3 else "anim_sword_shield/sword and shield slash.fbx"
OUT = os.path.join(os.path.dirname(__file__), "out")
JS = """
async ([skin, anim]) => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
  const L = new FBXLoader();
  const base = '/models/realistic/_src/';
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const obj = await L.loadAsync(base + enc(skin));
  const a = await L.loadAsync(base + enc(anim));
  const names = {}; obj.traverse((o) => { if (o.isBone) names[o.name] = (names[o.name] || 0) + 1; });
  const dup = Object.entries(names).filter(([, c]) => c > 1).slice(0, 5);
  const sk = []; obj.traverse((o) => { if (o.isSkinnedMesh) sk.push([o.name, o.skeleton.bones.length, o.skeleton.bones[0].name, o.skeleton.bones[0].parent?.name]); });
  const clip = a.animations[0];
  const tracks = clip.tracks.slice(0, 4).map((t) => t.name);
  const hipsA = a.getObjectByName('mixamorigHips'), hipsS = obj.getObjectByName('mixamorigHips');
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3());
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(1200, 400); r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#888');
  scene.add(new THREE.HemisphereLight('#fff', '#444', 2)); const dl = new THREE.DirectionalLight('#fff', 3); dl.position.set(1, 2, 3); scene.add(dl);
  const s = 1.8 / size.y; obj.scale.setScalar(s); scene.add(obj);
  const mixer = new THREE.AnimationMixer(obj); mixer.clipAction(clip).play();
  const cam = new THREE.PerspectiveCamera(30, 3, 0.1, 50); cam.position.set(0, 1, 6); cam.lookAt(0, 0.9, 0);
  const frames = [];
  const shots = 3; const W = 400;
  r.setScissorTest(true);
  for (let i = 0; i < shots; i++) {
    mixer.setTime(clip.duration * (i + 0.5) / shots);
    r.setViewport(i * W, 0, W, 400); r.setScissor(i * W, 0, W, 400);
    cam.aspect = 1; cam.updateProjectionMatrix(); r.render(scene, cam);
  }
  return { img: r.domElement.toDataURL('image/png'), dup, sk, tracks, dur: clip.duration, hipsA: hipsA && hipsA.position.toArray(), hipsS: hipsS && hipsS.position.toArray(), size: size.toArray(), aKids: a.children.map((c) => c.type + ':' + c.name) };
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu"])
    page = b.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.goto(URL); page.wait_for_timeout(1500)
    res = page.evaluate(JS, [SKIN, ANIM])
    open(os.path.join(OUT, "mixamo.png"), "wb").write(base64.b64decode(res.pop("img").split(",")[1]))
    b.close()
print(json.dumps({**res, "errors": errs[:3]}, ensure_ascii=False))
