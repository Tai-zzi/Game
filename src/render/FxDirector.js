import * as THREE from 'three';
import { FEEL } from '../data/feel.js';
import { SKILLS } from '../data/skills.js';
import { heightAt } from '../data/zones.js';
import { Sfx, rumble } from '../core/Sfx.js';

/**
 * 타격감 연출 감독. 로직 이벤트(damage, groggy, death …)를 받아
 * 입자(풀)·카메라·후처리·소리·진동·연타 표시를 FEEL 값대로 조립한다.
 * 판정에는 관여하지 않는다 (서버 권위와 무관한 표현 계층).
 */
export class FxDirector {
  constructor({ bus, game, views, renderer, particles, hooks }) {
    Object.assign(this, { bus, game, views, renderer, P: particles, hooks });
    this.pid = game.playerId;
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3();
    this.combo = { n: 0, t: 0, best: 0 };
    this.comboEl = document.getElementById('combo');
    this.letterbox = document.getElementById('letterbox');
    this.ghostT = 0; this.heartT = 0; this.gatherT = 0;
    this.lastCrit = 0;

    bus.on('damage', (d) => this.onDamage(d));
    bus.on('groggy', ({ id }) => this.onGroggy(id));
    bus.on('counter', ({ id }) => { this.at(id, 1, this.v); this.P.shockwave(this.v, '#5ab8ff', 4); this.P.sparks(this.v, null, 26, '#9fd8ff', { speed: 9 }); this.renderer.ripple(this.v, 1); });
    bus.on('chargeStart', ({ id, max }) => { if (id === this.pid) Sfx.chargeStart(max); });
    bus.on('chargeRelease', ({ id, frac }) => { if (id !== this.pid) return; Sfx.chargeStop(); Sfx.play('release'); this.at(id, 1.1, this.v); this.P.flash(this.v, '#fff3c0', 1.5 + frac * 2.5); this.renderer.addPunch(0.3 + frac); });
    bus.on('interrupt', () => Sfx.chargeStop());
    bus.on('holdEnd', () => Sfx.chargeStop());
    bus.on('ultimate', ({ id }) => { if (id === this.pid) this.cinematic(); });
    bus.on('areaHit', ({ ult, at }) => { if (ult) { this.renderer.impactFrame(FEEL.cinematic.impactFrames); this.v.set(at.x, heightAt(at.x, at.z), at.z); this.P.shockwave(this.v, '#fff3c0', 9, 0.7); this.renderer.ripple(this.v, 1.5); Sfx.play('boom'); } });
    bus.on('skillStrike', (s) => this.onStrike(s));
    bus.on('positional', () => Sfx.play('ting', null, { jitter: 0.1 }));
    views.onLand = (v) => { this.v.copy(v.model.root.position); this.P.puff(this.v, 12, '#c8b898', { size: 0.7, speed: 2.2, rise: 0.5 }); this.P.shockwave(this.v, '#e8d8b8', 1.6, 0.3); Sfx.play('knockdown', null, { jitter: 0.1 }); };
    views.onUnravel = (v) => {
      const mat = FEEL.materials[v.entity.monsterId] || FEEL.materials.unravel_sheep;
      this.v.copy(v.model.root.position); this.v.y += 0.7 * v.scale;
      this.P.threadBits(this.v, 18 * v.scale, mat.thread, { speed: 2.4, life: 1.6 });
      Sfx.play('threadSnap', null, { jitter: 0.2 });
    };
  }

  at(id, y, out) { return this.views.positionOf(id, y, out); }

  onDamage({ sourceId, targetId, amount, crit, weight, killing, knockdown, air, groggy, blocked, dir, skillId }) {
    const W = FEEL.weight[weight] || FEEL.weight.light, F = FEEL.fx;
    const view = this.views.views.get(targetId);
    if (!view) return;
    const tgt = view.entity, src = this.game.get(sourceId);
    const hit = this.at(targetId, 0.9 * view.scale, this.v);
    // 플레이어가 맞음
    if (targetId === this.pid) {
      this.renderer.addShake(FEEL.playerHit.shake);
      if (!blocked) { this.renderer.flashEdge(FEEL.playerHit.flashColor, FEEL.playerHit.flash); Sfx.play('hurt', null, { jitter: 0.1 }); this.P.sparks(hit, null, 6, '#ff6a4a', { speed: 4 }); }
      else { Sfx.play('block', null, { jitter: 0.1 }); this.P.sparks(hit, null, 10, '#cfe6ff', { speed: 6 }); }
      rumble(FEEL.rumble[weight] || FEEL.rumble.light);
      return;
    }
    if (sourceId !== this.pid) return;
    const cls = FEEL.classFx[src?.classId] || FEEL.classFx.guardian;
    const sk = SKILLS[skillId];
    const color = sk?.element ? FEEL.elementColors[sk.element] : (sk?.color || cls.trail);
    // ① 충돌 섬광 별 (피해량 비례)
    this.P.flash(hit, crit ? '#ffe08a' : color, (F.flashSize[weight] || 1) + amount * F.flashPerDamage);
    // ② 늘어나는 불꽃 (맞은 방향으로)
    this.P.sparks(hit, dir, W.sparks * (crit ? 1.6 : 1), crit ? '#ffe9a8' : '#fff1d0', { speed: 6 + (weight === 'heavy' ? 4 : 0) });
    // ③ 금빛 실 조각 (세계의 상징) + 재질별 입자
    const mat = FEEL.materials[tgt.monsterId] || FEEL.materials.unravel_sheep;
    this.P.threadBits(hit, F.threadsPerHit[weight], mat.thread);
    if (mat.puff) this.P.puff(hit, weight === 'heavy' ? 8 : 4, mat.puff, { size: mat.puffSize, speed: 1.8, rise: 0.8, gravity: 1.2 });
    if (mat.stitch) this.P.sparks(hit, dir, 4, mat.stitch, { speed: 4, gravity: 10 });
    if (mat.shard) this.P.sparks(hit, dir, weight === 'heavy' ? 14 : 6, mat.shard, { speed: 8, gravity: 18, life: 0.7 });
    // ④ 직업별 흔적
    if (src?.classId === 'dyer') { this.v2.copy(hit); this.v2.y = heightAt(hit.x, hit.z); this.P.decal(this.v2, '#5ab87a', 1 + Math.random() * 0.8, 1 + Math.random() * 0.8, Math.random() * 6, 4, 0.45); this.P.puff(hit, 5, '#6ad08a', { size: 0.35, speed: 2, rise: 0.4, gravity: 6 }); }
    if (src?.classId === 'archer' && sk?.type === 'projectile') { this.P.flash(hit, '#ffe08a', 0.7); this.P.sparks(hit, dir, 3, '#ffd24a', { speed: 2, spread: 0.1, gravity: 0, life: 0.6 }); }
    // ⑤ 밀려남: 먼지 + 미끄러짐 자국
    if (!tgt.superArmor || tgt.groggy > 0) {
      this.v2.copy(hit); this.v2.y = heightAt(hit.x, hit.z);
      this.P.puff(this.v2, weight === 'light' ? 3 : 7, '#c8b898', { size: 0.5, speed: 1.4, rise: 0.3 });
      if (F.slideMarks && weight !== 'light' && dir) this.P.decal(this.v2, '#4a3a2a', 0.5, W.push * 1.6, Math.atan2(dir.x, dir.z), 2.5, 0.35);
    }
    // ⑥ 무거운 타격: 바닥 충격파 + 화면 물결 + 색수차
    if (weight === 'heavy') {
      this.v2.copy(hit); this.v2.y = heightAt(hit.x, hit.z);
      this.P.shockwave(this.v2, color, F.shockwave.heavy);
      if (this.renderer.quality === 'high') this.renderer.ripple(hit, F.ripple);
      this.renderer.pulseChroma(FEEL.chroma.heavy);
    }
    // ⑦ 카메라: 가벼우면 방향 킥, 무거우면 트라우마 + 펀치
    if (dir) this.renderer.kick(dir, FEEL.camera.kick[weight] || 0.08);
    if (weight !== 'light') this.renderer.addShake(W.shake * (crit ? 1.3 : 1));
    if (W.punch) this.renderer.addPunch(W.punch);
    // ⑧ 치명타: 금빛 가장자리 + 방사 흐림 + 색수차
    if (crit) { this.renderer.flashEdge(FEEL.crit.flashColor, FEEL.crit.flash); this.renderer.blurPulse(0.6); this.renderer.pulseChroma(0.5); }
    // ⑨ 소리 층 + 진동 + 히트스톱
    Sfx.hit(weight, crit);
    if (knockdown) Sfx.play('knockdown', null, { jitter: 0.1 });
    rumble(FEEL.rumble[weight] || FEEL.rumble.light);
    this.hooks.hitStop(W.hitStop * (crit ? FEEL.crit.hitStopMult : 1));
    if (killing) this.hooks.slow(FEEL.slowMo.killDuration);
    // ⑩ 연타
    this.addCombo();
  }

  onGroggy(id) {
    this.at(id, 1.2, this.v);
    this.P.flash(this.v, '#ffe08a', 5);
    this.P.sparks(this.v, null, 40, '#ffd24a', { speed: 11, life: 0.8 });
    this.P.threadBits(this.v, 30, '#ffd27a', { speed: 5 });
    this.v.y -= 1.2; this.P.shockwave(this.v, '#ffd24a', 6, 0.7);
    this.renderer.ripple(this.v, 1.3);
    this.renderer.addPunch(1.6); this.renderer.addShake(0.4); this.renderer.flashEdge('#ffd24a', 0.7);
    this.hooks.slow(0.35);
    Sfx.play('boom');
    rumble(FEEL.rumble.heavy);
  }

  onStrike({ id, skillId, facing, weight }) {
    if (id !== this.pid) return;
    const sk = SKILLS[skillId], p = this.game.player();
    const cls = FEEL.classFx[p.classId];
    // 수호기사: 무거운 강철 호 + 잔상
    if (cls?.afterimage && (sk.type === 'melee' || sk.type === 'release' || sk.type === 'cone') && weight !== 'light') { this.at(id, 0, this.v); this.P.ghost(this.v, facing, cls.trail); }
    // 원소직조사: 원소 리본 (원소식 순서대로)
    if (p.classId === 'elementalist' && (sk.element || sk.type === 'complete')) {
      this.at(id, 1.4, this.v);
      const cols = p.res.slots.length ? p.res.slots.map((e) => FEEL.elementColors[e]) : [FEEL.elementColors[sk.element] || cls.trail];
      cols.forEach((c) => this.P.threadBits(this.v, 6, c, { speed: 2, life: 0.8 }));
    }
  }

  /** 각성기 연출: 레터박스 · 배경 탈색 · 돌리 · 슬로모션 */
  cinematic() {
    const C = FEEL.cinematic, U = FEEL.ultimate;
    this.letterbox?.classList.add('on');
    this.renderer.setDesaturate(C.desaturate);
    this.renderer.addPunch(C.dolly);
    this.renderer.flashEdge(U.flashColor, U.flash);
    this.renderer.pulseChroma(U.chroma);
    this.hooks.slow(FEEL.slowMo.ultDuration);
    clearTimeout(this.lbT);
    this.lbT = setTimeout(() => { this.letterbox?.classList.remove('on'); this.renderer.setDesaturate(0); }, C.letterbox * 1000);
    Sfx.play('levelUp');
  }

  addCombo() {
    const c = this.combo;
    c.n++; c.t = FEEL.combo.reset;
    if (!this.comboEl) return;
    this.comboEl.classList.remove('hidden');
    const milestone = FEEL.combo.milestones.includes(c.n);
    this.comboEl.innerHTML = `<b>${c.n}</b> 연타${milestone ? ` <i>x${c.n} 연타!</i>` : ''}`;
    this.comboEl.classList.remove('pop'); void this.comboEl.offsetWidth; this.comboEl.classList.add('pop');
    if (milestone) { Sfx.play('ting'); this.renderer.flashEdge('#ffd24a', 0.35); }
  }

  update(dt, realDt) {
    const p = this.game.player();
    if (!p) return;
    // 연타 초기화
    if (this.combo.n && (this.combo.t -= realDt) <= 0) { this.combo.n = 0; this.comboEl?.classList.add('hidden'); }
    // 잔상: 구르기·돌진·도약
    this.ghostT -= dt;
    if (p.fx.dash && this.ghostT <= 0) { this.ghostT = 0.035; this.at(p.id, 0, this.v); this.P.ghost(this.v, p.rot, FEEL.classFx[p.classId]?.trail || '#ffffff'); }
    // 차지: 모여드는 빛
    if (p.charging) {
      this.gatherT -= dt;
      if (this.gatherT <= 0) {
        this.gatherT = 0.03;
        this.at(p.id, 1, this.v);
        const a = Math.random() * Math.PI * 2;
        this.v2.set(this.v.x + Math.cos(a) * 2.2, this.v.y + (Math.random() - 0.3), this.v.z + Math.sin(a) * 2.2);
        this.P.sparks(this.v2, { x: -Math.cos(a) * 1.2, z: -Math.sin(a) * 1.2 }, 1, FEEL.classFx[p.classId]?.trail || '#ffe08a', { speed: 4, spread: 0.05, gravity: 0, life: 0.45 });
      }
    }
    // 낮은 체력: 붉은 비네트 + 심장 소리
    const low = p.alive && p.hp / p.stats.maxHp < FEEL.lowHp.threshold;
    this.renderer.setLowHp(low ? 1 : 0);
    if (low && (this.heartT -= realDt) <= 0) { this.heartT = FEEL.lowHp.pulse; Sfx.play('heartbeat'); }
  }
}
