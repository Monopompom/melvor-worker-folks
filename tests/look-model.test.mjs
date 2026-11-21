import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/look-model.mjs';
import * as art from '../src/look-art-model.mjs';
import { LOOK_PARTS, LOOK_COLORS, LOOK_MARKS, LOOK_GEAR, normalizeLook, normalizeMarks, normalizeFolk, createFolk } from '../src/folk.mjs';

const H = model.HOUR_MS;

test('the saved limits match the art', () => {
  assert.equal(LOOK_PARTS.skin, art.SKINS.length);
  assert.equal(LOOK_PARTS.hair, art.HAIR_STYLES.length);
  assert.equal(LOOK_PARTS.hairColor, art.HAIR_COLORS.length);
  assert.equal(LOOK_PARTS.beard, art.BEARDS.length);
  assert.equal(LOOK_PARTS.extra, art.EXTRAS.length);
  assert.equal(LOOK_COLORS, art.COLORS.length);
  assert.deepEqual([...LOOK_MARKS], [...model.MARK_IDS]);
  assert.deepEqual([...LOOK_GEAR], Object.values(model.HEIRLOOM_GEAR));
});

test('every part draws at every rank, with everything worn', () => {
  const gear = Object.values(model.HEIRLOOM_GEAR);
  for (const rank of art.RANK_IDS) {
    for (let hair = 0; hair < art.HAIR_STYLES.length; hair += 1) {
      for (let skin = 0; skin < art.SKINS.length; skin += 1) {
        const svg = art.render({ rank, hair, skin, hairColor: skin, beard: hair % art.BEARDS.length, extra: hair % art.EXTRAS.length, color: hair % art.COLORS.length, colorAt: hair % 2 ? 'band' : 'scarf', gear, marks: [...model.MARK_IDS], stripes: 3 });
        assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
        assert.doesNotMatch(svg, /undefined|NaN/);
      }
    }
  }
});

test('a look from an id never changes and stays in range', () => {
  assert.deepEqual(art.lookFrom('folk-7'), art.lookFrom('folk-7'));
  for (let i = 0; i < 300; i += 1) assert.ok(normalizeLook(art.lookFrom(`folk-${i}`)) !== undefined);
});

test('a saved look is cleaned', () => {
  const good = { skin: 8, hair: 7, hairColor: 8, beard: 4, extra: 3, color: 7, colorAt: 'band', hide: ['scar', 'scar', 'nope'] };
  assert.deepEqual(normalizeLook(good), { skin: 8, hair: 7, hairColor: 8, beard: 4, extra: 3, color: 7, colorAt: 'band', hide: ['scar'] });
  assert.equal(normalizeLook({ ...good, skin: 9 }), undefined);
  assert.equal(normalizeLook({ ...good, hair: '1' }), undefined);
  assert.equal(normalizeLook(null), undefined);
  assert.deepEqual(normalizeLook({ ...good, color: 99, colorAt: 'x', hide: 'y' }), { skin: 8, hair: 7, hairColor: 8, beard: 4, extra: 3, color: -1, colorAt: 'scarf' });
});

test('saved counts are cleaned, and an empty set is not kept', () => {
  assert.deepEqual(normalizeMarks({ ms: 5, close: 2, trips: 1, from: { q: 1, r: -2 }, x: 1 }), { ms: 5, close: 2, trips: 1, from: { q: 1, r: -2 } });
  assert.equal(normalizeMarks({ ms: -1, close: 1.5, trips: 'a', from: {} }), undefined);
  assert.equal(normalizeMarks(undefined), undefined);
});

test('a Folk without a look or counts keeps none through a load', () => {
  const folk = normalizeFolk(createFolk({ id: 'a', slot: 0, tier: 'Newbie', name: 'Ada' }));
  assert.equal('look' in folk, false);
  assert.equal('marks' in folk, false);
  const kept = normalizeFolk({ ...folk, look: { skin: 1, hair: 2, hairColor: 3, beard: 0, extra: 0 }, marks: { close: 1 } });
  assert.deepEqual(kept.look, { skin: 1, hair: 2, hairColor: 3, beard: 0, extra: 0, color: -1, colorAt: 'scarf' });
  assert.deepEqual(kept.marks, { close: 1 });
});

test('only our Heirlooms show as worn', () => {
  const gear = model.wornGear({ Helmet: { id: 'worker_folks:Golden_Hardhat', qty: 1 }, Ring: { id: 'worker_folks:Timekeepers_Bell', qty: 1 }, Boots: { id: 'melvorD:Bronze_Boots', qty: 1 }, Cape: { id: 'worker_folks:Bag_Pack', qty: 1 } });
  assert.deepEqual(gear, ['bell', 'hardhat']);
  assert.deepEqual(model.wornGear(undefined), []);
});

test('a hidden Heirloom leaves the picture and is kept through a load', () => {
  assert.deepEqual(model.shownGear(['apron', 'bell', 'ledger'], ['bell', 'scar']), ['apron', 'ledger']);
  assert.deepEqual(model.shownGear(['apron']), ['apron']);
  const look = normalizeLook({ skin: 1, hair: 2, hairColor: 3, beard: 0, extra: 0, hide: ['bell', 'scar', 'nope'] });
  assert.deepEqual(look.hide, ['scar', 'bell']);
});

test('service bars: one per 100 h, three at most', () => {
  assert.equal(model.stripesFor(100 * H - 1), 0);
  assert.equal(model.stripesFor(100 * H), 1);
  assert.equal(model.stripesFor(250 * H), 2);
  assert.equal(model.stripesFor(9000 * H), 3);
});

test('each mark is earned at its number', () => {
  const by = (args) => Object.fromEntries(model.markStates(args).map((m) => [m.id, m]));
  const none = by({});
  assert.ok(Object.values(none).every((m) => !m.earned));
  const some = by({ mastery: 99, strikes: 3, counts: { trips: 10, close: 1, ms: 120 * H } });
  assert.ok(some.mastery.earned && some.anchor.earned && some.armband.earned && some.scar.earned && some.service.earned);
  assert.equal(some.patch.earned, false);
  assert.equal(some.service.bars, 1);
  assert.equal(some.service.need, 200);
  assert.equal(by({ counts: { close: 3 } }).patch.earned, true);
  assert.equal(by({ counts: { ms: 400 * H } }).service.need, 300);
});

test('hidden marks stay earned but are not shown', () => {
  const states = model.markStates({ mastery: 99, counts: { close: 3 } });
  assert.deepEqual(model.shownMarks(states), ['mastery', 'scar', 'patch']);
  assert.deepEqual(model.shownMarks(states, ['scar']), ['mastery', 'patch']);
});

test('without Voyage the Anchor pin is neither listed nor drawn, and its trips are kept', () => {
  const counts = { trips: 10 };
  assert.deepEqual(model.shownMarks(model.markStates({ counts })), ['anchor']);
  const without = model.markStates({ counts, voyage: false });
  assert.equal(without.some((m) => m.id === 'anchor'), false);
  assert.deepEqual(model.shownMarks(without), []);
  assert.equal(counts.trips, 10);
});

test('a close call is crossing under 10% and living', () => {
  assert.equal(model.isCloseCall(50, 9, 100), true);
  assert.equal(model.isCloseCall(10, 9, 100), true);
  assert.equal(model.isCloseCall(9, 5, 100), false, 'already under the line');
  assert.equal(model.isCloseCall(50, 10, 100), false);
  assert.equal(model.isCloseCall(50, 0, 100), false, 'it died');
});

test('a trip counts when the Folk comes home on another hex', () => {
  let c = model.noteTravel(undefined, 'idle', 'with', { q: 0, r: 0 });
  assert.deepEqual(c, { from: { q: 0, r: 0 } });
  assert.equal(model.noteTravel(c, 'with', 'with', { q: 5, r: 5 }), c);
  c = model.noteTravel(c, 'with', 'idle', { q: 3, r: 1 });
  assert.deepEqual(c, { trips: 1 });
  c = model.noteTravel(c, 'idle', 'with', { q: 3, r: 1 });
  c = model.noteTravel(c, 'with', 'idle', { q: 3, r: 1 });
  assert.deepEqual(c, { trips: 1 }, 'on and off on one hex');
  c = model.noteTravel(c, 'idle', 'with', { q: 3, r: 1 });
  c = model.noteTravel(c, 'with', 'walking', { q: 4, r: 1 });
  assert.deepEqual(c, { trips: 1 }, 'sent off alone');
});

test('sameLook compares what shows', () => {
  const a = { skin: 1, hair: 2, hairColor: 3, beard: 0, extra: 0, color: -1, colorAt: 'band' };
  assert.equal(model.sameLook(a, { ...a, colorAt: 'scarf' }), true, 'no colour: where it goes is moot');
  assert.equal(model.sameLook({ ...a, color: 2 }, { ...a, color: 2, colorAt: 'scarf' }), false);
  assert.equal(model.sameLook(a, { ...a, hide: ['scar'] }), false);
  assert.equal(model.sameLook({ ...a, hide: ['scar', 'patch'] }, { ...a, hide: ['patch', 'scar'] }), true);
});

test('the key changes with everything the picture shows', () => {
  const base = { tier: 'Junior', look: art.lookFrom('x'), gear: ['bell'], marks: ['service'], stripes: 1 };
  const key = model.lookKey(base);
  assert.equal(model.lookKey({ ...base }), key);
  for (const change of [{ tier: 'Middle' }, { gear: [] }, { marks: [] }, { stripes: 2 }, { look: { ...base.look, skin: (base.look.skin + 1) % 9 } }]) {
    assert.notEqual(model.lookKey({ ...base, ...change }), key);
  }
  assert.equal(model.lookKey({ ...base, marks: [], stripes: 2 }), model.lookKey({ ...base, marks: [], stripes: 1 }), 'bars not shown');
});

test('the drawing takes the tier as the art names it', () => {
  const d = model.drawing({ tier: 'Expert', look: { skin: 1, hair: 2, hairColor: 3, beard: 0, extra: 0 }, gear: ['bell'], marks: ['scar'], stripes: 0 });
  assert.equal(d.rank, 'expert');
  assert.equal(d.color, -1);
  assert.ok(art.render(d).includes('</svg>'));
});
