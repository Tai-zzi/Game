import { smoothstep, lerp } from '../core/math.js';

/**
 * 하르벤 교역 거점과 주변 필드 (v0.3 §13.1 수직 단면).
 * 높이 함수는 로직(충돌/위치)과 렌더가 함께 쓰므로 순수 함수로 여기에 둔다.
 * 좌표·크기는 레벨 디자인 예시.
 */
export const HARVEN = {
  id: 'harven', name: '하르벤 교역 거점', region: '하르벤 계곡',
  size: 260,
  boundsRadius: 112,
  playerSpawn: { x: 0, z: 10 },
  villageCenter: { x: 0, z: 0 },
  hubRadius: 24, // 안전 거점: 직업 변경 가능, 몬스터가 들어오지 않음
  waterLevel: -0.45,
  houses: [
    { x: -14, z: -8, w: 7, d: 6, h: 3.4, roof: '#a8553a' },
    { x: 12, z: -12.8, w: 7, d: 2.6, h: 3.4, roof: '#8a5a3c', shop: true }, // 잡화점 (앞이 트인 가게 — 뒤 창고만 막힘)
    { x: -16, z: 10, w: 6, d: 7, h: 3.2, roof: '#b4673f' },
    { x: 15, z: 9, w: 7, d: 5, h: 3.0, roof: '#9c4f36' },
    { x: -2, z: -19, w: 8, d: 6, h: 3.8, roof: '#7d4a33' },
    { x: 41, z: -2, w: 5, d: 5, h: 3.2, roof: '#7a5236', mill: true }, // 물레방앗간
  ],
  loom: { x: 2, z: -3, w: 5, d: 2.4 }, // 연맹 지부 앞 공동 베틀
  wheelZ: -2,
  // 끊어진 다리 (상태: broken → temp_bridge | detour → repaired)
  bridge: { z: 4, halfWidth: 1.7, deckY: 0.55 },
  ford: { z: 56 }, // 상류 여울: 다리 상태와 관계없이 늘 건널 수 있다 (핵심 접근 보장)
  workbench: { x: 39, z: 10 },
  depot: { x: 66, z: 4, name: '동쪽 창고' },
  cartStart: { x: 10, z: 3 },
  cartRoute: [
    { x: 18, z: 14 }, { x: 20, z: 40 }, { x: 36, z: 54 }, { x: 50, z: 56 },
    { x: 62, z: 48 }, { x: 66, z: 24 }, { x: 66, z: 6 },
  ],
  detourArea: { x: 34, z: 50, radius: 16 }, // 우회로 위험 구역 (호위 1단계)
  nodes: [
    { item: 'lumber', name: '목재 더미', x: -30, z: 12 },
    { item: 'lumber', name: '목재 더미', x: -34, z: 2 },
    { item: 'lumber', name: '목재 더미', x: -27, z: 22 },
    { item: 'clamp', name: '부서진 수레 잔해', x: 26, z: -17 },
    { item: 'clamp', name: '부서진 수레 잔해', x: 31, z: -23 },
  ],
  clues: [
    { id: 'tracks', name: '바퀴 자국과 가축 발자국', x: 24, z: 22,
      text: '무거운 수레가 다리 대신 들판으로 돌아간 자국. 그 위를 겁먹은 양 떼가 흩어지며 밟고 지나갔다.' },
    { id: 'lamb', name: '쓰러진 새끼 양', x: 8, z: 44,
      text: '실종된 가축 중 한 마리. 털 끝이 실처럼 풀려 있지만 숨은 붙어 있다. 의사에게 보여야 할 것 같다.' },
    { id: 'footing', name: '교각 아래 지반 이상', x: 43.5, z: 7,
      text: '교각 아래 흙이 결을 따라 갈라져 있다. 그런데 지난 보수 때 박은 말뚝은 규격보다 짧다. 지반 이상과 부실 보수가 겹친 것이다.' },
  ],
  spawns: [
    { monster: 'unravel_sheep', x: 32, z: 32, radius: 12, count: 7 },
    { monster: 'unravel_sheep', x: -6, z: 50, radius: 10, count: 4 },
    { monster: 'unravel_wolf', x: 38, z: 52, radius: 9, count: 4, levelRange: [3, 4], tag: 'detour' },
    { monster: 'unravel_wolf', x: -52, z: -50, radius: 15, count: 6 },
    { monster: 'tangled_alpha', x: -60, z: -60, radius: 2, count: 1, tag: 'elite' }, // 잿빛 숲 엘리트
    { monster: 'bridge_keeper', x: 44, z: 22, radius: 1, count: 1, tag: 'boss' }, // 끊어진 다리 근처 중간 보스
  ],
  hollow: { x: -55, z: -55, radius: 36 },
};

export const riverX = (z) => 46 + 9 * Math.sin(z * 0.022) + 4 * Math.sin(z * 0.061 + 1.3);

export function heightAt(x, z) {
  let h = 2.4 * Math.sin(x * 0.031) * Math.cos(z * 0.027)
    + 1.3 * Math.sin(x * 0.072 + z * 0.049)
    + 0.6 * Math.cos(x * 0.13 - z * 0.11);
  h += smoothstep(85, 135, Math.hypot(x, z)) * 10;
  const v = smoothstep(18, 42, Math.hypot(x - HARVEN.villageCenter.x, z - HARVEN.villageCenter.z));
  h = lerp(0.15, h, v);
  const d = Math.abs(x - riverX(z));
  h = lerp(h, -1.6, 1 - smoothstep(3.5, 11, d));
  return h;
}

export const inRiver = (x, z) => Math.abs(x - riverX(z)) < 4.2;
/** 다리 상판 위인지 (다리가 쓸 수 있는 상태일 때만 의미) */
export const onBridge = (x, z) => Math.abs(z - HARVEN.bridge.z) < HARVEN.bridge.halfWidth && Math.abs(x - riverX(HARVEN.bridge.z)) < 9;
export const inHub = (x, z) => Math.hypot(x - HARVEN.villageCenter.x, z - HARVEN.villageCenter.z) < HARVEN.hubRadius;
