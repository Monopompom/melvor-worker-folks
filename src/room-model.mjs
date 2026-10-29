// A Folk's room: what it holds for you instead of the bank, measured in hours of work. Pure: no game globals.
//
// Build .150 gives the room its first job: a buffer for a full bank. Output of a new kind of item that finds no free
// bank slot waits in the room instead of being lost (the game's own rule stops the skill too), and goes to the bank
// on its own once a slot is free.
//
// Hours of work, never item counts: every stack keeps the action time that made it (`ms`), so 1,200 logs an hour and
// a few dozen bars an hour fill a room alike. An action charges its time once, to the first item it puts in the room;
// taking n of a stack takes n / qty of its time. A change of interval needs no special case. The room's saved shape
// ({ haul: { itemId: { qty, ms } } }) and its check are in folk.mjs with the rest of the Folk record.

const HOUR_MS = 3_600_000;

/** Room size in hours by tier (Trainee 2 h up to Foreman 8 h). */
export const ROOM_HOURS = Object.freeze({ Newbie: 2, Junior: 3.5, Middle: 5, Senior: 6.5, Expert: 8 });

/** The room's size in ms of work for a tier, plus extra hours (bags, later). Unknown tier: no room. */
export function capacityMs(tier, extraHours = 0) {
  const base = ROOM_HOURS[tier];
  if (base === undefined) return 0;
  const extra = Number.isFinite(extraHours) && extraHours > 0 ? extraHours : 0;
  return (base + extra) * HOUR_MS;
}

export function isEmpty(room) {
  return Object.keys(room?.haul ?? {}).length === 0;
}

/** Work held, in ms. */
export function usedMs(room) {
  return Object.values(room?.haul ?? {}).reduce((sum, e) => sum + e.ms, 0);
}

/** Whether `ms` more work fits in a room of `capMs`. */
export function fits(room, capMs, ms) {
  return usedMs(room) + Math.max(0, ms) <= capMs;
}

/** Puts qty of an item worth `ms` of work in the room (the caller checked it fits). */
export function put(room, itemId, qty, ms) {
  if (!Number.isInteger(qty) || qty <= 0) return;
  const entry = room.haul[itemId] ?? { qty: 0, ms: 0 };
  entry.qty += qty;
  entry.ms += Math.max(0, ms);
  room.haul[itemId] = entry;
}

/** Takes up to qty of an item out with its share of the time; returns { qty, ms } taken. */
export function take(room, itemId, qty = Infinity) {
  const entry = room.haul[itemId];
  if (entry === undefined || !(qty > 0)) return { qty: 0, ms: 0 };
  const n = Math.min(entry.qty, Math.floor(qty));
  if (n >= entry.qty) {
    delete room.haul[itemId];
    return { qty: entry.qty, ms: entry.ms };
  }
  const ms = (entry.ms * n) / entry.qty;
  entry.qty -= n;
  entry.ms -= ms;
  return { qty: n, ms };
}

/** The stacks, the biggest share of work first. */
export function entries(room) {
  return Object.entries(room?.haul ?? {}).map(([id, e]) => ({ id, qty: e.qty, ms: e.ms })).sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id));
}

/** What the card shows: hours held and the room's size, its fill in percent. */
export function fillView(room, capMs) {
  const used = usedMs(room);
  return { usedHours: used / HOUR_MS, capHours: capMs / HOUR_MS, percent: capMs > 0 ? Math.min(100, (used / capMs) * 100) : 0 };
}

/**
 * A leaving Folk's items against a full bank, in order (its gear, then its room): `{ kept, lost }`. A kind the bank
 * holds (`inBank(id)`), or one already kept, always fits; a new kind takes one of `freeSlots`; an unknown item
 * (`known(id)` false: no loaded mod adds it) is lost. Each entry is { id, qty }.
 */
export function splitForBank(list, { freeSlots, inBank, known = () => true }) {
  const kept = [];
  const lost = [];
  const kinds = new Set();
  let free = Math.max(0, freeSlots);
  list.forEach(({ id, qty }) => {
    if (!known(id)) lost.push({ id, qty });
    else if (inBank(id) || kinds.has(id)) kept.push({ id, qty });
    else if (free > 0) {
      free -= 1;
      kinds.add(id);
      kept.push({ id, qty });
    } else lost.push({ id, qty });
  });
  return { kept, lost };
}
