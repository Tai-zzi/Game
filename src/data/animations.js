/**
 * 애니메이션 매핑 (데이터). 게임 상태 이름 → 리그 클립 이름.
 * 리그: KayKit Adventurers (CC0) — public/models/kaykit/*.glb, 캐릭터마다 76개 클립 내장.
 *
 * strike: 클립 안에서 타격이 닿는 시점의 비율(0~1). 기술의 windup(예비 동작) 길이에 맞춰
 *         timeScale = 클립길이 × strike ÷ windup 으로 재생해 "판정 프레임 = 타격 프레임"이 되게 한다.
 *         값은 클립을 눈으로 보고 정한 추정치 — 실제 프레임 확인 후 조정 필요.
 */
export const RIG_FILES = {
  Knight: 'models/kaykit/Knight.glb',
  Mage: 'models/kaykit/Mage.glb',
  Rogue: 'models/kaykit/Rogue.glb',
  Rogue_Hooded: 'models/kaykit/Rogue_Hooded.glb',
  Barbarian: 'models/kaykit/Barbarian.glb',
};

/** 몸통 메시 (항상 표시). 나머지 메시(무기·모자·망토 등)는 show 목록에 있을 때만 보인다 */
export const BODY_PART = /_(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight)$/;

/**
 * 모델 ID → 리그·보이는 장비·색조·동작 스타일.
 * 단면 직업의 무기 실루엣과 KayKit 장비가 정확히 일치하지는 않는다 (창 → 한손검, 장궁 → 석궁): 미정 항목.
 */
export const MODEL_RIGS = {
  player_guardian: { rig: 'Knight', show: ['1H_Sword', 'Rectangle_Shield', 'Knight_Cape', 'Knight_Helmet'], style: 'swordShield' },
  player_archer: { rig: 'Rogue_Hooded', show: ['2H_Crossbow', 'Rogue_Cape'], style: 'crossbow', tint: '#b8d0a8' },
  player_elementalist: { rig: 'Mage', show: ['2H_Staff', 'Mage_Cape', 'Mage_Hat'], style: 'staff' },
  player_dyer: { rig: 'Mage', show: ['1H_Wand', 'Spellbook'], style: 'wand', tint: '#b8e8c0' },
  npc_haila: { rig: 'Mage', show: ['Spellbook'], style: 'npc', tint: '#b8bcc4' },
  npc_belo: { rig: 'Barbarian', show: ['Barbarian_Round_Shield', 'Barbarian_Cape'], style: 'npc', tint: '#d0c0a8' },
  npc_mora: { rig: 'Rogue', show: ['Rogue_Cape'], style: 'npc', tint: '#d8c0e8' },
  npc_merchant: { rig: 'Barbarian', show: ['Mug', 'Barbarian_Hat'], style: 'npc', tint: '#f0d8a8' },
  npc_trainer: { rig: 'Knight', show: ['Knight_Cape'], style: 'npc', tint: '#b8c0d0' },
  npc_villager_a: { rig: 'Rogue', show: [], style: 'npc', tint: '#e0c8a8' },
  npc_villager_b: { rig: 'Barbarian', show: [], style: 'npc', tint: '#c8d0b0' },
  npc_child: { rig: 'Rogue_Hooded', show: [], style: 'npc', tint: '#f0b8a0' },
};

/** 스타일별 기본 상태 클립 */
export const STYLES = {
  swordShield: { idle: 'Idle', run: 'Running_A', sprint: 'Running_B', block: 'Blocking', hit: ['Hit_A', 'Hit_B'], death: 'Death_A', dodge: 'Dodge_Forward',
    combo: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab'] },
  crossbow: { idle: 'Idle', run: 'Running_B', block: 'Idle', hit: ['Hit_A', 'Hit_B'], death: 'Death_B', dodge: 'Dodge_Forward', combo: ['2H_Ranged_Shoot'] },
  staff: { idle: 'Idle', run: 'Running_A', block: 'Idle', hit: ['Hit_A', 'Hit_B'], death: 'Death_A', dodge: 'Dodge_Forward', combo: ['Spellcast_Shoot'] },
  wand: { idle: 'Idle', run: 'Running_A', block: 'Idle', hit: ['Hit_A', 'Hit_B'], death: 'Death_A', dodge: 'Dodge_Forward', combo: ['1H_Melee_Attack_Chop'] },
  npc: { idle: 'Idle', run: 'Walking_A', block: 'Idle', hit: ['Hit_A'], death: 'Death_A', dodge: 'Dodge_Forward', combo: ['Interact'] },
};

/**
 * 기술 → 클립과 strike 비율. combo: true 면 스타일의 combo 클립을 1-2-3 순환.
 * proc: 절차적 대체 모델의 키프레임 클립 이름 (melee | shoot | cast | use | dodge | block)
 */
export const SKILL_ANIMS = {
  dodge: { clip: 'Dodge_Forward', strike: 0, duration: 0.32, proc: 'dodge' },
  mob_attack: { proc: 'lunge' },
  // 수호기사
  g_basic: { combo: true, strike: [0.42, 0.42, 0.36], proc: 'melee' },
  g_shield: { clip: 'Block', strike: 0.3, proc: 'block' },
  g_escort: { clip: 'Dodge_Forward', strike: 0.6, proc: 'dodge' },
  g_wall: { clip: 'Block_Attack', strike: 0.45, proc: 'cast' },
  g_parry: { clip: 'Block_Attack', strike: 0.3, proc: 'block' },
  g_rush: { clip: '1H_Melee_Attack_Stab', strike: 0.38, proc: 'melee' },
  g_chain: { combo: true, strike: [0.36, 0.36, 0.42], proc: 'melee' },
  g_taunt: { clip: 'Cheer', strike: 0.35, proc: 'cast' },
  g_release: { clip: '2H_Melee_Attack_Chop', strike: 0.45, proc: 'melee' },
  g_ult: { clip: '2H_Melee_Attack_Spin', strike: 0.5, proc: 'cast' },
  // 매듭궁수
  a_basic: { combo: true, strike: [0.22, 0.22, 0.22], proc: 'shoot' },
  a_mark: { clip: '2H_Ranged_Shoot', strike: 0.22, proc: 'shoot' },
  a_link: { clip: '2H_Ranged_Shoot', strike: 0.22, proc: 'shoot' },
  a_knotstep: { clip: 'Dodge_Backward', strike: 0.6, proc: 'dodge' },
  a_pierce: { clip: '2H_Ranged_Aiming', strike: 0.9, proc: 'shoot' },
  a_post: { clip: 'Throw', strike: 0.45, proc: 'use' },
  a_volley: { clip: '2H_Ranged_Shoot', strike: 0.22, proc: 'shoot' },
  a_backshot: { clip: 'Dodge_Backward', strike: 0.5, proc: 'dodge' },
  a_rain: { clip: 'Throw', strike: 0.45, proc: 'cast' },
  a_ult: { clip: 'Cheer', strike: 0.5, proc: 'cast' },
  // 원소직조사
  e_basic: { combo: true, strike: [0.4, 0.4, 0.4], proc: 'cast' },
  e_ember: { clip: 'Spellcast_Shoot', strike: 0.4, proc: 'cast' },
  e_frost: { clip: 'Spellcast_Shoot', strike: 0.4, proc: 'cast' },
  e_complete: { clip: 'Spellcast_Long', strike: 0.55, proc: 'cast' },
  e_firewall: { clip: 'Spellcast_Raise', strike: 0.5, proc: 'cast' },
  e_crystal: { clip: 'Spellcast_Raise', strike: 0.5, proc: 'cast' },
  e_beam: { clip: 'Spellcasting', strike: 0.1, proc: 'cast' },
  e_leap: { clip: 'Dodge_Backward', strike: 0.5, proc: 'dodge' },
  e_cycle: { clip: 'Spellcast_Shoot', strike: 0.4, proc: 'cast' },
  e_ult: { clip: 'Spellcast_Long', strike: 0.6, proc: 'cast' },
  // 생명염색사
  d_basic: { combo: true, strike: [0.4, 0.4, 0.4], proc: 'melee' },
  d_green: { clip: 'Use_Item', strike: 0.35, proc: 'use' },
  d_spread: { clip: 'Spellcast_Raise', strike: 0.5, proc: 'cast' },
  d_bleach: { clip: 'Use_Item', strike: 0.35, proc: 'use' },
  d_shield: { clip: 'Use_Item', strike: 0.35, proc: 'use' },
  d_pool: { clip: 'Throw', strike: 0.45, proc: 'use' },
  d_needle: { clip: '1H_Melee_Attack_Stab', strike: 0.38, proc: 'melee' },
  d_suture: { clip: 'Use_Item', strike: 0.3, proc: 'use' },
  d_burst: { clip: 'Spellcast_Raise', strike: 0.6, proc: 'cast' },
  d_ult: { clip: 'Spellcast_Raise', strike: 0.6, proc: 'cast' },
};

/**
 * 실사 리그 캐릭터 자리 (Mixamo 등): public/models/realistic/<이름>.glb
 * 애니메이션: public/models/realistic/anims/<상태>.glb — 뼈 이름이 같으면(mixamorig:*) 그대로 재생된다.
 * 파일이 없으면 KayKit → 절차적 모델 순서로 대체.
 */
export const REALISTIC_FILES = {
  player_guardian: 'guardian', player_archer: 'archer', player_elementalist: 'elementalist', player_dyer: 'dyer',
  npc_haila: 'haila', npc_belo: 'belo', npc_mora: 'mora', npc_merchant: 'merchant', npc_trainer: 'trainer',
  npc_villager_a: 'villager_a', npc_villager_b: 'villager_b', npc_child: 'child',
};
export const REALISTIC_ANIMS = ['idle', 'run', 'sprint', 'attack1', 'attack2', 'attack3', 'cast', 'shoot', 'block', 'hit', 'death', 'dodge', 'use'];
/** 실사 리그의 상태 → 애니메이션 파일 */
export const REALISTIC_STYLE = { idle: 'idle', run: 'run', sprint: 'sprint', block: 'block', hit: ['hit'], death: 'death', dodge: 'dodge', combo: ['attack1', 'attack2', 'attack3'] };
/** KayKit 귀여운 비율 완화: 머리 축소 · 다리 늘림 (뼈 배율, 애니메이션 뒤에 적용) */
export const KAYKIT_PROPORTION = { head: 0.74, upperleg: 1.1, lowerleg: 1.08, chest: 1.04 };

/**
 * Mixamo 실사 캐릭터 (public/models/realistic/_src). 스킨 FBX + 동작 FBX(같은 mixamorig 뼈대 — 이름으로 그대로 재생).
 * 동작은 '제자리'로 바꿔 쓴다 (엉덩이 위치 트랙 제거) → 이동은 게임 로직이 담당.
 * 파일이 없거나 실패하면 KayKit → 절차적 모델로 대체.
 */
export const MIXAMO_DIR = 'models/realistic/_src/';
export const MIXAMO_SKINS = {
  player_guardian: 'Paladin J Nordstrom.fbx',
  player_archer: 'Erika Archer.fbx',
  player_elementalist: 'Heraklios By A. Dizon.fbx',
  player_dyer: 'Knight D Pelegrini.fbx',
  npc_belo: 'castle_guard_01.fbx',
  npc_mora: 'Peasant Girl.fbx',
  npc_villager_a: 'Peasant Girl.fbx',
  npc_villager_b: 'castle_guard_01.fbx',
  npc_trainer: 'castle_guard_01.fbx',
  npc_child: 'Peasant Girl.fbx',
};
/** 동작 묶음: 상태 → 파일 (배열이면 순환/무작위) */
export const MIXAMO_SETS = {
  sword: {
    dir: 'anim_sword_shield/',
    idle: 'sword and shield idle.fbx', walk: 'sword and shield walk.fbx', run: 'sword and shield run.fbx', sprint: 'sword and shield run (2).fbx',
    block: 'sword and shield block idle.fbx', death: 'sword and shield death.fbx', dodge: 'sword and shield jump.fbx',
    hit: ['sword and shield impact.fbx', 'sword and shield impact (2).fbx'],
    combo: ['sword and shield slash.fbx', 'sword and shield slash (2).fbx', 'sword and shield slash (3).fbx'],
    cast: 'sword and shield casting.fbx', heavy: 'sword and shield attack (2).fbx', power: 'sword and shield power up.fbx', talk: 'sword and shield idle (2).fbx',
  },
  bow: {
    dir: 'anim_longbow/',
    idle: 'standing idle 01.fbx', walk: 'standing walk forward.fbx', run: 'standing run forward.fbx', sprint: 'standing run forward.fbx',
    block: 'standing block.fbx', death: 'standing death backward 01.fbx', dodge: 'standing dodge forward.fbx',
    hit: ['standing react small from front.fbx'], combo: ['standing aim recoil.fbx'], shoot: 'standing aim recoil.fbx', aim: 'standing aim overdraw.fbx',
    cast: 'standing draw arrow.fbx', heavy: 'standing aim overdraw.fbx', talk: 'standing idle 02 looking.fbx',
  },
  magic: {
    dir: 'anim_magic/',
    idle: 'standing idle.fbx', walk: 'Standing Walk Forward.fbx', run: 'Standing Run Forward.fbx', sprint: 'Standing Sprint Forward.fbx',
    block: 'Standing Block Idle.fbx', death: 'Standing React Death Backward.fbx', dodge: 'Standing Jump.fbx',
    hit: ['Standing React Small From Front.fbx', 'Standing React Large From Front.fbx'],
    combo: ['Standing 1H Magic Attack 01.fbx', 'Standing 1H Magic Attack 02.fbx', 'Standing 1H Magic Attack 03.fbx'],
    cast: 'Standing 2H Cast Spell 01.fbx', heavy: 'Standing 2H Magic Area Attack 01.fbx', shoot: 'Standing 2H Magic Attack 01.fbx', talk: 'standing idle 02.fbx',
  },
};
export const MIXAMO_CLASS_SET = { player_guardian: 'sword', player_dyer: 'sword', player_archer: 'bow', player_elementalist: 'magic', npc_belo: 'sword', npc_mora: 'magic', npc_villager_a: 'magic', npc_villager_b: 'magic', npc_trainer: 'sword', npc_child: 'magic' };
/** 기술의 절차 동작 종류 → 묶음의 상태 (strike: 타격 시점 비율 — 추정치) */
export const MIXAMO_PROC = { melee: ['heavy', 0.45], shoot: ['shoot', 0.35], cast: ['cast', 0.5], use: ['cast', 0.45], block: ['block', 0.2], dodge: ['dodge', 0.3], lunge: ['combo', 0.42] };
