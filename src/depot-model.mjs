// Tent depots (joint order round 3, with Voyage): a shared room another mod keeps by its own id (Voyage's pitched
// tent). A Folk whose bank-access answer names a registered depot fills its own room first, then the depot; its inputs
// come from its stock first, then the depot's. "Restock all" at the depot fills it with every member's inputs, each
// member an equal share of the free hours. The depot's stacks are weighed in work as a room's are. Pure: no game
// globals.

/** A depot's size when the other mod gives none: 48 hours of work. */
export const DEPOT_HOURS = 48;
/** The sides a depot keeps: what its members made, and the inputs it holds for them. */
export const DEPOT_SIDES = Object.freeze(['haul', 'stock']);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = (id) => typeof id === 'string' && id !== '' && id.length <= 120;

/** Hours of a depot from the other mod's answer: a positive finite number, else DEPOT_HOURS. */
export function hoursOf(hours) {
  return Number.isFinite(hours) && hours > 0 ? hours : DEPOT_HOURS;
}

/** A depot's size in ms of work. */
export function capMs(hours) {
  return hoursOf(hours) * 3_600_000;
}

/** A side's stacks kept as saved, only whole positive counts with a finite, non-negative work. */
function side(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, e] of Object.entries(raw)) {
    if (!isId(id) || !isObj(e)) continue;
    const qty = Number.isFinite(e.qty) ? Math.floor(e.qty) : 0;
    if (qty <= 0) continue;
    out[id] = { qty, ms: Number.isFinite(e.ms) && e.ms > 0 ? e.ms : 0 };
  }
  return out;
}

/** An empty depot room in the shape room-model.mjs reads (town and purse stay empty: a depot has neither). */
export function emptyRoom() {
  return { haul: {}, stock: {}, town: {}, purse: {} };
}

/**
 * The saved depots: { [id]: { name, hours, room, dropped } }. `dropped`: the other mod ended it and the bank could not
 * take all of it yet; what is left goes to the bank as space comes. Anything else in the save is left out.
 */
export function normalize(saved) {
  const out = {};
  if (!isObj(saved)) return out;
  for (const [id, d] of Object.entries(saved)) {
    if (!isId(id) || !isObj(d)) continue;
    const room = emptyRoom();
    DEPOT_SIDES.forEach((s) => { room[s] = side(d.room?.[s]); });
    out[id] = {
      name: typeof d.name === 'string' ? d.name.slice(0, 80) : '',
      hours: hoursOf(d.hours),
      room,
      dropped: d.dropped === true,
    };
  }
  return out;
}

/** Whether a depot room holds nothing. */
export function isEmpty(room) {
  return DEPOT_SIDES.every((s) => !isObj(room?.[s]) || Object.keys(room[s]).length === 0);
}

/**
 * Restock all at a depot: each member's share of the free work, in ms. `freeMs` the depot's free room, `members` how
 * many take a share. The shares are equal; nothing is shared out among none.
 */
export function shares(freeMs, members) {
  const n = Math.floor(members);
  if (!(n > 0) || !(freeMs > 0)) return 0;
  return freeMs / n;
}

/**
 * Why a Restock all moved nothing, from each member's restock plan: 'noRoom' when a member's share was under one
 * action (the depot is the limit, however full the bank), else 'noBank' (the bank lacked the inputs).
 */
export function restockRefusal(plans) {
  return (plans ?? []).some((p) => p?.actions === 0 && p?.short === null) ? 'noRoom' : 'noBank';
}

/**
 * Where an action's goods go for a Folk with a depot: 'room' while its own room has space for the action's work,
 * else 'depot' while the depot has, else 'over' (both full: the goods go in the Folk's room all the same and it stops).
 */
export function target({ roomFreeMs, depotFreeMs, chargeMs }) {
  if (chargeMs <= roomFreeMs) return 'room';
  if (depotFreeMs !== undefined && chargeMs <= depotFreeMs) return 'depot';
  return 'over';
}

/** An input taken from the Folk's stock first, the rest from its depot: { fromStock, fromDepot, short }. */
export function draw(need, stockQty, depotQty) {
  const n = Math.max(0, Math.floor(need));
  const fromStock = Math.min(n, Math.max(0, Math.floor(stockQty)));
  const fromDepot = Math.min(n - fromStock, Math.max(0, Math.floor(depotQty)));
  return { fromStock, fromDepot, short: n - fromStock - fromDepot };
}

/** What the depots hold, { itemId: qty } over both sides (the backup counts it with the crew's rooms). */
export function heldBy(depots) {
  const out = {};
  if (!isObj(depots)) return out;
  for (const d of Object.values(depots)) {
    if (!isObj(d?.room)) continue;
    DEPOT_SIDES.forEach((s) => {
      if (!isObj(d.room[s])) return;
      for (const [id, e] of Object.entries(d.room[s])) {
        const qty = Number.isFinite(e?.qty) ? Math.floor(e.qty) : 0;
        if (isId(id) && qty > 0) out[id] = (out[id] ?? 0) + qty;
      }
    });
  }
  return out;
}
