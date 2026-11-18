const KEY = 'bernel.save.v1'; // 키는 유지하고 내부 version 으로 구분 (구 저장 이관을 위해)
const SETTINGS_KEY = 'bernel.settings.v1';
export const CURRENT_VERSION = 3;

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch (e) { console.warn('[Save] 읽기 실패', e); return null; }
}
function write(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch (e) { console.warn('[Save] 쓰기 실패', e); return false; }
}

/**
 * 구 저장 이관.
 *  v1 (Phase 1): { name, classId:'apprentice', level, xp, hp, pos, inventory, quests }
 *   → v2: 이름·레벨·경험치·실뭉치만 유지. 출신·직업은 다시 고른다 (needsProfile).
 *     '견습 수선공' 강제 직업과 장로 퀘스트는 v0.3에서 폐기되었으므로 버린다.
 *  알 수 없는 형식 → null (새로 시작)
 */
export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version === CURRENT_VERSION && raw.character?.name) return raw;
  // v2 → v3: 관계 축(친밀·교감·반감·신뢰) 도입 · 히든 퀘스트 · 탐험 기록 · NPC 시계. 관계는 기억 태그에서 추정, 나머지는 새로 시작
  if (raw.version === 2 && raw.character?.name) return { ...raw, version: CURRENT_VERSION, migratedFrom: 2 };
  if ((raw.version === 1 || raw.version == null) && typeof raw.name === 'string') {
    return {
      version: CURRENT_VERSION, needsProfile: true, migratedFrom: 1, savedAt: raw.savedAt,
      character: { name: raw.name, level: raw.level || 1, xp: raw.xp || 0, gold: 20, inventory: raw.inventory?.thread_ball ? { thread_ball: raw.inventory.thread_ball } : {} },
      personal: null, public: null, world: null,
    };
  }
  return null;
}

export const Save = {
  load: () => migrateSave(read(KEY)),
  save: (data) => write(KEY, { ...data, savedAt: Date.now(), version: CURRENT_VERSION }),
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* 무시 */ } },
  loadSettings: () => read(SETTINGS_KEY) || {},
  saveSettings: (s) => write(SETTINGS_KEY, s),
};
