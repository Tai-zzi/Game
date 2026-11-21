"""브라우저 실제 실행 확인 (Playwright + 시스템 Edge).
사용: python tools/verify/smoke.py [URL] [클래스]
- 타이틀 → 캐릭터 생성 → 게임 진입 → 몇 가지 조작 → 스크린샷 (tools/verify/out/)
- 콘솔 오류·페이지 오류를 모아 출력 (오류가 있으면 종료 코드 1)
"""
import sys, os, time, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5199/"
CLS = sys.argv[2] if len(sys.argv) > 2 else "guardian"
OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

errors, logs = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    page.on("console", lambda m: (errors if m.type == "error" and "404" not in m.text else logs).append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
    page.goto(URL, wait_until="domcontentloaded")
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    page.screenshot(path=os.path.join(OUT, "01_title.png"))
    page.fill("#name-input", "검증")
    page.click(f'button.choice[data-class="{CLS}"]')
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(OUT, "02_create.png"))
    page.click("#start-btn")
    page.wait_for_timeout(6000)
    page.keyboard.press("Escape")
    page.click("#summary button", timeout=3000) if page.is_visible("#summary button") else None
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(OUT, "03_game.png"))
    # 조작: 허수아비 → 공격
    page.mouse.move(800, 420)
    page.keyboard.press("F9")
    page.wait_for_timeout(500)
    for k in ["c", "c", "c", "q", "w", "e", "r", "a"]:
        page.keyboard.press(k)
        page.wait_for_timeout(450)
    page.screenshot(path=os.path.join(OUT, "04_combat.png"))
    page.keyboard.press("m"); page.wait_for_timeout(1200)
    page.screenshot(path=os.path.join(OUT, "05_map.png"))
    page.keyboard.press("Escape"); page.keyboard.press("k"); page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(OUT, "06_bonds.png"))
    page.keyboard.press("Escape")
    info = page.evaluate("""() => ({ fps: null, hud: !!document.querySelector('#hud:not(.hidden)'), err: window.__errors || null })""")
    browser.close()

print(json.dumps({"errors": errors[:40], "warnings": [l for l in logs if "warn" in l][:20], "info": info}, ensure_ascii=False, indent=1))
sys.exit(1 if errors else 0)
