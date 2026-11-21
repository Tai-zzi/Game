import * as THREE from 'three';
import { heightAt } from '../data/zones.js';

/** 화면 광선이 지형과 만나는 점 (높이 함수로 행진 — 청크 지형과 무관하게 정확) */
function rayGround(ray) {
  const o = ray.origin, d = ray.direction;
  let prev = 0;
  for (let t = 0; t < 400; t += 0.8) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < heightAt(x, z)) {
      let a = prev, b = t;
      for (let k = 0; k < 8; k++) { const m = (a + b) / 2; const yy = o.y + d.y * m; if (yy < heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      return { x: o.x + d.x * b, y: o.y + d.y * b, z: o.z + d.z * b };
    }
    prev = t;
  }
  return null;
}

/**
 * 키 배치 프리셋 (W 충돌 해결: 이동 방식에 따라 기술 줄 전체를 옮긴다)
 *  lostark: 마우스 이동(+방향키) · 기술 Q W E R / A S D F · 각성 V · 기본 공격 C(또는 적 좌클릭) · 구르기 Space · 상호작용 G
 *  wasd   : WASD 이동 · 기술 1~8 · 각성 X · 기본 공격 Z(또는 적 좌클릭) · 구르기 Space · 상호작용 G
 * 공통: Shift 질주, T 회복약, I 소지품, M 지도, K 인연, Tab 대상, F2 배치 전환, F3 그래픽 품질, F9 타격감 시험 허수아비
 */
export const KEYMAPS = {
  lostark: { label: '로스트아크식 (마우스 이동 · QWER/ASDF)', move: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] },
    slots: { KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyV: 'ult', KeyC: 'basic', Space: 'dodge' } },
  wasd: { label: 'WASD 이동 · 기술 1~8', move: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] },
    slots: { Digit1: 'q', Digit2: 'w', Digit3: 'e', Digit4: 'r', Digit5: 'a', Digit6: 's', Digit7: 'd', Digit8: 'f', KeyX: 'ult', KeyZ: 'basic', Space: 'dodge' } },
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
    this.heldSlots = new Set();
    this.aimSendT = 0;
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
    window.addEventListener('blur', () => { for (const s of this.heldSlots) this.send({ type: 'skillRelease', slot: s }); this.heldSlots.clear(); this.keys.clear(); this.held.left = this.held.right = false; });
  }

  get keymap() { return KEYMAPS[this.keymapId]; }

  typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }

  pick(clientX, clientY) {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hitE = this.ray.intersectObjects(this.views.pickables(), false)[0];
    const hitG = rayGround(this.ray.ray);
    return { entityId: hitE?.object.userData.entityId ?? null, ground: hitG };
  }

  onDown(e) {
    if (!this.enabled) return;
    if (this.typing()) document.activeElement.blur();
    const { entityId, ground } = this.pick(e.clientX, e.clientY);
    const ent = entityId != null ? this.hooks.getEntity(entityId) : null;
    if (e.button === 0 || e.button === 2) {
      if (ent?.kind === 'monster' && ent.alive) { this.send({ type: 'attackTarget', targetId: ent.id }); return; }
      if (ent && ['npc', 'node', 'clue', 'station'].includes(ent.kind)) { this.send({ type: 'setTarget', targetId: ent.kind === 'npc' ? ent.id : null }); this.send({ type: 'interact', id: ent.id }); return; }
      if (ent?.kind === 'cart') { this.send({ type: 'setTarget', targetId: ent.id }); }
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
    if (!this.enabled) return;
    const slot = this.keymap.slots[e.code];
    if (!down && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) { this.send({ type: 'sprint', on: false }); return; }
    if (!down) { // 차지·유지 기술은 놓을 때
      if (slot && this.heldSlots.has(slot)) { this.heldSlots.delete(slot); this.send({ type: 'skillRelease', slot, aim: this.aim }); }
      return;
    }
    if (e.repeat) { if (slot) e.preventDefault(); return; }
    if (slot) { e.preventDefault(); this.heldSlots.add(slot); this.send({ type: 'skill', slot, aim: this.aim }); return; }
    switch (e.code) {
      case 'KeyI': this.hooks.onInventory?.(); break;
      case 'KeyG': this.hooks.onInteractKey?.(); break;
      case 'KeyM': this.hooks.onMap?.(); break;
      case 'KeyK': this.hooks.onBonds?.(); break;
      case 'F9': e.preventDefault(); this.send({ type: 'debugDummy' }); break;
      case 'ShiftLeft': case 'ShiftRight': this.send({ type: 'sprint', on: true }); break;
      case 'KeyT': this.send({ type: 'quickPotion' }); break;
      case 'F3': e.preventDefault(); this.hooks.onQuality?.(); break;
      case 'Tab': e.preventDefault(); this.hooks.onTabTarget?.(); break;
      case 'Escape': this.hooks.onEscape?.(); break;
      case 'Enter': e.preventDefault(); this.hooks.onChat?.(); break;
      case 'F2': e.preventDefault(); this.toggleKeymap(); break;
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
    if (this.heldSlots.size && this.aim) { this.aimSendT -= dt; if (this.aimSendT <= 0) { this.aimSendT = 0.1; this.send({ type: 'aim', x: this.aim.x, z: this.aim.z }); } }
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
