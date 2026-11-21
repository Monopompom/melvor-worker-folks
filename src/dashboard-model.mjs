// The Hiring page's Overview block (build .95, the user, 18 Oct 2026: a dashboard in place of the Tips block, which
// was useful once and then a placeholder): who is at work, what it made this session and the next Hiring unlock; the
// Payroll band (build .98) is reserve-panel.mjs. Pure: no DOM, no game globals (tests/dashboard-model.test.mjs).

/** Tips are MOD_WF_TIP_<n>_HEAD and MOD_WF_TIP_<n> in the language file, n = 1..TIP_COUNT; behind the block's "?". */
export const TIP_COUNT = 12;
/** Tips about wages, the reserve and strikes: left out while wages are off (No sweat). */
export const WAGE_TIPS = new Set([1, 2, 5, 6, 9, 11, 12]);
/**
 * Item chips under "Made this session". They scroll in a box of their own (build .96, the user: many kinds of items
 * must not grow the block), so the cap only guards a very long session; the rest is one "+N more" line.
 */
export const ITEM_CHIPS = 60;

export function tipNumbers(wagesOn) {
  return Array.from({ length: TIP_COUNT }, (_, i) => i + 1).filter((n) => wagesOn || !WAGE_TIPS.has(n));
}

/** What the crew made since the page was loaded (not saved): XP by skill id, items and currencies by id. */
export function createTally() {
  const bump = (map, id, n) => {
    if (typeof id !== 'string' || !(n > 0)) return false;
    map.set(id, (map.get(id) ?? 0) + n);
    return true;
  };
  const tally = {
    xp: new Map(),
    items: new Map(),
    currencies: new Map(),
    addXP: (skillId, n) => bump(tally.xp, skillId, n),
    addItem: (itemId, n) => bump(tally.items, itemId, n),
    addCurrency: (currencyId, n) => bump(tally.currencies, currencyId, n),
    get empty() { return tally.xp.size === 0 && tally.items.size === 0 && tally.currencies.size === 0; },
  };
  return tally;
}

/** Most first (ties by id, so the order holds still); `n` of them and how many more there are. */
export function topEntries(map, n) {
  const all = [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { shown: all.slice(0, n), more: Math.max(0, all.length - n) };
}

/**
 * The next milestone above `level` in a list sorted by level: `{ level, key, capped }` (capped: above the current
 * level cap), or null once every one is reached.
 */
export function nextMilestone(milestones, { level, levelCap }) {
  const next = milestones.find((m) => m.level > level);
  return next === undefined ? null : { level: next.level, key: next.key, capped: next.level > levelCap };
}

/** Share of the way from `fromXP` to `toXP`, 0..1. */
export function progressTo(xp, fromXP, toXP) {
  if (!(toXP > fromXP)) return 1;
  return Math.min(1, Math.max(0, (xp - fromXP) / (toXP - fromXP)));
}

/**
 * Roster order (build .98; reordered in .250 from a player's report: idle on top and the workers at the bottom read
 * badly). Trouble first, so a strike or debt is never scrolled out of sight; then the Folks at work, overtime among them,
 * grouped by skill (by `skillText`) so Folks on one skill sit together; idle last. Slot order within.
 */
export const STATUS_RANK = { strike: 0, debt: 1, cooldown: 2, working: 3, overtime: 3, idle: 4 };

/** The At work list's sorts (a player's idea): the order above, by skill, by name, or the player's own card order. */
export const ROSTER_SORTS = Object.freeze(['trouble', 'skill', 'name', 'mine']);
export const cleanRosterSort = (sort) => (ROSTER_SORTS.includes(sort) ? sort : 'trouble');

/** `sort` one of ROSTER_SORTS; `mine` the Folk ids in the player's order (My order). Slot order breaks every tie. */
export function rosterOrder(rows, sort = 'trouble', mine = []) {
  const bySlot = (a, b) => a.slot - b.slot;
  const text = (v) => `${v ?? ''}`;
  if (sort === 'skill') {
    return [...rows].sort((a, b) => (a.assigned === false) - (b.assigned === false) || text(a.skillText).localeCompare(text(b.skillText)) || bySlot(a, b));
  }
  if (sort === 'name') return [...rows].sort((a, b) => text(a.first ?? a.name).localeCompare(text(b.first ?? b.name)) || bySlot(a, b));
  if (sort === 'mine') {
    const at = new Map(mine.map((id, i) => [id, i]));
    const place = (r) => at.get(r.id) ?? Infinity;
    return [...rows].sort((a, b) => (place(a) === place(b) ? bySlot(a, b) : place(a) - place(b)));
  }
  const rank = (r) => STATUS_RANK[r.status] ?? STATUS_RANK.idle;
  const atWork = STATUS_RANK.working;
  const bySkill = (a, b) => (rank(a) === atWork ? `${a.skillText ?? ''}`.localeCompare(`${b.skillText ?? ''}`) : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || bySkill(a, b) || bySlot(a, b));
}

/**
 * The order of a list the player may be scrolling: while `hold`, what is shown keeps its place and new ids join the end,
 * so tiles never move under the pointer; otherwise simply `next`.
 */
export function holdOrder(shown, next, hold) {
  if (!hold) return [...next];
  const wanted = new Set(next);
  const kept = shown.filter((id) => wanted.has(id));
  const have = new Set(kept);
  return [...kept, ...next.filter((id) => !have.has(id))];
}
