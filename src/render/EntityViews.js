import * as THREE from 'three';
import { heightAt, onBridge, HARVEN } from '../data/zones.js';
import { CharacterModel } from './CharacterModel.js';
import { wrapAngle } from '../core/math.js';
import { FEEL } from '../data/feel.js';
import { SKILLS } from '../data/skills.js';

/**
 * 게임 엔티티(순수 데이터) → 3D 뷰 동기화. 상태를 읽기만 하고 바꾸지 않는다.
 * 애니메이션 상태(이동/기술/피격/사망)는 이벤트와 엔티티 상태에서 CharacterModel 로 전달.
 */
export class EntityViews {
  constructor(scene, game, bus, vfx) {
    this.scene = scene; this.game = game; this.vfx = vfx;
    this.views = new Map();
    this.pickGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.pickMat = new THREE.MeshBasicMaterial({ visible: false });

    bus.on('spawn', ({ id }) => this.create(id));
    bus.on('despawn', ({ id }) => this.destroy(id));
    bus.on('classChanged', ({ id }) => { this.destroy(id); this.create(id); const v = this.views.get(id); if (v) v.born = 1; });
    bus.on('skillCast', ({ id, skillId, windup, recovery, stage }) => this.views.get(id)?.model.playSkill(skillId, { windup, recovery, combo: stage || 0 }));
    bus.on('telegraph', ({ id, time }) => this.views.get(id)?.model.playSkill('mob_attack', { windup: time, recovery: 0.3 }));
    bus.on('damage', ({ targetId, weight, knockdown, crit }) => {
      const v = this.views.get(targetId);
      if (!v) return;
      v.model.hitReact(weight, knockdown);
      const p = this.positionOf(targetId, 0.8 * v.scale);
      vfx.impact(p, v.entity.kind === 'player' ? '#ff8a6a' : crit ? '#fff2b0' : '#ffd27a', FEEL.weight[weight].sparks * (crit ? 1.5 : 1));
    });
    bus.on('death', ({ id }) => {
      const v = this.views.get(id);
      if (!v) return;
      v.dying = 0;
      v.model.die();
      vfx.unravel(this.positionOf(id, 0), v.entity.monsterId === 'unravel_sheep' ? '#ffd98a' : '#b8c8ff', v.model.height * v.scale);
    });
    bus.on('playerRespawn', ({ id }) => { const v = this.views.get(id); if (v) { v.dying = -1; v.model.root.scale.setScalar(1); v.model.revive(); } });
    bus.on('npcInteract', ({ id }) => { const v = this.views.get(id); if (v) v.faceUntil = this.game.time + 6; });

    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff6a4a', transparent: true, opacity: 0.8, depthWrite: false }));
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const arc = 2.4;
    this.blockArc = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 24, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd0ff').multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.blockArc.visible = false;
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.chargeRing.visible = false;
    scene.add(this.targetRing, this.aura, this.blockArc, this.chargeRing);
  }

  create(id) {
    const e = this.game.get(id);
    if (!e || this.views.has(id)) return;
    const model = new CharacterModel(e.modelId, { npcId: e.npcId });
    const scale = e.scale || 1;
    model.root.position.set(e.pos.x, heightAt(e.pos.x, e.pos.z), e.pos.z);
    model.root.rotation.y = e.rot;
    const pick = new THREE.Mesh(this.pickGeo, this.pickMat);
    pick.scale.set(Math.max(0.7, e.radius + 0.3) / scale, model.height, Math.max(0.7, e.radius + 0.3) / scale);
    pick.position.y = model.height / 2;
    pick.userData.entityId = id;
    model.root.add(pick);
    this.scene.add(model.root);
    if (e.kind === 'monster') model.root.scale.setScalar(0.01);
    this.views.set(id, { entity: e, model, pick, dying: -1, born: 0, scale, airY: 0 });
  }

  destroy(id) {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.remove(v.model.root);
    v.model.dispose();
    this.views.delete(id);
  }

  pickables() { const r = []; for (const v of this.views.values()) if (v.dying < 0) r.push(v.pick); return r; }

  positionOf(id, yOffset = 0, out = new THREE.Vector3()) {
    const v = this.views.get(id);
    if (!v) return out.set(0, 0, 0);
    return out.copy(v.model.root.position).setY(v.model.root.position.y + yOffset);
  }

  update(dt, t) {
    const pl = this.game.player();
    const clues = pl?.records?.clues || [];
    for (const v of this.views.values()) {
      const e = v.entity, root = v.model.root;
      // 큰 순간이동(끌어당김·밀침)은 부드럽게, 평상시는 즉시 동기화
      const jx = e.pos.x - root.position.x, jz = e.pos.z - root.position.z;
      if (jx * jx + jz * jz > 0.8 && jx * jx + jz * jz < 400) { const k = Math.min(1, dt * 14); root.position.x += jx * k; root.position.z += jz * k; }
      else { root.position.x = e.pos.x; root.position.z = e.pos.z; }
      let gy = Math.max(heightAt(e.pos.x, e.pos.z), -0.9);
      if (this.game.publicState?.bridgeWalkable() && onBridge(e.pos.x, e.pos.z)) gy = Math.max(gy, HARVEN.bridge.deckY);
      // 띄움: 포물선
      const airT = e.fx?.air > 0 ? e.fx.air / FEEL.knock.airTime : 0;
      v.airY = airT > 0 ? Math.sin(airT * Math.PI) * FEEL.knock.airHeight : Math.max(0, v.airY - dt * 8);
      root.position.y = gy + v.airY;
      // NPC: 대화 중에는 플레이어를 바라본다
      let rot = e.rot;
      if (e.kind === 'npc' && v.faceUntil > this.game.time && pl) rot = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z);
      root.rotation.y += wrapAngle(rot - root.rotation.y) * Math.min(1, dt * (e.kind === 'npc' ? 5 : 14));
      v.model.setLocomotion(e.fx?.block > 0 ? 'block' : e.moving ? 'run' : 'idle');
      if (v.born < 1 && v.dying < 0) { v.born = Math.min(1, v.born + dt * 2.5); root.scale.setScalar(easeOutBack(v.born) * v.scale); }
      if (v.dying >= 0) {
        v.dying += dt;
        if (v.dying > 0.9) { // 쓰러진 뒤 실로 풀려 사라짐
          const k = Math.min(1, (v.dying - 0.9) / 1.2);
          root.scale.set(v.scale * (1 - k * 0.6), v.scale * Math.max(0.01, 1 - k), v.scale * (1 - k * 0.6));
        }
      }
      v.model.update(dt, t);
      if (e.kind === 'node') root.scale.setScalar(this.game.time < e.readyAt ? 0.5 : 1);
      else if (e.kind === 'clue' && v.model.parts.glow) { const found = clues.includes(e.data.id); v.model.parts.glow.visible = !found || Math.sin(t * 2) > 0.6; v.model.parts.glow.position.y = Math.sin(t * 2) * 0.1; }
    }

    // 직업 자원 오라 · 방패 호 · 차지 링 · 대상 링
    const p = pl;
    const pv = p && this.views.get(p.id);
    if (pv) {
      const r = p.res;
      const tv = r.id === 'pigment' ? 0 : r.value / r.max;
      const col = { resolve: '#9fd0ff', marks: '#ffd27a', elements: r.slots?.[r.slots.length - 1] === 'frost' ? '#9fd0ff' : '#ff9a5a', pigment: '#6ad08a' }[r.id];
      this.aura.position.copy(pv.model.root.position).y += 0.06;
      this.aura.material.color.set(col).multiplyScalar(1.6);
      this.aura.material.opacity = p.alive ? tv * 0.6 : 0;
      this.aura.scale.setScalar(1 + tv * 0.4);
      this.blockArc.visible = p.alive && p.fx.block > 0;
      if (this.blockArc.visible) { this.blockArc.position.copy(pv.model.root.position).y += 0.1; this.blockArc.rotation.y = p.rot; this.blockArc.material.opacity = 0.5 + 0.3 * Math.sin(t * 12); }
      const ch = p.charging || p.holding;
      this.chargeRing.visible = !!ch;
      if (ch) {
        const sk = SKILLS[ch.skillId];
        const frac = Math.min(1, (this.game.time - ch.t0) / (sk.charge?.max || sk.hold?.max || 1));
        this.chargeRing.position.copy(pv.model.root.position).y += 0.08;
        this.chargeRing.scale.setScalar(2.2 - frac * 1.2);
        this.chargeRing.material.opacity = 0.4 + frac * 0.6;
      }
      const tgt = this.views.get(p.targetId);
      this.targetRing.visible = !!tgt && tgt.dying < 0;
      if (this.targetRing.visible) {
        this.targetRing.position.copy(tgt.model.root.position).y += 0.07 - tgt.airY;
        const s = Math.max(0.8, tgt.entity.radius + 0.4);
        this.targetRing.scale.setScalar(s * (1 + Math.sin(t * 5) * 0.04));
        const k = tgt.entity.kind;
        this.targetRing.material.color.set(k === 'monster' ? '#ff6a4a' : k === 'cart' || k === 'player' ? '#6ad08a' : '#ffd27a');
      }
    }
  }
}

function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
