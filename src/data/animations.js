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
};

/** 스타일별 기본 상태 클립 */
export const STYLES = {
  swordShield: { idle: 'Idle', run: 'Running_A', block: 'Blocking', hit: ['Hit_A', 'Hit_B'], death: 'Death_A', dodge: 'Dodge_Forward',
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
