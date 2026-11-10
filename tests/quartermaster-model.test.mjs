import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Q from '../src/quartermaster-model.mjs';

test('the slots a Quartermaster watches grow by tier, and it looks more often', () => {
  assert.deepEqual(Q.watches('Newbie'), ['food']);
  assert.deepEqual(Q.watches('Junior'), ['food', 'ammo']);
  assert.deepEqual(Q.watches('Middle'), ['food', 'ammo', 'summon']);
  assert.deepEqual(Q.watches('Senior'), ['food', 'ammo', 'summon', 'consumable']);
  assert.deepEqual(Q.watches('Expert'), Q.watches('Senior'));
  assert.deepEqual(Q.watches('Boss'), []);
  assert.deepEqual(['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'].map(Q.checkMs), [30000, 20000, 15000, 10000, 5000]);
  assert.equal(Q.UNLOCK_LEVEL, 45);
});

test('a line is one of its choices, anything else the default', () => {
  assert.equal(Q.lineOf('food', 500), 500);
  assert.equal(Q.lineOf('food', '1000'), 1000);
  assert.equal(Q.lineOf('food', 7), Q.DEFAULT_LINES.food);
  assert.equal(Q.lineOf('ammo', undefined), 1000);
  Q.KINDS.forEach((k) => assert.ok(Q.LINE_CHOICES[k].includes(Q.DEFAULT_LINES[k]), k));
});

test('no refills where the game refuses an equip: dungeons and strongholds unless swapping is allowed, the Raid', () => {
  assert.equal(Q.equipBlocked({}), false);
  assert.equal(Q.equipBlocked({ areaType: 'Area' }), false);
  assert.equal(Q.equipBlocked({ areaType: 'Dungeon' }), true);
  assert.equal(Q.equipBlocked({ areaType: 'Dungeon', dungeonSwap: 1 }), false);
  assert.equal(Q.equipBlocked({ areaType: 'Stronghold' }), true);
  assert.equal(Q.equipBlocked({ areaType: 'Stronghold', strongholdSwap: 1 }), false);
  assert.equal(Q.equipBlocked({ raid: true }), true);
});

test('a slot remembers its item when it runs empty, and a new item replaces it', () => {
  const m = Q.remember({}, [{ key: 'food0', itemId: 'shark' }, { key: 'ammo', itemId: null }]);
  assert.deepEqual(m, { food0: 'shark' });
  assert.deepEqual(Q.remember(m, [{ key: 'food0', itemId: null }]), { food0: 'shark' });
  assert.deepEqual(Q.remember(m, [{ key: 'food0', itemId: 'whale' }]), { food0: 'whale' });
});

test('a look fills each watched slot to its line from the bank, with the same item only', () => {
  const lines = { food: 200, ammo: 1000, summon: 500, consumable: 100 };
  const slots = [
    { key: 'food0', kind: 'food', itemId: 'shark', qty: 150, bank: 9999 },
    { key: 'food1', kind: 'food', itemId: 'whale', qty: 300, bank: 9999 },
    { key: 'ammo', kind: 'ammo', itemId: 'rune_arrows', qty: 10, bank: 400 },
    { key: 'summon1', kind: 'summon', itemId: 'wolf', qty: 0, bank: 50 },
  ];
  const junior = Q.plan(slots, { tier: 'Junior', lines });
  assert.deepEqual(junior.refills, [
    { key: 'food0', kind: 'food', itemId: 'shark', add: 50, empty: false },
    { key: 'ammo', kind: 'ammo', itemId: 'rune_arrows', add: 400, empty: false },
  ], 'over its line: left alone; short bank: what there is; familiars not yet at Junior');
  assert.deepEqual(junior.out, []);
  const middle = Q.plan(slots, { tier: 'Middle', lines });
  assert.equal(middle.refills.find((r) => r.key === 'summon1').add, 50);
});

test('an emptied slot is refilled with what it last held; with none in the bank it is reported, never swapped', () => {
  const slots = [
    { key: 'food0', kind: 'food', itemId: null, qty: 0, bank: 30 },
    { key: 'food1', kind: 'food', itemId: 'whale', qty: 5, bank: 0 },
    { key: 'food2', kind: 'food', itemId: null, qty: 0, bank: 0 },
  ];
  const r = Q.plan(slots, { tier: 'Newbie', memory: { food0: 'shark', food1: 'whale' } });
  assert.deepEqual(r.refills, [{ key: 'food0', kind: 'food', itemId: 'shark', add: 30, empty: true }]);
  assert.deepEqual(r.out, [{ key: 'food1', kind: 'food', itemId: 'whale' }], 'food2 never held anything: nothing to say');
});
