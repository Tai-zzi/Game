import { SKILLS, TENSION } from '../data/skills.js';
import { xpToNext, CLASSES } from '../data/classes.js';
import { MONSTERS } from '../data/monsters.js';
import { NPCS } from '../data/npcs.js';
import { QUESTS } from '../data/quests.js';

const $ = (id) => document.getElementById(id);

/** 한국어 HUD. 게임 상태를 읽어서 그리기만 하며, 변경이 있을 때만 DOM을 갱신한다. */
export class HUD {
  constructor(game, bus, { onSkillClick, onChat }) {
    this.game = game;
    this.cache = {};
    this.root = $('hud');
    this.logEl = $('log');
    this.buildSkillbar(onSkillClick);

    bus.on('log', ({ text, kind }) => this.log(text, kind));
    bus.on('levelUp', ({ level }) => this.banner(`Lv ${level}`, '실이 한 겹 더 단단해졌습니다'));
    bus.on('skillFail', ({ reason }) => this.toast(reason));
    bus.on('snap', () => this.toast('장력이 끊어졌다!'));
    bus.on('questUpdate', () => { this.cache.quest = null; });
    bus.on('skillCast', ({ skillId, id }) => {
      if (id !== game.playerId) return;
      const el = this.skillEls[skillId];
      if (el) { el.root.classList.remove('flash'); void el.root.offsetWidth; el.root.classList.add('flash'); }
    });

    const chat = $('chat-input');
    chat.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const v = chat.value.trim();
        if (v) onChat(v);
        chat.value = '';
        chat.blur();
      }
    });
  }

  show() { this.root.classList.remove('hidden'); }
  focusChat() { $('chat-input').focus(); }

  buildSkillbar(onClick) {
    const bar = $('skillbar');
    this.skillEls = {};
    const order = ['basic', 'pullSlash', 'tauten', 'release'];
    for (const id of order) {
      const sk = SKILLS[id];
      const root = document.createElement('div');
      root.className = 'skill';
      root.innerHTML = `<span class="key"></span>${sk.icon}<div class="cd"></div><span class="cdt"></span>
        <div class="tip"><b>${sk.name}</b><br>${sk.desc}<br><small>재사용 ${sk.cooldown}초</small></div>`;
      root.addEventListener('mousedown', (e) => { e.stopPropagation(); onClick(id); });
      bar.appendChild(root);
      this.skillEls[id] = { root, key: root.querySelector('.key'), cd: root.querySelector('.cd'), cdt: root.querySelector('.cdt') };
    }
  }

  setKeymap(keymap) {
    const inv = {};
    for (const [code, id] of Object.entries(keymap.skills)) if (!inv[id]) inv[id] = code.replace('Key', '').replace('Digit', '');
    this.skillEls.basic.key.textContent = 'Spc';
    for (const id of ['pullSlash', 'tauten', 'release']) this.skillEls[id].key.textContent = inv[id] || '';
    const move = keymap.move.up.includes('KeyW') ? 'WASD 이동' : '우클릭/좌클릭 이동 · 꾹 누르면 계속 이동';
    $('keyhint').innerHTML = `${move}<br>좌클릭 적: 공격 · Tab 대상 선택 · F 대화<br>휠: 확대/축소 · Enter 채팅 · F2 키 배치 (${keymap.label})`;
  }

  log(text, kind = 'system') {
    const line = document.createElement('div');
    line.className = kind;
    const t = new Date();
    line.textContent = `[${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}] ${text}`;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 120) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  banner(title, sub) {
    const b = $('banner');
    b.innerHTML = `${title}<small>${sub}</small>`;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 2500);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), 1300);
  }

  set(key, value, fn) { if (this.cache[key] !== value) { this.cache[key] = value; fn(value); } }

  update() {
    const g = this.game, p = g.player();
    if (!p) return;
    // 플레이어
    this.set('name', p.name, (v) => { $('pf-name').textContent = v; });
    this.set('lvl', p.level, (v) => { $('pf-level').textContent = `Lv ${v}`; });
    this.set('cls', p.classId, (v) => { document.querySelector('.pf-class').textContent = `${CLASSES[v].name} · 수선공 연맹`; });
    const hp = Math.ceil(p.hp);
    this.set('hp', `${hp}/${p.stats.maxHp}`, (v) => { $('pf-hp').style.width = `${(hp / p.stats.maxHp) * 100}%`; $('pf-hp-text').textContent = v; });
    // 장력
    const tv = Math.round(p.tension.value);
    this.set('ten', tv, (v) => { $('tension-fill').style.width = `${v}%`; $('tension-value').textContent = v; });
    const tcls = p.tension.maxTime > 0 ? 'max' : tv >= 75 ? 'high' : '';
    this.set('tcls', tcls, (v) => { $('tension-wrap').className = v; });
    // 경험치
    const need = xpToNext(p.level);
    this.set('xp', `${p.xp}/${need}`, (v) => { $('xp-fill').style.width = `${(p.xp / need) * 100}%`; $('xp-text').textContent = `경험치 ${v}`; });
    // 스킬 쿨다운
    for (const [id, el] of Object.entries(this.skillEls)) {
      const cd = p.cooldowns[id] || 0, max = SKILLS[id].cooldown;
      const pct = cd > 0 ? Math.round((cd / max) * 100) : 0;
      this.set(`cd_${id}`, pct, (v) => { el.cd.style.setProperty('--p', `${v}%`); });
      this.set(`cdt_${id}`, cd > 0.05 && max > 1 ? cd.toFixed(cd < 1 ? 1 : 0) : '', (v) => { el.cdt.textContent = v; });
      const dis = !p.alive || p.stun > 0 || (SKILLS[id].minTension && p.tension.value < SKILLS[id].minTension);
      this.set(`dis_${id}`, !!dis, (v) => el.root.classList.toggle('disabled', v));
    }
    // 대상
    const t = g.get(p.targetId);
    const tKey = t ? `${t.id}:${Math.ceil(t.hp)}:${t.alive}` : '';
    this.set('target', tKey, () => {
      const tf = $('target-frame');
      if (!t || (t.kind === 'monster' && !t.alive)) { tf.classList.add('hidden'); return; }
      tf.classList.remove('hidden');
      tf.classList.toggle('npc', t.kind === 'npc');
      $('tf-name').textContent = t.name;
      $('tf-level').textContent = t.kind === 'monster' ? `Lv ${t.level}` : 'NPC';
      $('tf-kind').textContent = t.kind === 'monster' ? `${MONSTERS[t.monsterId].kind} · 실이 풀려가는 생명` : NPCS[t.npcId].title;
      $('tf-hp').style.width = `${(t.hp / t.stats.maxHp) * 100}%`;
      $('tf-hp-text').textContent = t.kind === 'monster' ? `${Math.ceil(t.hp)} / ${t.stats.maxHp}` : '';
    });
    // 사망
    this.set('dead', !p.alive, (v) => $('death-screen').classList.toggle('hidden', !v));
    // 좌표
    this.set('coords', `${Math.round(p.pos.x)}, ${Math.round(p.pos.z)}`, (v) => { $('coords').textContent = v; });
    // 퀘스트 추적기
    const qKey = JSON.stringify([p.quests, p.inventory]);
    this.set('quest', qKey, () => this.renderQuests(p));
  }

  renderQuests(p) {
    const q = this.game.quests;
    const html = Object.keys(p.quests.active).map((qid) => {
      const objs = q.objectiveProgress(p, qid).map((o) => `<div class="qt-obj ${o.have >= o.count ? 'done' : ''}">· ${o.label} ${o.have}/${o.count}</div>`).join('');
      const ready = q.status(p, qid) === 'ready' ? `<div class="qt-ready">▶ ${NPCS[QUESTS[qid].giver].name}에게 보고하기</div>` : '';
      return `<div class="qt-quest"><div class="qt-title">${QUESTS[qid].name}</div>${objs}${ready}</div>`;
    }).join('');
    $('quest-tracker').innerHTML = html;
  }
}
