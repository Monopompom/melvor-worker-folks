// Tent depots on the game side (joint order round 3, with Voyage). Another mod registers a depot by its own id (a
// pitched tent) with its size in hours, and names it in its bank-access answer for the Folks that share it
// ({ access: 'room', depot: id }). room.mjs does the sharing: such a Folk's goods fill its own room first, then the
// depot's haul side; its inputs come from its stock first, then the depot's stock side. This module keeps the depots
// (in the crew's save, beside the Folks), and what the other mod calls on them: look, collect, restock (every member an
// equal share of the free hours, from your bank), empty, and drop (the tent struck: everything to the bank, what the
// bank can't take yet waiting until it can). A depot the other mod doesn't register again after a load goes to the bank
// once the game is up. Events: depotChanged { depotId }, depotFull { depotId }. Game-facing; the rules are in
// depot-model.mjs.

const CHECK_TICKS = 20;

export function install(ctx, { getHiring, model, roomModel, log }) {
  let hiring;
  /** Depot ids the other mod registered this session (only those are shared). */
  const registered = new Set();
  /** Depots whose stacks changed since the last depotChanged event. */
  const changed = new Set();
  /** Depots already told full: once until they have space again. */
  const toldFull = new Set();
  let ticks = 0;

  const store = () => hiring?.crew.depots ?? {};
  const itemOf = (id) => game.items.getObjectByID(id);
  const bankTakes = (item) => game.bank.items.has(item) || game.bank.occupiedSlots < game.bank.maximumSlots;
  const usedMs = (d) => roomModel.usedMs(d.room);
  const capOf = (d) => model.capMs(d.hours);

  const touched = (id) => {
    changed.add(id);
    const d = store()[id];
    if (d !== undefined && usedMs(d) < capOf(d)) toldFull.delete(id);
    if (hiring !== undefined) hiring.renderQueue.folks = true;
  };
  const emitChanged = (id) => {
    changed.delete(id);
    hiring.events.emit('depotChanged', { depotId: id });
  };

  /**
   * Moves a side's stacks (all, or `keep(id)` false ones) to the bank as far as it takes them: [{ itemId, qty }] moved;
   * what stayed (a new kind with no free slot, or an item no loaded mod registers) goes in `left`.
   */
  const moveSide = (d, side, left, keep = () => false) => {
    const moved = [];
    for (const { id } of roomModel.entries(d.room, side)) {
      if (keep(id)) continue;
      const item = itemOf(id);
      if (item === undefined || !bankTakes(item)) {
        left.push({ itemId: id, qty: roomModel.qtyOf(d.room, id, side) });
        continue;
      }
      const { qty, ms } = roomModel.take(d.room, id, Infinity, side);
      if (game.bank.addItem(item, qty, false, true, false, game._isInOnlineLoop, `Skill.${hiring.id}`)) moved.push({ itemId: id, qty });
      else {
        roomModel.put(d.room, id, qty, ms, side);
        left.push({ itemId: id, qty });
      }
    }
    return moved;
  };
  const result = (items, left) => Object.freeze({
    items: Object.freeze(items.map((e) => Object.freeze(e))),
    left: Object.freeze(left.map((e) => Object.freeze(e))),
    purse: Object.freeze([]),
  });

  /** A registered, live depot as room.mjs shares it: { id, name, room, capMs }; undefined otherwise. */
  const roomFor = (id) => {
    if (!registered.has(id)) return undefined;
    const d = store()[id];
    if (d === undefined || d.dropped) return undefined;
    return { id, name: d.name, room: d.room, capMs: capOf(d) };
  };

  const register = (id, { hours, name } = {}) => {
    if (typeof id !== 'string' || id === '' || id.length > 120 || hiring === undefined) return false;
    const depots = store();
    const d = depots[id] ?? { name: '', hours: model.DEPOT_HOURS, room: model.emptyRoom(), dropped: false };
    d.hours = model.hoursOf(hours);
    if (typeof name === 'string') d.name = name.slice(0, 80);
    // A tent pitched again where a struck one's goods still wait for bank space: they are its own again.
    d.dropped = false;
    depots[id] = d;
    hiring.crew.depots = depots;
    registered.add(id);
    log(`depot ${id} registered (${d.hours} h)`);
    hiring.room?.refreshAccess();
    touched(id);
    return true;
  };

  /** Everything in it to the bank; what the bank can't take waits (dropped) and goes as space comes. */
  const drop = (id) => {
    const depots = store();
    const d = depots[id];
    registered.delete(id);
    toldFull.delete(id);
    if (d === undefined) return result([], []);
    const left = [];
    const items = [...moveSide(d, 'haul', left), ...moveSide(d, 'stock', left)];
    if (model.isEmpty(d.room)) delete depots[id];
    else d.dropped = true;
    log(`depot ${id} dropped: ${items.length} kind(s) to the bank, ${left.length} waiting`);
    // Its members work from their own rooms again: a Folk it held full or dry may go on.
    hiring.room?.wakeDepot(id);
    emitChanged(id);
    return result(items, left);
  };

  /** What a depot holds and its state, frozen; undefined for an id never registered nor saved. */
  const view = (id) => {
    const d = store()[id];
    if (d === undefined) return undefined;
    const side = (s) => Object.freeze(roomModel.entries(d.room, s).map(({ id: itemId, qty, ms }) => Object.freeze({ itemId, qty, ms })));
    const used = usedMs(d);
    return Object.freeze({
      id,
      name: d.name,
      sizeMs: capOf(d),
      usedMs: used,
      haul: side('haul'),
      stock: side('stock'),
      members: Object.freeze((hiring.room?.membersOf(id) ?? []).map((f) => f.id)),
      // Full: no space left, or a member's last action found none (told until it has space again).
      state: d.dropped ? 'dropped' : !registered.has(id) ? 'unregistered' : used >= capOf(d) || toldFull.has(id) ? 'full' : 'ok',
    });
  };

  /** What its members made, and stock no member's recipe uses now, to the bank. { items, left, purse }. */
  const collect = (id) => {
    const d = store()[id];
    if (d === undefined) return undefined;
    const left = [];
    const used = new Set((hiring.room?.membersOf(id) ?? []).flatMap((f) => hiring.room.inputsOf(f).perAction.map((e) => e.id)));
    const items = [...moveSide(d, 'haul', left), ...moveSide(d, 'stock', left, (itemId) => used.has(itemId))];
    if (items.length > 0) {
      touched(id);
      hiring.room?.wakeDepot(id);
    }
    return result(items, left);
  };

  /** Everything in it to the bank, the depot staying up. { items, left, purse }. */
  const empty = (id) => {
    const d = store()[id];
    if (d === undefined) return undefined;
    const left = [];
    const items = [...moveSide(d, 'haul', left), ...moveSide(d, 'stock', left)];
    if (items.length > 0) {
      touched(id);
      hiring.room?.wakeDepot(id);
    }
    return result(items, left);
  };

  /**
   * Restock all at the depot: each member with a recipe gets an equal share of the free hours in its inputs, from your
   * bank, into the depot's stock; then members stopped dry start again. { ok, members: [{ folkId, actions, items }],
   * items: [{ itemId, qty }] } or { ok: false, why } ('unknown' | 'noMembers' | 'noRoom' | 'noBank').
   */
  const restock = (id) => {
    const d = roomFor(id) === undefined ? undefined : store()[id];
    if (d === undefined) return Object.freeze({ ok: false, why: 'unknown' });
    const members = (hiring.room?.membersOf(id) ?? [])
      .map((folk) => ({ folk, ...hiring.room.inputsOf(folk) }))
      .filter((m) => m.perAction.length > 0 && m.intervalMs > 0);
    if (members.length === 0) return Object.freeze({ ok: false, why: 'noMembers' });
    const share = model.shares(capOf(d) - usedMs(d), members.length);
    if (share <= 0) return Object.freeze({ ok: false, why: 'noRoom' });
    const per = [];
    const total = new Map();
    members.forEach(({ folk, perAction, intervalMs }) => {
      // Each member reads the bank as the ones before it left it.
      const plan = roomModel.restockPlan({ perAction, intervalMs, freeMs: share, bankQty: (itemId) => game.bank.getQty(itemOf(itemId)) });
      if (plan.actions === 0) return;
      plan.items.forEach(({ id: itemId, qty, ms }) => {
        game.bank.removeItemQuantity(itemOf(itemId), qty, false);
        roomModel.put(d.room, itemId, qty, ms, 'stock');
        total.set(itemId, (total.get(itemId) ?? 0) + qty);
      });
      per.push(Object.freeze({ folkId: folk.id, actions: plan.actions, items: Object.freeze(plan.items.map(({ id: itemId, qty }) => Object.freeze({ itemId, qty }))) }));
    });
    if (per.length === 0) return Object.freeze({ ok: false, why: 'noBank' });
    touched(id);
    hiring.room?.wakeDepot(id);
    log(`depot ${id} restocked for ${per.length} Folk(s)`);
    return Object.freeze({ ok: true, members: Object.freeze(per), items: Object.freeze([...total].map(([itemId, qty]) => Object.freeze({ itemId, qty }))) });
  };

  /** room.mjs: its last action found the depot full as well (told once until it has space). */
  const full = (id) => {
    if (toldFull.has(id)) return;
    toldFull.add(id);
    hiring.events.emit('depotFull', { depotId: id });
  };

  const api = { register, drop, view, collect, empty, restock, roomFor, touched, full, isFull: (id) => toldFull.has(id), isRegistered: (id) => registered.has(id), ids: () => Object.keys(store()) };

  // Dropped depots hand what they still hold to the bank as space comes; changes are told once a second.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid) return;
    ticks += 1;
    if (ticks % CHECK_TICKS !== 0) return;
    const depots = store();
    for (const [id, d] of Object.entries(depots)) {
      if (!d.dropped) continue;
      const moved = [...moveSide(d, 'haul', []), ...moveSide(d, 'stock', [])];
      if (model.isEmpty(d.room)) delete depots[id];
      if (moved.length > 0) changed.add(id);
    }
    [...changed].forEach(emitChanged);
  });

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.depots = api;
  });
  ctx.onCharacterLoaded(() => {
    // The save's depots, checked; ids the other mod registered before this point keep their registration.
    hiring.crew.depots = model.normalize(hiring.crew.depots);
    changed.clear();
    toldFull.clear();
  });
  // By now the other mod has registered every standing depot (on its character load, before offline progress): one
  // it didn't is gone, and its goods go to the bank.
  ctx.onInterfaceReady(() => {
    Object.keys(store()).forEach((id) => {
      if (!registered.has(id) && store()[id]?.dropped !== true) drop(id);
    });
  });

  return api;
}
