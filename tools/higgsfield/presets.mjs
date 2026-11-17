// 베르넬 캐릭터/몬스터 아트 프리셋 (D:\Game 설정서 기반)
// 생성 결과: public/art/<id>.<ext>
//  - 게임 내 초상화(대화창/타깃 프레임)로 사용
//  - 추후 Blender + Higgsfield 이미지→3D 변환의 입력(정면 전신 시트)으로 사용 → public/models/<id>.glb

export const DEFAULT_MODEL = 'higgsfield-ai/soul/standard'; // 입력 스키마 검증된 모델

const STYLE =
  'stylized fantasy MMORPG character concept art, warm handcrafted textile aesthetic, embroidery and woven fabric details, ' +
  'glowing golden thread lines, painterly, soft rim light, clean readable silhouette';
const SHEET = 'full body, front view, standing A-pose, centered, plain light neutral background, no text, no watermark';
const PORTRAIT = 'bust portrait, three-quarter view, soft vignette background, no text, no watermark';

const p = (title, prompt, aspect_ratio = '2:3') => ({
  title,
  input: { prompt: `${prompt}, ${STYLE}`, aspect_ratio, resolution: '1080p', num_images: 1 },
});

export const PRESETS = {
  // ── 플레이어 ──
  player_mender: p('견습 수선공 (주인공, 전신)',
    `young apprentice mender adventurer, layered woolen tunic with embroidered thread patterns, leather apron with spools and needles, glowing golden thread wrapped around forearms, short patched cape, sturdy boots, ${SHEET}`),
  player_mender_portrait: p('견습 수선공 (초상화)',
    `young apprentice mender adventurer, determined hopeful expression, woolen hood, a single glowing golden thread floating near the face, ${PORTRAIT}`, '1:1'),
  class_puller: p('당김꾼 (1차 전직, 근접)',
    `muscular melee warrior who pulls threads of fate, longsword with thread wound around the hilt, taut glowing threads stretching from gauntlets, quilted armor with knot motifs, ${SHEET}`),

  // ── NPC ──
  npc_elder: p('하르벤 마을 장로 (전신)',
    `elderly village elder of a peaceful weaving valley, kind wrinkled face, long grey braided beard, thick knitted shawl with valley sheep patterns, wooden staff topped with a small spinning wheel, ${SHEET}`),
  npc_elder_portrait: p('하르벤 마을 장로 (초상화)',
    `elderly village elder, kind but worried expression, long grey braided beard, thick knitted shawl, ${PORTRAIT}`, '1:1'),

  // ── 몬스터 ──
  mob_unravel_sheep: p('풀린 양 (몬스터)',
    `creature design, a fluffy sheep whose wool is unraveling into loose glowing yarn strands, parts of its body turning into tangled thread balls, eerie hollow eyes, slightly cute but unsettling, full body side view, plain light neutral background, no text`, '4:3'),
  mob_unravel_wolf: p('풀린 늑대 (몬스터)',
    `creature design, a grey wolf whose body is unraveling into frayed threads and loose stitches, exposed seams glowing faintly, snarling, full body side view, plain light neutral background, no text`, '4:3'),

  // ── 배경 ──
  zone_harven_keyart: p('하르벤 계곡 키 아트',
    `environment key art, peaceful green valley village with water wheels, flocks of sheep, a giant communal loom in the village square with glowing threads, rolling hills, river, golden hour, faint unraveling threads drifting in the sky`, '16:9'),
};
