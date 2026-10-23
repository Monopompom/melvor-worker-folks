import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDelegable, implementsActionContract } from '../src/delegable.mjs';

const skill = (id, extra = {}) => ({
  id,
  stop() {},
  activeTick() {},
  isActive: false,
  actionTimer: {},
  ...extra,
});

test('keeps gathering/crafting style skills and drops combat-like actions', () => {
  const actions = [skill('melvorD:Combat'), skill('melvorD:GolbinRaid'), skill('melvorD:Woodcutting'), skill('melvorD:Smithing')];
  const out = selectDelegable(actions, { combatLikeIds: ['melvorD:Combat', 'melvorD:GolbinRaid'] });
  assert.deepEqual(out.map((a) => a.id), ['melvorD:Woodcutting', 'melvorD:Smithing']);
});

test('never hands out Cartography, whatever the options', () => {
  const out = selectDelegable([skill('melvorAoD:Cartography'), skill('melvorD:Mining')]);
  assert.deepEqual(out.map((a) => a.id), ['melvorD:Mining']);
});

test('drops actions that do not implement the contract', () => {
  const custom = { id: 'some_mod:Weird', stop() {} }; // no activeTick / timer / isActive
  const out = selectDelegable([custom, skill('melvorD:Fishing')]);
  assert.deepEqual(out.map((a) => a.id), ['melvorD:Fishing']);
  assert.equal(implementsActionContract(custom), false);
});

test('honours the exclude list and ignores garbage entries', () => {
  const out = selectDelegable([skill('melvorD:Magic'), skill('melvorD:Mining'), null, { id: 42 }], { excludeIds: ['melvorD:Magic'] });
  assert.deepEqual(out.map((a) => a.id), ['melvorD:Mining']);
});

test('accepts a Cartography-shaped skill that has no plain start()', () => {
  const carto = { id: 'melvorAoD:Cartography', stop() {}, activeTick() {}, isActive: false, actionTimer: {}, startSurveyTimer() {} };
  assert.equal(implementsActionContract(carto), true);
});

test('preserves registry order (mod skills simply append)', () => {
  const ids = ['melvorD:Woodcutting', 'other_mod:Alchemy', 'melvorItA:Harvesting'];
  const out = selectDelegable(ids.map((id) => skill(id)));
  assert.deepEqual(out.map((a) => a.id), ids);
});
