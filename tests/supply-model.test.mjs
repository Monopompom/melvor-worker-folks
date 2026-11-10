import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/supply-model.mjs';

test('supply lines open at Hiring 60 with one tier step of Produce Rate', () => {
  assert.equal(S.UNLOCK_LEVEL, 60);
  assert.equal(S.LINK_BONUS, 20);
});

test('a supplier may feed a Folk whose recipe uses what it makes and has no other supplier for it', () => {
  const smith = { id: 'smith', inputs: ['iron_ore', 'coal'] };
  const cook = { id: 'cook', inputs: ['raw_shrimp'] };
  const coal = { id: 'coalMiner', products: ['coal'] };
  assert.deepEqual(S.receivers(coal, [smith, cook, { id: 'coalMiner', inputs: ['coal'] }], []), [{ id: 'smith', items: ['coal'] }], 'never itself, only a recipe that uses coal');
  // Steel: an Iron miner and a Coal miner both feed the smith (one supplier per input).
  const iron = { id: 'ironMiner', products: ['iron_ore'] };
  const productsOf = (id) => ({ coalMiner: ['coal'], ironMiner: ['iron_ore'], coal2: ['coal'] }[id] ?? []);
  const links = [{ supplierId: 'coalMiner', receiverId: 'smith' }];
  assert.deepEqual(S.receivers(iron, [smith], links, productsOf), [{ id: 'smith', items: ['iron_ore'] }]);
  // A second Coal miner finds the smith's coal taken.
  assert.deepEqual(S.receivers({ id: 'coal2', products: ['coal'] }, [smith], links, productsOf), []);
  // The linked supplier itself still sees it (to keep or change its pick).
  assert.deepEqual(S.receivers(coal, [smith], links, productsOf), [{ id: 'smith', items: ['coal'] }]);
  assert.deepEqual(S.receivers({ id: 'x', products: [] }, [smith], []), [], 'makes nothing yet: nobody');
});

test('a unit of input weighs its share of the receiver action, as Restock does', () => {
  const steel = [{ id: 'iron_ore', qty: 1 }, { id: 'coal', qty: 2 }];
  assert.equal(S.unitMs(steel, 2000, 'iron_ore'), 1000);
  assert.equal(S.unitMs(steel, 2000, 'coal'), 500);
  assert.equal(S.unitMs(steel, 2000, 'gold'), 0);
  assert.equal(S.unitMs(steel, 0, 'coal'), 0);
});

test('a delivery fills the free room and sends the rest to the bank', () => {
  assert.deepEqual(S.split(10, 5000, 1000), { toRoom: 5, toBank: 5 });
  assert.deepEqual(S.split(3, 5000, 1000), { toRoom: 3, toBank: 0 });
  assert.deepEqual(S.split(4, 0, 1000), { toRoom: 0, toBank: 4 });
  assert.deepEqual(S.split(4, -50, 1000), { toRoom: 0, toBank: 4 });
  assert.deepEqual(S.split(4, 5000, 0), { toRoom: 0, toBank: 4 }, 'an item it does not use never goes in');
  assert.deepEqual(S.split(0, 5000, 1000), { toRoom: 0, toBank: 0 });
});

test('the receiver takes from its stock first, then your bank', () => {
  assert.deepEqual(S.draw(5, 3), { fromStock: 3, fromBank: 2 });
  assert.deepEqual(S.draw(5, 9), { fromStock: 5, fromBank: 0 });
  assert.deepEqual(S.draw(5, 0), { fromStock: 0, fromBank: 5 });
  const steel = [{ id: 'iron_ore', qty: 1 }, { id: 'coal', qty: 2 }];
  const stock = { coal: 1 };
  const bank = { iron_ore: 1, coal: 1 };
  assert.equal(S.covers(steel, (id) => stock[id] ?? 0, (id) => bank[id] ?? 0), true);
  assert.equal(S.covers(steel, () => 0, (id) => bank[id] ?? 0), false);
});

test('the receiver gains the bonus while one of its suppliers works', () => {
  const links = [{ supplierId: 'a', receiverId: 'r' }, { supplierId: 'b', receiverId: 'r' }];
  assert.equal(S.bonus('r', links, (id) => id === 'b'), 20);
  assert.equal(S.bonus('r', links, () => false), 0);
  assert.equal(S.bonus('a', links, () => true), 0, 'a supplier gains nothing');
});
