// Strike demands: with the option on, a striking Folk wants something for each trait it holds, on top of the GP:
// junk and ignored items, dungeon chests, kills of a monster or clears of a dungeon. Rolled when the strike starts and
// kept on the Folk; kills and clears count from that moment. The strike ends only once every demand is met. Pure.

/** Trainee to Foreman, as src/folk.mjs TIERS. */
const TIERS = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'];

/** Amounts by tier, Trainee to Foreman. */
const q = (...amounts) => Object.freeze(amounts);

const BONES = { item: 'melvorD:Bones' };

/**
 * What each trait wants. `item` (one id or a list, the first one registered wins), `kill` (a monster you've killed),
 * `dungeon` (a dungeon you've cleared) or `chest` (a dungeon chest you've found). `fallback`: what it wants instead
 * when there is no such monster, dungeon or chest.
 */
export const TRAIT_DEMANDS = Object.freeze({
  Specialist: { item: 'melvorD:Bird_Nest', qty: q(2, 4, 8, 15, 25) },
  EarlyBird: { item: 'melvorD:Feathers', qty: q(100, 200, 400, 800, 1500) },
  NightOwl: { kill: true, qty: q(20, 40, 80, 150, 300), fallback: { ...BONES, qty: q(50, 100, 200, 400, 800) } },
  QuickLearner: { item: 'melvorD:Message_In_A_Bottle', qty: q(1, 2, 3, 5, 8) },
  Frugal: { item: 'melvorD:Normal_Logs', qty: q(500, 1000, 2500, 5000, 10000) },
  Loyal: { item: 'melvorD:Shell', qty: q(10, 20, 40, 80, 150) },
  Veteran: { chest: true, qty: q(1, 2, 3, 5, 8), fallback: { item: 'melvorD:Bird_Nest', qty: q(2, 4, 8, 15, 25) } },
  Meticulous: { item: 'melvorD:Bronze_Bar', qty: q(100, 200, 400, 800, 1500) },
  Greedy: { item: 'melvorD:Topaz', qty: q(5, 10, 20, 40, 80) },
  Workaholic: { item: 'melvorD:Shrimp', qty: q(100, 200, 500, 1000, 2000) },
  Lucky: { item: 'melvorD:Rubber_Ducky', qty: q(5, 10, 25, 50, 100) },
  Ambitious: { dungeon: true, qty: q(1, 1, 2, 3, 5), fallback: { item: 'melvorD:Big_Bones', qty: q(20, 40, 80, 150, 300) } },
  Clumsy: { item: 'melvorD:Old_Boot', qty: q(10, 20, 40, 80, 150) },
  Lazy: { item: 'melvorD:Potatoes', qty: q(200, 400, 800, 1500, 3000) },
  Sickly: { item: 'melvorD:Seaweed', qty: q(10, 20, 40, 80, 150) },
  Wasteful: { item: ['melvorF:Ash', 'melvorD:Burnt_Shrimp'], qty: q(200, 500, 1000, 2000, 5000) },
  Resentful: { kill: true, qty: q(50, 100, 200, 400, 800), fallback: { ...BONES, qty: q(100, 200, 400, 800, 1600) } },
  /** A Townsfolk's Local trait (born with it, kept apart from the earned ones): a taste of home. */
  Local: { item: 'melvorD:Cabbage', qty: q(50, 100, 200, 400, 750) },
});

/** Another mod's trait (Voyage's travel traits): one line all the same. */
export const OTHER_DEMAND = Object.freeze({ item: 'melvorD:Rusty_Key', qty: q(10, 20, 40, 80, 150) });

/** The dungeon chests a Veteran can want, cheapest first. */
export const CHESTS = Object.freeze([
  'melvorD:Standard_Chest', 'melvorD:Bandit_Chest', 'melvorD:Egg_Chest', 'melvorD:Spider_Chest', 'melvorD:Chest_of_Witwix',
  'melvorD:Frozen_Chest', 'melvorD:Treasure_Chest', 'melvorD:Locked_Chest', 'melvorF:Elder_Chest', 'melvorD:Elite_Chest',
  'melvorD:Magic_Chest', 'melvorD:Pirate_Booty',
]);

/** The strike count's weight: ×1 the first strike, +50% each one after, at most ×3. */
export function strikeFactor(strikes) {
  const n = Number.isInteger(strikes) && strikes > 1 ? strikes : 1;
  return Math.min(3, 1 + 0.5 * (n - 1));
}

const amountFor = (qty, tier, strikes) => {
  const i = Math.max(0, TIERS.indexOf(tier));
  return Math.max(1, Math.round(qty[Math.min(i, qty.length - 1)] * strikeFactor(strikes)));
};

const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/**
 * The demands of a strike starting now, one per held trait, lines for the same thing merged. `world`:
 * - `hasItem(id)`: the item exists in this game;
 * - `monsters`: [{ id, count }] you've killed and could again; `dungeons`: [{ id, count }] cleared;
 * - `chests`: ids found before.
 * Returns [{ kind: 'item' | 'kill' | 'dungeon', id, qty, start? }] (`start`: the count when the strike began).
 */
export function rollDemands({ traits = [], tier, strikes = 1, rng = Math.random, world = {} }) {
  const hasItem = world.hasItem ?? (() => true);
  const out = [];
  const add = (line) => {
    const same = out.find((d) => d.kind === line.kind && d.id === line.id);
    if (same !== undefined) same.qty += line.qty;
    else out.push(line);
  };
  const itemLine = (spec) => {
    const ids = Array.isArray(spec.item) ? spec.item : [spec.item];
    const id = ids.find((x) => hasItem(x));
    return id === undefined ? null : { kind: 'item', id, qty: amountFor(spec.qty, tier, strikes) };
  };
  for (const traitId of traits) {
    const spec = TRAIT_DEMANDS[traitId] ?? OTHER_DEMAND;
    let line = null;
    if (spec.kill && (world.monsters ?? []).length > 0) {
      const m = pick(world.monsters, rng);
      line = { kind: 'kill', id: m.id, qty: amountFor(spec.qty, tier, strikes), start: m.count };
    } else if (spec.dungeon && (world.dungeons ?? []).length > 0) {
      const d = pick(world.dungeons, rng);
      line = { kind: 'dungeon', id: d.id, qty: amountFor(spec.qty, tier, strikes), start: d.count };
    } else if (spec.chest) {
      const found = (world.chests ?? []).filter((id) => hasItem(id));
      if (found.length > 0) line = { kind: 'item', id: pick(found, rng), qty: amountFor(spec.qty, tier, strikes) };
    } else if (spec.item !== undefined) {
      line = itemLine(spec);
    }
    if (line === null && spec.fallback !== undefined) line = itemLine(spec.fallback);
    if (line !== null) add(line);
  }
  return out;
}

/**
 * How far one demand is: { have, need, met, gone, locked }. `read`: bankQty(id), kills(id), clears(id), each the count
 * now, or null when the game no longer has that item, monster or dungeon (a mod or an expansion turned off): such a
 * line counts as met (`gone`), or the strike could never end. `read.locked(id)`: the item is locked in your bank; a
 * locked item is never handed over, so its line is not met until you unlock it. Kills and clears count from the
 * strike's start.
 */
export function progressOf(demand, read = {}) {
  const now = demand.kind === 'kill' ? read.kills?.(demand.id) : demand.kind === 'dungeon' ? read.clears?.(demand.id) : read.bankQty?.(demand.id);
  if (now === null) return { have: demand.qty, need: demand.qty, met: true, gone: true, locked: false };
  const raw = (Number(now) || 0) - (demand.kind === 'item' ? 0 : demand.start ?? 0);
  const have = Math.max(0, Math.min(demand.qty, raw));
  const locked = demand.kind === 'item' && read.locked?.(demand.id) === true;
  return { have, need: demand.qty, met: have >= demand.qty && !locked, gone: false, locked };
}

/** Every demand met (an empty list is). */
export function allMet(demands, read) {
  return (demands ?? []).every((d) => progressOf(d, read).met);
}

/** The items a settlement takes from the bank: [{ id, qty }]. */
export function itemsToTake(demands) {
  return (demands ?? []).filter((d) => d.kind === 'item').map(({ id, qty }) => ({ id, qty }));
}
