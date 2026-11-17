import { CLASSES, statsFor } from '../data/classes.js';
import { MONSTERS } from '../data/monsters.js';
import { NPCS } from '../data/npcs.js';

/**
 * 엔티티 = 순수 데이터 (컴포넌트 묶음). three.js 객체를 넣지 않는다 → 직렬화/네트워크 전송 가능.
 * kind: player | monster | npc | cart | node | clue | station
 */
function baseEntity(id, kind, name, x, z) {
  return {
    id, kind, name,
    pos: { x, z }, rot: 0, radius: 0.5,
    alive: true, hp: 1, level: 1,
    stats: { maxHp: 1, atk: 1, def: 0, moveSpeed: 3, critChance: 0 },
    moving: false, lastMoveT: -99,
    stun: 0, actionLock: 0, cooldowns: {},
    fx: {}, // 상태 효과: block, guard, protect, slow, root, bleed, hot, iframes, dash
    anim: { state: 'idle', action: null, actionSeq: 0, hitSeq: 0 }, // 렌더 힌트
  };
}

export function createPlayer(id, { name, origin, classId, character }) {
  const cls = CLASSES[classId] || CLASSES.guardian;
  const e = baseEntity(id, 'player', name, 0, 0);
  e.origin = origin;
  e.level = character?.level ?? 1;
  e.xp = character?.xp ?? 0;
  e.gold = character?.gold ?? 20;
  e.inventory = { ...(character?.inventory || {}) };
  e.affiliation = character?.affiliation ?? null; // null | 'league' | 'independent'
  e.radius = 0.45;
  e.move = { target: null, dir: { x: 0, z: 0 } };
  e.targetId = null;
  e.attackTargetId = null;
  e.interactId = null;
  e.channel = null; // { targetId, t, dur, kind }
  e.respawnAt = 0;
  e.lastCombat = -99;
  setClass(e, cls.id);
  e.hp = Math.min(character?.hp ?? e.stats.maxHp, e.stats.maxHp);
  if (e.hp <= 0) e.hp = e.stats.maxHp;
  return e;
}

/** 직업 적용 (생성·안전 거점 변경 공용). 레벨·기록·소지품은 유지 */
export function setClass(e, classId) {
  const cls = CLASSES[classId];
  e.classId = classId;
  e.modelId = cls.modelId;
  e.skills = { ...cls.skills };
  const ratio = e.stats?.maxHp > 1 ? e.hp / e.stats.maxHp : 1;
  e.stats = statsFor(classId, e.level);
  e.hp = Math.max(1, Math.round(e.stats.maxHp * ratio));
  e.res = { id: cls.resource.id, value: cls.resource.start, max: cls.resource.max, slots: [], lastGain: -99, counterUntil: -99 };
  e.cooldowns = {};
}

export function createMonster(id, monsterId, level, home, rng, tag = null) {
  const def = MONSTERS[monsterId];
  const e = baseEntity(id, 'monster', def.name, home.x, home.z);
  e.monsterId = monsterId;
  e.modelId = def.modelId;
  e.level = level;
  e.tag = tag;
  e.stats = { maxHp: Math.round(def.hp(level)), atk: def.atk(level), def: def.def(level), moveSpeed: def.moveSpeed, critChance: 0.05 };
  e.hp = e.stats.maxHp;
  e.radius = def.radius;
  e.rot = rng() * Math.PI * 2;
  e.home = { x: home.x, z: home.z };
  e.ai = { state: 'idle', timer: 1 + rng() * 3, targetId: null, wander: null, windup: 0, attackCd: 0 };
  e.marks = { n: 0, until: 0 }; // 매듭궁수 표식
  e.threat = new Map();
  return e;
}

export function createNpc(id, npcId) {
  const def = NPCS[npcId];
  const e = baseEntity(id, 'npc', def.name, def.pos.x, def.pos.z);
  e.npcId = npcId;
  e.modelId = def.modelId;
  e.rot = def.rot;
  e.radius = 0.6;
  return e;
}

/** 호송 수레: 아군(보호 대상). 체력을 가진다. */
export function createCart(id, pos) {
  const e = baseEntity(id, 'cart', '식량 수레', pos.x, pos.z);
  e.modelId = 'prop_cart';
  e.stats = { maxHp: 420, atk: 0, def: 2, moveSpeed: 2.3, critChance: 0 }; // 검증 전 예시
  e.hp = e.stats.maxHp;
  e.radius = 1.1;
  e.ally = true;
  e.waypoint = 0;
  return e;
}

/** 상호작용 지점: 채집 더미 / 조사 단서 / 작업대 */
export function createInteractable(id, kind, data) {
  const e = baseEntity(id, kind, data.name, data.x, data.z);
  e.modelId = kind === 'node' ? (data.item === 'lumber' ? 'prop_lumber' : 'prop_wreck') : kind === 'clue' ? 'prop_clue' : 'prop_workbench';
  e.data = data;
  e.radius = kind === 'station' ? 1.0 : 0.7;
  e.readyAt = 0; // 채집 더미 재생성 시각
  return e;
}
