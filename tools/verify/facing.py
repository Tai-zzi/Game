"""AI 모델 정면 확인: 카메라를 +Z 쪽에 두고(-Z 를 바라봄) 각 모델을 렌더해 한 장으로 저장.
모델 정면이 +Z 이면 얼굴이 보여야 한다. 사용: python tools/verify/facing.py [URL]
"""
import sys, os, base64
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5199/"
OUT = os.path.join(os.path.dirname(__file__), "out")
JS = """
async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
  const { AiAssets } = await import('/src/render/AiAssets.js');
  const ids = ['class_guardian', 'class_knotarcher', 'class_weaver', 'class_dyer'];
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(1200, 400); r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#888');
  scene.add(new THREE.HemisphereLight('#fff', '#444', 2.5));
  const dl = new THREE.DirectionalLight('#fff', 4); dl.position.set(2, 3, 10); scene.add(dl);
  const pm = new THREE.PMREMGenerator(r); const env = new THREE.Scene(); env.background = new THREE.Color('#bbb'); scene.environment = pm.fromScene(env).texture;
  const cam = new THREE.OrthographicCamera(-6, 6, 2.2, -1.8, 0.1, 50); cam.position.set(0, 0.9, 10); cam.lookAt(0, 0.9, 0);
  let i = 0;
  for (const id of ids) { const o = await AiAssets.instance(id); if (o) { o.position.x = -4.5 + i * 3; o.traverse((m) => { if (m.isMesh) { m.material.metalness = 0; } }); scene.add(o); } i++; }
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}
"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu"])
    page = b.new_page()
    page.goto(URL); page.wait_for_timeout(2500)
    data = page.evaluate(JS)
    open(os.path.join(OUT, "facing.png"), "wb").write(base64.b64decode(data.split(",")[1]))
    b.close()
print("saved")
