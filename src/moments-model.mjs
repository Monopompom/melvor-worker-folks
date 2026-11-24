// Folk moments (joint order round 5): now and then a Folk brings you a short question with two answers. This is the
// shape a moment takes, ours or another mod's (API v13 registerMoment), and the "While you were away" queue's items.
// Pure: no game globals.

/** A moment's id: the registering mod's namespace, a colon, a name ('worker_folks:DayOff', 'voyage:Ford'). */
export const MOMENT_ID = /^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/;
/** How long a moment stays open, in game time, when its def names no other (48 h: rare moments outlast a night away). */
export const DEFAULT_LIFE_MS = 48 * 3600 * 1000;
/** A moment offers this many answers. */
export const ANSWERS_MIN = 1;
export const ANSWERS_MAX = 3;
/** An answer's button colour: 'go' green (the good choice), 'risk' amber (a known cost), 'no' the plain outline. */
export const TONES = Object.freeze(['go', 'risk', 'no']);
/** After a moment opens, the next may open after a random 48 to 96 h of game time: "a few days across". */
export const GAP_MIN_MS = 48 * 3600 * 1000;
export const GAP_MAX_MS = 96 * 3600 * 1000;
/** Open moments age, and a due gap looks for a Folk, once each 10 min of game time. */
export const CHECK_MS = 10 * 60 * 1000;

const isFn = (v) => typeof v === 'function';
const isText = (v) => typeof v === 'string' || isFn(v);

/**
 * What is wrong with a moment's def, or undefined when it is fine. `def`: { id, weight (> 0, default 1), fits(folk) →
 * boolean, text(folk) → string, answers: [{ id, label(folk) → string, why?(folk) → '' or the reason it can't be picked,
 * hint?(folk) → what it does (the button's tooltip), tone? (TONES; the first answer 'go' and the rest 'no' when left
 * out), apply(folk, { offline, expired, with }) }], defaultAnswer (an answer's id, taken when it runs out), expiresMs?
 * (> 0), partner?(folk) → another Folk's id the moment is about (ours) }. text, label and hint may be plain strings.
 */
export function checkMomentDef(def) {
  if (def === null || typeof def !== 'object') return 'moment must be an object';
  if (typeof def.id !== 'string' || !MOMENT_ID.test(def.id)) return 'moment id must be namespace:Name';
  if (def.weight !== undefined && !(Number.isFinite(def.weight) && def.weight > 0)) return 'moment weight must be a number above 0';
  if (!isFn(def.fits)) return 'moment fits must be a function';
  if (!isText(def.text)) return 'moment text must be a string or function';
  if (!Array.isArray(def.answers) || def.answers.length < ANSWERS_MIN || def.answers.length > ANSWERS_MAX) return `moment answers must be ${ANSWERS_MIN} to ${ANSWERS_MAX}`;
  const ids = new Set();
  for (const a of def.answers) {
    if (a === null || typeof a !== 'object' || typeof a.id !== 'string' || a.id === '') return 'moment answer id must be a string';
    if (ids.has(a.id)) return `moment answer id ${a.id} is repeated`;
    ids.add(a.id);
    if (!isText(a.label)) return 'moment answer label must be a string or function';
    if (a.why !== undefined && !isFn(a.why)) return 'moment answer why must be a function';
    if (a.hint !== undefined && !isText(a.hint)) return 'moment answer hint must be a string or function';
    if (a.tone !== undefined && !TONES.includes(a.tone)) return 'moment answer tone must be go, risk or no';
    if (!isFn(a.apply)) return 'moment answer apply must be a function';
  }
  if (!ids.has(def.defaultAnswer)) return 'moment defaultAnswer must be one of its answer ids';
  if (def.expiresMs !== undefined && !(Number.isFinite(def.expiresMs) && def.expiresMs > 0)) return 'moment expiresMs must be a number above 0';
  if (def.partner !== undefined && !isFn(def.partner)) return 'moment partner must be a function';
  return undefined;
}

/** The button colour of the answer at `index`: its own tone, else the first is 'go' and the rest 'no'. */
export function toneOf(answer, index) {
  return TONES.includes(answer?.tone) ? answer.tone : (index === 0 ? 'go' : 'no');
}

/** A new crew-wide gap, from `rand()` in [0, 1). */
export function rollGap(rand = Math.random) {
  return Math.round(GAP_MIN_MS + Math.min(Math.max(rand(), 0), 1) * (GAP_MAX_MS - GAP_MIN_MS));
}

/**
 * The crew's clock after `ms` of game time: { gapMs, due }. A clock with no gap yet (a new save) rolls one first. Due
 * once the gap is used up; it then stays at 0 until a moment opens and the caller rolls the next.
 */
export function runClock(gapMs, ms, rand = Math.random) {
  const left = (gapMs ?? rollGap(rand)) - Math.max(0, ms);
  return { gapMs: Math.max(0, left), due: left <= 0 };
}

/** An open moment after `ms` of game time: { moment (its copy, or null once out), expired }. */
export function ageMoment(moment, ms) {
  const leftMs = moment.leftMs - Math.max(0, ms);
  return leftMs > 0 ? { moment: { ...moment, leftMs }, expired: false } : { moment: null, expired: true };
}

/** One of `candidates` ([{ weight, ... }]) picked by weight with `rand()` in [0, 1), or undefined for none. */
export function pickWeighted(candidates, rand = Math.random) {
  const total = candidates.reduce((sum, c) => sum + (c.weight > 0 ? c.weight : 0), 0);
  if (!(total > 0)) return undefined;
  let r = rand() * total;
  for (const c of candidates) {
    if (!(c.weight > 0)) continue;
    r -= c.weight;
    if (r < 0) return c;
  }
  return candidates.filter((c) => c.weight > 0).at(-1);
}

/** A clean moment def from a checked one: weight and life filled in, the answers copied. */
export function momentDef(def) {
  return Object.freeze({
    ...def,
    weight: def.weight ?? 1,
    lifeMs: def.expiresMs ?? DEFAULT_LIFE_MS,
    answers: Object.freeze(def.answers.map((a) => Object.freeze({ ...a }))),
  });
}

/** What is wrong with an away-queue item, or undefined: { id (string), title (string or function), open() → promise }. */
export function checkAwayItem(item) {
  if (item === null || typeof item !== 'object') return 'away item must be an object';
  if (typeof item.id !== 'string' || item.id === '') return 'away item id must be a string';
  if (!isText(item.title)) return 'away item title must be a string or function';
  if (!isFn(item.open)) return 'away item open must be a function';
  return undefined;
}

/**
 * The away queue's order: items with a lower `rank` first (Worker Folks' own moments 0, other mods' items 1), then in
 * the order they came. Pushing an id already waiting replaces it in its place. Returns the new list.
 */
export function queueAway(list, item, rank = 1) {
  const at = list.findIndex((e) => e.item.id === item.id);
  if (at >= 0) return list.map((e, i) => (i === at ? { ...e, item } : e));
  const entry = { item, rank };
  const after = list.findIndex((e) => e.rank > rank);
  return after < 0 ? [...list, entry] : [...list.slice(0, after), entry, ...list.slice(after)];
}
