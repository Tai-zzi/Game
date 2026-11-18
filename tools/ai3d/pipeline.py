"""
베르넬 AI 3D 에셋 파이프라인 (무료 Hugging Face Spaces)
  1) FLUX.1-dev(28 steps, 고품질) 로 컨셉 이미지 생성  -> public/art/concept/<id>.webp
  2) TRELLIS 로 이미지 -> 3D(GLB) 변환    -> public/models/ai/<id>.glb

무료 ZeroGPU 할당량이 하루 몇 분뿐이라 '하루 몇 개씩' 나눠 돌리는 구조.
이미 만든 파일은 건너뛰므로 매일 같은 명령을 다시 실행하면 이어서 진행됨.
HF_TOKEN(.env.local)이 있으면 할당량이 늘어남 (huggingface.co/settings/tokens, Read 권한).

사용 (프로젝트 루트에서, venv 에 gradio_client 설치 필요):
  python -I tools/ai3d/pipeline.py --list
  python -I tools/ai3d/pipeline.py --images            # 이미지만 전부
  python -I tools/ai3d/pipeline.py --3d weapon_guardian_sword npc_bello
  python -I tools/ai3d/pipeline.py --all --max 3       # 이미지+3D, 3D는 최대 3개
주의: AI 3D 결과물은 뼈대(리깅)가 없는 정적 메시. 무기·장비·소품·배경·서 있는 NPC에 적합.
     플레이어 캐릭터 애니메이션은 KayKit 리그 사용, 또는 Mixamo 등으로 별도 리깅 필요.
"""
import argparse, os, shutil, sys
from pathlib import Path
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = Path(__file__).resolve().parents[2]
IMG_DIR = ROOT / "public" / "art" / "concept"
GLB_DIR = ROOT / "public" / "models" / "ai"

STYLE = ("high-end Korean MMORPG 3D game asset, Lost Ark style semi-realistic PBR render, intricate detail, "
         "fabric embroidery and woven-thread motifs, subtle glowing golden thread accents, studio lighting")
ISO = "single object, isolated, centered, full view, plain pure white background, no text, no watermark, no shadow"
CHAR = "full body character, front view, A-pose, arms slightly away from body, isolated, plain pure white background, no text"

ASSETS = {
    # ── 플레이어 직업 (참고/NPC용 정적 모델) ──
    "class_guardian":   ("수호기사", f"armored guardian knight, large tower shield and short spear, low stance, quilted surcoat with knot embroidery, {CHAR}"),
    "class_knotarcher": ("매듭궁수", f"hooded ranger archer, longbow, quiver, leather armor with braided cords, long cloak, {CHAR}"),
    "class_weaver":     ("원소직조사", f"elemental weaver mage, staff with rotating glyph disc, layered robes with woven elemental patterns, {CHAR}"),
    "class_dyer":       ("생명염색사", f"healer dyer, work apron with dye vials, brush staff, flowing dyed robes in teal and crimson, {CHAR}"),
    # ── NPC ──
    "npc_hayla":  ("하일라 몬티스 (계약 감독관)", f"middle-aged female contract supervisor, practical long coat, ledger and seal, stern but fair face, {CHAR}"),
    "npc_bello":  ("벨로 하르크 (방패 교관)", f"veteran male shield instructor, scarred, heavy worn armor, battered shield on back, {CHAR}"),
    "npc_mora":   ("모라 페넬 (의사)", f"female village doctor, apron, satchel of herbs and threads, rolled sleeves, calm eyes, {CHAR}"),
    "npc_merchant": ("하르벤 상인", f"cheerful traveling merchant, backpack piled with fabric bolts and spools, {CHAR}"),
    # ── 무기 ──
    "weapon_guardian_shield": ("수호기사 방패", f"large kite tower shield, steel rim, embroidered fabric face with knot emblem, {ISO}"),
    "weapon_guardian_spear":  ("수호기사 단창", f"short spear, thread-wrapped shaft, engraved steel head, {ISO}"),
    "weapon_knot_bow":        ("매듭궁 장궁", f"elegant longbow, limbs bound with glowing braided cord, {ISO}"),
    "weapon_weaver_staff":    ("직조사 지팡이", f"mage staff topped with floating rotating glyph ring disc, {ISO}"),
    "weapon_dyer_brush":      ("염색사 도포봉", f"long ornate dye brush staff with glass dye vial, {ISO}"),
    # ── 장비 ──
    "armor_guardian_chest": ("수호기사 흉갑", f"plate chest armor with quilted fabric padding and knot embroidery, armor piece on stand, {ISO}"),
    "armor_hood":           ("궁수 두건", f"leather hood with braided cord trim, {ISO}"),
    # ── 아티팩트 ──
    "artifact_eternal_knot": ("영원매듭 파편", f"ancient magical artifact, fragment of a giant glowing knot of golden threads encased in cracked stone, {ISO}"),
    "artifact_spindle":      ("결의 물레가락", f"ancient ornate spindle artifact with glowing thread, {ISO}"),
    "item_thread_ball":      ("실뭉치", f"ball of glowing yarn, loose strands, {ISO}"),
    # ── 배경 소품 ──
    "prop_loom":       ("하르벤 공동 베틀", f"giant wooden communal village loom with colorful half-woven tapestry, {ISO}"),
    "prop_waterwheel": ("물레방아", f"rustic wooden watermill wheel, {ISO}"),
    "prop_cart":       ("교역 수레", f"medieval trade cart loaded with crates and fabric bolts, {ISO}"),
    "prop_broken_bridge": ("끊어진 다리", f"broken wooden and stone bridge segment, snapped planks, frayed rope, {ISO}"),
    "prop_house":      ("하르벤 가옥", f"cozy medieval weaver's cottage, timber frame, thatched roof, dyed cloth hanging, {ISO}"),
}
# 배경(하늘/원경) 이미지 — 3D 변환 안 함
BACKDROPS = {
    "bg_harven_valley": ("하르벤 계곡 원경", "panoramic landscape, lush green valley with river, water wheels, weaving village, rolling hills, golden hour, Lost Ark style environment concept art, no text"),
    "bg_harven_sky":    ("하르벤 하늘", "wide sky panorama, warm sunset clouds, faint glowing threads drifting across sky, no ground, no text"),
}


def load_env():
    for f in (".env.local", ".env"):
        p = ROOT / f
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    return os.environ.get("HF_TOKEN") or None


def gen_image(client, aid, prompt, w=1024, h=1024):
    out = IMG_DIR / f"{aid}.webp"
    if out.exists():
        return out
    r = client.predict(prompt=prompt, seed=7, randomize_seed=False, width=w, height=h,
                       guidance_scale=3.5, num_inference_steps=28, api_name="/infer")
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy(r[0], out)
    print(f"  이미지 저장: {out}")
    return out


def gen_3d(client, aid, img):
    from gradio_client import handle_file
    out = GLB_DIR / f"{aid}.glb"
    if out.exists():
        return out
    client.predict(api_name="/start_session")
    r = client.predict(image=handle_file(str(img)), multiimages=[], seed=0, ss_guidance_strength=7.5,
                       ss_sampling_steps=25, slat_guidance_strength=3, slat_sampling_steps=25,
                       multiimage_algo="stochastic", mesh_simplify=0.9, texture_size=2048,
                       api_name="/generate_and_extract_glb")
    items = r if isinstance(r, (list, tuple)) else [r]
    for x in items:
        p = x if isinstance(x, str) else (x.get("value") if isinstance(x, dict) else None)
        if p and str(p).endswith(".glb"):
            GLB_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy(p, out)
            print(f"  3D 저장: {out}")
            return out
    raise RuntimeError(f"GLB 결과 없음: {r}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--images", action="store_true", help="이미지만")
    ap.add_argument("--3d", dest="three_d", action="store_true", help="이미지+3D")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--max", type=int, default=99, help="이번 실행에서 3D 변환 최대 개수")
    a = ap.parse_args()

    if a.list or not (a.images or a.three_d or a.all):
        for k, (t, _) in {**ASSETS, **BACKDROPS}.items():
            img = "이미지O" if (IMG_DIR / f"{k}.webp").exists() else "이미지-"
            glb = "3D O" if (GLB_DIR / f"{k}.glb").exists() else ("3D -" if k in ASSETS else "")
            print(f"  {k:26} {img} {glb:5} {t}")
        return

    from gradio_client import Client
    token = load_env()
    ids = a.ids or (list(ASSETS) + list(BACKDROPS))
    flux = Client("black-forest-labs/FLUX.1-dev", token=token, verbose=False)
    trellis = None
    made3d = 0
    for aid in ids:
        if aid in BACKDROPS:
            title, prompt = BACKDROPS[aid]
            print(f"▶ {aid} ({title})")
            try: gen_image(flux, aid, prompt, 1344, 768)
            except Exception as e: print(f"  ✖ 이미지 실패: {str(e)[:200]}")
            continue
        if aid not in ASSETS:
            print(f"알 수 없는 id: {aid}"); continue
        title, desc = ASSETS[aid]
        print(f"▶ {aid} ({title})")
        try:
            img = gen_image(flux, aid, f"{desc}, {STYLE}")
        except Exception as e:
            msg = str(e)
            print(f"  ✖ 이미지 실패: {msg[:200]}")
            if "quota" in msg.lower(): print("  → 오늘 무료 할당량 소진. 내일 다시 실행하면 이어서 진행됩니다."); break
            continue
        if a.images or made3d >= a.max:
            continue
        try:
            trellis = trellis or Client("trellis-community/TRELLIS", token=token, verbose=False)
            gen_3d(trellis, aid, img); made3d += 1
        except Exception as e:
            msg = str(e)
            print(f"  ✖ 3D 실패: {msg[:200]}")
            if "quota" in msg.lower(): print("  → 3D 무료 할당량 소진. 이미지 생성만 계속합니다."); a.images = True


if __name__ == "__main__":
    main()
