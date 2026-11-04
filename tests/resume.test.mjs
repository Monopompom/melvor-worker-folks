import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectionOf, startAgain, toSaved, fromSaved } from '../src/resume.mjs';

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

test('Woodcutting with no tree to go back to is not started', () => {
  let started = 0;
  const wc = { activeTrees: new Set(), selectTree() {}, start() { started += 1; } };
  startAgain(wc, undefined);
  startAgain(wc, { trees: [] });
  assert.equal(started, 0);
  wc.activeTrees.add('oak');
  startAgain(wc, undefined);
  assert.equal(started, 1, 'a tree still selected: a plain start()');
});

test('a skill that keeps its own pick gets a plain start()', () => {
  let started = 0;
  const fishing = { selectedFish: 'shrimp', start() { started += 1; } };
  assert.equal(selectionOf(fishing), null);
  startAgain(fishing, null);
  assert.equal(started, 1);
});

test('Cooking: the pick is the active category, replayed through its Cook button once the category is gone', () => {
  const calls = [];
  const cooking = { selectedRecipes: new Map(), activeCookingCategory: 'fire', onActiveCookButtonClick(c) { calls.push(`cook ${c}`); }, start() { calls.push('start'); } };
  const pick = selectionOf(cooking);
  assert.deepEqual(pick, { cook: 'fire' });
  startAgain(cooking, pick);
  cooking.activeCookingCategory = undefined;
  startAgain(cooking, pick);
  assert.deepEqual(calls, ['start', 'cook fire']);
  assert.equal(selectionOf(cooking), null, 'no category: nothing to keep');
});

const registry = (...ids) => {
  const objs = new Map(ids.map((id) => [id, { id }]));
  return { getObjectByID: (id) => objs.get(id) };
};

test('a pick goes into the save as ids and comes back as the skill\'s own objects', () => {
  const wc = { actions: registry('oak', 'willow'), activeTrees: new Set(), selectTree() {} };
  const saved = toSaved({ trees: [{ id: 'oak' }, { id: 'willow' }] });
  assert.deepEqual(saved, { trees: ['oak', 'willow'] });
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved);
  const back = fromSaved(wc, saved);
  assert.equal(back.trees[0], wc.actions.getObjectByID('oak'));
  assert.equal(back.trees.length, 2);
  const mining = { actions: registry('copper'), onRockClick() {} };
  assert.equal(fromSaved(mining, toSaved({ rock: { id: 'copper' } })).rock, mining.actions.getObjectByID('copper'));
  const harvesting = { actions: registry('v1'), onVeinClick() {} };
  assert.equal(fromSaved(harvesting, toSaved({ vein: { id: 'v1' } })).vein.id, 'v1');
  const arch = { actions: registry('site'), startDigging() {} };
  assert.equal(fromSaved(arch, toSaved({ digSite: { id: 'site' } })).digSite.id, 'site');
  const cooking = { categories: registry('fire'), onActiveCookButtonClick() {} };
  assert.equal(fromSaved(cooking, toSaved({ cook: { id: 'fire' } })).cook.id, 'fire');
});

test('Cartography picks keep hex coordinates and recipe or dig site ids', () => {
  const hexes = new Map([['1,2', { q: 1, r: 2, extra: 'hex a' }], ['3,4', { q: 3, r: 4 }]]);
  const carto = { startAutoSurvey() {}, activeMap: { getHex: ({ q, r }) => hexes.get(`${q},${r}`) }, paperRecipes: registry('paper') };
  const game = { archaeology: { actions: registry('site') } };
  const queue = toSaved({ mode: 1, hexes: [hexes.get('1,2'), hexes.get('3,4')] });
  assert.deepEqual(queue, { mode: 1, hexes: [{ q: 1, r: 2 }, { q: 3, r: 4 }] });
  assert.equal(fromSaved(carto, queue, game).hexes[0].extra, 'hex a');
  assert.equal(fromSaved(carto, toSaved({ mode: 2, hex: hexes.get('3,4') }), game).hex, hexes.get('3,4'));
  assert.equal(fromSaved(carto, toSaved({ mode: 3, recipe: { id: 'paper' } }), game).recipe.id, 'paper');
  assert.equal(fromSaved(carto, toSaved({ mode: 4, digSite: { id: 'site' } }), game).digSite.id, 'site');
  assert.equal(fromSaved(carto, { mode: 2, hex: { q: 9, r: 9 } }, game), null, 'a hex the map lacks');
});

test('a saved pick another skill or a gone id cannot use gives null: a plain start', () => {
  const smithing = { actions: registry('bar'), categories: registry('fire'), start() {} };
  assert.equal(fromSaved(smithing, { cook: 'fire' }), null, 'categories but no Cook button');
  assert.equal(fromSaved(smithing, { rock: 'bar' }), null, 'no rock starter');
  const mining = { actions: registry('copper'), onRockClick() {} };
  assert.equal(fromSaved(mining, { rock: 'mithril' }), null);
  assert.equal(fromSaved(mining, { trees: ['copper'] }), null);
  assert.equal(fromSaved(mining, null), null);
  assert.equal(fromSaved(undefined, { rock: 'copper' }), null);
  assert.equal(toSaved(null), null);
  assert.equal(toSaved({ trees: [] }), null);
  assert.equal(toSaved({ mode: 0 }), null);
});
