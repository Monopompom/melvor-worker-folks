// Tiny event bus shared by the mod's slices. Pure: no game globals.

export const EVENT_NAMES = [
  'folkHired',
  'folkFired',
  'folkPromoted',
  'folkAssigned',
  'folkActionDone',
  'folkStruck',
  'folkInDebt',
  'folkReleased',
  'folkStarted',
  'crewChanged',
  'folkPending',
  'loadoutChanged',
  'folkDied',
  'offlineTicks',
  // A Folk's place or travel changed (the API, Voyage phase 6).
  'folkMoved',
  // A Folk learned a trait, one waits for a slot, takes one or faded: { folk, type, trait, offline }.
  'folkTrait',
];

export function createEventBus(names = EVENT_NAMES, { onError } = {}) {
  const known = new Set(names);
  const listeners = new Map();
  const assertKnown = (name) => {
    if (!known.has(name)) throw new Error(`Unknown Worker Folks event: ${name}`);
  };
  return {
    on(name, fn) {
      assertKnown(name);
      if (typeof fn !== 'function') throw new Error('listener must be a function');
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => this.off(name, fn);
    },
    off(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    /** Calls every listener; a throwing listener never blocks the others. */
    emit(name, payload) {
      assertKnown(name);
      const set = listeners.get(name);
      if (set === undefined) return 0;
      let called = 0;
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (err) {
          if (onError) onError(err, name);
          else console.error(`[Worker Folks] listener for ${name} failed`, err);
        }
        called += 1;
      }
      return called;
    },
    listenerCount(name) {
      return listeners.get(name)?.size ?? 0;
    },
  };
}
