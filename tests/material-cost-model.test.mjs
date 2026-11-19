import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_PER_HOUR, MIN_PER_8H, GEM_VEIN, gemVeinMs, superiorGemMs, randomGemMs, meteoriteMs, farmMs, costBook, askable, itemsIn,
} from '../src/material-cost-model.mjs';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('find rates follow the game: gem veins, superior gems, random gems, meteorites, farm plots', () => {
  // The rarest vein (weight 1 of 20): one per 1 / (0.5333% × 16.125 / 20) Mining actions, plus the one that takes it.
  const perAction = GEM_VEIN.chance * GEM_VEIN.hp;
  close(gemVeinMs({ miningMs: 3000, weight: 1, totalWeight: 20 }), 3000 / (perAction / 20) + 3000);
  assert.ok(gemVeinMs({ miningMs: 3000, weight: 1, totalWeight: 20 }) > 600000);
  // Zephyte: 10% of vein actions give a superior gem, 1 in 20 of those is one: about two hours of Mining.
  const z = superiorGemMs({ miningMs: 3000, chance: 10, weight: 1, totalWeight: 20 });
  assert.ok(z > 1.9 * MS_PER_HOUR && z < 2.2 * MS_PER_HOUR, `${z}`);
  close(randomGemMs({ miningMs: 3000, weight: 25, totalWeight: 100 }), 3000 / 0.0025);
  // Astrology at 3 s: 0.25% for 14.5 HP, so about 83 s per Meteorite Ore with its Mining.
  close(meteoriteMs({ astrologyMs: 3000, miningMs: 3000 }), 3000 / (0.0025 * 14.5) + 3000);
  // A 5.5 h herb, 4 a harvest, on 4 plots: about 1,238 s per herb; no plot counts as one.
  close(farmMs({ growthMs: 19800000, harvest: 4, plots: 4 }), 19800000 / 16);
  close(farmMs({ growthMs: 19800000, harvest: 4, plots: 0 }), 19800000 / 4);
  for (const ms of [gemVeinMs({}), superiorGemMs({}), randomGemMs({}), meteoriteMs({}), farmMs({})]) assert.equal(ms, Infinity);
});

test('a chain costs its gathering and every step: bars from ore, bodies from logs', () => {
  const book = costBook({
    sources: { ore: [{ ms: 3000 }], logs: [{ ms: 40000 }], bark: [] },
    recipes: { bar: [{ ms: 2000, out: 1, costs: [{ id: 'ore', qty: 2 }] }] },
  });
  assert.equal(book.unit('ore').ms, 3000);
  assert.equal(book.unit('bar').ms, 8000);
  // A platebody of 5 bars at 2 s: 42 s of chain, not the 2 s the Folk's own step takes.
  assert.equal(book.action({ ms: 2000, out: 1, costs: [{ id: 'bar', qty: 5 }] }).ms, 42000);
  // Three bolts from one bar: per bolt a third.
  assert.equal(book.action({ ms: 2000, out: 3, costs: [{ id: 'bar', qty: 1 }] }).ms, 10000 / 3);
  // Something no Folk can get (a monster drop): no way at all, and so anything made of it.
  const body = book.action({ ms: 3000, out: 1, costs: [{ id: 'logs', qty: 150 }, { id: 'bark', qty: 50 }] });
  assert.equal(body.ms, Infinity);
  assert.ok(body.kinds.includes('none'));
  assert.deepEqual(body.missing, ['bark']);
  // What it would cost without the drop: what an old card shrinks by.
  assert.equal(body.known, 3000 + 150 * 40000);
});

test('the cheapest way wins: a shop item costs no work, another recipe can be cheaper, a loop is no way', () => {
  const book = costBook({
    sources: { feather: [{ ms: 0, kind: 'shop' }], oak: [{ ms: 4000 }], normal: [{ ms: 3000 }], gem: [{ ms: 7e6, kind: 'find' }] },
    recipes: {
      shaft: [{ ms: 2000, out: 15, costs: [{ id: 'normal', qty: 1 }] }, { ms: 2000, out: 30, costs: [{ id: 'oak', qty: 1 }] }],
      a: [{ ms: 1000, out: 1, costs: [{ id: 'b', qty: 1 }] }],
      b: [{ ms: 1000, out: 1, costs: [{ id: 'a', qty: 1 }] }],
      ring: [{ ms: 3000, out: 1, costs: [{ id: 'gem', qty: 1 }] }],
    },
  });
  assert.equal(book.unit('feather').ms, 0);
  assert.deepEqual(book.unit('feather').kinds, ['shop']);
  assert.equal(book.unit('shaft').ms, 6000 / 30);
  assert.equal(book.unit('a').ms, Infinity);
  assert.deepEqual(book.unit('ring').kinds, ['find']);
  assert.equal(book.unit('nothing').ms, Infinity);
  // Broken entries are left out.
  const odd = costBook({ sources: { x: [null, { ms: -1 }, { ms: 5 }] }, recipes: { y: [null, { ms: 1, costs: [null, { id: 'x', qty: 0 }, { id: 'x', qty: 2 }] }] } });
  assert.equal(odd.unit('x').ms, 5);
  assert.equal(odd.unit('y').ms, 11);
});

test('askable: a Folk can get it and 8 h make at least ten', () => {
  assert.equal(askable(Infinity), false);
  assert.equal(askable(0), false);
  assert.equal(askable((8 * MS_PER_HOUR) / MIN_PER_8H), true);
  assert.equal(askable((8 * MS_PER_HOUR) / MIN_PER_8H + 1), false);
  assert.equal(askable(3000), true);
  close(itemsIn(16, 3000), 19200);
  assert.equal(itemsIn(16, Infinity), 0);
});
