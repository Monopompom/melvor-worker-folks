import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectionOf, startAgain } from '../src/resume.mjs';

test('trees: the pick is the tree set, replayed through selectTree', () => {
  const calls = [];
  const wc = { activeTrees: new Set(['oak', 'willow']), selectTree(t) { calls.push(t); this.activeTrees.add(t); }, start() { calls.push('start'); } };
  const pick = selectionOf(wc);
  assert.deepEqual(pick, { trees: ['oak', 'willow'] });
  wc.activeTrees.clear();
  startAgain(wc, pick);
  assert.deepEqual(calls, ['oak', 'willow']);
});

test('rock, vein and dig site go back through the game\'s click starters', () => {
  const calls = [];
  const mining = { selectedRock: 'copper', onRockClick(r) { calls.push(`rock ${r}`); } };
  const pick = selectionOf(mining);
  mining.selectedRock = undefined;
  startAgain(mining, pick);
  const harvesting = { selectedVein: 'v1', onVeinClick(v) { calls.push(`vein ${v}`); } };
  const vein = selectionOf(harvesting);
  harvesting.selectedVein = undefined;
  startAgain(harvesting, vein);
  const arch = { currentDigSite: 'old', startDigging(d) { calls.push(`dig ${d}`); }, start() { calls.push('start'); } };
  const site = selectionOf(arch);
  arch.currentDigSite = undefined;
  startAgain(arch, site);
  assert.deepEqual(calls, ['rock copper', 'vein v1', 'dig old']);
});

test('Cartography restarts by mode; the survey queue is rebuilt in order', () => {
  const calls = [];
  const queue = { items: ['a', 'b'], forEachForward(fn) { this.items.forEach(fn); }, queue(h) { calls.push(`queue ${h}`); } };
  const carto = { _actionMode: 1, surveyQueue: queue, startAutoSurvey(h) { calls.push(`auto ${h}`); }, startSurveyQueue() { calls.push('queue start'); },
    startMakingPaper(r) { calls.push(`paper ${r}`); }, startUpgradingMap(d) { calls.push(`upgrade ${d}`); } };
  const q = selectionOf(carto);
  assert.deepEqual(q, { mode: 1, hexes: ['a', 'b'] });
  startAgain(carto, q);
  Object.assign(carto, { _actionMode: 2, autoSurveyHex: 'h' }); startAgain(carto, selectionOf(carto));
  Object.assign(carto, { _actionMode: 3, selectedPaperRecipe: 'p' }); startAgain(carto, selectionOf(carto));
  Object.assign(carto, { _actionMode: 4, selectedMapUpgradeDigsite: 'd' }); startAgain(carto, selectionOf(carto));
  carto._actionMode = 0;
  assert.equal(selectionOf(carto), null);
  assert.deepEqual(calls, ['queue a', 'queue b', 'queue start', 'auto h', 'paper p', 'upgrade d']);
});

test('a skill that keeps its own pick gets a plain start()', () => {
  let started = 0;
  const fishing = { selectedFish: 'shrimp', start() { started += 1; } };
  assert.equal(selectionOf(fishing), null);
  startAgain(fishing, null);
  assert.equal(started, 1);
});
