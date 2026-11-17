import * as THREE from 'three';

/**
 * 키 배치 프리셋.
 *  lostark: 마우스 이동(+방향키), 스킬 Q/W/E (1/2/3도 가능)
 *  wasd   : WASD 이동, 스킬 1/2/3 (+Q/E)
 */
export const KEYMAPS = {
  lostark: { label: '로스트아크식 (마우스 이동 · QWE)', move: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] }, skills: { KeyQ: 'pullSlash', KeyW: 'tauten', KeyE: 'release', Digit1: 'pullSlash', Digit2: 'tauten', Digit3: 'release' } },
  wasd: { label: 'WASD 이동 · 123', move: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }, skills: { Digit1: 'pullSlash', Digit2: 'tauten', Digit3: 'release', KeyQ: 'pullSlash', KeyE: 'release' } },
};

/**
 * 입력 → 명령(command) 변환. 게임 상태를 직접 바꾸지 않고 send(cmd) 로만 전달한다.
 * (멀티플레이 시 send 가 서버 전송으로 바뀐다)
 */
export class Input {
  constructor({ canvas, camera, terrain, views, send, hooks, keymap = 'lostark' }) {
    Object.assign(this, { canvas, camera, terrain, views, send, hooks });
    this.keymapId = KEYMAPS[keymap] ? keymap : 'lostark';
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.mouse = { x: 0, y: 0 };
    this.aim = null; // 마우스가 가리키는 지면 좌표
    this.held = { left: false, right: false };
    this.holdTimer = 0;
    this.keys = new Set();
    this.lastDir = { x: 0, z: 0 };
    this.enabled = false;
    // 카메라 기준 방향 (쿼터뷰 고정 방향)
    const f = new THREE.Vector2(-0.62, -0.78).normalize();
    this.fwd = { x: f.x, z: f.y };
    this.right = { x: -f.y, z: f.x };

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.held.left = false; if (e.button === 2) this.held.right = false; });
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.held.left = this.held.right = false; });
  }

  get keymap() { return KEYMAPS[this.keymapId]; }

  typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }

  pick(clientX, clientY) {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hitE = this.ray.intersectObjects(this.views.pickables(), false)[0];
    const hitG = this.ray.intersectObject(this.terrain, false)[0];
    return { entityId: hitE?.object.userData.entityId ?? null, ground: hitG ? { x: hitG.point.x, z: hitG.point.z, y: hitG.point.y } : null };
  }

  onDown(e) {
    if (!this.enabled) return;
    if (this.typing()) document.activeElement.blur();
    const { entityId, ground } = this.pick(e.clientX, e.clientY);
    const ent = entityId != null ? this.hooks.getEntity(entityId) : null;
    if (e.button === 0 || e.button === 2) {
      if (ent?.kind === 'monster' && ent.alive) { this.send({ type: 'attackTarget', targetId: ent.id }); return; }
      if (ent?.kind === 'npc') { this.send({ type: 'setTarget', targetId: ent.id }); this.send({ type: 'interact', id: ent.id }); return; }
      if (ground) {
        this.send({ type: 'moveTo', x: ground.x, z: ground.z });
        this.hooks.onMoveMarker?.(ground);
        if (e.button === 0) this.held.left = true; else this.held.right = true;
        this.holdTimer = 0.12;
      }
    }
  }

  onKey(e, down) {
    if (this.typing()) {
      if (down && e.code === 'Escape') document.activeElement.blur();
      return;
    }
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    if (!down || !this.enabled) return;
    if (e.repeat && !this.keymap.skills[e.code] && e.code !== 'Space') return;
    const skill = this.keymap.skills[e.code];
    if (skill) { e.preventDefault(); this.send({ type: 'skill', skillId: skill, aim: this.aim }); return; }
    switch (e.code) {
      case 'Space': e.preventDefault(); this.send({ type: 'skill', skillId: 'basic', aim: this.aim }); break;
      case 'KeyF': this.hooks.onInteractKey?.(); break;
      case 'Tab': e.preventDefault(); this.hooks.onTabTarget?.(); break;
      case 'Escape': this.hooks.onEscape?.(); break;
      case 'Enter': e.preventDefault(); this.hooks.onChat?.(); break;
      case 'F2': e.preventDefault(); this.toggleKeymap(); break;
      case 'KeyS': if (this.keymapId === 'lostark') this.send({ type: 'stop' }); break;
    }
  }

  toggleKeymap() {
    this.keymapId = this.keymapId === 'lostark' ? 'wasd' : 'lostark';
    this.hooks.onKeymapChange?.(this.keymapId);
  }

  update(dt) {
    if (!this.enabled) return;
    // 지면 조준점 갱신
    // (매 프레임 지형 전체 레이캐스트는 비싸므로 플레이어 높이의 평면과 교차)
    this.ndc.set((this.mouse.x / window.innerWidth) * 2 - 1, -(this.mouse.y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane = this.plane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.plane.constant = -(this.hooks.aimHeight?.() ?? 0);
    const hit = this.ray.ray.intersectPlane(this.plane, this.tmpV || (this.tmpV = new THREE.Vector3()));
    if (hit) this.aim = { x: hit.x, z: hit.z, y: hit.y };
    // 마우스 꾹 누르기 → 계속 커서 방향 이동 (로스트아크식)
    if ((this.held.left || this.held.right) && this.aim) {
      this.holdTimer -= dt;
      if (this.holdTimer <= 0) { this.holdTimer = 0.1; this.send({ type: 'moveTo', x: this.aim.x, z: this.aim.z }); }
    }
    // 키보드 이동 (카메라 기준)
    let dx = 0, dz = 0;
    if (!this.typing()) {
      const m = this.keymap.move, has = (arr) => arr.some((k) => this.keys.has(k));
      const f = (has(m.up) ? 1 : 0) - (has(m.down) ? 1 : 0), r = (has(m.right) ? 1 : 0) - (has(m.left) ? 1 : 0);
      dx = this.fwd.x * f + this.right.x * r; dz = this.fwd.z * f + this.right.z * r;
    }
    if (dx !== this.lastDir.x || dz !== this.lastDir.z) {
      this.lastDir = { x: dx, z: dz };
      this.send({ type: 'moveDir', x: dx, z: dz });
    }
  }
}
