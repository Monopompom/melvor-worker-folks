import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOARD_LEVEL, TICKS_PER_HOUR, DAY_TICKS, REFRESH_TICKS, RUN_TICKS, OVERDUE_TICKS, FIGURES, TIERS, BONUS, LINES,
  figureOf, tierOf, nextTierPoints, slotsFor, resourceScale, niceQuantity, quantityFor, rewardFor, figureWeight,
  candidatePool, rollCommission, createState, normalizeCommission, normalizeState, fill, refresh, advance, fade,
  ticksLeft, deadlineLeft, commissionOf, remaining, deliver, payout, proRata, gainStanding, runDue, runsLeft,
  noteReached, charterDue, guildPackage, CHARTER_TIER, HALL_MAX, HALL_WAGE_DISCOUNT,
  TOWNSFOLK_TIER, TOWNSFOLK_CHANCE, LOCAL_HAPPINESS, townsfolkRoll, runTicksFor, localCooldownFactor,
  FREEDOM_TIER, CHARTERS, SQUARE_MAX, SQUARE_HAPPINESS, SQUARE_EDUCATION,
} from '../src/commissions-model.mjs';

const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
let n = 0;
const makeId = () => `c${(n += 1)}`;
const cand = (skillId, itemId, level, intervalMs = 3000, extra = {}) => ({ skillId, itemId, itemIds: [itemId], level, intervalMs, perAction: 1, ...extra });
const CANDIDATES = [
  cand('melvorD:Woodcutting', 'melvorD:Oak_Logs', 10, 4000),
  cand('melvorD:Woodcutting', 'melvorD:Willow_Logs', 25, 5000),
  cand('melvorD:Smithing', 'melvorD:Iron_Bar', 15, 2000),
  cand('melvorD:Thieving', 'melvorD:Bobbys_Pocket', 1, 3000),
];

test('the board opens at Hiring 30 with three commissions, four from Trusted', () => {
  assert.equal(BOARD_LEVEL, 30);
  assert.equal(slotsFor(0), 3);
  assert.equal(slotsFor(1), 3);
  assert.equal(slotsFor(2), 4);
  assert.equal(slotsFor(3), 4);
});

test('Standing tiers: Strangers, Known at 80, Trusted at 300, Honoured at 800', () => {
  assert.deepEqual(TIERS.map((t) => t.id), ['Strangers', 'Known', 'Trusted', 'Honoured']);
  assert.equal(tierOf(0), 0);
  assert.equal(tierOf(79.9), 0);
  assert.equal(tierOf(80), 1);
  assert.equal(tierOf(300), 2);
  assert.equal(tierOf(2000), 3);
  assert.equal(nextTierPoints(10), 80);
  assert.equal(nextTierPoints(800), null);
});

test('resources follow Township Casual Tasks by Township level, ×1.25 per 8 hours of work', () => {
  assert.equal(resourceScale(1), 2500);
  assert.equal(resourceScale(30), 17500);
  assert.equal(resourceScale(35), 20000);
  assert.equal(resourceScale(80), 60000);
  assert.equal(resourceScale(120), 75000);
  assert.equal(resourceScale(0), 2500);
  const r = rewardFor({ hours: 16, townshipLevel: 50 });
  assert.equal(r.resources, niceQuantity(30000 * 2 * BONUS));
  assert.equal(r.standing, 16);
  assert.ok(Math.abs(r.xpLevels - 0.05) < 1e-9);
});

test('a quantity is two significant digits of the work asked', () => {
  assert.equal(niceQuantity(1234), 1200);
  assert.equal(niceQuantity(87), 87);
  assert.equal(quantityFor({ hours: 8, intervalMs: 4000 }), 7200);
  assert.equal(quantityFor({ hours: 8, intervalMs: 3000, perAction: 2 }), 19000);
});

test('figures lean toward the town\'s shortest resources and, in winter, Food and Clothing', () => {
  const stock = Object.fromEntries(FIGURES.map((f, i) => [f.resource, (i + 1) * 1000]));
  const miller = figureOf('Miller');
  const runewright = figureOf('Runewright');
  assert.equal(figureWeight(miller, { stock }), 2, 'Wood is short');
  assert.equal(figureWeight(runewright, { stock }), 1, 'Rune Essence is plenty');
  assert.equal(figureWeight(figureOf('Tailor'), { stock, season: 'Winter' }), 2);
  assert.equal(figureWeight(figureOf('Baker'), { stock: {}, season: 'Winter' }), 3);
});

test('the pool keeps each skill\'s newest recipes and skips bad entries', () => {
  const many = Array.from({ length: 8 }, (_, i) => cand('melvorD:Mining', `ore${i}`, i));
  const pool = candidatePool([...many, null, { skillId: 'x' }, cand('melvorD:Mining', 'bad', 1, 0)]);
  assert.deepEqual(pool.map((c) => c.itemId), ['ore7', 'ore6', 'ore5', 'ore4', 'ore3']);
});

test('a commission: a figure with something to ask, its item, 8 to 24 hours, a deadline and its reward', () => {
  const c = rollCommission({ candidates: CANDIDATES, townshipLevel: 30, rng: seq(0, 0, 0.99, 0), makeId });
  assert.equal(c.figure, 'Miller', 'Thieving has no figure; Miller comes first');
  assert.equal(c.skillId, 'melvorD:Woodcutting');
  assert.equal(c.itemId, 'melvorD:Willow_Logs', 'the newest recipe first in the pool');
  assert.equal(c.hours, 24);
  assert.equal(c.qty, quantityFor({ hours: 24, intervalMs: 5000 }));
  assert.equal(c.deadline, (2 * 24 + 24) * TICKS_PER_HOUR);
  assert.equal(c.resourceId, 'melvorF:Wood');
  assert.equal(c.resources, rewardFor({ hours: 24, townshipLevel: 30 }).resources);
  assert.equal(c.state, 'open');
  assert.equal(c.folkId, null);
  assert.ok(c.line >= 1 && c.line <= 3);
});

test('a figure or an item already on the board is not asked again; nothing left gives null', () => {
  const first = rollCommission({ candidates: CANDIDATES, rng: seq(0), makeId });
  const second = rollCommission({ candidates: CANDIDATES, rng: seq(0), makeId, onBoard: [first] });
  assert.equal(second.figure, 'Smith');
  assert.equal(rollCommission({ candidates: CANDIDATES, rng: seq(0), makeId, onBoard: [first, second] }), null);
  assert.equal(rollCommission({ candidates: [], makeId }), null);
});

test('fill stops at the slots or when no figure is left; refresh drops what is done and refills', () => {
  const state = createState();
  const added = fill(state, { candidates: CANDIDATES, rng: seq(0.3), makeId }, 3);
  assert.equal(added.length, 2, 'only the Miller and the Smith have work');
  state.commissions[0].state = 'done';
  state.ticks = REFRESH_TICKS;
  refresh(state, { candidates: CANDIDATES, rng: seq(0.3), makeId }, 3);
  assert.equal(state.ticks, 0);
  assert.equal(state.commissions.length, 2);
  assert.ok(state.commissions.every((c) => c.state === 'open'));
});

test('advance: refresh due after a day, late at the deadline, withdrawn a day later', () => {
  const state = createState();
  fill(state, { candidates: CANDIDATES, rng: seq(0), makeId }, 1);
  const c = state.commissions[0];
  let r = advance(state, c.deadline - 1);
  assert.equal(r.late.length, 0);
  assert.equal(r.refresh, true);
  r = advance(state, 1);
  assert.deepEqual(r.late, [c]);
  assert.equal(c.late, true);
  assert.equal(deadlineLeft(c), 0);
  r = advance(state, OVERDUE_TICKS - 1);
  assert.equal(r.withdrawn.length, 0);
  r = advance(state, 1);
  assert.deepEqual(r.withdrawn, [c]);
  assert.equal(c.state, 'withdrawn');
  assert.equal(ticksLeft(state), 0);
});

test('deliver counts up to the amount, frees the Folk when done; payout halves resources when late', () => {
  const c = rollCommission({ candidates: CANDIDATES, townshipLevel: 1, rng: seq(0), makeId });
  c.folkId = 'f1';
  assert.deepEqual(deliver(c, 100), { added: 100, done: false });
  assert.equal(remaining(c), c.qty - 100);
  const rest = remaining(c);
  assert.deepEqual(deliver(c, rest + 50), { added: rest, done: true });
  assert.equal(c.folkId, null);
  assert.deepEqual(deliver(c, 5), { added: 0, done: false });
  assert.deepEqual(payout(c), { resources: c.resources, standing: c.standing, xpLevels: c.xpLevels, late: false });
  c.late = true;
  assert.equal(payout(c).resources, Math.floor(c.resources / 2));
  assert.ok(Math.abs(payout(c).standing - c.standing * 0.8) < 1e-9);
});

test('a withdrawn commission pays for what came, without the bonus', () => {
  const c = { qty: 1000, delivered: 250, resources: 12500 };
  assert.equal(proRata(c).resources, Math.floor((12500 * 0.25) / BONUS));
  assert.equal(proRata({ qty: 0, delivered: 0, resources: 1 }).resources, 0);
});

test('Standing grows with deliveries and fades 2% a day after three idle days', () => {
  const standing = { points: 70, idle: 5 * DAY_TICKS };
  assert.deepEqual(gainStanding(standing, 16), { before: 0, after: 1 });
  assert.equal(standing.idle, 0);
  fade(standing, 3 * DAY_TICKS);
  assert.equal(standing.points, 86, 'no fading in the first three days');
  fade(standing, DAY_TICKS);
  assert.ok(Math.abs(standing.points - 86 * 0.98) < 1e-9);
  fade(standing, 2 * DAY_TICKS);
  assert.ok(Math.abs(standing.points - 86 * 0.98 ** 3) < 1e-9);
});

test('a run is due when the room holds the rest, or has no space for one more action', () => {
  assert.equal(runDue({ townQty: 0, remaining: 10, usedMs: 99, capMs: 100, nextMs: 5 }), false);
  assert.equal(runDue({ townQty: 10, remaining: 10, usedMs: 0, capMs: 100, nextMs: 5 }), true);
  assert.equal(runDue({ townQty: 3, remaining: 10, usedMs: 96, capMs: 100, nextMs: 5 }), true);
  assert.equal(runDue({ townQty: 3, remaining: 10, usedMs: 95, capMs: 100, nextMs: 5 }), false);
  assert.equal(runsLeft({ rest: 0, perRunQty: 10 }), 0);
  assert.equal(runsLeft({ rest: 25, perRunQty: 10 }), 3);
  assert.equal(runsLeft({ rest: 5, perRunQty: 0 }), 1);
  assert.equal(RUN_TICKS, 54000, '45 minutes');
});

test('the saved state: a fresh one from junk, bad commissions dropped, one commission per Folk, runs kept', () => {
  assert.deepEqual(normalizeState(null), createState());
  const good = rollCommission({ candidates: CANDIDATES, rng: seq(0), makeId });
  good.folkId = 'f1';
  const twin = { ...good, id: 'other', figure: 'Smith', skillId: 'melvorD:Smithing', itemId: 'melvorD:Iron_Bar', itemIds: ['melvorD:Iron_Bar'], folkId: 'f1' };
  const state = normalizeState({
    commissions: [good, twin, { id: 'x', figure: 'Nobody' }, good],
    ticks: REFRESH_TICKS * 3,
    standing: { points: 55.5, idle: 7 },
    runs: { f1: { ticks: RUN_TICKS * 2, commissionId: good.id, restart: true, pick: { rock: 'melvorD:Copper' } }, f2: { ticks: 'x' }, f3: { ticks: 5, commissionId: good.id, pick: ['junk'] } },
    delivered: 4,
  });
  assert.equal(state.commissions.length, 2);
  assert.equal(state.commissions[0].folkId, 'f1');
  assert.equal(state.commissions[1].folkId, null, 'a second commission for the same Folk lets it go');
  assert.equal(state.ticks, REFRESH_TICKS);
  assert.deepEqual(state.standing, { points: 55.5, idle: 7 });
  assert.deepEqual(state.runs, {
    f1: { ticks: RUN_TICKS, commissionId: good.id, restart: true, pick: { rock: 'melvorD:Copper' } },
    f3: { ticks: 5, commissionId: good.id, restart: false, pick: null },
  });
  assert.equal(state.delivered, 4);
  assert.equal(commissionOf(state, 'f1'), state.commissions[0]);
  assert.equal(normalizeCommission({ ...good, figure: 'Tailor' }), null, 'a Tailor asking for Woodcutting work is dropped');
  assert.equal(normalizeCommission({ ...good, resourceId: 'melvorF:Food' }).resourceId, 'melvorF:Wood', 'the figure\'s own resource');
  const back = normalizeCommission({ ...good, delivered: good.qty + 5, state: 'open' });
  assert.equal(back.delivered, good.qty);
  assert.equal(back.state, 'done');
});

test('every string the board uses exists in en.json: its own, each figure\'s name and lines, each tier', () => {
  const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
  const src = readFileSync(new URL('../src/commissions.mjs', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/'(MOD_WF_[A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 30, 'the board names its keys literally');
  for (const f of FIGURES) {
    keys.push(`MOD_WF_FIGURE_${f.id}`);
    for (const [kind, count] of [['ASK', LINES.ask], ['THANKS', LINES.thanks], ['LATE', LINES.late]]) {
      for (let i = 1; i <= count; i += 1) keys.push(`MOD_WF_FIGURE_${f.id}_${kind}_${i}`);
    }
  }
  for (const t of TIERS) keys.push(`MOD_WF_STANDING_${t.id}`);
  for (const k of [1, 2, 3]) keys.push(`MOD_WF_COMM_HELP_${k}`, `MOD_WF_COMM_HELP_${k}_HEAD`);
  keys.push('MOD_WF_HELP_LABEL_commissions');
  keys.forEach((k) => assert.ok(typeof lang[k] === 'string' && lang[k].length > 0, `missing lang ${k}`));
});

test('what a commission paid keeps what a full storage turned away (none in older saves)', () => {
  const good = rollCommission({ candidates: CANDIDATES, rng: seq(0), makeId });
  const done = { ...good, delivered: good.qty, state: 'done' };
  assert.deepEqual(normalizeCommission({ ...done, paid: { resources: 0, lost: 7800.6, standing: 20, late: false } }).paid, { resources: 0, lost: 7800, standing: 20, late: false });
  assert.deepEqual(normalizeCommission({ ...done, paid: { resources: 500, standing: 20 } }).paid, { resources: 500, lost: 0, standing: 20, late: false });
  assert.equal(normalizeCommission({ ...done, paid: { resources: 500, lost: -3, standing: 20 } }).paid.lost, 0);
  assert.equal(normalizeCommission({ ...done, paid: { lost: 5 } }).paid, null);
});

test('the highest tier reached stays through fading; older saves start from the tier held now', () => {
  const state = createState();
  assert.equal(state.reached, 0);
  gainStanding(state.standing, 85);
  assert.equal(noteReached(state), true);
  assert.equal(state.reached, CHARTER_TIER);
  assert.equal(noteReached(state), false, 'no news the second time');
  fade(state.standing, DAY_TICKS * 40);
  assert.ok(state.standing.points < 80);
  noteReached(state);
  assert.equal(state.reached, CHARTER_TIER, 'fading takes no reached tier away');
  assert.equal(normalizeState({ standing: { points: 320 } }).reached, 2, 'an older save: Trusted held, so Trusted reached');
  assert.equal(normalizeState({ standing: { points: 10 }, reached: 1 }).reached, 1);
  assert.equal(normalizeState({ standing: { points: 10 }, reached: 99 }).reached, 0, 'junk reached: from points');
  assert.equal(normalizeState({ standing: { points: 10 }, reached: 3 }).reached, 3);
});

test('the charter is owed from Known until it is found', () => {
  assert.equal(charterDue(null, false), false);
  assert.equal(charterDue({ reached: 0 }, false), false);
  assert.equal(charterDue({ reached: 1 }, false), true);
  assert.equal(charterDue({ reached: 3 }, true), false);
});

test('the guild package: a charter item and a Grasslands Hall that asks for it, five at most, -1% wages each', () => {
  const pkg = guildPackage({ charter: 'C', charterDesc: 'D', hall: 'H' });
  const [item] = pkg.items;
  assert.equal(item.id, 'Guild_Charter');
  assert.equal(item.name, 'C');
  assert.equal(item.customDescription, 'D');
  assert.equal(item.sellsFor, 0);
  const ts = pkg.skillData[0];
  assert.equal(ts.skillID, 'melvorD:Township');
  const [hall] = ts.data.buildings;
  assert.equal(hall.name, 'H');
  assert.equal(hall.maxUpgrades, HALL_MAX);
  assert.deepEqual(hall.biomes, ['melvorF:Grasslands']);
  assert.deepEqual(hall.modifiers, { 'worker_folks:folkWageDiscount': HALL_WAGE_DISCOUNT });
  assert.ok(HALL_MAX * HALL_WAGE_DISCOUNT <= 10, 'no wage relief source over 10%');
  assert.deepEqual(hall.requirements, [{ type: 'ItemFound', itemID: 'worker_folks:Guild_Charter' }]);
  assert.equal(hall.cost[0].biomeID, 'melvorF:Grasslands');
  assert.ok(hall.cost[0].cost.every((c) => c.quantity > 0 && c.id.startsWith('melvorF:')));
  assert.deepEqual(ts.data.buildingDisplayOrder, [{ insertAt: 'After', afterID: 'melvorF:Town_Hall', ids: ['worker_folks:Guild_Hall', 'worker_folks:Guild_Square'] }]);
});

test('Townsfolk: from Trusted, one hire in four', () => {
  assert.equal(townsfolkRoll(TOWNSFOLK_TIER - 1, () => 0), false, 'never before Trusted');
  assert.equal(townsfolkRoll(TOWNSFOLK_TIER, () => 0), true);
  assert.equal(townsfolkRoll(TOWNSFOLK_TIER, () => TOWNSFOLK_CHANCE - 0.001), true);
  assert.equal(townsfolkRoll(TOWNSFOLK_TIER, () => TOWNSFOLK_CHANCE), false);
  assert.equal(townsfolkRoll(3, () => 0.1), true, 'Honoured too');
  assert.equal(TIERS[TOWNSFOLK_TIER].id, 'Trusted');
  assert.equal(slotsFor(TOWNSFOLK_TIER), 4, 'the fourth commission comes with the same tier');
});

test('Local: half-length runs, a halved strike cooldown only while the town is happy', () => {
  assert.equal(runTicksFor(false), RUN_TICKS);
  assert.equal(runTicksFor(true), RUN_TICKS / 2);
  assert.equal(localCooldownFactor(true, LOCAL_HAPPINESS), 0.5);
  assert.equal(localCooldownFactor(true, 120), 0.5);
  assert.equal(localCooldownFactor(true, LOCAL_HAPPINESS - 0.1), 1);
  assert.equal(localCooldownFactor(true, undefined), 1, 'unreadable happiness: no relief');
  assert.equal(localCooldownFactor(false, 200), 1, 'only Local Folks');
});

test('a run already under way keeps its ticks through a reload, whatever its length', () => {
  const s = normalizeState({ runs: { f1: { ticks: runTicksFor(true), commissionId: 'c1', restart: true } } });
  assert.equal(s.runs.f1.ticks, RUN_TICKS / 2);
});

test('Freedom of the Town is owed from Honoured until it is found; the Guild Charter keeps its own rule', () => {
  assert.equal(charterDue({ reached: 2 }, false, FREEDOM_TIER), false);
  assert.equal(charterDue({ reached: 3 }, false, FREEDOM_TIER), true);
  assert.equal(charterDue({ reached: 3 }, true, FREEDOM_TIER), false);
  assert.equal(TIERS[FREEDOM_TIER].id, 'Honoured');
  assert.deepEqual(CHARTERS.map((c) => [c.tier, c.itemId, c.buildingId]), [[1, 'Guild_Charter', 'Guild_Hall'], [3, 'Freedom_of_the_Town', 'Guild_Square']]);
});

test('the Guild Square: a Grasslands building behind Freedom of the Town, +2% happiness and education, half the Hall\'s bill', () => {
  const pkg = guildPackage({ freedom: 'F', freedomDesc: 'FD', square: 'S' });
  const freedom = pkg.items.find((i) => i.id === 'Freedom_of_the_Town');
  assert.equal(freedom.name, 'F');
  assert.equal(freedom.customDescription, 'FD');
  assert.equal(freedom.sellsFor, 0);
  assert.equal(freedom.ignoreCompletion, true);
  const [hall, square] = pkg.skillData[0].data.buildings;
  assert.equal(square.id, 'Guild_Square');
  assert.equal(square.name, 'S');
  assert.equal(square.maxUpgrades, SQUARE_MAX);
  assert.equal(square.tier, hall.tier);
  assert.deepEqual(square.biomes, ['melvorF:Grasslands']);
  assert.equal(square.modifiers, undefined, 'the town\'s own stats, no player modifier');
  assert.deepEqual(square.provides, [{ biomeID: 'melvorF:Grasslands', population: 0, happiness: SQUARE_HAPPINESS, education: SQUARE_EDUCATION, storage: 0, resources: [] }]);
  assert.equal(SQUARE_MAX * SQUARE_HAPPINESS, 10);
  assert.deepEqual(square.requirements, [{ type: 'ItemFound', itemID: 'worker_folks:Freedom_of_the_Town' }]);
  const hallCost = Object.fromEntries(hall.cost[0].cost.map((c) => [c.id, c.quantity]));
  square.cost[0].cost.forEach((c) => assert.equal(c.quantity * 2, hallCost[c.id], c.id));
  assert.equal(square.cost[0].cost.length, hall.cost[0].cost.length);
});
