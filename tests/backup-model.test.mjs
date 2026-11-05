import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../src/backup-model.mjs';
import { SAVE_VERSION, createFolk, serializeRoot } from '../src/folk.mjs';

const folk = (id, slot, extra = {}) => ({ ...createFolk({ id, slot, tier: 'Junior', name: `F${slot}` }), ...extra });
const record = (folks, reserve = {}) => serializeRoot(folks, reserve);

const sample = (over = {}) => B.make({
  record: record([folk('a', 0, { loadout: { Pick: { id: 'melvorD:Rune_Pickaxe', qty: 1 } } }), folk('b', 1)], { 'melvorD:GP': 5000 }),
  xp: 123456.5, abyssalXP: 0, unlocked: true, caps: { level: 99, abyssal: null },
  mastery: { 'worker_folks:Slot_1': 4000, 'worker_folks:Slot_2': 0 },
  pool: { 'melvorD:Melvor': 9000 },
  relics: { 'melvorD:Melvor': { 'worker_folks:Relic_1': 1 }, 'melvorItA:Abyssal': {} },
  items: { 'worker_folks:Licence_Junior': 1, 'worker_folks:Mastery_Token_Hiring': 3, 'melvorD:Oak_Logs': 50 },
  buys: { 'worker_folks:Hire_Junior': 2, 'melvorD:Auto_Eat_Tier_I': 1 },
  buildings: { 'melvorF:Grasslands': { 'worker_folks:Guild_Hall': { n: 1, eff: 80 }, 'melvorF:Woodcutters_Camp': { n: 9, eff: 100 } } },
  pets: ['worker_folks:Bruno', 'melvorD:Ty'],
  settings: { wageDifficulty: 'standard', quietFolkPopups: true },
  name: 'VoFoSD', mode: 'melvorD:Standard', mod: '1.7.0', build: '2026-11-05.181', save: SAVE_VERSION, at: Date.UTC(2026, 10, 5, 12),
  ...over,
});

test('make keeps only this mod\'s items, purchases, buildings and pets, and clean numbers', () => {
  const b = sample();
  assert.equal(b.f, B.FORMAT);
  assert.deepEqual(b.items, { 'worker_folks:Licence_Junior': 1, 'worker_folks:Mastery_Token_Hiring': 3 });
  assert.deepEqual(b.buys, { 'worker_folks:Hire_Junior': 2 });
  assert.deepEqual(b.buildings, { 'melvorF:Grasslands': { 'worker_folks:Guild_Hall': { n: 1, eff: 80 } } });
  assert.deepEqual(b.pets, ['worker_folks:Bruno']);
  assert.deepEqual(b.mastery, { 'worker_folks:Slot_1': 4000 });
  assert.deepEqual(b.relics, { 'melvorD:Melvor': { 'worker_folks:Relic_1': 1 } });
  assert.deepEqual(b.caps, { level: 99, abyssal: null });
  assert.equal(b.xp, 123456.5);
  const junk = B.make({ xp: -5, abyssalXP: NaN, items: 'x', buys: null, buildings: { b: { 'worker_folks:X': { n: 0 } } }, pets: 'x', at: -1 });
  assert.equal(junk.xp, 0);
  assert.equal(junk.abyssalXP, 0);
  assert.deepEqual(junk.items, {});
  assert.deepEqual(junk.buildings, {});
  assert.deepEqual(junk.pets, []);
  assert.equal(junk.unlocked, false);
});

test('a code round-trips, packed and plain; spaces and line breaks in a pasted code are ignored', async () => {
  const b = sample();
  for (const zip of [true, false]) {
    const code = await B.encode(b, { zip });
    assert.ok(code.startsWith(`FOLKS-BACKUP:${zip ? 'z' : 'j'}:`));
    const wrapped = code.replace(/(.{60})/g, '$1\n  ');
    const r = await B.decode(wrapped, SAVE_VERSION);
    assert.deepEqual(r.backup, b);
  }
});

test('a pasted code is refused with its reason', async () => {
  const b = sample();
  assert.equal((await B.decode('   ', SAVE_VERSION)).why, 'empty');
  assert.equal((await B.decode('hello', SAVE_VERSION)).why, 'notCode');
  assert.equal((await B.decode('VOYAGE-BACKUP:z:AAAA', SAVE_VERSION)).why, 'voyage');
  const code = await B.encode(b);
  assert.equal((await B.decode(code.slice(0, code.length - 40), SAVE_VERSION)).why, 'broken');
  const plain = await B.encode(b, { zip: false });
  const sealed = JSON.parse(Buffer.from(plain.split(':')[2], 'base64').toString('utf8'));
  const edited = JSON.stringify({ body: sealed.body.replace('VoFoSD', 'VoFoSX'), sum: sealed.sum });
  assert.equal(B.open(edited, SAVE_VERSION).why, 'checksum');
  assert.equal(B.open(B.seal({ ...b, f: 99 }), SAVE_VERSION).why, 'format');
  assert.equal(B.open(B.seal({ ...b, record: 'nope' }), SAVE_VERSION).why, 'record');
  assert.equal(B.open(B.seal({ ...b, record: JSON.stringify({ v: SAVE_VERSION + 1, folks: [] }) }), SAVE_VERSION).why, 'newer');
  // An older record is fine: the save's own migrations read it on restore.
  assert.ok(B.open(B.seal({ ...b, record: JSON.stringify({ v: 3, folks: [] }) }), SAVE_VERSION).backup);
});

test('folksIn lists the record\'s Folks in slot order; heldBy counts gear, rooms and the Reserve', () => {
  const rec = record([
    folk('b', 2, { room: { haul: { 'melvorD:Oak_Logs': { qty: 40, ms: 1 } }, stock: { 'melvorD:Coal_Ore': { qty: 5, ms: 0 } }, town: {} } }),
    folk('a', 0, { loadout: { Pick: { id: 'melvorD:Rune_Pickaxe', qty: 1 }, Food: { id: 'melvorD:Shrimp', qty: 30 } } }),
  ], { 'melvorD:GP': 1200, 'melvorItA:AbyssalPieces': 7 });
  assert.deepEqual(B.folksIn(rec).map((f) => f.id), ['a', 'b']);
  assert.deepEqual(B.heldBy(rec), {
    items: { 'melvorD:Rune_Pickaxe': 1, 'melvorD:Shrimp': 30, 'melvorD:Oak_Logs': 40, 'melvorD:Coal_Ore': 5 },
    currencies: { 'melvorD:GP': 1200, 'melvorItA:AbyssalPieces': 7 },
  });
  assert.deepEqual(B.folksIn('broken'), []);
  assert.deepEqual(B.heldBy('broken'), { items: {}, currencies: {} });
});

test('returns hands back only what the crew holds now beyond the backup\'s crew', () => {
  const then = record([folk('a', 0, { loadout: { Pick: { id: 'melvorD:Rune_Pickaxe', qty: 1 } } })], { 'melvorD:GP': 500 });
  // Nothing changed since: a restore is a no-op, nothing comes twice.
  assert.deepEqual(B.returns(then, then), { items: [], currencies: [] });
  // The mod was off: nothing held now, everything comes back with the record.
  assert.deepEqual(B.returns(record([]), then), { items: [], currencies: [] });
  // Gear and Reserve gathered since, and a Folk hired since with its room: back to the bank.
  const now = record([
    folk('a', 0, { loadout: { Pick: { id: 'melvorD:Dragon_Pickaxe', qty: 1 } } }),
    folk('c', 1, { room: { haul: { 'melvorD:Oak_Logs': { qty: 12, ms: 0 } }, stock: {}, town: {} } }),
  ], { 'melvorD:GP': 2000 });
  assert.deepEqual(B.returns(now, then), { items: [['melvorD:Dragon_Pickaxe', 1], ['melvorD:Oak_Logs', 12]], currencies: [['melvorD:GP', 1500]] });
  assert.deepEqual(B.leaving(now, then), [{ id: 'c', name: 'F1' }]);
});

test('takes: gear and stacks moved to the bank since the backup come out of it; lost ones come back free', () => {
  const pick = { Pick: { id: 'melvorD:Rune_Pickaxe', qty: 1 } };
  const room = { haul: { 'melvorD:Oak_Logs': { qty: 200, ms: 0 } }, stock: {}, town: {} };
  const rec = record([folk('a', 0, { loadout: pick, room })]);
  const bankThen = { 'melvorD:Rune_Pickaxe': 2, 'melvorD:Oak_Logs': 50 };
  const b = B.make({ record: rec, bank: B.bankSnapshot(rec, (id) => bankThen[id] ?? 0) });
  assert.deepEqual(b.bank, { 'melvorD:Rune_Pickaxe': 2, 'melvorD:Oak_Logs': 50 });
  // Nothing changed: the crew holds it all, nothing to take.
  assert.deepEqual(B.takes(rec, b, bankThen), []);
  // The pickaxe taken off and the room emptied into the bank, then a restore: both come out of the bank again.
  const bare = record([folk('a', 0)]);
  assert.deepEqual(B.takes(bare, b, { 'melvorD:Rune_Pickaxe': 3, 'melvorD:Oak_Logs': 250 }), [['melvorD:Rune_Pickaxe', 1], ['melvorD:Oak_Logs', 200]]);
  // Lost with the mod: the bank didn't gain them, they come back free.
  assert.deepEqual(B.takes(record([]), b, bankThen), []);
  // Spent since (the bank holds fewer than then): nothing to take.
  assert.deepEqual(B.takes(record([]), b, { 'melvorD:Rune_Pickaxe': 0, 'melvorD:Oak_Logs': 10 }), []);
  // The bank gained some of the same item otherwise: that much is taken, never more than the crew gets back.
  assert.deepEqual(B.takes(record([]), b, { 'melvorD:Oak_Logs': 120 }), [['melvorD:Oak_Logs', 70]]);
  assert.deepEqual(B.takes(record([]), b, { 'melvorD:Oak_Logs': 5000 }), [['melvorD:Oak_Logs', 200]]);
});

test('livedOn: Hiring XP at least the backup\'s means the crew is still here', () => {
  assert.equal(B.livedOn(5000, 4000), true);
  assert.equal(B.livedOn(4000, 4000), true);
  assert.equal(B.livedOn(0, 4000), false); // the game lost the mod's save
  assert.equal(B.livedOn(NaN, 10), false);
});

test('keepCommissions: runs only for Folks in the crew; stray commission stacks go home', () => {
  const now = {
    commissions: [{ id: 'c1', folkId: 'a' }, { id: 'c2', folkId: null }],
    runs: { b: { ticks: 10, commissionId: 'c9' }, x: { ticks: 5, commissionId: 'c2' } },
    standing: { points: 300, idle: 0 },
  };
  const withTown = (id) => folk(id, 0, { room: { haul: {}, stock: {}, town: { 'melvorD:Oak_Logs': { qty: 5, ms: 0 } } } });
  const folks = [withTown('a'), withTown('b'), withTown('c'), folk('d', 3)];
  const r = B.keepCommissions(now, folks);
  assert.deepEqual(Object.keys(r.commissions.runs), ['b']);
  assert.equal(r.commissions.standing.points, 300);
  assert.deepEqual(r.commissions.commissions, now.commissions);
  // a has its commission, b is on a run: their stacks stay; c's has nothing to go to.
  assert.deepEqual(r.home, ['c']);
  assert.deepEqual(B.keepCommissions(null, folks), { commissions: null, home: [] });
});

test('restorePlan tops up, never doubles, never takes away', () => {
  const b = sample();
  const first = B.restorePlan(b, {});
  assert.deepEqual(first.add, [['worker_folks:Licence_Junior', 1], ['worker_folks:Mastery_Token_Hiring', 3]]);
  assert.deepEqual(first.buys, [['worker_folks:Hire_Junior', 2]]);
  assert.deepEqual(first.buildings, [{ biome: 'melvorF:Grasslands', id: 'worker_folks:Guild_Hall', n: 1, eff: 80 }]);
  assert.deepEqual(first.pets, ['worker_folks:Bruno']);
  const after = B.restorePlan(b, {
    items: { 'worker_folks:Licence_Junior': 1, 'worker_folks:Mastery_Token_Hiring': 10 },
    buys: { 'worker_folks:Hire_Junior': 5 },
    buildings: { 'melvorF:Grasslands': { 'worker_folks:Guild_Hall': { n: 1, eff: 100 } } },
    pets: ['worker_folks:Bruno'],
  });
  assert.deepEqual(after, { add: [], buys: [], buildings: [], pets: [] });
  const partly = B.restorePlan(b, { items: { 'worker_folks:Mastery_Token_Hiring': 1 } });
  assert.deepEqual(partly.add, [['worker_folks:Licence_Junior', 1], ['worker_folks:Mastery_Token_Hiring', 2]]);
});

test('a walking Folk stands still without Voyage; other travel stays', () => {
  assert.equal(B.travelAfter('walking', false), 'idle');
  assert.equal(B.travelAfter('walking', true), 'walking');
  assert.equal(B.travelAfter('with', false), 'with');
  assert.equal(B.travelAfter('idle', true), 'idle');
});

test('every string the backup popups use exists in en.json, and every backup string is used', () => {
  const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
  const code = readFileSync(new URL('../src/backup.mjs', import.meta.url), 'utf8');
  const used = new Set(code.match(/MOD_WF_[A-Z0-9_]+/g));
  for (const key of used) assert.ok(key in lang, `${key} missing from en.json`);
  for (const key of Object.keys(lang).filter((k) => /^MOD_WF_(BACKUP|RESTORE)_/.test(k))) assert.ok(used.has(key), `${key} not used`);
});

test('fileName: safe letters, accents folded, the local date', () => {
  const at = new Date(2026, 10, 5, 9).getTime();
  assert.equal(B.fileName('Ölaf the Bold!', at), 'folks-backup-Olaf-the-Bold-2026-11-05.txt');
  assert.equal(B.fileName('', at), 'folks-backup-character-2026-11-05.txt');
});
