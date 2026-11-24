// Carriers on the game side (API v12): another mod's job with a roomScale (Voyage's couriers) moves goods in its Folk's
// own room, so firing, death, backups and the full-bank buffer treat a load as any room. Every call here is one whole
// move, done before it returns, and each stack keeps its count and its share of the work. A commission's goods ride on
// the carrier's town side until it hands them in at a bank stop. Game-facing; the sums are in carry-model.mjs.

export function install(ctx, { getHiring, model, roomModel, depotModel, log }) {
  let hiring;

  const itemOf = (id) => game.items.getObjectByID(id);
  const frozen = (list) => Object.freeze(list.map((e) => Object.freeze(e)));
  const limit = (maxMs) => (Number.isFinite(maxMs) ? Math.max(0, maxMs) : Infinity);

  /** The Folk with this id while its job makes it a carrier; undefined otherwise. */
  const courierOf = (id) => {
    const folk = hiring?.crew.byId(id);
    return folk?.room !== undefined && hiring.room?.isCarrier(folk) === true ? folk : undefined;
  };
  const freeOf = (folk) => Math.max(0, hiring.room.capMs(folk) - roomModel.usedMs(folk.room));

  /** `{ folk: id }` or `{ depot: id }` as a place goods move through: { room, folk | depot }; undefined if unknown. */
  const placeOf = (where) => {
    if (where?.folk !== undefined) {
      const folk = hiring.crew.byId(where.folk);
      return folk?.room === undefined ? undefined : { room: folk.room, folk };
    }
    if (where?.depot !== undefined) {
      const depot = hiring.depots?.roomFor(where.depot);
      return depot === undefined ? undefined : { room: depot.room, depot };
    }
    return undefined;
  };
  /** Tells the place its goods changed: a Folk or depot member stopped full or dry may go on. */
  const changed = (place) => {
    if (place.folk !== undefined) {
      hiring.room.roomMoved(place.folk);
      return;
    }
    hiring.depots.touched(place.depot.id);
    hiring.room.wakeDepot(place.depot.id);
  };
  const recipeIds = (folk) => (folk === undefined ? [] : hiring.room.inputsOf(folk).perAction.map(({ id }) => id));
  /** Depot members with a recipe, as { perAction, intervalMs }. */
  const recipesAt = (depotId) => (hiring.room.membersOf(depotId) ?? [])
    .map((folk) => ({ folk, ...hiring.room.inputsOf(folk) }))
    .filter((m) => m.perAction.length > 0 && m.intervalMs > 0);

  /**
   * Takes what a Folk or depot made onto the carrier, up to its free room and `maxMs`. A Folk's commission goods come
   * first, on the town side, unless it is on its own run with them. Then a receiver's recipe items (`forReceiver`, a
   * Folk id), on the stock side, for handing over; then everything else on the haul side, but not a carried line's goods
   * for a receiver this carrier doesn't serve. A Folk's purse comes too and weighs nothing (not with `only`, a list of
   * the item ids to take).
   * { items: [{ itemId, qty, ms, side }], purse: [{ currencyId, amount }], ms, freeMs }; undefined for an unknown or
   * non-carrier Folk or place.
   */
  const take = (courierId, from, { maxMs, only, forReceiver } = {}) => {
    const courier = courierOf(courierId);
    const place = placeOf(from);
    if (courier === undefined || place === undefined || place.folk === courier) return undefined;
    const linked = forReceiver === undefined ? [] : recipeIds(hiring.crew.byId(forReceiver));
    const free = Math.min(freeOf(courier), limit(maxMs));
    const townOpen = place.folk !== undefined && hiring.commissions?.onRun(place.folk) !== true;
    const town = model.fitStacks(townOpen ? model.takeOrder(roomModel.entries(place.room, 'town'), [], only) : [], free);
    const held = place.folk === undefined ? [] : (hiring.supply?.carriedIds(place.folk) ?? []).filter((id) => !linked.includes(id));
    const stacks = model.takeOrder(roomModel.entries(place.room, 'haul').filter(({ id }) => !held.includes(id)), linked, only);
    const { moves } = model.fitStacks(stacks, free - town.ms);
    const items = [];
    let ms = 0;
    const carry = (id, qty, fromSide, side) => {
      const got = roomModel.take(place.room, id, qty, fromSide);
      if (got.qty <= 0) return;
      roomModel.put(courier.room, id, got.qty, got.ms, side);
      items.push({ itemId: id, qty: got.qty, ms: got.ms, side });
      ms += got.ms;
    };
    town.moves.forEach(({ id, qty }) => carry(id, qty, 'town', 'town'));
    moves.forEach(({ id, qty }) => carry(id, qty, 'haul', linked.includes(id) ? 'stock' : 'haul'));
    const purse = [];
    if (only === undefined && place.folk !== undefined) {
      roomModel.takePurse(place.room).forEach(({ id, amount }) => {
        roomModel.putPurse(courier.room, id, amount);
        purse.push({ currencyId: id, amount });
      });
    }
    if (items.length > 0 || purse.length > 0) {
      changed(place);
      hiring.room.roomMoved(courier);
    }
    return Object.freeze({ items: frozen(items), purse: frozen(purse), ms, freeMs: freeOf(courier) });
  };

  /** The carrier's haul and purse to your bank and currencies; its inputs stay aboard. { items, left, purse }. */
  const toBank = (courierId) => {
    const courier = courierOf(courierId);
    return courier === undefined ? undefined : hiring.room.collect(courier);
  };

  /** What one stop asks for, as the plan's demands; a depot's free room is split evenly among its members. */
  const demandsAt = (stop, index) => {
    const place = placeOf(stop);
    if (place === undefined) return [];
    if (place.folk !== undefined) {
      const { perAction, intervalMs } = hiring.room.inputsOf(place.folk);
      return [{ key: `${index}`, perAction, intervalMs, freeMs: freeOf(place.folk) }];
    }
    const members = recipesAt(place.depot.id);
    const share = depotModel.shares(place.depot.capMs - roomModel.usedMs(place.room), members.length);
    return members.map(({ perAction, intervalMs }) => ({ key: `${index}`, perAction, intervalMs, freeMs: share }));
  };

  /**
   * The inputs to load at the bank for these stops ([{ folk | depot }]). Each stop wants its free room's worth; a short
   * load or bank gives every Folk the same hours. Nothing moves yet. { stops: [{ folk | depot, actions, items: [{ itemId,
   * qty }] }], take: [{ itemId, qty, ms }] (from the bank), spare: [itemId] (aboard, no stop uses it), ms, short: 'load'
   * | 'bank' | null }; undefined for an unknown or non-carrier Folk.
   */
  const inputsPlan = (courierId, stops) => {
    const courier = courierOf(courierId);
    if (courier === undefined || !Array.isArray(stops)) return undefined;
    const plan = model.inputsPlan({
      demands: stops.flatMap(demandsAt),
      freeMs: freeOf(courier),
      aboard: (id) => roomModel.qtyOf(courier.room, id, 'stock'),
      aboardIds: roomModel.entries(courier.room, 'stock').map(({ id }) => id),
      bankQty: (id) => {
        const item = itemOf(id);
        return item === undefined ? 0 : game.bank.getQty(item);
      },
    });
    const perStop = stops.map((stop, index) => {
      const parts = plan.stops.filter((s) => s.key === `${index}`);
      const total = new Map();
      parts.forEach((p) => p.items.forEach(({ id, qty }) => total.set(id, (total.get(id) ?? 0) + qty)));
      const where = stop?.depot !== undefined ? { depot: stop.depot } : { folk: stop?.folk };
      return Object.freeze({
        ...where,
        actions: parts.reduce((sum, p) => sum + p.actions, 0),
        items: frozen([...total].map(([itemId, qty]) => ({ itemId, qty }))),
      });
    });
    return Object.freeze({
      stops: Object.freeze(perStop),
      take: frozen(plan.take.map(({ id, qty, ms }) => ({ itemId: id, qty, ms }))),
      spare: Object.freeze(plan.spare),
      ms: plan.ms,
      short: plan.short,
    });
  };

  /**
   * Carries out a plan from carryInputsPlan: its `spare` goes home first, then its `take` comes from the bank onto the
   * carrier's stock side, each line cut to what the bank and the load hold now. { items: [{ itemId, qty, ms }], home:
   * [{ itemId, qty }], left: [{ itemId, qty }] (spare the bank had no slot for: still aboard) }.
   */
  const loadInputs = (courierId, plan) => {
    const courier = courierOf(courierId);
    if (courier === undefined || !Array.isArray(plan?.take)) return undefined;
    const spare = Array.isArray(plan.spare) ? plan.spare.filter((id) => roomModel.qtyOf(courier.room, id, 'stock') > 0) : [];
    const { items: home, left } = spare.length > 0 ? hiring.room.stockHome(courier, spare) : { items: [], left: [] };
    let space = freeOf(courier);
    const items = [];
    plan.take.forEach(({ itemId, qty, ms }) => {
      const item = itemOf(itemId);
      if (item === undefined || !Number.isFinite(qty) || qty <= 0) return;
      const unit = Number.isFinite(ms) && ms > 0 ? ms / qty : 0;
      let n = Math.min(Math.floor(qty), game.bank.getQty(item));
      if (unit > 0) n = Math.min(n, Math.floor(space / unit));
      if (n <= 0) return;
      // false: an item keeps its charges on the way out of the bank, as a Restock's does.
      game.bank.removeItemQuantity(item, n, false);
      const weight = n * unit;
      roomModel.put(courier.room, itemId, n, weight, 'stock');
      space = Math.max(0, space - weight);
      items.push({ itemId, qty: n, ms: weight });
    });
    if (items.length > 0) hiring.room.roomMoved(courier);
    return Object.freeze({ items: frozen(items), home: frozen(home), left: frozen(left) });
  };

  /**
   * Hands a Folk or depot the inputs aboard that its recipe uses, up to its free room and `maxMs`, weighed by that
   * recipe; a Folk stopped for want of them starts again. What no recipe there uses rides on. { items: [{ itemId, qty }],
   * ms }; undefined for an unknown or non-carrier Folk or place.
   */
  const give = (courierId, to, { maxMs } = {}) => {
    const courier = courierOf(courierId);
    const place = placeOf(to);
    if (courier === undefined || place === undefined || place.folk === courier) return undefined;
    const aboard = (id) => roomModel.qtyOf(courier.room, id, 'stock');
    const total = new Map();
    let ms = 0;
    const hand = (moves) => moves.forEach(({ id, qty, ms: weight }) => {
      const got = roomModel.take(courier.room, id, qty, 'stock');
      if (got.qty <= 0) return;
      const part = got.qty === qty ? weight : (weight * got.qty) / qty;
      roomModel.put(place.room, id, got.qty, part, 'stock');
      total.set(id, (total.get(id) ?? 0) + got.qty);
      ms += part;
    });
    if (place.folk !== undefined) {
      const { perAction, intervalMs } = hiring.room.inputsOf(place.folk);
      hand(model.giveStacks({ perAction, intervalMs, freeMs: Math.min(freeOf(place.folk), limit(maxMs)), aboard }));
    } else {
      const members = recipesAt(place.depot.id);
      const share = depotModel.shares(Math.min(place.depot.capMs - roomModel.usedMs(place.room), limit(maxMs)), members.length);
      members.forEach(({ perAction, intervalMs }) => hand(model.giveStacks({ perAction, intervalMs, freeMs: share, aboard })));
    }
    if (total.size > 0) {
      changed(place);
      if (place.folk !== undefined) hiring.room.wake(place.folk);
      hiring.room.roomMoved(courier);
      log(`carry: ${courier.name} handed over ${total.size} kind(s)`);
    }
    return Object.freeze({ items: frozen([...total].map(([itemId, qty]) => ({ itemId, qty }))), ms });
  };

  /**
   * Hands the commission goods aboard to the town, at a bank stop: open commissions, soonest deadline first, paid as a
   * run's delivery. What none wants moves to the carrier's haul side. { delivered: [{ commissionId, figure, itemId, qty,
   * done }], home: [{ itemId, qty }] }; undefined for an unknown or non-carrier Folk.
   */
  const toTown = (courierId) => {
    const courier = courierOf(courierId);
    if (courier === undefined) return undefined;
    const { delivered, home } = hiring.commissions?.handIn(courier) ?? { delivered: [], home: [] };
    return Object.freeze({ delivered: frozen(delivered), home: frozen(home) });
  };

  /**
   * The carriers whose route calls at this Folk (another mod's route-share hook) and whose job runs now, as
   * [{ courier, share, faresPerHour }]. `running: false` counts one still on its job: right after a load, before the
   * jobs' first tick.
   */
  const routesOf = (folk, { running = true } = {}) => {
    const hook = hiring?.routeShareHook;
    if (typeof hook !== 'function') return [];
    let list;
    try {
      list = hook(folk);
    } catch (err) {
      log('route share hook failed', err);
      return [];
    }
    if (!Array.isArray(list)) return [];
    return list
      .map((e) => ({ courier: courierOf(e?.courierId), share: e?.share, faresPerHour: e?.faresPerHour }))
      .filter(({ courier }) => courier !== undefined && courier !== folk && (!running || hiring.jobs.isRunning(courier)));
  };
  const servedBy = (folk, options) => routesOf(folk, options).map(({ courier }) => courier);

  /** One item's sale value in GP (0 for an unknown item or one sold for another currency). */
  const unitGp = (id) => {
    const sells = itemOf(id)?.sellsFor;
    return sells?.currency?.id === 'melvorD:GP' && sells.quantity > 0 ? sells.quantity : 0;
  };
  /**
   * A band's raid (v13): takes toward `valueGp` from a Folk's room or a depot, `{ folk: id }` or `{ depot: id }`, in the
   * order of model.raidPlan: purse GP, then the haul, stock and town goods, dearest first, never gear. What it takes is
   * gone. { taken: [{ itemId, qty }], gp } with gp the sale value taken; undefined for an unknown place.
   */
  const raid = (target, valueGp) => {
    const place = placeOf(target);
    if (place === undefined) return undefined;
    const sides = (place.folk !== undefined ? ['haul', 'stock', 'town'] : depotModel.DEPOT_SIDES)
      .map((side) => ({ side, stacks: roomModel.entries(place.room, side).map(({ id, qty }) => ({ id, qty, unit: unitGp(id) })) }));
    const purseGp = place.folk !== undefined ? (place.room.purse?.['melvorD:GP'] ?? 0) : 0;
    const plan = model.raidPlan({ purseGp, sides }, valueGp);
    if (plan.purse > 0) {
      const leftGp = place.room.purse['melvorD:GP'] - plan.purse;
      if (leftGp > 0) place.room.purse['melvorD:GP'] = leftGp;
      else delete place.room.purse['melvorD:GP'];
    }
    const taken = [];
    plan.moves.forEach(({ side, id, qty }) => {
      const got = roomModel.take(place.room, id, qty, side);
      if (got.qty > 0) taken.push({ itemId: id, qty: got.qty });
    });
    if (plan.purse > 0 || taken.length > 0) {
      changed(place);
      if (place.folk !== undefined) hiring.markCard(place.folk);
      log(`raid on ${place.folk?.name ?? place.depot.id}: ${plan.gp} GP of ${valueGp}`);
    }
    return Object.freeze({ taken: frozen(taken), gp: plan.gp });
  };

  const api = { take, toBank, toTown, inputsPlan, loadInputs, give, servedBy, routesOf, raid };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.carry = api;
  });

  return api;
}
