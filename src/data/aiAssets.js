/**
 * AI 생성 3D 에셋 목록 (TRELLIS 파이프라인 — tools/ai3d/pipeline.py ASSETS 와 같은 이름).
 * 파일: public/models/ai/<id>.glb — 정적 메시(뼈대·애니메이션 없음), 높이 1.0 정규화, 원점 중심, Y-up.
 * 파일이 아직 없으면 조용히 절차적/리그 모델로 대체된다. 새 파일은 넣기만 하면 다음 실행에 나타난다.
 *
 * height: 월드 높이(m)로 맞춤, fit: 대신 가로 폭(x)으로 맞춤, rotY: 정면 보정(라디안), yOffset: 추가 높이
 * role: class(캐릭터 생성 미리보기) | npc | item | prop
 */
export const AI_DIR = 'models/ai/';
export const AI_CONCEPT_DIR = 'art/concept/';
export const AI_MAX_HEAVY = 7; // 한 번에 올릴 무거운 메시 종류 수 상한
export const AI_WARN_BYTES = 5 * 1024 * 1024;

export const AI_ASSETS = {
  // 직업 (리그 없음 → 플레이어 대신 캐릭터 생성 턴테이블·NPC 대역에 사용)
  class_guardian: { role: 'class', classId: 'guardian', height: 1.8, rotY: 0 },
  class_knotarcher: { role: 'class', classId: 'archer', height: 1.8, rotY: 0 },
  class_weaver: { role: 'class', classId: 'elementalist', height: 1.8, rotY: 0 },
  class_dyer: { role: 'class', classId: 'dyer', height: 1.8, rotY: 0 },
  // NPC
  npc_hayla: { role: 'npc', npcId: 'haila', height: 1.75 },
  npc_bello: { role: 'npc', npcId: 'belo', height: 1.85 },
  npc_mora: { role: 'npc', npcId: 'mora', height: 1.7 },
  npc_merchant: { role: 'npc', npcId: 'merchant', height: 1.75 },
  // 아이템 (바닥 드롭·상점 아이콘)
  weapon_guardian_shield: { role: 'item', height: 0.9 },
  weapon_guardian_spear: { role: 'item', height: 1.1 },
  weapon_knot_bow: { role: 'item', height: 1.1 },
  weapon_weaver_staff: { role: 'item', height: 1.1 },
  weapon_dyer_brush: { role: 'item', height: 0.8 },
  armor_guardian_chest: { role: 'item', height: 0.8 },
  armor_hood: { role: 'item', height: 0.6 },
  artifact_eternal_knot: { role: 'item', height: 0.6 },
  artifact_spindle: { role: 'item', height: 0.7 },
  item_thread_ball: { role: 'item', height: 0.4 },
  // 소품
  prop_loom: { role: 'prop', height: 3.6 },
  prop_waterwheel: { role: 'prop', height: 5.6 },
  prop_cart: { role: 'prop', height: 1.6 },
  prop_broken_bridge: { role: 'prop', fit: 19, rotY: Math.PI / 2 },
  prop_house: { role: 'prop', height: 5 },
};

/** 직업 → 캐릭터 생성 미리보기 모델 */
export const CLASS_PREVIEW = { guardian: 'class_guardian', archer: 'class_knotarcher', elementalist: 'class_weaver', dyer: 'class_dyer' };

/** NPC → 우선순위 목록(앞에서부터 있는 것 사용) + 대역일 때 색조 */
export const NPC_AI = {
  haila: { ids: ['npc_hayla', 'class_weaver'], tint: '#b8bcc8' },
  belo: { ids: ['npc_bello', 'class_guardian'], tint: '#e0d4c0' },
  mora: { ids: ['npc_mora', 'class_knotarcher'], tint: '#d8c4e8' },
  merchant: { ids: ['npc_merchant', 'class_weaver'], tint: '#f0d0a0' },
};

/** 게임 아이템 → 3D 아이콘/드롭 모델 */
export const ITEM_AI = {
  thread_ball: 'item_thread_ball',
  gw1: 'weapon_guardian_spear', ga1: 'armor_guardian_chest',
  aw1: 'weapon_knot_bow', aa1: 'armor_hood',
  ew1: 'weapon_weaver_staff', dw1: 'weapon_dyer_brush',
  acc1: 'artifact_eternal_knot', acc2: 'artifact_spindle',
};

/** 엔티티 소품 모델 → AI 에셋 */
export const PROP_AI = { prop_cart: 'prop_cart' };

/** 목록 중 사용 가능한 첫 ID (available: Set 또는 has(id) 함수) — 순수 함수, 테스트 대상 */
export function resolveFirst(ids, available) {
  const has = typeof available === 'function' ? available : (id) => available.has(id);
  return ids.find((id) => AI_ASSETS[id] && has(id)) || null;
}

/** 정규화 변환: 높이(또는 폭) 맞춤 + 바닥 맞춤. bbox: { min:{x,y,z}, max:{x,y,z} } */
export function placementFor(id, bbox) {
  const a = AI_ASSETS[id] || {};
  const sizeY = Math.max(1e-6, bbox.max.y - bbox.min.y), sizeX = Math.max(1e-6, bbox.max.x - bbox.min.x);
  const scale = a.fit ? a.fit / sizeX : (a.height || 1) / sizeY;
  return { scale, y: -bbox.min.y * scale + (a.yOffset || 0), rotY: a.rotY || 0 };
}
