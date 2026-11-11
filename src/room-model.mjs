// A Folk's room: what it holds for you instead of the bank, measured in hours of work. Pure: no game globals.
//
// Build .150 gives the room its first job: a buffer for a full bank. Output of a new kind of item that finds no free
// bank slot waits in the room instead of being lost (the game's own rule stops the skill too), and goes to the bank
// on its own once a slot is free.
//
// Hours of work, never item counts: every stack keeps the action time that made it (`ms`), so 1,200 logs an hour and
// a few dozen bars an hour fill a room alike. An action charges its time once, to the first item it puts in the room;
// taking n of a stack takes n / qty of its time. A change of interval needs no special case. The room's saved shape
// ({ haul: { itemId: { qty, ms } }, stock: { … } }) and its check are in folk.mjs with the rest of the Folk record.
//
// Build .152 adds the stock: inputs a Folk set to work from its own stock takes instead of your bank, put in by
// Restock. A restocked stack weighs the action time it feeds (the actions it is enough for, its share of each), so as
// inputs are used the room empties at the rate the Folk works. Haul and stock share one size. A bag worn in the
// Folk's Cape slot makes the room bigger: a Satchel by a third of the tier's bag room, a Pack by two thirds, a Frame
// Pack by all of it.
//
// Township Commissions (build .163) add a third side, `town`: what a Folk makes for a commission, kept for the town
// and never emptied to the bank. It takes room like the rest, so a full room sends the Folk on a run to town.

const HOUR_MS = 3_600_000;

/** Room size in hours by tier (Trainee 2 h up to Foreman 8 h). */
export const ROOM_HOURS = Object.freeze({ Newbie: 2, Junior: 3.5, Middle: 5, Senior: 6.5, Expert: 8 });

/** The extra hours a bag can give, by tier: the room with a Frame Pack is 4 h for a Trainee up to 12 h for a Foreman. */
export const BAG_HOURS = Object.freeze({ Newbie: 2, Junior: 2.5, Middle: 3, Senior: 3.5, Expert: 4 });

/** The bags (local ids in the mod's namespace) and the share of BAG_HOURS each gives. */
export const BAG_SHARE = Object.freeze({ Folk_Satchel: 1 / 3, Folk_Pack: 2 / 3, Folk_Frame_Pack: 1 });

/** Extra hours from the item in a Folk's Cape slot (its full id); 0 for anything that is not a bag. */
export function bagHours(tier, itemId, namespace = 'worker_folks') {
  const prefix = `${namespace}:`;
  if (typeof itemId !== 'string' || !itemId.startsWith(prefix)) return 0;
  const share = BAG_SHARE[itemId.slice(prefix.length)];
  const hours = BAG_HOURS[tier];
  return share === undefined || hours === undefined ? 0 : hours * share;
}

/**
 * The bags' recipes (the Amulets of Looting the user's: 1, 6 and 12). The amulet drops only from the Spider Chest,
 * about one in 22, so a Frame Pack's 19 amulets are some 420 chests: a long goal, as meant. Past the Satchel the
 * work is in what the Shop doesn't sell (it sells Leather and Green, Blue and Red Dragonhide for GP): the Pack takes
 * Bobby's Pockets, Thieving's rare find (one in 120 steals, so 10 are some 1,200) and Mithril Bars (Smithing 50, the
 * Pack's own level); the Frame Pack 250 Black Dragonhide (a drop only) and 400 Runite Bars (the user, 30 Oct
 * 2026). Each bag's XP is that of the game's best jewellery at its level (Gold Sapphire, Emerald and Diamond
 * Necklaces): the bags are worth making for the room, never for the XP.
 */
export const BAG_RECIPES = Object.freeze([
  { id: 'Folk_Satchel', media: 'assets/bag_satchel.webp', level: 20, xp: 45, sellsFor: 2_500,
    costs: [['melvorD:Leather', 40], ['melvorD:Amulet_of_Looting', 1]] },
  { id: 'Folk_Pack', media: 'assets/bag_pack.webp', level: 50, xp: 130, sellsFor: 10_000,
    costs: [['worker_folks:Folk_Satchel', 1], ['melvorF:Bobbys_Pocket', 10], ['melvorD:Mithril_Bar', 150], ['melvorD:Amulet_of_Looting', 6]] },
  { id: 'Folk_Frame_Pack', media: 'assets/bag_frame_pack.webp', level: 80, xp: 250, sellsFor: 40_000,
    costs: [['worker_folks:Folk_Pack', 1], ['melvorD:Black_Dragonhide', 250], ['melvorD:Runite_Bar', 400], ['melvorD:Amulet_of_Looting', 12]] },
]);

/** "+0.7 h to +1.3 h": what a bag adds, from a Trainee's room to a Foreman's. */
export function bagRange(id) {
  const share = BAG_SHARE[id] ?? 0;
  const h = (x) => `${Math.round(x * share * 10) / 10}`;
  return { low: h(BAG_HOURS.Newbie), high: h(BAG_HOURS.Expert) };
}

/**
 * The bags' data package: the three items (worn in a Folk's Cape slot, no modifiers: the room reads the slot) and,
 * with the full game, their Crafting recipes among the game's own Bags. `text(id)` gives { name, description }.
 */
export function bagPackage({ hasFull = true } = {}, text = (id) => ({ name: id, description: '' })) {
  const items = BAG_RECIPES.map((b) => ({
    itemType: 'Equipment',
    id: b.id,
    name: text(b.id).name,
    customDescription: text(b.id).description,
    category: 'Hiring',
    type: 'Bag',
    media: b.media,
    ignoreCompletion: false,
    obtainFromItemLog: false,
    golbinRaidExclusive: false,
    sellsFor: b.sellsFor,
    validSlots: ['Cape'],
    occupiesSlots: [],
    equipRequirements: [],
    equipmentStats: [],
  }));
  if (!hasFull) return { items };
  return {
    items,
    skillData: [{
      skillID: 'melvorD:Crafting',
      data: {
        recipes: BAG_RECIPES.map((b) => ({
          id: b.id,
          level: b.level,
          productID: `worker_folks:${b.id}`,
          baseQuantity: 1,
          baseExperience: b.xp,
          categoryID: 'melvorF:Bags',
          itemCosts: b.costs.map(([id, quantity]) => ({ id, quantity })),
          currencyCosts: [],
        })),
      },
    }],
  };
}

/** The room's size in ms of work for a tier, plus extra hours (a bag). Unknown tier: no room. */
export function capacityMs(tier, extraHours = 0) {
  const base = ROOM_HOURS[tier];
  if (base === undefined) return 0;
  const extra = Number.isFinite(extraHours) && extraHours > 0 ? extraHours : 0;
  return (base + extra) * HOUR_MS;
}

/** The room's sides: 'haul' (what it holds for you), 'stock' (its inputs), 'town' (a commission's goods). */
export const SIDES = Object.freeze(['haul', 'stock', 'town']);
const keyOf = (side) => (SIDES.includes(side) ? side : 'haul');
const sideOf = (room, side) => room?.[keyOf(side)];

/** Nothing held on that side ('haul', the default, or 'stock'). */
export function isEmpty(room, side = 'haul') {
  return Object.keys(sideOf(room, side) ?? {}).length === 0;
}

/** Work held on every side, in ms. */
export function usedMs(room) {
  const sum = (stacks) => Object.values(stacks ?? {}).reduce((total, e) => total + e.ms, 0);
  return sum(room?.haul) + sum(room?.stock) + sum(room?.town);
}

/** Whether `ms` more work fits in a room of `capMs`. */
export function fits(room, capMs, ms) {
  return usedMs(room) + Math.max(0, ms) <= capMs;
}

/** Puts qty of an item worth `ms` of work on a side of the room (the caller checked it fits). */
export function put(room, itemId, qty, ms, side = 'haul') {
  if (!Number.isInteger(qty) || qty <= 0) return;
  const key = keyOf(side);
  room[key] ??= {};
  const entry = room[key][itemId] ?? { qty: 0, ms: 0 };
  entry.qty += qty;
  entry.ms += Math.max(0, ms);
  room[key][itemId] = entry;
}

/** Takes up to qty of an item off a side with its share of the time; returns { qty, ms } taken. */
export function take(room, itemId, qty = Infinity, side = 'haul') {
  const stacks = sideOf(room, side);
  const entry = stacks?.[itemId];
  if (entry === undefined || !(qty > 0)) return { qty: 0, ms: 0 };
  const n = Math.min(entry.qty, Math.floor(qty));
  if (n >= entry.qty) {
    delete stacks[itemId];
    return { qty: entry.qty, ms: entry.ms };
  }
  const ms = (entry.ms * n) / entry.qty;
  entry.qty -= n;
  entry.ms -= ms;
  return { qty: n, ms };
}

/** How many of an item a side holds. */
export function qtyOf(room, itemId, side = 'haul') {
  return sideOf(room, side)?.[itemId]?.qty ?? 0;
}

/** A side's stacks, the biggest share of work first. */
export function entries(room, side = 'haul') {
  return Object.entries(sideOf(room, side) ?? {}).map(([id, e]) => ({ id, qty: e.qty, ms: e.ms })).sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id));
}

/** Whether the stock holds every input of one action: [{ id, qty }]. */
export function stockCovers(room, perAction) {
  return perAction.every(({ id, qty }) => qtyOf(room, id, 'stock') >= qty);
}

/**
 * Restock: as many actions' inputs as the free room holds and the bank has, the same number for every input.
 * `perAction` is one action's inputs [{ id, qty }], `intervalMs` the Folk's action time, `freeMs` the room's free
 * work, `bankQty(id)` what the bank holds, `maxActions` (optional) the most the player asked for (the card's slider,
 * build .153). Each input's stack weighs an even share of those actions' time. Returns
 * { actions, items: [{ id, qty, ms }], short } where `short` is the input the bank ran out of first (null when the
 * room's space or the asked amount was the limit, or nothing was asked).
 */
export function restockPlan({ perAction, intervalMs, freeMs, bankQty, maxActions = Infinity }) {
  const inputs = (perAction ?? []).filter(({ qty }) => Number.isInteger(qty) && qty > 0);
  if (inputs.length === 0 || !(intervalMs > 0)) return { actions: 0, items: [], short: null };
  const asked = Number.isFinite(maxActions) ? Math.max(0, Math.floor(maxActions)) : Infinity;
  const bySpace = Math.min(asked, Math.max(0, Math.floor(freeMs / intervalMs)));
  let actions = bySpace;
  let short = null;
  inputs.forEach(({ id, qty }) => {
    const byBank = Math.floor(Math.max(0, bankQty(id)) / qty);
    if (byBank < actions) {
      actions = byBank;
      short = id;
    }
  });
  if (actions === 0) return { actions: 0, items: [], short: bySpace === 0 ? null : short };
  const ms = (actions * intervalMs) / inputs.length;
  return { actions, items: inputs.map(({ id, qty }) => ({ id, qty: qty * actions, ms })), short };
}

/**
 * Where a Folk's goods go (API v10): 'bank' (as without the haul: the bank, the own-stock switch deciding the inputs)
 * or 'room' (another mod's haul: everything it makes waits in its room, its inputs come only from its stock). Any
 * other answer from that mod's hook reads 'bank', so a broken hook never strands a Folk's goods.
 */
export const ACCESS = Object.freeze(['bank', 'room']);
export function normalizeAccess(answer) {
  return answer === 'room' ? 'room' : 'bank';
}

/**
 * The hook's whole answer (round 3): 'bank' / 'room', or { access, depot } naming the depot (another mod's id) a Folk
 * on the room shares. { access, depot } with depot null for none; a depot on 'bank' means nothing and is left out.
 */
export function normalizeAnswer(answer) {
  if (answer !== null && typeof answer === 'object') {
    const access = normalizeAccess(answer.access);
    const depot = access === 'room' && typeof answer.depot === 'string' && answer.depot !== '' && answer.depot.length <= 120 ? answer.depot : null;
    return { access, depot };
  }
  return { access: normalizeAccess(answer), depot: null };
}

/** The room's state for other mods: 'full' (no space for the next action), 'dry' (out of inputs) or 'ok'. */
export function stateOf({ full = false, dry = false } = {}) {
  return full ? 'full' : dry ? 'dry' : 'ok';
}

/** Adds currency to the purse (v9): a positive, finite amount only. */
export function putPurse(room, currencyId, amount) {
  if (room === undefined || typeof currencyId !== 'string' || currencyId === '' || !(Number.isFinite(amount) && amount > 0)) return;
  room.purse ??= {};
  room.purse[currencyId] = (room.purse[currencyId] ?? 0) + amount;
}

/** The purse as [{ id, amount }], the biggest amount first. */
export function purseEntries(room) {
  return Object.entries(room?.purse ?? {}).map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
}

/** Empties the purse; returns what it held, as purseEntries. */
export function takePurse(room) {
  const list = purseEntries(room);
  if (room !== undefined) room.purse = {};
  return list;
}

/** Stock items the current recipe does not use (`recipeIds`): leftovers a collection may send home. */
export function leftoverIds(room, recipeIds) {
  const used = new Set(recipeIds ?? []);
  return Object.keys(room?.stock ?? {}).filter((id) => !used.has(id)).sort();
}

/** Hours of work the stock feeds now. */
export function stockHours(room) {
  return Object.values(room?.stock ?? {}).reduce((total, e) => total + e.ms, 0) / HOUR_MS;
}

/**
 * Auto-restock (v9): due when the stock feeds fewer hours than the Folk's threshold and the room has space for at
 * least one more action. `atHours` null or not positive: off.
 */
export function restockDue({ room, atHours, capMs, intervalMs }) {
  if (!(Number.isFinite(atHours) && atHours > 0) || !(intervalMs > 0)) return false;
  if (stockHours(room) >= atHours) return false;
  return capMs - usedMs(room) >= intervalMs;
}

/** The auto-restock lines a player can pick, in hours of stock (build .202). */
export const RESTOCK_AT_HOURS = Object.freeze([0.25, 0.5, 1, 2, 3, 4, 6, 8]);

/** The lines that fit a room of `capHours`: below its size, so a refill always has room to add. */
export function restockAtOptions(capHours) {
  const fit = RESTOCK_AT_HOURS.filter((h) => h < capHours);
  return fit.length > 0 ? fit : [RESTOCK_AT_HOURS[0]];
}

/** The line a switched-on auto-restock starts at: the largest within a quarter of the room, else the smallest. */
export function defaultRestockAt(capHours) {
  const fit = restockAtOptions(capHours).filter((h) => h <= capHours / 4);
  return fit.length > 0 ? fit[fit.length - 1] : RESTOCK_AT_HOURS[0];
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
