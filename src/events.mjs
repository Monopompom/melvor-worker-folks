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
  // The Payroll Reserve took a deposit or paid a wage or debt: { currencyId, amount } (the new total).
  'reserveChanged',
  'folkPending',
  'loadoutChanged',
  'folkDied',
  'offlineTicks',
  // A Folk's place or travel changed (the API, Voyage phase 6).
  'folkMoved',
  // A Folk learned a trait, one waits for a slot, takes one or faded: { folk, type, trait, offline }.
  'folkTrait',
  // A wage left the reserve or the bank for an action: { folk, skill, currencyId, amount, offline } (build .136).
  'folkPaid',
  // A Work Order was delivered and paid: { order, reward, text, offline }; one in progress ran out: { order, offline }.
  'orderDelivered',
  'orderExpired',
  // A Folk's action made an item, into the bank or held in its room: { folk, skill, item, quantity, held } (build .150).
  'folkMade',
  // Township Commissions (build .163): a Folk set off with what it holds { commission, folk, qty, offline }; a
  // commission was delivered and paid { commission, folk, reward, offline }; its figure withdrew it { commission, folk, offline }.
  'commissionRun',
  'commissionDelivered',
  'commissionWithdrawn',
  // A Folk's room (API v10): it stopped with no space for the next action { folk }; it stopped out of inputs { folk };
  // what it holds or where its goods go changed { folk } (at most once a second, and at once after a collection).
  'roomFull',
  'roomDry',
  'roomChanged',
  // Jobs (round 3): a Folk's job changed { folk, previous, jobId }; a job did a stretch of work, its wage charged
  // { folk, jobId, ms, offline }; the Quartermaster refilled a slot { folk, item, quantity, offline } or found none of
  // its item left in the bank { folk, item, offline }.
  'folkJobChanged',
  'folkJobWorked',
  'folkRefilled',
  'folkRefillOut',
  'folkSupplyChanged',
  'folkSupplied',
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
