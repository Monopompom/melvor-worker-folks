// The crew: every hired Folk, slot allocation and the events other slices
// subscribe to. Pure: no game globals (ids, names and clock are injected).
// Mod modules are served from blob URLs, so sibling modules cannot be imported
// with relative paths; the Folk model and name picker are injected instead.

const defaultId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function createCrew({ bus, model, pickName, maxSlots, now = () => Date.now(), makeId = defaultId, rng = Math.random }) {
  const { createFolk, serializeRoot, parseRoot, normalizeReserve, normalizeFrozen } = model;
  let reserve = {};
  let frozen = {};
  let folks = [];
  /** The Work Orders board (work-orders.mjs owns its shape); null until it opens. */
  let board = null;

  const emitChange = () => bus.emit('crewChanged', { folks: crew.all });

  const crew = {
    get all() {
      return folks.slice();
    },
    get size() {
      return folks.length;
    },
    /** Hard ceiling on slots (the registered mastery pool); the shop enforces the live cap. */
    get maxSlots() {
      return typeof maxSlots === 'function' ? maxSlots() : maxSlots;
    },
    byId(id) {
      return folks.find((f) => f.id === id);
    },
    bySlot(slot) {
      return folks.find((f) => f.slot === slot);
    },
    bySkill(skillId) {
      return folks.find((f) => f.skillId === skillId);
    },
    countByTier(tier) {
      return folks.reduce((n, f) => (f.tier === tier ? n + 1 : n), 0);
    },
    /** Lowest slot that is neither used nor frozen, below `limit` (default: every registered slot). */
    freeSlot({ limit } = {}) {
      const used = new Set(folks.map((f) => f.slot));
      const active = this.frozenSlots();
      const max = Math.min(this.maxSlots, limit ?? this.maxSlots);
      for (let i = 0; i < max; i += 1) if (!used.has(i) && !active.has(i)) return i;
      return -1;
    },
    /** Frozen slots still in effect: Map(slot → untilMs). Expired freezes are forgotten. */
    frozenSlots() {
      const t = now();
      const out = new Map();
      for (const [slot, until] of Object.entries(frozen)) {
        if (until > t) out.set(Number(slot), until);
        else delete frozen[slot];
      }
      return out;
    },
    /** Blocks a slot until `until` (ms). */
    freeze(slot, until) {
      frozen[slot] = until;
      emitChange();
    },
    thaw(slot) {
      if (slot === undefined) frozen = {};
      else delete frozen[slot];
      emitChange();
    },
    /** Earliest moment a frozen slot opens, or undefined. */
    nextThaw() {
      let min;
      this.frozenSlots().forEach((until) => { if (min === undefined || until < min) min = until; });
      return min;
    },
    /** Adds a Folk of `tier` in the lowest free slot (`paid`: the GP it cost). Returns the record or null when full. */
    hire(tier, { name, source = 'shop', limit, paid } = {}) {
      const slot = this.freeSlot({ limit });
      if (slot < 0) return null;
      const folk = createFolk({
        id: makeId(),
        slot,
        tier,
        name: name ?? pickName(folks.map((f) => f.name), rng),
        hiredAt: now(),
        paid,
      });
      folks.push(folk);
      folks.sort((a, b) => a.slot - b.slot);
      bus.emit('folkHired', { folk, source });
      emitChange();
      return folk;
    },
    fire(id, { reason = 'fired' } = {}) {
      const folk = this.byId(id);
      if (folk === undefined) return false;
      folks = folks.filter((f) => f !== folk);
      bus.emit('folkFired', { folk, reason });
      emitChange();
      return true;
    },
    /** Raises a Folk one tier; everything else (skill, mastery slot, loadout) stays. `paid`: the fee, added to its cost. */
    promote(id, toTier, { paid = 0 } = {}) {
      const folk = this.byId(id);
      if (folk === undefined) return false;
      const from = folk.tier;
      folk.tier = toTier;
      if (paid > 0 && folk.paid !== null) folk.paid += paid;
      bus.emit('folkPromoted', { folk, from, to: toTier });
      emitChange();
      return true;
    },
    /**
     * Assigns a skill (or null). One Folk per skill: a previous holder is unassigned. A Folk given a skill stops going
     * along with the player or walking (its travel becomes 'idle'): it works, so it stays put, and heals again. This
     * also frees a Folk left on the road by a mod that is no longer loaded.
     */
    assign(id, skillId) {
      const folk = this.byId(id);
      if (folk === undefined) return false;
      if (skillId !== null) {
        const holder = this.bySkill(skillId);
        if (holder !== undefined && holder !== folk) this.assign(holder.id, null);
        if (folk.travel !== 'idle') folk.travel = 'idle';
      }
      const previous = folk.skillId;
      if (previous === skillId) return true;
      folk.skillId = skillId;
      bus.emit('folkAssigned', { folk, previous, skillId });
      emitChange();
      return true;
    },
    /** Payroll Reserve amounts by currency id (whole numbers). */
    get reserve() {
      return reserve;
    },
    reserveOf(currencyId) {
      return reserve[currencyId] ?? 0;
    },
    /** Adds (or, negative, removes) from the reserve; never below zero. Returns the new amount. */
    adjustReserve(currencyId, delta) {
      const next = Math.max(0, Math.floor((reserve[currencyId] ?? 0) + delta));
      if (next === 0) delete reserve[currencyId];
      else reserve[currencyId] = next;
      emitChange();
      return next;
    },
    get board() {
      return board;
    },
    set board(value) {
      board = value !== null && typeof value === 'object' ? value : null;
    },
    serialize() {
      return serializeRoot(folks, reserve, frozen, board);
    },
    /** Replaces the crew from a serialised root. Returns the parse report. */
    load(input) {
      const report = parseRoot(input);
      folks = report.root.folks.filter((f) => f.slot < this.maxSlots);
      reserve = normalizeReserve(report.root.reserve);
      frozen = normalizeFrozen(report.root.frozen, now());
      board = report.root.board ?? null;
      report.dropped += report.root.folks.length - folks.length;
      emitChange();
      return report;
    },
    clear() {
      folks = [];
      reserve = {};
      frozen = {};
      board = null;
      emitChange();
    },
    /** Announces an in-place change to Folk fields (debt, cooldown...). */
    touch() {
      emitChange();
    },
  };
  return crew;
}
