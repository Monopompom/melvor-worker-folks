// Township Commissions: the rules (build .163, the user, 4 Nov 2026). Work Orders are the guild's own board; these are
// the town asking the guild for help. People of your town (the Miller, the Smith…) post requests: one item, 8 to 24
// hours of one Folk's work, a deadline. A Folk sent on one keeps that item in its room (the room's `town` side) and
// carries it to town in runs whenever the room fills; a run takes 45 minutes of game time, the Folk makes nothing
// then and its wages still run. A delivered commission pays Township resources on the scale of Township's own Casual
// Tasks (by Township level, ×1.25), Town Standing and a little Hiring XP; never GP. Late (past the deadline) it still
// counts for a day more at half the resources and four fifths of the Standing; after that the figure withdraws it and
// pays for what came, without the bonus. Nothing a Folk made is ever lost: what is left goes home to the bank.
// Standing grows by the hours of work delivered and fades a little each day after three days with no delivery; its
// tiers (Known, Trusted, Honoured) open the town's rewards. The board shows three commissions (four from Trusted),
// refilled every 24 h of game time. Pure: no game globals (tests/commissions-model.test.mjs).

export const BOARD_LEVEL = 30;
export const TICKS_PER_HOUR = 72000; // 50 ms ticks
export const DAY_TICKS = 24 * TICKS_PER_HOUR;
export const REFRESH_TICKS = DAY_TICKS;
/** Hours of one Folk's work a commission asks for: 8 to 24 in steps of 2. */
export const HOURS = { min: 8, max: 24, step: 2 };
/** A run to town: 45 minutes of game time. */
export const RUN_TICKS = 0.75 * TICKS_PER_HOUR;
/** The deadline: twice the work plus a day. Past it the commission is late for one more day. */
export const DEADLINE = { perHour: 2, extraHours: 24 };
export const OVERDUE_TICKS = DAY_TICKS;
/** Resources over the Casual Tasks' scale; late pays half of them and four fifths of the Standing. */
export const BONUS = 1.25;
export const LATE_RESOURCES = 0.5;
export const LATE_STANDING = 0.8;
/** Hiring XP, in levels' worth at delivery, for 8 hours of work (a third of a Work Order's pace). */
export const XP_LEVELS_PER_8H = 0.05;
/** Per skill, the newest recipes you have unlocked are the candidates, as for Work Orders. */
export const RECENT_RECIPES = 5;
/** Standing fades 2% a day once three days pass with no delivery. */
export const FADE_AFTER_TICKS = 3 * DAY_TICKS;
export const FADE_PER_DAY = 0.02;

/** Town Standing tiers: points needed and what each opens (Known: the Guild Charter; Trusted: a fourth commission). */
export const TIERS = [
  { id: 'Strangers', points: 0 },
  { id: 'Known', points: 40 },
  { id: 'Trusted', points: 150 },
  { id: 'Honoured', points: 400 },
];

/**
 * The town's people: what they ask for (skills) and the Township resource their reward is paid in. Weighted toward the
 * town's shortest resources; in winter toward Food and Clothing.
 */
export const FIGURES = Object.freeze([
  { id: 'Miller', skills: ['melvorD:Woodcutting'], resource: 'melvorF:Wood' },
  { id: 'Mason', skills: ['melvorD:Mining'], resource: 'melvorF:Stone' },
  { id: 'Smith', skills: ['melvorD:Smithing'], resource: 'melvorF:Bar' },
  { id: 'Baker', skills: ['melvorD:Cooking', 'melvorD:Fishing'], resource: 'melvorF:Food' },
  { id: 'Healer', skills: ['melvorD:Herblore'], resource: 'melvorF:Potions' },
  { id: 'Tailor', skills: ['melvorD:Crafting'], resource: 'melvorF:Clothing' },
  { id: 'Fletcher', skills: ['melvorD:Fletching'], resource: 'melvorF:Planks' },
  { id: 'Runewright', skills: ['melvorD:Runecrafting'], resource: 'melvorF:Rune_Essence' },
]);
const WINTER_NEEDS = new Set(['melvorF:Food', 'melvorF:Clothing']);
/** Lines per figure in the language file: asking, thanking, late. */
export const LINES = { ask: 3, thanks: 3, late: 2 };

/**
 * Township's Casual Tasks pay by Township level, not item value (read from the 1.3.1 data, 4 Nov 2026): 2,500 at
 * level 1, 10,000 at 15, 17,500 at 30, 30,000 at 50, 60,000 at 80. A commission pays that per 8 hours of work.
 */
export const RESOURCE_SCALE = Object.freeze([[1, 2500], [15, 10000], [20, 12500], [30, 17500], [40, 22500], [50, 30000], [60, 40000], [70, 50000], [80, 60000], [99, 75000]]);

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (n) => Number.isInteger(n) && n >= 0;
const clampCount = (n, max) => (isCount(n) ? Math.min(n, max) : 0);

export function figureOf(id) {
  return FIGURES.find((f) => f.id === id);
}

/** The Standing tier for `points`: its index in TIERS. */
export function tierOf(points) {
  let tier = 0;
  TIERS.forEach((t, i) => { if (points >= t.points) tier = i; });
  return tier;
}

/** Points to the next tier (null at the top). */
export function nextTierPoints(points) {
  const next = TIERS[tierOf(points) + 1];
  return next === undefined ? null : next.points;
}

/** Commissions on the board: three, four from Trusted. */
export function slotsFor(tier) {
  return tier >= 2 ? 4 : 3;
}

/** Township's Casual Task scale at a Township level, interpolated between the data's points. */
export function resourceScale(level) {
  const lv = Math.max(1, Number(level) || 1);
  const pts = RESOURCE_SCALE;
  if (lv >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i += 1) {
    const [l1, v1] = pts[i];
    const [l0, v0] = pts[i - 1];
    if (lv <= l1) return Math.round(v0 + ((v1 - v0) * (lv - l0)) / (l1 - l0));
  }
  return pts[0][1];
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
  return niceQuantity(((hours * 3600000) / Math.max(1, intervalMs)) * Math.max(1, perAction));
}

/** What a commission pays when delivered on time: resources, Standing points and Hiring XP in levels' worth. */
export function rewardFor({ hours, townshipLevel }) {
  return {
    resources: niceQuantity(resourceScale(townshipLevel) * (hours / 8) * BONUS),
    standing: hours,
    xpLevels: (hours / 8) * XP_LEVELS_PER_8H,
  };
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

/**
 * A figure's weight: 1, +1 when its resource is among the town's shortest half (`stock`: { resourceId: amount }), +1
 * in winter for Food and Clothing.
 */
export function figureWeight(figure, { stock = {}, season = null } = {}) {
  let w = 1;
  const amounts = FIGURES.map((f) => Number(stock[f.resource] ?? 0)).sort((a, b) => a - b);
  const median = amounts[Math.floor((amounts.length - 1) / 2)];
  if (Number(stock[figure.resource] ?? 0) <= median) w += 1;
  if (season === 'Winter' && WINTER_NEEDS.has(figure.resource)) w += 1;
  return w;
}

/** Per skill, the RECENT_RECIPES highest-level candidates (`{ skillId, itemId, itemIds, level, intervalMs, perAction }`). */
export function candidatePool(candidates) {
  const bySkill = new Map();
  for (const c of candidates ?? []) {
    if (!isObject(c) || typeof c.skillId !== 'string' || typeof c.itemId !== 'string' || !(c.intervalMs > 0)) continue;
    if (!bySkill.has(c.skillId)) bySkill.set(c.skillId, []);
    bySkill.get(c.skillId).push(c);
  }
  const out = [];
  bySkill.forEach((list) => out.push(...[...list].sort((a, b) => (b.level ?? 0) - (a.level ?? 0)).slice(0, RECENT_RECIPES)));
  return out;
}

/**
 * A new commission, or null when no figure has anything to ask. A figure already on the board, or an item already
 * asked, is not picked again.
 */
export function rollCommission({ candidates, townshipLevel = 1, stock = {}, season = null, rng = Math.random, makeId, onBoard = [] }) {
  const busy = new Set(onBoard.map((c) => c.figure));
  const taken = new Set(onBoard.flatMap((c) => c.itemIds ?? [c.itemId]));
  const pool = candidatePool(candidates).filter((c) => !(c.itemIds ?? [c.itemId]).some((id) => taken.has(id)));
  const open = FIGURES.filter((f) => !busy.has(f.id) && pool.some((c) => f.skills.includes(c.skillId)));
  const figure = pickWeighted(open, (f) => figureWeight(f, { stock, season }), rng);
  if (figure === undefined) return null;
  const mine = pool.filter((c) => figure.skills.includes(c.skillId));
  const c = mine[Math.min(mine.length - 1, Math.floor(rng() * mine.length))];
  const steps = Math.floor((HOURS.max - HOURS.min) / HOURS.step);
  const hours = HOURS.min + Math.min(steps, Math.floor(rng() * (steps + 1))) * HOURS.step;
  const reward = rewardFor({ hours, townshipLevel });
  return {
    id: makeId(),
    figure: figure.id,
    skillId: c.skillId,
    itemId: c.itemId,
    itemIds: [...new Set([c.itemId, ...(c.itemIds ?? [])])],
    qty: quantityFor({ hours, intervalMs: c.intervalMs, perAction: c.perAction }),
    hours,
    delivered: 0,
    folkId: null,
    age: 0,
    deadline: Math.round((DEADLINE.perHour * hours + DEADLINE.extraHours) * TICKS_PER_HOUR),
    late: false,
    state: 'open',
    resourceId: figure.resource,
    resources: reward.resources,
    standing: reward.standing,
    xpLevels: reward.xpLevels,
    line: 1 + Math.min(LINES.ask - 1, Math.floor(rng() * LINES.ask)),
    paid: null,
  };
}

export function createState() {
  return { commissions: [], ticks: 0, standing: { points: 0, idle: 0 }, runs: {}, delivered: 0 };
}

const normalizePaid = (raw) => (isObject(raw) && Number.isFinite(raw.resources) && Number.isFinite(raw.standing)
  ? { resources: Math.max(0, raw.resources), lost: Number.isFinite(raw.lost) && raw.lost > 0 ? Math.floor(raw.lost) : 0, standing: Math.max(0, raw.standing), late: raw.late === true }
  : null);

export function normalizeCommission(raw) {
  if (!isObject(raw)) return null;
  const { id, figure, skillId, itemId, qty, hours } = raw;
  if (typeof id !== 'string' || id === '' || figureOf(figure) === undefined) return null;
  if (typeof skillId !== 'string' || typeof itemId !== 'string' || !Number.isInteger(qty) || qty < 1) return null;
  // A figure asks only for its own trade's work (the Tailor never for Shrimp): one that doesn't is dropped.
  if (!figureOf(figure).skills.includes(skillId)) return null;
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const itemIds = Array.isArray(raw.itemIds) ? raw.itemIds.filter((x) => typeof x === 'string') : [];
  if (!itemIds.includes(itemId)) itemIds.unshift(itemId);
  const delivered = clampCount(raw.delivered, qty);
  const state = ['open', 'done', 'withdrawn'].includes(raw.state) ? raw.state : 'open';
  return {
    id,
    figure,
    skillId,
    itemId,
    itemIds,
    qty,
    hours,
    delivered,
    folkId: state === 'open' && typeof raw.folkId === 'string' && raw.folkId !== '' ? raw.folkId : null,
    age: isCount(raw.age) ? raw.age : 0,
    deadline: isCount(raw.deadline) && raw.deadline > 0 ? raw.deadline : Math.round((DEADLINE.perHour * hours + DEADLINE.extraHours) * TICKS_PER_HOUR),
    late: raw.late === true,
    state: state === 'open' && delivered >= qty ? 'done' : state,
    resourceId: figureOf(figure).resource,
    resources: isCount(raw.resources) ? raw.resources : 0,
    standing: Number.isFinite(raw.standing) && raw.standing >= 0 ? raw.standing : hours,
    xpLevels: Number.isFinite(raw.xpLevels) && raw.xpLevels >= 0 ? raw.xpLevels : 0,
    line: Number.isInteger(raw.line) && raw.line >= 1 && raw.line <= LINES.ask ? raw.line : 1,
    paid: normalizePaid(raw.paid),
  };
}

/** The saved state: anything unreadable is a fresh one; bad commissions go, ids stay unique, runs need a Folk id. */
export function normalizeState(raw) {
  if (!isObject(raw)) return createState();
  const seen = new Set();
  const commissions = [];
  for (const c of Array.isArray(raw.commissions) ? raw.commissions : []) {
    const n = normalizeCommission(c);
    if (n === null || seen.has(n.id) || commissions.length >= slotsFor(TIERS.length - 1)) continue;
    seen.add(n.id);
    commissions.push(n);
  }
  // One commission per Folk.
  const folks = new Set();
  commissions.forEach((c) => {
    if (c.folkId === null) return;
    if (folks.has(c.folkId)) c.folkId = null;
    else folks.add(c.folkId);
  });
  const runs = {};
  if (isObject(raw.runs)) {
    for (const [folkId, run] of Object.entries(raw.runs)) {
      if (!isObject(run) || !isCount(run.ticks) || typeof run.commissionId !== 'string') continue;
      // restart: the Folk was working when it set off, so it goes back to work when it is back.
      // pick: what it was working on, as plain ids (checked when it is replayed); null = a plain start.
      const pick = isObject(run.pick) ? run.pick : null;
      runs[folkId] = { ticks: Math.min(run.ticks, RUN_TICKS), commissionId: run.commissionId, restart: run.restart === true, pick };
    }
  }
  const s = isObject(raw.standing) ? raw.standing : {};
  return {
    commissions,
    ticks: clampCount(raw.ticks, REFRESH_TICKS),
    standing: { points: Number.isFinite(s.points) && s.points > 0 ? s.points : 0, idle: isCount(s.idle) ? s.idle : 0 },
    runs,
    delivered: isCount(raw.delivered) ? raw.delivered : 0,
  };
}

/** Fills the board up to `slots`. Returns the commissions added. */
export function fill(state, opts, slots) {
  const added = [];
  while (state.commissions.length < slots) {
    const c = rollCommission({ ...opts, onBoard: state.commissions });
    if (c === null) break;
    state.commissions.push(c);
    added.push(c);
  }
  return added;
}

/** The daily refresh: delivered and withdrawn commissions go, the clock restarts and the board fills again. */
export function refresh(state, opts, slots) {
  state.commissions = state.commissions.filter((c) => c.state === 'open');
  state.ticks = 0;
  return fill(state, opts, slots);
}

/**
 * Moves every clock by `ticks`: the board's refresh, each open commission's age (late past its deadline, withdrawn a
 * day after), Standing's fading. Returns { refresh, late: [commission], withdrawn: [commission] }.
 */
export function advance(state, ticks = 1) {
  state.ticks = Math.min(REFRESH_TICKS, state.ticks + ticks);
  const late = [];
  const withdrawn = [];
  for (const c of state.commissions) {
    if (c.state !== 'open') continue;
    c.age += ticks;
    if (!c.late && c.age >= c.deadline) {
      c.late = true;
      late.push(c);
    }
    if (c.age >= c.deadline + OVERDUE_TICKS) {
      c.state = 'withdrawn';
      withdrawn.push(c);
    }
  }
  fade(state.standing, ticks);
  return { refresh: state.ticks >= REFRESH_TICKS, late, withdrawn };
}

/** Standing's idle clock; past FADE_AFTER_TICKS the points shrink FADE_PER_DAY a day. */
export function fade(standing, ticks) {
  const before = standing.idle;
  standing.idle += ticks;
  const fading = Math.max(0, standing.idle - Math.max(before, FADE_AFTER_TICKS));
  if (fading > 0 && standing.points > 0) standing.points *= (1 - FADE_PER_DAY) ** (fading / DAY_TICKS);
}

export function ticksLeft(state) {
  return Math.max(0, REFRESH_TICKS - state.ticks);
}

/** Ticks to the deadline (negative once late). */
export function deadlineLeft(c) {
  return c.deadline - c.age;
}

/** The commission a Folk works for, if any. */
export function commissionOf(state, folkId) {
  return state.commissions.find((c) => c.state === 'open' && c.folkId === folkId);
}

/** How many more of the item the commission needs. */
export function remaining(c) {
  return Math.max(0, c.qty - c.delivered);
}

/** Counts `qty` delivered. Returns { added, done }; anything past the amount is not taken. */
export function deliver(c, qty) {
  if (c.state !== 'open' || !(qty > 0)) return { added: 0, done: false };
  const added = Math.min(Math.floor(qty), remaining(c));
  c.delivered += added;
  if (c.delivered >= c.qty) {
    c.state = 'done';
    c.folkId = null;
  }
  return { added, done: c.state === 'done' };
}

/** What a delivered commission pays: on time all of it, late half the resources and four fifths of the Standing. */
export function payout(c) {
  return {
    resources: Math.floor(c.resources * (c.late ? LATE_RESOURCES : 1)),
    standing: c.standing * (c.late ? LATE_STANDING : 1),
    xpLevels: c.xpLevels,
    late: c.late,
  };
}

/** A withdrawn commission pays for what came, without the bonus; no Standing, no XP. */
export function proRata(c) {
  if (!(c.qty > 0)) return { resources: 0 };
  return { resources: Math.floor((c.resources * (c.delivered / c.qty)) / BONUS) };
}

/** Adds Standing; returns { before, after } as tiers. A delivery also resets the fading clock. */
export function gainStanding(standing, points) {
  const before = tierOf(standing.points);
  standing.points += Math.max(0, points);
  standing.idle = 0;
  return { before, after: tierOf(standing.points) };
}

/**
 * Whether a Folk on a commission should go to town now: it holds the rest of the amount, or the room has no space for
 * one more action. Never with nothing to carry.
 */
export function runDue({ townQty, remaining: rest, usedMs, capMs, nextMs }) {
  if (!(townQty > 0)) return false;
  return townQty >= rest || usedMs + Math.max(0, nextMs) > capMs;
}

/** Runs still to go for the rest of a commission, each carrying a room's worth (`perRunQty`, what fits in the room). */
export function runsLeft({ rest, perRunQty }) {
  if (!(rest > 0)) return 0;
  return perRunQty > 0 ? Math.max(1, Math.ceil(rest / perRunQty)) : 1;
}
