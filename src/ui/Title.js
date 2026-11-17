import { Save } from '../core/Save.js';

const $ = (id) => document.getElementById(id);

/** 타이틀 화면. 이름을 받아 { name, save } 로 resolve 한다. */
export function showTitle() {
  return new Promise((resolve) => {
    const save = Save.load();
    const input = $('name-input'), start = $('start-btn'), fresh = $('new-btn');
    $('loading').classList.add('hidden');
    if (save?.name) {
      input.value = save.name;
      start.textContent = `이어하기 (Lv ${save.level})`;
      fresh.classList.remove('hidden');
    }
    input.focus();
    let done = false;
    const go = (useSave) => {
      if (done) return;
      const name = (input.value || '').trim().slice(0, 12) || '이름 없는 수선공';
      done = true;
      $('title').classList.add('fade');
      input.blur();
      setTimeout(() => $('title').classList.add('hidden'), 800);
      resolve({ name, save: useSave && save?.name === name ? save : useSave && save ? { ...save, name } : null });
    };
    start.addEventListener('click', () => go(true));
    fresh.addEventListener('click', () => { Save.clear(); go(false); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); go(true); } });
  });
}
