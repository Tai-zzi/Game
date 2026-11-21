"""넓은 계곡 둘러보기: 여러 지역으로 순간이동해 스크린샷 (실사 느낌 판단용).
사용: python tools/verify/tour.py [URL]
"""
import sys, os, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5199/"
OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)
SPOTS = [("town_gate", 40, 6, 24), ("bridge", 48, 14, 28), ("valley", 90, 140, 30), ("forest", -40, 330, 26), ("lake", 300, 110, 34), ("hills", -330, -260, 34), ("ruins", -340, 270, 30)]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
    page = b.new_page(viewport={"width": 1600, "height": 900})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.evaluate("localStorage.clear()"); page.reload()
    page.wait_for_timeout(2500)
    page.fill("#name-input", "여행자"); page.click("#start-btn")
    page.wait_for_timeout(5000)
    if page.is_visible("#summary button"): page.click("#summary button")
    for name, x, z, zoom in SPOTS:
        page.evaluate(f"(() => {{ const g = window.__bernel.game, p = g.player(); p.pos.x = {x}; p.pos.z = {z}; window.__bernel.renderer.zoomTarget = {zoom}; window.__bernel.renderer.focus.set({x}, 0, {z}); }})()")
        page.wait_for_timeout(4500)
        page.screenshot(path=os.path.join(OUT, f"tour_{name}.png"))
    fps = page.evaluate("""() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })""")
    b.close()
print(json.dumps({"errors": errors[:20], "fps_headless": fps}, ensure_ascii=False))
