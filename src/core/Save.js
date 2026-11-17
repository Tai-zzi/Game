const KEY = 'bernel.save.v1';
const SETTINGS_KEY = 'bernel.settings.v1';

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch (e) { console.warn('[Save] 읽기 실패', e); return null; }
}
function write(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch (e) { console.warn('[Save] 쓰기 실패', e); return false; }
}

export const Save = {
  load: () => read(KEY),
  save: (data) => write(KEY, { ...data, savedAt: Date.now(), version: 1 }),
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* 무시 */ } },
  loadSettings: () => read(SETTINGS_KEY) || {},
  saveSettings: (s) => write(SETTINGS_KEY, s),
};
