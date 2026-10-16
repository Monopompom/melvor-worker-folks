import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShopData, licenceItems, licencePurchase } from '../src/shop-data.mjs';
import { shiftSlotPrice, shiftSlotCap } from '../src/pricing.mjs';

test('Expert licence items follow the expansion variants', () => {
  assert.deepEqual(licenceItems('Expert').map((i) => i.id), ['melvorF:Ultima_Godsword', 'melvorF:Elder_Crown']);
  assert.deepEqual(licenceItems('Expert', { hasTotH: true }).map((i) => i.id), ['melvorTotH:FrostSpark_Amulet', 'melvorTotH:Divine_Platebody', 'melvorTotH:Ethereal_Arrows']);
  const all = licenceItems('Expert', { hasTotH: true, hasAoD: true, hasItA: true }).map((i) => i.id);
  assert.ok(all.includes('melvorAoD:Mystic_Pure_Crystal_Staff') && all.includes('melvorItA:Voidfire_Quartz'));
  assert.equal(all.length, 7);
  const aodOnly = licenceItems('Expert', { hasAoD: true }).map((i) => i.id);
  assert.deepEqual(aodOnly.slice(0, 2), ['melvorF:Ultima_Godsword', 'melvorF:Elder_Crown']);
});

test('licence chain: previous licence, Hiring level and dungeon', () => {
  const junior = licencePurchase('Junior', {});
  assert.deepEqual(junior.purchaseRequirements, [
    { type: 'DungeonCompletion', dungeonID: 'melvorD:Volcanic_Cave', count: 1 },
    { type: 'SkillLevel', skillID: 'worker_folks:Hiring', level: 20 },
    { type: 'ShopPurchase', purchaseID: 'worker_folks:Licence_Newbie', count: 1 },
  ]);
  const newbie = licencePurchase('Newbie', {});
  assert.equal(newbie.purchaseRequirements.length, 1);
  // the dungeon is never the one the signature item drops from
  assert.deepEqual(newbie.purchaseRequirements[0], { type: 'DungeonCompletion', dungeonID: 'melvorD:Frozen_Cove', count: 1 });
  assert.equal(licencePurchase('Middle', {}).purchaseRequirements[0].dungeonID, 'melvorF:Air_God_Dungeon');
  assert.equal(licencePurchase('Senior', {}).purchaseRequirements[0].dungeonID, 'melvorF:Fire_God_Dungeon');
  assert.equal(licencePurchase('Expert', {}).purchaseRequirements[0].dungeonID, 'melvorF:Into_the_Mist');
  assert.equal(newbie.defaultBuyLimit, 1);
  assert.deepEqual(newbie.contains, { items: [], modifiers: {} });
});

test('buildShopData lists licences, hires, slot in display order with namespaced ids', () => {
  const data = buildShopData({});
  assert.equal(data.shopPurchases.length, 11);
  assert.deepEqual(data.shopDisplayOrder[0].ids.slice(0, 2), ['worker_folks:Licence_Newbie', 'worker_folks:Licence_Junior']);
  assert.equal(data.shopDisplayOrder[0].ids.at(-1), 'worker_folks:Shift_Slot');
  const hire = data.shopPurchases.find((p) => p.id === 'Hire_Expert');
  assert.equal(hire.cost.currencies[0].cost, 120000000);
  assert.equal(hire.purchaseRequirements[0].purchaseID, 'worker_folks:Licence_Expert');
  assert.equal(hire.unlockRequirements.length, 0);
  assert.ok(new Set(data.shopPurchases.map((p) => p.id)).size === 11);
});

test('Shift Slot price ladder and licence caps', () => {
  assert.equal(shiftSlotPrice(0), 4200000);
  assert.equal(shiftSlotPrice(1), 5880000);
  assert.equal(shiftSlotPrice(2), 8232000);
  assert.equal(shiftSlotCap(null, 15), 0);
  assert.equal(shiftSlotCap('Newbie', 15), 2);
  assert.equal(shiftSlotCap('Senior', 15), 10);
  assert.equal(shiftSlotCap('Expert', 15), 15);
  assert.equal(shiftSlotCap('Expert', 18), 18);
});

test('shop text uses each tier\'s plural and article (Journeymen, an Apprentice)', () => {
  const { shopPurchases } = buildShopData();
  const byId = Object.fromEntries(shopPurchases.map((p) => [p.id, p]));
  const names = shopPurchases.map((p) => `${p.customName} ${p.customDescription}`).join(' ');
  assert.ok(!/Journeymans|Foremans|a Apprentice/.test(names));
  assert.match(Object.values(byId).find((p) => /Apprentice Licence/.test(p.customName)).customDescription, /promoting Apprentices/);
  assert.match(names, /promoting Journeymen/);
  assert.ok(shopPurchases.some((p) => p.customName === 'Hire an Apprentice'));
  assert.ok(shopPurchases.some((p) => p.customName === 'Hire a Foreman'));
});
