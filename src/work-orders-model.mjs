// Work Orders: the board's rules (the user, 28 Oct 2026). A board on the Hiring page asks for items that only Folks'
// work fills: 2 Small orders at Hiring 8, 3 with Medium ones at 30, a reroll at 50, 4 with Large ones at 70. Each
// order asks for about 2 / 6 / 16 hours of one Folk's work on a recipe you have unlocked, and pays a GP share of the
// wages its own work cost (rolled per order, 0.5× to 3×), Hiring XP, and items: Medium a Hiring mastery token, Large
// one pick from a pool (tokens, a diploma, junk or gems). Every 24 h of game time the board refreshes: delivered and
// untouched orders go, an order in progress gets one more day. A delivered order's place stays empty until then.
// Pure: no game globals (tests/work-orders-model.test.mjs).

export const BOARD_LEVEL = 8;
export const MEDIUM_LEVEL = 30;
export const REROLL_LEVEL = 50;
export const LARGE_LEVEL = 70;
export const REROLL_COST = 1000000;
export const TICKS_PER_HOUR = 72000; // 50 ms ticks
export const REFRESH_TICKS = 24 * TICKS_PER_HOUR;
/** Refreshes an order in progress survives before it goes undelivered. */
export const AGE_LIMIT = 1;

export const SIZES = ['Small', 'Medium', 'Large'];
/** Hours of one Folk's work at the recipe's base pace, Hiring XP in levels' worth at delivery, roll weight. */
export const SIZE = {
  Small: { hours: 2, xpLevels: 0.5, weight: 6, tokens: 0 },
  Medium: { hours: 6, xpLevels: 1, weight: 3, tokens: 1 },
  Large: { hours: 16, xpLevels: 2, weight: 1, tokens: 0 },
};
/** The order's GP share of its wages: 0.5× to 3× in quarter steps, rolled when it appears. */
export const GP_RATE = { min: 0.5, max: 3, step: 0.25 };
/** Per skill, the newest recipes you have unlocked are the candidates (no Normal Logs at Woodcutting 99). */
export const RECENT_RECIPES = 5;
/** What a Large order adds, one pick (the user: tokens up to 2, a diploma, junk or valuables). */
export const LARGE_EXTRAS = [
  { kind: 'tokens', weight: 3 },
  { kind: 'diploma', weight: 2 },
  { kind: 'junk', weight: 3 },
  { kind: 'gems', weight: 2 },
];
export const JUNK_QTY = { min: 20, max: 100 };
export const GEMS_QTY = { min: 5, max: 15 };
export const TOKENS_QTY = { min: 1, max: 2 };
/** Most orders a board keeps (the largest slot count). */
export const MAX_ORDERS = 4;

const between = (rng, { min, max }) => min + Math.floor(rng() * (max - min + 1));
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (n) => Number.isInteger(n) && n >= 0;

export function slotsFor(level) {
  if (level < BOARD_LEVEL) return 0;
  if (level < MEDIUM_LEVEL) return 2;
  if (level < LARGE_LEVEL) return 3;
  return 4;
}

export function sizesFor(level) {
  if (level < BOARD_LEVEL) return [];
  return SIZES.filter((s) => s === 'Small' || (s === 'Medium' && level >= MEDIUM_LEVEL) || (s === 'Large' && level >= LARGE_LEVEL));
}

export function rerollUnlocked(level) {
  return level >= REROLL_LEVEL;
}

/** One entry of `list` by its weight; undefined for an empty list. */
export function pickWeighted(list, weightOf, rng = Math.random) {
  const total = list.reduce((s, x) => s + Math.max(0, weightOf(x)), 0);
  if (!(total > 0)) return undefined;
  let r = rng() * total;
  for (const x of list) {
    r -= Math.max(0, weightOf(x));
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

export function rollGpRate(rng = Math.random) {
  const steps = Math.round((GP_RATE.max - GP_RATE.min) / GP_RATE.step);
  return GP_RATE.min + Math.min(steps, Math.floor(rng() * (steps + 1))) * GP_RATE.step;
}

/** A quantity a person would ask for: two significant digits (1,234 → 1,200; 87 stays), at least 1. */
export function niceQuantity(raw) {
  const n = Math.max(1, Number(raw) || 1);
  if (n < 100) return Math.round(n);
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / unit) * unit;
}

/** How many items `hours` of one Folk's work makes: actions at `intervalMs`, `perAction` items each. */
export function quantityFor({ hours, intervalMs, perAction = 1 }) {
  const actions = (hours * 3600000) / Math.max(1, intervalMs);
  return niceQuantity(actions * Math.max(1, perAction));
}

/**
 * The candidates a board picks from: per skill, the RECENT_RECIPES highest-level ones. A candidate is
 * `{ skillId, itemId, itemIds, level, intervalMs, perAction }`; `itemIds` are every item that fills it (a potion's
 * four tiers, a cooked food and its perfect one).
 */
export function candidatePool(candidates) {
  const bySkill = new Map();
  for (const c of candidates) {
    if (c === null || typeof c !== 'object' || typeof c.skillId !== 'string' || typeof c.itemId !== 'string') continue;
    if (!(c.intervalMs > 0)) continue;
    if (!bySkill.has(c.skillId)) bySkill.set(c.skillId, []);
    bySkill.get(c.skillId).push(c);
  }
  const out = [];
  bySkill.forEach((list) => out.push(...[...list].sort((a, b) => (b.level ?? 0) - (a.level ?? 0)).slice(0, RECENT_RECIPES)));
  return out;
}

/** A Large order's extra, rolled when the order appears so its card can show it. */
export function rollExtra({ rng = Math.random, diplomaId = null, junkIds = [] } = {}) {
  const kinds = LARGE_EXTRAS.filter((e) => (e.kind !== 'diploma' || typeof diplomaId === 'string') && (e.kind !== 'junk' || junkIds.length > 0));
  const pick = pickWeighted(kinds, (e) => e.weight, rng);
  switch (pick?.kind) {
    case 'diploma': return { kind: 'item', itemId: diplomaId, qty: 1 };
    case 'junk': return { kind: 'item', itemId: junkIds[Math.min(junkIds.length - 1, Math.floor(rng() * junkIds.length))], qty: between(rng, JUNK_QTY) };
    case 'gems': return { kind: 'gems', qty: between(rng, GEMS_QTY) };
    default: return { kind: 'tokens', qty: between(rng, TOKENS_QTY) };
  }
}

/**
 * A new order for a board at `level`, or null when nothing can be asked for. An item already on the board is never
 * asked twice; a skill not on the board yet goes first, so a board spreads over the crew.
 */
export function rollOrder({ candidates, level, rng = Math.random, makeId, onBoard = [], diplomaId = null, junkIds = [] }) {
  const sizes = sizesFor(level);
  if (sizes.length === 0) return null;
  const taken = new Set(onBoard.flatMap((o) => o.itemIds ?? [o.itemId]));
  const busySkills = new Set(onBoard.map((o) => o.skillId));
  const pool = candidatePool(candidates).filter((c) => !(c.itemIds ?? [c.itemId]).some((id) => taken.has(id)));
  if (pool.length === 0) return null;
  const fresh = pool.filter((c) => !busySkills.has(c.skillId));
  const from = fresh.length > 0 ? fresh : pool;
  const skills = [...new Set(from.map((c) => c.skillId))];
  const skillId = skills[Math.min(skills.length - 1, Math.floor(rng() * skills.length))];
  const inSkill = from.filter((c) => c.skillId === skillId);
  const c = inSkill[Math.min(inSkill.length - 1, Math.floor(rng() * inSkill.length))];
  const size = pickWeighted(sizes, (s) => SIZE[s].weight, rng);
  return {
    id: makeId(),
    skillId,
    itemId: c.itemId,
    itemIds: [...new Set([c.itemId, ...(c.itemIds ?? [])])],
    qty: quantityFor({ hours: SIZE[size].hours, intervalMs: c.intervalMs, perAction: c.perAction }),
    delivered: 0,
    size,
    gpRate: rollGpRate(rng),
    wages: 0,
    state: 'open',
    aged: 0,
    extra: size === 'Large' ? rollExtra({ rng, diplomaId, junkIds }) : null,
    paid: null,
  };
}

export function createBoard() {
  return { orders: [], ticks: 0 };
}

const normalizeExtra = (raw) => {
  if (!isObject(raw)) return null;
  if (raw.kind === 'tokens' || raw.kind === 'gems') return isCount(raw.qty) && raw.qty > 0 ? { kind: raw.kind, qty: raw.qty } : null;
  if (raw.kind === 'item' && typeof raw.itemId === 'string' && isCount(raw.qty) && raw.qty > 0) return { kind: 'item', itemId: raw.itemId, qty: raw.qty };
  return null;
};

/** What a delivered order paid out, kept so its card shows that and not today's XP. */
const normalizePaid = (raw) => (isObject(raw) && Number.isFinite(raw.gp) && Number.isFinite(raw.xp)
  ? { gp: Math.max(0, raw.gp), xp: Math.max(0, raw.xp) }
  : null);

export function normalizeOrder(raw) {
  if (!isObject(raw)) return null;
  const { id, skillId, itemId, qty, size } = raw;
  if (typeof id !== 'string' || id === '' || typeof skillId !== 'string' || typeof itemId !== 'string') return null;
  if (!Number.isInteger(qty) || qty < 1 || !SIZES.includes(size)) return null;
  const itemIds = Array.isArray(raw.itemIds) ? raw.itemIds.filter((x) => typeof x === 'string') : [];
  if (!itemIds.includes(itemId)) itemIds.unshift(itemId);
  const delivered = isCount(raw.delivered) ? Math.min(raw.delivered, qty) : 0;
  const gpRate = Number(raw.gpRate);
  return {
    id,
    skillId,
    itemId,
    itemIds,
    qty,
    delivered,
    size,
    gpRate: Number.isFinite(gpRate) ? Math.min(GP_RATE.max, Math.max(GP_RATE.min, gpRate)) : GP_RATE.min,
    wages: Number.isFinite(raw.wages) && raw.wages > 0 ? raw.wages : 0,
    state: raw.state === 'done' || delivered >= qty ? 'done' : 'open',
    aged: isCount(raw.aged) ? raw.aged : 0,
    extra: size === 'Large' ? normalizeExtra(raw.extra) : null,
    paid: normalizePaid(raw.paid),
  };
}

/** A board from the save: anything unreadable is a fresh board; bad orders are dropped, ids kept unique. */
export function normalizeBoard(raw) {
  if (!isObject(raw)) return createBoard();
  const seen = new Set();
  const orders = [];
  for (const o of Array.isArray(raw.orders) ? raw.orders : []) {
    const order = normalizeOrder(o);
    if (order === null || seen.has(order.id) || orders.length >= MAX_ORDERS) continue;
    seen.add(order.id);
    orders.push(order);
  }
  return { orders, ticks: isCount(raw.ticks) ? Math.min(raw.ticks, REFRESH_TICKS) : 0 };
}

/** Fills the board up to its slot count for `level`. Returns the orders added. `avoid`: orders not to repeat. */
export function fill(board, opts, avoid = []) {
  const added = [];
  while (board.orders.length < slotsFor(opts.level)) {
    const order = rollOrder({ ...opts, onBoard: [...board.orders, ...avoid] });
    if (order === null) break;
    board.orders.push(order);
    added.push(order);
  }
  return added;
}

/**
 * The daily refresh: delivered and untouched orders go, an order in progress stays for one more day (then it goes
 * too, undelivered), the clock restarts and the board fills again. Returns { expired, kept, added }.
 */
export function refresh(board, opts) {
  const kept = [];
  const expired = [];
  for (const o of board.orders) {
    if (o.state === 'open' && o.delivered > 0) {
      if (o.aged < AGE_LIMIT) { o.aged += 1; kept.push(o); } else expired.push(o);
    }
  }
  board.orders = [...kept];
  board.ticks = 0;
  return { expired, kept, added: fill(board, opts) };
}

/** Moves the board's clock; true when the refresh is due. */
export function advance(board, ticks = 1) {
  board.ticks = Math.min(REFRESH_TICKS, board.ticks + ticks);
  return board.ticks >= REFRESH_TICKS;
}

export function ticksLeft(board) {
  return Math.max(0, REFRESH_TICKS - board.ticks);
}

/** The open order `itemId` fills, if any. */
export function orderFor(board, itemId) {
  return board.orders.find((o) => o.state === 'open' && o.itemIds.includes(itemId));
}

/** Counts `qty` toward an open order. Returns { added, done }. */
export function deliver(order, qty) {
  if (order.state !== 'open' || !(qty > 0)) return { added: 0, done: false };
  const added = Math.min(Math.floor(qty), order.qty - order.delivered);
  order.delivered += added;
  if (order.delivered >= order.qty) order.state = 'done';
  return { added, done: order.state === 'done' };
}

/**
 * What a delivered order pays. `xpToNext`: the Hiring XP from the level at delivery to the next. With wages off (No
 * sweat) there are no wages, so no GP (the user, 28 Oct 2026).
 */
export function rewardFor(order, { xpToNext, wagesOn = true }) {
  const extra = order.extra ?? null;
  return {
    gp: wagesOn ? Math.floor(order.wages * order.gpRate) : 0,
    xp: Math.max(1, Math.ceil(SIZE[order.size].xpLevels * Math.max(0, xpToNext))),
    tokens: SIZE[order.size].tokens + (extra?.kind === 'tokens' ? extra.qty : 0),
    items: extra?.kind === 'item' ? [{ itemId: extra.itemId, qty: extra.qty }] : [],
    gems: extra?.kind === 'gems' ? extra.qty : 0,
  };
}

/** Untouched open orders replaced by new ones (the reroll). Returns the number replaced. */
export function reroll(board, opts) {
  const keep = board.orders.filter((o) => o.state !== 'open' || o.delivered > 0);
  const gone = board.orders.filter((o) => !keep.includes(o));
  if (gone.length === 0) return 0;
  board.orders = keep;
  // Not the same items again: the replaced ones count as taken for this roll (they come back when nothing else can).
  const replaced = fill(board, opts, gone);
  if (board.orders.length < slotsFor(opts.level)) fill(board, opts);
  return replaced.length;
}

/** Whether a reroll would change anything: an open order nobody has started. */
export function canReroll(board) {
  return board.orders.some((o) => o.state === 'open' && o.delivered === 0);
}
