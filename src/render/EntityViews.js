import * as THREE from 'three';
import { heightAt } from '../data/zones.js';
import { CharacterModel } from './CharacterModel.js';
import { wrapAngle } from '../core/math.js';

/**
 * 게임 엔티티(순수 데이터) → 3D 뷰 동기화. 로직 상태를 읽기만 하고 바꾸지 않는다.
 */
export class EntityViews {
  constructor(scene, game, bus, vfx) {
    this.scene = scene; this.game = game; this.vfx = vfx;
    this.views = new Map();
    this.pickGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.pickMat = new THREE.MeshBasicMaterial({ visible: false });

    bus.on('spawn', ({ id }) => this.create(id));
    bus.on('despawn', ({ id }) => this.destroy(id));
    bus.on('damage', ({ targetId, crit }) => {
      const v = this.views.get(targetId);
      if (!v) return;
      v.model.flash();
      const p = this.positionOf(targetId, 0.8);
      vfx.threadBurst(p, v.entity.kind === 'player' ? '#ff8a6a' : crit ? '#fff2b0' : '#ffd27a', crit ? 12 : 7, crit ? 1.6 : 1.1);
    });
    bus.on('death', ({ id }) => {
      const v = this.views.get(id);
      if (!v) return;
      v.dying = 0;
      vfx.unravel(this.positionOf(id, 0), v.entity.monsterId === 'unravel_wolf' ? '#b8c8ff' : '#ffd98a', v.model.height);
    });
    bus.on('playerRespawn', ({ id }) => { const v = this.views.get(id); if (v) { v.dying = -1; v.model.root.scale.setScalar(1); } });

    // 대상 표시 링 + 플레이어 장력 오라
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff6a4a', transparent: true, opacity: 0.8, depthWrite: false }));
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(this.targetRing, this.aura);
  }

  create(id) {
    const e = this.game.get(id);
    if (!e || this.views.has(id)) return;
    const model = new CharacterModel(e.modelId);
    model.root.position.set(e.pos.x, heightAt(e.pos.x, e.pos.z), e.pos.z);
    model.root.rotation.y = e.rot;
    const pick = new THREE.Mesh(this.pickGeo, this.pickMat);
    pick.scale.set(Math.max(0.7, e.radius + 0.3), model.height, Math.max(0.7, e.radius + 0.3));
    pick.position.y = model.height / 2;
    pick.userData.entityId = id;
    model.root.add(pick);
    this.scene.add(model.root);
    if (e.kind === 'monster') { model.root.scale.setScalar(0.01); }
    this.views.set(id, { entity: e, model, pick, dying: -1, seq: e.anim.actionSeq, born: 0 });
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
    for (const v of this.views.values()) {
      const e = v.entity, root = v.model.root;
      // 큰 순간이동(끌어베기 등)은 부드럽게 미끄러지듯, 평상시는 즉시 동기화
      const jx = e.pos.x - root.position.x, jz = e.pos.z - root.position.z;
      if (jx * jx + jz * jz > 0.8 && jx * jx + jz * jz < 400) { const k = Math.min(1, dt * 14); root.position.x += jx * k; root.position.z += jz * k; }
      else { root.position.x = e.pos.x; root.position.z = e.pos.z; }
      root.position.y = Math.max(heightAt(e.pos.x, e.pos.z), -0.9);
      root.rotation.y += wrapAngle(e.rot - root.rotation.y) * Math.min(1, dt * 14);
      v.model.setState(e.moving ? 'run' : 'idle');
      if (e.anim.actionSeq !== v.seq) { v.seq = e.anim.actionSeq; v.model.triggerAttack(); }
      // 등장 연출 (실이 감기며 커진다)
      if (v.born < 1 && v.dying < 0) { v.born = Math.min(1, v.born + dt * 2.5); root.scale.setScalar(easeOutBack(v.born)); }
      if (v.dying >= 0) {
        v.dying += dt;
        const k = Math.min(1, v.dying / 1.4);
        root.scale.set(1 - k * 0.6, Math.max(0.01, 1 - k), 1 - k * 0.6);
        root.rotation.y += dt * 4 * k;
      }
      v.model.update(dt, t);
    }

    // 플레이어 장력 오라 & 대상 링
    const p = this.game.player();
    const pv = p && this.views.get(p.id);
    if (pv) {
      const tv = p.tension.value / 100;
      this.aura.position.copy(pv.model.root.position).y += 0.06;
      const atMax = p.tension.maxTime > 0;
      this.aura.material.color.set(atMax ? '#ff5a3a' : tv > 0.7 ? '#ffb05a' : '#ffd27a');
      this.aura.material.opacity = p.alive ? tv * 0.7 * (atMax ? 0.6 + 0.4 * Math.sin(t * 25) : 1) : 0;
      this.aura.scale.setScalar(1 + tv * 0.4 + (atMax ? Math.sin(t * 25) * 0.08 : 0));
      const tgt = this.views.get(p.targetId);
      this.targetRing.visible = !!tgt && tgt.dying < 0;
      if (this.targetRing.visible) {
        this.targetRing.position.copy(tgt.model.root.position).y += 0.07;
        const s = Math.max(0.8, tgt.entity.radius + 0.4);
        this.targetRing.scale.setScalar(s * (1 + Math.sin(t * 5) * 0.04));
        this.targetRing.material.color.set(tgt.entity.kind === 'npc' ? '#ffd27a' : '#ff6a4a');
      }
    }
  }
}

function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
