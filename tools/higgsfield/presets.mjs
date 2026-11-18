// 베르넬 캐릭터/몬스터 아트 프리셋 (v0.3 제안 기준)
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
  // ── 플레이어: v0.3 수직 단면 4직업 (정면 전신 시트, 무기 실루엣으로 구분) ──
  // 직업은 전투 방식일 뿐 성격·도덕성을 정하지 않는다 → 표정은 중립적으로
  player_guardian: p('수호기사 (전신)',
    `defensive shield fighter, large rectangular wooden tower shield with visible repair patches on the left arm, short spear in the right hand, low grounded stance, padded gambeson with woven trim, practical travel boots, neutral calm expression, ${SHEET}`),
  player_archer: p('매듭궁수 (전신)',
    `ranged hunter, tall longbow with knotted cord wrapping, leather quiver on the back, a faint glowing aiming thread line, hooded green travel cloak, light layered leather armor, neutral focused expression, ${SHEET}`),
  player_elementalist: p('원소직조사 (전신)',
    `workshop elemental scholar, wooden staff topped with a glowing ember crystal, a circular sigil plate of woven glowing lines floating behind the back, heat-resistant layered coat with soot marks, neutral thoughtful expression, ${SHEET}`),
  player_dyer: p('생명염색사 (전신)',
    `field medic dyer, green-stained work apron with a row of colored dye bottles, slim applicator rod with a glowing green tip, rolled sleeves with dye stains, satchel of bandages, neutral attentive expression, ${SHEET}`),

  // ── 주요 NPC 초상화 (v0.3 §7) ──
  npc_haila_portrait: p('하일라 몬티스 (초상화)',
    `contract supervisor woman in her forties, rain-soaked grey coat, holding a ledger full of corrections and crossed-out names, tired but attentive eyes, ${PORTRAIT}`, '1:1'),
  npc_belo_portrait: p('벨로 하르크 (초상화)',
    `veteran shield instructor man in his fifties, weathered face, a battered round shield with repair marks on his back, restrained regret in the eyes, ${PORTRAIT}`, '1:1'),
  npc_mora_portrait: p('모라 페넬 (초상화)',
    `calm doctor woman in her thirties, rows of colored pigment bottles on her belt, worn medical ledger and pen, gentle but firm expression, ${PORTRAIT}`, '1:1'),

  // ── 몬스터 ──
  mob_unravel_sheep: p('풀린 양 (몬스터)',
    `creature design, a fluffy sheep whose wool is unraveling into loose glowing yarn strands, parts of its body turning into tangled thread balls, eerie hollow eyes, slightly cute but unsettling, full body side view, plain light neutral background, no text`, '4:3'),
  mob_unravel_wolf: p('풀린 늑대 (몬스터)',
    `creature design, a grey wolf whose body is unraveling into frayed threads and loose stitches, exposed seams glowing faintly, snarling, full body side view, plain light neutral background, no text`, '4:3'),

  // ── 배경 ──
  zone_harven_keyart: p('하르벤 계곡 키 아트',
    `environment key art, peaceful green valley village with water wheels, flocks of sheep, a giant communal loom in the village square with glowing threads, rolling hills, river, golden hour, faint unraveling threads drifting in the sky`, '16:9'),
};
