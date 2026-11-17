/**
 * 단순 이벤트 버스. 게임 로직(GameState)은 이벤트만 발행하고,
 * 렌더/UI/네트워크 계층이 구독한다. 이후 서버 권위 구조에서는
 * 서버가 보낸 이벤트를 동일한 버스로 재발행하면 된다.
 */
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[EventBus] ${type}`, e); }
    }
    const any = this.map.get('*');
    if (any) for (const fn of [...any]) fn(type, payload);
  }
}
