import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLUMNS, DEFAULT_COLS, allowed, cleanLayout, defaultLayout, isDefault, orderCards, parseLayout, pruneCards, serializeLayout,
  setFolded,
} from '../src/layout-model.mjs';

test('the default layout: the Overview above the cards, nothing folded', () => {
  const d = defaultLayout();
  assert.deepEqual(d, { cols: { wide: ['dashboard', 'crew'] }, folded: [], cards: [] });
  assert.ok(isDefault(d));
  d.cols.wide.push('x');
  assert.deepEqual(DEFAULT_COLS.wide, ['dashboard', 'crew'], 'a default layout is a copy');
});

test('a saved layout round-trips', () => {
  const saved = { cols: { wide: ['crew', 'dashboard'] }, folded: ['dashboard'], cards: ['f2', 'f1'] };
  const back = parseLayout(serializeLayout(saved));
  assert.deepEqual(back, saved);
  assert.equal(isDefault(back), false);
});

test('junk reads as the default layout', () => {
  for (const text of [undefined, null, '', '{', 'null', '42', '"x"', '[]', '{"cols":5}']) {
    assert.ok(isDefault(parseLayout(text)), `${text}`);
  }
});

test('unknown ids and repeats are dropped', () => {
  const l = cleanLayout({ cols: { wide: ['crew', 'ghost', 'crew', 7, 'dashboard', 'dashboard'] }, folded: ['ghost', 'dashboard', 'dashboard', null, 'crew'], cards: ['a', 'a', 5, '', 'b'] });
  assert.deepEqual(l, { cols: { wide: ['crew', 'dashboard'] }, folded: ['dashboard'], cards: ['a', 'b'] });
});

test('a layout from builds .93-.97 (two top columns, a reserve block) cleans to one column', () => {
  const old = { cols: { left: ['reserve'], right: ['dashboard'], wide: ['crew'] }, folded: ['reserve'], cards: ['f1'] };
  assert.deepEqual(cleanLayout(old), { cols: { wide: ['dashboard', 'crew'] }, folded: [], cards: ['f1'] });
  const below = { cols: { left: ['reserve'], right: [], wide: ['crew', 'dashboard'] }, folded: ['dashboard'] };
  assert.deepEqual(cleanLayout(below).cols, { wide: ['crew', 'dashboard'] }, 'the Overview kept below the cards');
  assert.deepEqual(cleanLayout(below).folded, ['dashboard']);
});

test('a block missing from the saved order goes back to its default place', () => {
  assert.deepEqual(cleanLayout({ cols: { wide: ['crew'] } }).cols, { wide: ['dashboard', 'crew'] });
  assert.deepEqual(cleanLayout({ cols: { wide: ['dashboard'] } }).cols, { wide: ['dashboard', 'crew'] });
});

test('allowed: the one column only', () => {
  assert.equal(allowed('dashboard', 'wide'), true);
  assert.equal(allowed('crew', 'wide'), true);
  assert.equal(allowed('dashboard', 'left'), false);
});

test('isDefault: order matters, folding counts, the crew never folds', () => {
  assert.equal(isDefault(cleanLayout({ cols: { wide: ['dashboard', 'crew'] } })), true);
  assert.equal(isDefault(cleanLayout({ cols: { wide: ['crew', 'dashboard'] } })), false);
  assert.equal(isDefault(setFolded(defaultLayout(), 'dashboard', true)), false);
  assert.equal(isDefault(setFolded(setFolded(defaultLayout(), 'dashboard', true), 'dashboard', false)), true);
  assert.equal(isDefault(setFolded(defaultLayout(), 'crew', true)), true, 'the crew has no title row to fold to');
});

test('setFolded adds once and removes', () => {
  let l = setFolded(defaultLayout(), 'dashboard', true);
  l = setFolded(l, 'dashboard', true);
  assert.deepEqual(l.folded, ['dashboard']);
  assert.deepEqual(setFolded(l, 'dashboard', false).folded, []);
});

test('cards: dragged order first, the rest by slot; fired Folks dropped', () => {
  assert.deepEqual(orderCards([], ['a', 'b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(orderCards(['c', 'gone', 'a'], ['a', 'b', 'c']), ['c', 'a', 'b']);
  const l = { ...defaultLayout(), cards: ['c', 'gone'] };
  assert.deepEqual(pruneCards(l, ['a', 'b', 'c']), { ...l, cards: ['c'] });
});

test('isDefault with cards: slot order', () => {
  const live = ['a', 'b'];
  assert.equal(isDefault({ ...defaultLayout(), cards: ['a', 'b'] }, DEFAULT_COLS, live), true);
  assert.equal(isDefault({ ...defaultLayout(), cards: ['b'] }, DEFAULT_COLS, live), false);
  assert.equal(isDefault({ ...defaultLayout(), cards: ['gone'] }, DEFAULT_COLS, live), true);
});

test('every column has a default list', () => {
  for (const c of COLUMNS) assert.ok(Array.isArray(DEFAULT_COLS[c]));
});

test('every literal lang key the layout code uses exists in en.json', () => {
  const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
  const src = readFileSync(new URL('../src/layout.mjs', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/'(MOD_WF_[A-Z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 4, 'the layout code names its keys literally');
  keys.forEach((k) => assert.ok(typeof lang[k] === 'string' && lang[k].length > 0, `missing lang ${k}`));
});

test('every literal lang key the Payroll band uses exists in en.json', () => {
  const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
  const src = readFileSync(new URL('../src/reserve-panel.mjs', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/'(MOD_WF_[A-Z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 8);
  keys.forEach((k) => assert.ok(typeof lang[k] === 'string' && lang[k].length > 0, `missing lang ${k}`));
});
