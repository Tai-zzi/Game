import { Save } from '../core/Save.js';
import { ORIGINS, ORIGIN_ORDER } from '../data/origins.js';
import { CLASSES } from '../data/classes.js';
import { ARCHETYPES, ARCHETYPE_ORDER, ADVANCE_LEVEL } from '../data/archetypes.js';
import { MIXAMO_SKINS } from '../data/animations.js';
import * as THREE from 'three';
import { CLASS_PREVIEW, AI_CONCEPT_DIR } from '../data/aiAssets.js';
import { AiAssets } from '../render/AiAssets.js';
import { CharacterModel } from '../render/CharacterModel.js';

const BASE = import.meta.env.BASE_URL;

/** 캐릭터 생성 턴테이블: AI 직업 모델(정적)이 있으면 그것을, 없으면 리그 모델(대기 동작)을 돌려 보여준다 */
class Turntable {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#fff0dc', '#3a3030', 1.6));
    const key = new THREE.DirectionalLight('#ffd7a0', 2.4); key.position.set(2, 3, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fb7ff', 1.4); rim.position.set(-3, 2, -3); this.scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.18 }));
    this.scene.add(disc);
    this.camera = new THREE.PerspectiveCamera(30, 230 / 300, 0.1, 50);
    this.camera.position.set(0, 1.2, 4.6); this.camera.lookAt(0, 0.9, 0);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.clock = new THREE.Clock();
    this.alive = true;
    const loop = () => { if (!this.alive) return; this.frame(); requestAnimationFrame(loop); };
    loop();
  }
  /** 리그 모델(Mixamo 실사)이 있으면 그것을, 없으면 AI 정적 미리보기를 돌린다 */
  async show(classId) {
    this.want = classId;
    this.pivot.clear(); this.model = null;
    const modelId = CLASSES[classId].modelId;
    if (!MIXAMO_SKINS[modelId]) {
      const ai = await AiAssets.instance(CLASS_PREVIEW[classId]);
      if (this.want !== classId) return;
      if (ai) { this.pivot.add(ai); return 'ai'; }
    }
    this.model = new CharacterModel(modelId);
    this.pivot.add(this.model.root);
    return 'rig';
  }
  frame() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (w && (this.w !== w || this.h !== h)) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    const dt = this.clock.getDelta();
    this.pivot.rotation.y += dt * 0.6;
    this.model?.update(dt, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { this.alive = false; this.renderer.dispose(); this.renderer.domElement.remove(); }
}

const $ = (id) => document.getElementById(id);

/**
 * 타이틀 + 캐릭터 생성 (이름 · 출신 · 전투 직업).
 * resolve({ profile: { name, origin, classId }, save })
 * 선택받은 자·유일한 계승자 같은 도입은 쓰지 않는다 (v0.3 §9.1).
 */
export function showTitle() {
  return new Promise((resolve) => {
    const save = Save.load();
    $('loading').classList.add('hidden');
    let origin = 'farm', archetype = 'tank';
    const ARCH_PREVIEW = { common: 'dyer', blade: 'guardian', tank: 'guardian', ranged: 'archer', mage: 'elementalist' };
    let tt = null;
    const showModel = () => {
      tt ||= new Turntable($('turntable'));
      const nov = CLASSES[ARCHETYPES[archetype].novice];
      $('turntable-cap').textContent = `${nov.name} · ${nov.weapon}`;
      tt.show(nov.id);
    };
    const finish = (profile, s) => {
      tt?.dispose();
      $('title').classList.add('fade');
      document.activeElement?.blur();
      setTimeout(() => $('title').classList.add('hidden'), 800);
      resolve({ profile, save: s });
    };

    const showCreate = (fromSave = null) => {
      $('title-continue').classList.add('hidden');
      $('title-create').classList.remove('hidden');
      if (fromSave?.needsProfile) {
        const n = $('migrate-note');
        n.classList.remove('hidden');
        n.textContent = `이전 버전 기록을 찾았습니다. 게임 설계가 바뀌어 ‘견습 수선공’ 공통 직업과 장로 의뢰는 사라졌습니다. 이름과 레벨(Lv ${fromSave.character.level})은 이어집니다. 출신과 직업을 골라 주세요.`;
        $('name-input').value = fromSave.character.name;
      }
      renderChoices();
      showModel();
      $('name-input').focus();
    };

    const renderChoices = () => {
      $('origin-list').innerHTML = ORIGIN_ORDER.map((id) => {
        const o = ORIGINS[id];
        return `<button class="choice ${id === origin ? 'on' : ''}" data-origin="${id}"><b>${o.name}</b><small>${o.desc}</small></button>`;
      }).join('');
      $('class-list').innerHTML = ARCHETYPE_ORDER.map((id) => {
        const a = ARCHETYPES[id];
        const adv = a.advances?.length ? a.advances.map((x) => (x.playable ? `<u>${x.name}</u>` : x.name)).join(' · ') : '전직 없음 — 생업 중심';
        return `<button class="choice ${id === archetype ? 'on' : ''}" data-arch="${id}" style="background-image:url(${BASE}${AI_CONCEPT_DIR}${CLASS_PREVIEW[ARCH_PREVIEW[id]]}.webp)"><b>${a.icon || ''} ${a.name}</b><em>${CLASSES[a.novice].name}</em>
          <small>${a.desc}</small><small>Lv ${ADVANCE_LEVEL} 전직: ${adv}</small></button>`;
      }).join('');
    };
    $('title-create').addEventListener('click', (e) => {
      const b = e.target.closest('button.choice');
      if (!b) return;
      if (b.dataset.origin) origin = b.dataset.origin;
      if (b.dataset.arch && b.dataset.arch !== archetype) { archetype = b.dataset.arch; showModel(); }
      renderChoices();
    });
    $('start-btn').addEventListener('click', () => {
      const name = ($('name-input').value || '').trim().slice(0, 12) || '이름 없는 여행자';
      const s = save?.needsProfile ? { ...save, needsProfile: false, character: { ...save.character, name } } : null;
      finish({ name, origin, archetype, classId: ARCHETYPES[archetype].novice }, s);
    });
    $('name-input').addEventListener('keydown', (e) => e.stopPropagation());

    if (save && !save.needsProfile) {
      const c = save.character;
      $('title-continue').classList.remove('hidden');
      $('continue-info').innerHTML = `<b>${c.name}</b> · Lv ${c.level} ${CLASSES[c.classId]?.name || ''}<br><small>${ORIGINS[c.origin]?.name || ''}</small>`;
      $('continue-btn').addEventListener('click', () => finish({ name: c.name, origin: c.origin, classId: c.classId }, save));
      $('new-btn').addEventListener('click', () => { Save.clear(); showCreate(); });
    } else showCreate(save);
  });
}
