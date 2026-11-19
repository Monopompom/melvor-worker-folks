// What an item really costs in work (build .248, the user, 19 Nov 2026, after a player's report: a 16 h commission
// asked for 26,000 Carrion Bodies, 150 Carrion Logs and 50 Carrion Bark each). Work Orders and Township Commissions
// ask for "hours of work"; until now that counted only the Folk's own last step, so an artisan item could need a
// hundred to a million times the hours shown in gathering. Here an item's cost is the whole chain from raw materials
// at base pace: the gathering, every step in between and the last one. Chance finds count at the game's own find
// rates (a gem vein, a superior gem, a meteorite Astrology locates), farm produce at one harvest per growth on the
// plots of its kind you own, a shop item as no work (it costs GP). An item no Folk can get at all (a monster drop)
// costs Infinity, and anything made from it too: the boards leave it out. Pure: no game globals
// (tests/material-cost-model.test.mjs).

export const MS_PER_HOUR = 3600000;
/** An item a board may ask for makes at least this many in 8 hours of the chain (a single staff is gear, not an order). */
export const MIN_PER_8H = 10;
/** Gem veins: a 200/375% chance per Mining action on a rock of level 100 or more, 16.125 rock HP on average. */
export const GEM_VEIN = Object.freeze({ chance: 200 / 375 / 100, hp: 16.125, minRockLevel: 100 });
/** A random gem: 1% per Mining action on a rock that gives gems. */
export const RANDOM_GEM_CHANCE = 0.01;
/** A meteorite: a 0.25% chance per Astrology action on a constellation that can locate one, 14.5 rock HP on average. */
export const METEORITE = Object.freeze({ chance: 0.25 / 100, hp: 14.5 });

/** One item of a gem vein: its share of the veins found, plus the Mining action that takes it. */
export function gemVeinMs({ miningMs, weight, totalWeight }) {
  if (!(miningMs > 0) || !(weight > 0) || !(totalWeight > 0)) return Infinity;
  return miningMs / (GEM_VEIN.chance * GEM_VEIN.hp * (weight / totalWeight)) + miningMs;
}

/**
 * One superior gem of a kind: each gem vein action gives one at `chance`% (the veins' own superior gem chance), then
 * the superior table picks the kind by weight.
 */
export function superiorGemMs({ miningMs, chance, weight, totalWeight }) {
  if (!(miningMs > 0) || !(chance > 0) || !(weight > 0) || !(totalWeight > 0)) return Infinity;
  const perAction = GEM_VEIN.chance * GEM_VEIN.hp * (chance / 100) * (weight / totalWeight);
  return (miningMs * (1 + GEM_VEIN.chance * GEM_VEIN.hp)) / perAction;
}

/** One random gem of a kind: 1% per Mining action, the gem table's weight. */
export function randomGemMs({ miningMs, weight, totalWeight }) {
  if (!(miningMs > 0) || !(weight > 0) || !(totalWeight > 0)) return Infinity;
  return miningMs / (RANDOM_GEM_CHANCE * (weight / totalWeight));
}

/** One Meteorite Ore: the Astrology time to locate it, plus the Mining action that takes it. */
export function meteoriteMs({ astrologyMs, miningMs }) {
  if (!(astrologyMs > 0) || !(miningMs > 0)) return Infinity;
  return astrologyMs / (METEORITE.chance * METEORITE.hp) + miningMs;
}

/** One farm product: a harvest of `harvest` per growth, on each plot of its kind you own (one at least). */
export function farmMs({ growthMs, harvest, plots }) {
  if (!(growthMs > 0) || !(harvest > 0)) return Infinity;
  return growthMs / (harvest * Math.max(1, Math.floor(Number(plots) || 0)));
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const cleanCosts = (costs) => (Array.isArray(costs) ? costs : [])
  .filter((c) => isObject(c) && typeof c.id === 'string' && c.qty > 0);

/**
 * The cost book. `sources`: { [itemId]: [{ ms, kind? }] }, ms of work per item for each way to get it raw (kind
 * 'find', 'farm', 'shop'); `recipes`: { [itemId]: [{ ms, out, costs: [{ id, qty }] }] }, ms per action, items per
 * action and what an action uses, one entry per way to make it (a Fletching recipe's other logs, a Summoning tablet's
 * other item). Returns { unit(itemId), action({ ms, out, costs }) }: each { ms, known, kinds }, `ms` the cheapest way
 * (Infinity when there is none), `known` the same with what no Folk can get counted as no work (for shrinking an
 * old card, never for asking), `kinds` what the cheapest way needs.
 */
export function costBook({ sources = {}, recipes = {} } = {}) {
  const memo = new Map();
  const busy = new Set();
  const none = (id) => ({ ms: Infinity, known: 0, kinds: ['none'], missing: [id] });

  const combine = (ms, out, costs) => {
    let total = Math.max(0, Number(ms) || 0);
    let known = total;
    const kinds = new Set();
    const missing = new Set();
    for (const c of cleanCosts(costs)) {
      const u = unit(c.id);
      total += c.qty * u.ms;
      known += c.qty * u.known;
      u.kinds.forEach((k) => kinds.add(k));
      (u.missing ?? []).forEach((m) => missing.add(m));
    }
    const per = Math.max(1e-9, Number(out) || 1);
    return { ms: total / per, known: known / per, kinds: [...kinds], missing: [...missing] };
  };

  function unit(id) {
    if (memo.has(id)) return memo.get(id);
    // A loop in the recipes (none in the game's data) counts as no way.
    if (busy.has(id)) return none(id);
    busy.add(id);
    const ways = [];
    for (const s of Array.isArray(sources[id]) ? sources[id] : []) {
      if (!isObject(s) || !(s.ms >= 0)) continue;
      ways.push({ ms: s.ms, known: Number.isFinite(s.ms) ? s.ms : 0, kinds: typeof s.kind === 'string' ? [s.kind] : [], missing: [] });
    }
    for (const r of Array.isArray(recipes[id]) ? recipes[id] : []) {
      if (!isObject(r)) continue;
      ways.push(combine(r.ms, r.out, r.costs));
    }
    busy.delete(id);
    let best = ways.length === 0 ? none(id) : ways.reduce((a, b) => (b.ms < a.ms || (b.ms === a.ms && b.known < a.known) ? b : a));
    // With no full way, the cheapest known part is what an old card shrinks by.
    if (!Number.isFinite(best.ms) && ways.length > 0) best = { ...best, known: Math.min(...ways.map((w) => w.known)) };
    memo.set(id, best);
    return best;
  }

  return {
    unit,
    /** One action's item: its own time plus what it uses, per item it makes. */
    action: ({ ms, out = 1, costs = [] }) => combine(ms, out, costs),
  };
}

/** Whether a board may ask for an item that costs `unitMs` per item: something a Folk can get, 10 or more in 8 h. */
export function askable(unitMs) {
  return Number.isFinite(unitMs) && unitMs > 0 && (8 * MS_PER_HOUR) / unitMs >= MIN_PER_8H;
}

/** Items in `hours` of the chain at `unitMs` per item, before rounding (0 when there is no way). */
export function itemsIn(hours, unitMs) {
  return Number.isFinite(unitMs) && unitMs > 0 ? (hours * MS_PER_HOUR) / unitMs : 0;
}
