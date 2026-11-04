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
/** Hiring XP, in levels' worth at delivery, for 8 hours of work (build .175: halved from 0.05, so a day of commissions
 * is a quarter to a third of a day of Work Orders late on and Hiring 99 comes about four days early, not eight). */
export const XP_LEVELS_PER_8H = 0.025;
/** Per skill, the newest recipes you have unlocked are the candidates, as for Work Orders. */
export const RECENT_RECIPES = 5;
/** Standing fades 2% a day once three days pass with no delivery. */
export const FADE_AFTER_TICKS = 3 * DAY_TICKS;
export const FADE_PER_DAY = 0.02;

/**
 * Town Standing tiers: points needed and what each opens (Known: the Guild Charter; Trusted: a fourth commission and
 * Townsfolk; Honoured: Freedom of the Town).
 */
export const TIERS = [
  { id: 'Strangers', points: 0 },
  { id: 'Known', points: 80 },
  { id: 'Trusted', points: 300 },
  { id: 'Honoured', points: 800 },
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
  return tier >= TOWNSFOLK_TIER ? 4 : 3;
}

// ---- Townsfolk and the Local trait (Trusted) ------------------------------------------------------------------------

/**
 * From Trusted, a Folk hired in the shop is one in four times from your own town: a Townsfolk, born with the Local trait
 * (never learned, never forgotten, beside the earned traits' slots). Local: runs to town take half the time, and while
 * the town is happy (Township happiness 50% or more when a strike is settled) the cooldown after it is halved. What the
 * tier gives follows the tier held now; Townsfolk already hired stay Local.
 */
export const TOWNSFOLK_TIER = 2;
export const TOWNSFOLK_CHANCE = 0.25;
export const LOCAL_RUN_FACTOR = 0.5;
export const LOCAL_HAPPINESS = 50;
export const LOCAL_COOLDOWN_FACTOR = 0.5;

/** Whether a new hire is from your town: Trusted or higher now, then the roll. */
export function townsfolkRoll(tier, rng = Math.random) {
  return tier >= TOWNSFOLK_TIER && rng() < TOWNSFOLK_CHANCE;
}

/** A run's length in ticks: half for a Local Folk. */
export function runTicksFor(local) {
  return Math.round(RUN_TICKS * (local ? LOCAL_RUN_FACTOR : 1));
}

/** The factor on a strike's cooldown: halved for a Local Folk while the town's happiness is at least LOCAL_HAPPINESS. */
export function localCooldownFactor(local, happiness) {
  return local && Number(happiness) >= LOCAL_HAPPINESS ? LOCAL_COOLDOWN_FACTOR : 1;
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
  return makeCommission({ figure, c, townshipLevel, rng, makeId });
}

/** A commission from `figure` for the candidate `c`: its hours rolled, its amount, deadline and reward worked out. */
function makeCommission({ figure, c, townshipLevel, rng, makeId, story = null }) {
  const steps = Math.floor((HOURS.max - HOURS.min) / HOURS.step);
  const hours = HOURS.min + Math.min(steps, Math.floor(rng() * (steps + 1))) * HOURS.step;
  const reward = rewardFor({ hours, townshipLevel });
  return {
    ...(story === null ? {} : { story }),
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
  return { commissions: [], ticks: 0, standing: { points: 0, idle: 0 }, runs: {}, delivered: 0, reached: 0, stories: createStoryState() };
}

const normalizePaid = (raw) => (isObject(raw) && Number.isFinite(raw.resources) && Number.isFinite(raw.standing)
  ? { resources: Math.max(0, raw.resources), lost: Number.isFinite(raw.lost) && raw.lost > 0 ? Math.floor(raw.lost) : 0, standing: Math.max(0, raw.standing), late: raw.late === true }
  : null);

/** A story step's mark on a commission ({ id, step }), checked against the stories; null when it isn't one. */
function normalizeStoryMark(raw, figure, skillId, stories) {
  if (!isObject(raw)) return null;
  const def = storyOf(stories, raw.id);
  if (def === undefined || def.figure !== figure || !Number.isInteger(raw.step) || raw.step < 1 || raw.step > def.steps.length) return undefined;
  return def.steps[raw.step - 1].skill === skillId ? { id: def.id, step: raw.step } : undefined;
}

export function normalizeCommission(raw, stories = []) {
  if (!isObject(raw)) return null;
  const { id, figure, skillId, itemId, qty, hours } = raw;
  if (typeof id !== 'string' || id === '' || figureOf(figure) === undefined) return null;
  if (typeof skillId !== 'string' || typeof itemId !== 'string' || !Number.isInteger(qty) || qty < 1) return null;
  // A story step asks for its step's skill; a story the stories no longer hold drops the commission.
  const story = normalizeStoryMark(raw.story, figure, skillId, stories);
  if (story === undefined) return null;
  // A figure asks only for its own trade's work (the Tailor never for Shrimp): one that doesn't is dropped.
  if (story === null && !figureOf(figure).skills.includes(skillId)) return null;
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const itemIds = Array.isArray(raw.itemIds) ? raw.itemIds.filter((x) => typeof x === 'string') : [];
  if (!itemIds.includes(itemId)) itemIds.unshift(itemId);
  const delivered = clampCount(raw.delivered, qty);
  const state = ['open', 'done', 'withdrawn'].includes(raw.state) ? raw.state : 'open';
  return {
    ...(story === null ? {} : { story }),
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

/**
 * The saved state: anything unreadable is a fresh one; bad commissions go, ids stay unique, runs need a Folk id.
 * `stories`: the story list (data/commissions.json), for story steps and the stories' record.
 */
export function normalizeState(raw, stories = []) {
  if (!isObject(raw)) return createState();
  const seen = new Set();
  const commissions = [];
  for (const c of Array.isArray(raw.commissions) ? raw.commissions : []) {
    const n = normalizeCommission(c, stories);
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
  const points = Number.isFinite(s.points) && s.points > 0 ? s.points : 0;
  const out = {
    commissions,
    ticks: clampCount(raw.ticks, REFRESH_TICKS),
    standing: { points, idle: isCount(s.idle) ? s.idle : 0 },
    runs,
    delivered: isCount(raw.delivered) ? raw.delivered : 0,
    // The highest tier ever held (what a tier gave stays through fading); older saves start from the tier held now.
    reached: Math.max(isCount(raw.reached) && raw.reached < TIERS.length ? raw.reached : 0, tierOf(points)),
    stories: normalizeStoryState(raw.stories, stories),
  };
  reconcileStories(out);
  return out;
}

/**
 * Fills the board up to `slots`. While Honoured (`opts.tier`), every STORY_EVERY-th new commission starts a story
 * when one can (`opts.stories`, `opts.season`). Returns the commissions added.
 */
export function fill(state, opts, slots) {
  const added = [];
  while (state.commissions.length < slots) {
    const story = storyDue(state, opts.tier ?? 0) ? startStory(state, opts) : null;
    const c = story ?? rollCommission({ ...opts, onBoard: state.commissions });
    if (c === null) break;
    if (story === null && (opts.tier ?? 0) >= STORY_TIER) state.stories.count += 1;
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
      // A story step withdrawn ends the story; it can come back later from its first step.
      if (c.story !== undefined && state.stories?.active?.id === c.story.id) state.stories.active = null;
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

/** Notes the tier held now as reached; returns whether it is a new highest. */
export function noteReached(state) {
  const now = tierOf(state.standing.points);
  if (now <= state.reached) return false;
  state.reached = now;
  return true;
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

// ---- Stories (Honoured) -------------------------------------------------------------------------------------------

/**
 * From Honoured, every fifth new commission is a story when one can start: a town figure's project in three steps
 * (data/commissions.json), each a commission of its own that takes a board slot. Delivering a step puts the next one in
 * its place; the last step finishes the story: the town hands over its deed, which builds the story's decoration in
 * Township, and the story goes into the Town history with the Folks who worked on it. A withdrawn step ends the story;
 * it can come back later. Some stories come only in their season. One story runs at a time; each is told once.
 */
export const STORY_TIER = 3;
export const STORY_EVERY = 5;
export const STORY_HAPPINESS = 1;
export const STORY_BUILDING_TIER = 2;
export const SEASONS = Object.freeze(['Spring', 'Summer', 'Fall', 'Winter']);
/** The history keeps the names of up to this many Folks per story. */
export const STORY_FOLKS = 6;

/** The stories from data/commissions.json, checked: a bad entry is left out. */
export function storiesFrom(json) {
  const out = [];
  const ids = new Set();
  for (const raw of isObject(json) && Array.isArray(json.stories) ? json.stories : []) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(raw.id) || ids.has(raw.id)) continue;
    if (figureOf(raw.figure) === undefined) continue;
    const season = raw.season ?? null;
    if (season !== null && !SEASONS.includes(season)) continue;
    if (!Array.isArray(raw.steps) || raw.steps.length < 1) continue;
    const steps = [];
    for (const st of raw.steps) {
      if (!isObject(st) || typeof st.skill !== 'string') break;
      let match = null;
      if (st.match !== undefined) {
        try { match = new RegExp(st.match); } catch { break; }
      }
      steps.push({ skill: st.skill, match });
    }
    if (steps.length !== raw.steps.length) continue;
    const cost = (isObject(raw.building) && Array.isArray(raw.building.cost) ? raw.building.cost : [])
      .filter((x) => Array.isArray(x) && typeof x[0] === 'string' && Number.isInteger(x[1]) && x[1] > 0)
      .map(([id, quantity]) => [id, quantity]);
    if (cost.length === 0) continue;
    ids.add(raw.id);
    out.push(Object.freeze({ id: raw.id, figure: raw.figure, season, steps: Object.freeze(steps), cost: Object.freeze(cost) }));
  }
  return Object.freeze(out);
}

export function storyOf(stories, id) {
  return (stories ?? []).find((s) => s.id === id);
}

/** count: new commissions since the last story began; active: the story under way; done: the Town history. */
export function createStoryState() {
  return { count: 0, active: null, done: [] };
}

const folkNames = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((x) => typeof x === 'string' && x !== ''))].slice(0, STORY_FOLKS) : []);

export function normalizeStoryState(raw, stories = []) {
  const st = createStoryState();
  if (!isObject(raw)) return st;
  st.count = isCount(raw.count) ? Math.min(raw.count, STORY_EVERY) : 0;
  const seen = new Set();
  for (const d of Array.isArray(raw.done) ? raw.done : []) {
    if (!isObject(d) || storyOf(stories, d.id) === undefined || seen.has(d.id)) continue;
    seen.add(d.id);
    st.done.push({ id: d.id, folks: folkNames(d.folks), at: Number.isFinite(d.at) ? d.at : null });
  }
  const a = raw.active;
  const def = isObject(a) ? storyOf(stories, a.id) : undefined;
  if (def !== undefined && !seen.has(def.id) && Number.isInteger(a.step) && a.step >= 1 && a.step <= def.steps.length) {
    st.active = { id: def.id, step: a.step, folks: folkNames(a.folks) };
  }
  return st;
}

/** Keeps the board and the story record in step after loading: one story card, the one the record says is under way. */
function reconcileStories(state) {
  const st = state.stories;
  const cards = state.commissions.filter((c) => c.story !== undefined && c.state === 'open');
  const keep = cards.find((c) => st.active !== null && c.story.id === st.active.id) ?? (st.active === null ? cards[0] : undefined);
  state.commissions = state.commissions.filter((c) => c.story === undefined || c.state !== 'open' || c === keep);
  if (keep !== undefined) {
    if (st.done.some((d) => d.id === keep.story.id)) {
      state.commissions = state.commissions.filter((c) => c !== keep);
      st.active = null;
    } else if (st.active === null || st.active.step !== keep.story.step) {
      st.active = { id: keep.story.id, step: keep.story.step, folks: st.active?.folks ?? [] };
    }
  }
}

/** The candidates for one step of a story: its skill, its item filter (on the item's id without the namespace). */
export function stepCandidates(candidates, step) {
  return candidatePool((candidates ?? []).filter((c) => isObject(c) && c.skillId === step.skill
    && typeof c.itemId === 'string' && (step.match === null || step.match.test(c.itemId.slice(c.itemId.indexOf(':') + 1)))));
}

/** Whether the next commission should be a story: Honoured, and either a story waits for its next card or one is due. */
export function storyDue(state, tier) {
  const st = state.stories;
  if (tier < STORY_TIER || st === undefined) return false;
  if (st.active !== null) return !state.commissions.some((c) => c.state === 'open' && c.story?.id === st.active.id);
  return st.count >= STORY_EVERY - 1;
}

/** Stories that can start now: not told yet, in season, their figure free, a first step to ask for. */
export function storiesOpen(state, { stories = [], season = null, candidates = [] } = {}) {
  const busy = new Set(state.commissions.filter((c) => c.state === 'open').map((c) => c.figure));
  const done = new Set(state.stories.done.map((d) => d.id));
  return stories.filter((s) => !done.has(s.id) && (s.season === null || s.season === season) && !busy.has(s.figure)
    && stepCandidates(candidates, s.steps[0]).length > 0);
}

/** The card for a story's step `step`; null when there is nothing to ask for it. */
function storyCard(def, step, opts, onBoard) {
  const taken = new Set(onBoard.filter((c) => c.state === 'open').flatMap((c) => c.itemIds ?? [c.itemId]));
  const pool = stepCandidates(opts.candidates, def.steps[step - 1]).filter((c) => !(c.itemIds ?? [c.itemId]).some((id) => taken.has(id)));
  if (pool.length === 0) return null;
  const rng = opts.rng ?? Math.random;
  const c = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return makeCommission({ figure: figureOf(def.figure), c, townshipLevel: opts.townshipLevel ?? 1, rng, makeId: opts.makeId, story: { id: def.id, step } });
}

/**
 * A story's card: the next step of the story under way, or a new story's first step. Null when none can be asked
 * now (the count stays, so the next commission tries again).
 */
export function startStory(state, opts) {
  const st = state.stories;
  const stories = opts.stories ?? [];
  if (st.active !== null) {
    const def = storyOf(stories, st.active.id);
    return def === undefined ? null : storyCard(def, st.active.step, opts, state.commissions);
  }
  const open = storiesOpen(state, opts);
  const rng = opts.rng ?? Math.random;
  const def = open[Math.min(open.length - 1, Math.floor(rng() * open.length))];
  if (def === undefined) return null;
  const card = storyCard(def, 1, opts, state.commissions);
  if (card === null) return null;
  st.active = { id: def.id, step: 1, folks: [] };
  st.count = 0;
  return card;
}

/**
 * After a story step `c` is delivered (by `folkName`): the next step takes its place on the board, or the story is
 * finished and goes into the history. Returns { next: commission | null, finished: story | null }; with no card to
 * ask for the next step yet, it comes when the board next fills.
 */
export function advanceStory(state, c, opts = {}, folkName = null, at = null) {
  const st = state.stories;
  const def = c.story === undefined ? undefined : storyOf(opts.stories ?? [], c.story.id);
  if (def === undefined || st.active === null || st.active.id !== def.id) return { next: null, finished: null };
  if (typeof folkName === 'string' && folkName !== '' && !st.active.folks.includes(folkName) && st.active.folks.length < STORY_FOLKS) {
    st.active.folks.push(folkName);
  }
  if (c.story.step >= def.steps.length) {
    st.done.push({ id: def.id, folks: [...st.active.folks], at: Number.isFinite(at) ? at : null });
    st.active = null;
    return { next: null, finished: def };
  }
  st.active.step = c.story.step + 1;
  const next = storyCard(def, st.active.step, opts, state.commissions.filter((x) => x !== c));
  if (next !== null) {
    const i = state.commissions.indexOf(c);
    if (i >= 0) state.commissions[i] = next;
    else state.commissions.push(next);
  }
  return { next, finished: null };
}

export const deedId = (storyId) => `Deed_${storyId}`;
export const storyBuildingId = (storyId) => `Story_${storyId}`;
export const storyMedia = (storyId) => `assets/story_${storyId.toLowerCase()}.webp`;

/** Finished stories whose deed was never found (`found(storyId)`): the town still owes them. */
export function deedsDue(state, found) {
  if (state === null || state === undefined) return [];
  return state.stories.done.map((d) => d.id).filter((id) => !found(id));
}

/**
 * The data package for the stories: a deed item and a Township decoration for each (one per town, +1% happiness,
 * built with the deed). `text`: { [storyId]: { deed, deedDesc, building } }, set again from the language file.
 */
export function storyPackage(stories, text = {}) {
  const ns = (id) => `worker_folks:${id}`;
  return {
    items: stories.map((s) => charterItem({ id: deedId(s.id), name: text[s.id]?.deed ?? s.id, media: 'assets/town_deed.webp', desc: text[s.id]?.deedDesc })),
    skillData: [{
      skillID: 'melvorD:Township',
      data: {
        buildings: stories.map((s) => ({
          id: storyBuildingId(s.id),
          name: text[s.id]?.building ?? s.id,
          media: storyMedia(s.id),
          tier: STORY_BUILDING_TIER,
          cost: [{ biomeID: HALL_BIOME, cost: s.cost.map(([id, quantity]) => ({ id, quantity })) }],
          provides: [{ biomeID: HALL_BIOME, population: 0, happiness: STORY_HAPPINESS, education: 0, storage: 0, resources: [] }],
          biomes: [HALL_BIOME],
          maxUpgrades: 1,
          requirements: [{ type: 'ItemFound', itemID: ns(deedId(s.id)) }],
          canDegrade: false,
        })),
        buildingDisplayOrder: [{ insertAt: 'After', afterID: ns(SQUARE_ID), ids: stories.map((s) => ns(storyBuildingId(s.id))) }],
      },
    }],
  };
}

// ---- the Guild Charter and the Guild Hall (Known) -----------------------------------------------------------------

/**
 * Known gives the Guild Charter, an item; Township's Guild Hall asks for it (the game's buildings take only its fixed
 * requirement kinds, and "item found" is one). Each Hall built in Grasslands lowers Folk wages by 1%, up to five,
 * through the same modifier as the other reliefs (none over 10%); a run-down Hall gives less, as the town's own do.
 */
export const CHARTER_TIER = 1;
export const CHARTER_ID = 'Guild_Charter';
export const HALL_ID = 'Guild_Hall';
export const HALL_MAX = 5;
export const HALL_WAGE_DISCOUNT = 1;
/** Township tier 5, Town Hall's: Township level 80 and 40,000 citizens (the user, 4 Nov 2026). */
export const HALL_TIER = 5;
export const HALL_BIOME = 'melvorF:Grasslands';
/** Per Hall: Town Hall's bill in GP and in the trades the guild works for (Planks, Stone, Bar) (the user, 4 Nov 2026). */
export const HALL_COST = Object.freeze([['melvorF:GP', 100000000], ['melvorF:Planks', 100000], ['melvorF:Stone', 100000], ['melvorF:Bar', 100000]]);

// ---- Freedom of the Town and the Guild Square (Honoured) ----------------------------------------------------------

/**
 * Honoured gives Freedom of the Town, a second charter item; Township's Guild Square asks for it. Each Square built in
 * Grasslands gives the town +2% happiness and +2% education, up to five, at half the Hall's bill (the user, 4 Nov 2026).
 */
export const FREEDOM_TIER = 3;
export const FREEDOM_ID = 'Freedom_of_the_Town';
export const SQUARE_ID = 'Guild_Square';
export const SQUARE_MAX = 5;
export const SQUARE_HAPPINESS = 2;
export const SQUARE_EDUCATION = 2;
export const SQUARE_TIER = 5;
export const SQUARE_COST = Object.freeze(HALL_COST.map(([id, quantity]) => [id, quantity / 2]));

/** The town's gifts for reaching a Standing tier: the item it hands over and the building that asks for it. */
export const CHARTERS = Object.freeze([
  { tier: CHARTER_TIER, itemId: CHARTER_ID, buildingId: HALL_ID },
  { tier: FREEDOM_TIER, itemId: FREEDOM_ID, buildingId: SQUARE_ID },
]);

/** Whether the town owes the guild a charter: its tier reached once, the item never found. Known's by default. */
export function charterDue(state, found, tier = CHARTER_TIER) {
  return state !== null && state !== undefined && state.reached >= tier && !found;
}

const charterItem = ({ id, name, media, desc }) => ({
  itemType: 'Item',
  id,
  name,
  category: 'Hiring',
  type: 'Misc',
  media,
  ignoreCompletion: true,
  obtainFromItemLog: false,
  golbinRaidExclusive: false,
  sellsFor: 0,
  customDescription: desc ?? '',
});

/**
 * The data package for the charters, the Hall and the Square (only with Township's biomes loaded). `text`: { charter,
 * charterDesc, hall, freedom, freedomDesc, square } names, set again from the language file after loading.
 */
export function guildPackage(text = {}) {
  const ns = (id) => `worker_folks:${id}`;
  return {
    items: [
      charterItem({ id: CHARTER_ID, name: text.charter ?? 'Guild Charter', media: 'assets/guild_charter.webp', desc: text.charterDesc }),
      charterItem({ id: FREEDOM_ID, name: text.freedom ?? 'Freedom of the Town', media: 'assets/town_freedom.webp', desc: text.freedomDesc }),
    ],
    skillData: [{
      skillID: 'melvorD:Township',
      data: {
        buildings: [{
          id: HALL_ID,
          name: text.hall ?? 'Guild Hall',
          media: 'assets/guild_hall.webp',
          tier: HALL_TIER,
          cost: [{ biomeID: HALL_BIOME, cost: HALL_COST.map(([id, quantity]) => ({ id, quantity })) }],
          provides: [{ biomeID: HALL_BIOME, population: 0, happiness: 0, education: 0, storage: 0, resources: [] }],
          biomes: [HALL_BIOME],
          maxUpgrades: HALL_MAX,
          modifiers: { [ns('folkWageDiscount')]: HALL_WAGE_DISCOUNT },
          requirements: [{ type: 'ItemFound', itemID: ns(CHARTER_ID) }],
          canDegrade: true,
        }, {
          id: SQUARE_ID,
          name: text.square ?? 'Guild Square',
          media: 'assets/guild_square.webp',
          tier: SQUARE_TIER,
          cost: [{ biomeID: HALL_BIOME, cost: SQUARE_COST.map(([id, quantity]) => ({ id, quantity })) }],
          provides: [{ biomeID: HALL_BIOME, population: 0, happiness: SQUARE_HAPPINESS, education: SQUARE_EDUCATION, storage: 0, resources: [] }],
          biomes: [HALL_BIOME],
          maxUpgrades: SQUARE_MAX,
          requirements: [{ type: 'ItemFound', itemID: ns(FREEDOM_ID) }],
          canDegrade: true,
        }],
        buildingDisplayOrder: [{ insertAt: 'After', afterID: 'melvorF:Town_Hall', ids: [ns(HALL_ID), ns(SQUARE_ID)] }],
      },
    }],
  };
}
