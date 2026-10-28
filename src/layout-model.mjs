// The Hiring page's block layout (build .93, the user, 18 Oct 2026): which block sits in which column, in what order,
// and which are folded to their title row. Kept per browser in localStorage (not the save), so it differs per device
// on purpose. Pure: no DOM, no game globals (tests/layout-model.test.mjs).
//
// One column of blocks (build .98, the user: the Payroll Reserve merged into the Overview, so the top row's two columns
// went): the Overview and the crew, in either order. The crew is the cards' grid: it has no title row (the user, 18 Oct
// 2026: "no need in Crew panel at all"), so it neither moves nor folds, but the Overview goes above or below it. Each
// Folk card moves within the grid; cards don't fold (the user, build .95).
// A layout is `{ cols: { wide: [id] }, folded: [id], cards: [folkId] }`; `cards` is the card order the player dragged
// (empty: by slot), checked against the hired Folks when used. A layout saved by .93-.97 (columns left / right, a
// reserve block) cleans to this one: unknown ids go, a missing block returns to its default place.

export const STORAGE_KEY = 'worker_folks:layout';
export const COLUMNS = ['wide'];
export const DEFAULT_COLS = { wide: ['dashboard', 'orders', 'crew'] };
/** Blocks without a title row: they never fold. */
export const FIXED = ['crew'];
/** Most Folk ids kept (the mod's 24 slots, with room for ids of Folks since fired). */
const MAX_CARDS = 48;

const allIds = (defaults) => COLUMNS.flatMap((c) => defaults[c] ?? []);
const homeOf = (id, defaults) => COLUMNS.find((c) => (defaults[c] ?? []).includes(id));

/** Whether `id` may sit in column `col`. */
export function allowed(id, col) {
  return COLUMNS.includes(col);
}

export function defaultLayout(defaults = DEFAULT_COLS) {
  return { cols: Object.fromEntries(COLUMNS.map((c) => [c, [...(defaults[c] ?? [])]])), folded: [], cards: [] };
}

/**
 * A clean layout from anything (a saved one from an older build, hand-edited, or junk): unknown ids and repeats
 * dropped, a block in a column it may not use or missing from every column goes back to its default column at its
 * default place (or the end, if that column is shorter now).
 */
export function cleanLayout(raw, defaults = DEFAULT_COLS) {
  const known = new Set(allIds(defaults));
  const seen = new Set();
  const cols = {};
  const src = raw !== null && typeof raw === 'object' && raw.cols !== null && typeof raw.cols === 'object' ? raw.cols : {};
  for (const c of COLUMNS) {
    cols[c] = [];
    const list = Array.isArray(src[c]) ? src[c] : [];
    for (const id of list) {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id) || !allowed(id, c)) continue;
      seen.add(id);
      cols[c].push(id);
    }
  }
  for (const id of allIds(defaults)) {
    if (seen.has(id)) continue;
    const home = homeOf(id, defaults);
    const at = Math.min((defaults[home] ?? []).indexOf(id), cols[home].length);
    cols[home].splice(at, 0, id);
  }
  const folded = [];
  for (const id of Array.isArray(raw?.folded) ? raw.folded : []) {
    if (typeof id === 'string' && known.has(id) && !FIXED.includes(id) && !folded.includes(id)) folded.push(id);
  }
  return { cols, folded, cards: idList(raw?.cards) };
}

const idList = (list) => {
  const out = [];
  for (const id of Array.isArray(list) ? list : []) {
    if (typeof id === 'string' && id !== '' && id.length <= 64 && !out.includes(id)) out.push(id);
    if (out.length >= MAX_CARDS) break;
  }
  return out;
};

/** The hired Folks' ids (`live`, in slot order) in the dragged order; any not in it after, in slot order. */
export function orderCards(saved, live) {
  const set = new Set(live);
  const first = saved.filter((id) => set.has(id));
  return [...first, ...live.filter((id) => !first.includes(id))];
}

/** Ids of Folks no longer hired dropped from the card order. */
export function pruneCards(layout, live) {
  const set = new Set(live);
  return { ...layout, cards: layout.cards.filter((id) => set.has(id)) };
}

/** Default: blocks in their default places, none folded, cards by slot (`live`: the hired Folks' ids, slot order). */
export function isDefault(layout, defaults = DEFAULT_COLS, live = []) {
  const d = defaultLayout(defaults);
  const order = orderCards(layout.cards, live);
  return layout.folded.length === 0
    && COLUMNS.every((c) => layout.cols[c].length === d.cols[c].length && layout.cols[c].every((id, i) => id === d.cols[c][i]))
    && order.every((id, i) => id === live[i]);
}

/** Reads the stored text; anything unreadable is the default layout. */
export function parseLayout(text, defaults = DEFAULT_COLS) {
  if (typeof text !== 'string' || text === '') return defaultLayout(defaults);
  try { return cleanLayout(JSON.parse(text), defaults); } catch { return defaultLayout(defaults); }
}

export function serializeLayout(layout) {
  return JSON.stringify({ cols: layout.cols, folded: layout.folded, cards: layout.cards });
}

export function setFolded(layout, id, folded) {
  const rest = layout.folded.filter((x) => x !== id);
  return { ...layout, folded: folded && !FIXED.includes(id) ? [...rest, id] : rest };
}
