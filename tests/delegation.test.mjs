import test from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/delegation.mjs';
import { decideStart } from '../src/delegation-model.mjs';

function setup({ folks = [], pending = [], delegated = [], slots = 3, disabled = false, assignFails = false } = {}) {
  const skill = { id: 'test:Mining', stop() {} };
  const other = { id: 'test:Other', stop() {} };
  const notes = [];
  globalThis.Game = class {};
  globalThis.game = { activeAction: undefined, isGolbinRaid: false, notifications: { createErrorNotification: (id) => notes.push(id) } };
  globalThis.templateLangString = (key) => key;
  const crew = {
    all: folks,
    byId: (id) => folks.find((f) => f.id === id),
    bySkill: (id) => folks.find((f) => f.skillId === id),
  };
  const hiring = {
    crew,
    delegableSkills: [skill, other],
    delegated: new Set(delegated.map(() => skill)),
    pending: new Map(pending.map((id) => [skill, id])),
    slotsUsed: 0,
    shiftSlots: slots,
    renderQueue: {},
    events: { emit() {} },
    folkAvailable: (f) => f.available !== false,
    workRefusal: () => '',
    refusal: () => '',
    statusOf: () => 'strike',
    cooldownLeft: () => '',
    pendingFor(s) {
      const id = this.pending.get(s);
      return id === undefined || id === null ? id : crew.byId(id);
    },
    applyPending(s) {
      const folk = this.pendingFor(s);
      if (folk === undefined) return;
      this.pending.delete(s);
      if (folk !== null && !assignFails) folk.skillId = s.id;
    },
  };
  const patched = {};
  const loaded = [];
  const ctx = {
    patch: (_cls, name) => ({ replace(fn) { patched[name] = fn; }, before() {}, after() {} }),
    onModsLoaded: (fn) => loaded.push(fn),
    onCharacterLoaded() {},
  };
  install(ctx, {
    getHiring: () => hiring,
    rules: { decideStart },
    resume: { selectionOf: () => null },
    isDisabled: () => disabled,
    log() {},
  });
  loaded.forEach((fn) => fn());
  let reached = 0;
  const start = (action = skill) => patched.idleChecker.call(game, () => { reached += 1; return false; }, action);
  return { hiring, skill, other, notes, start, reached: () => reached };
}

test('startGoesToFolk: a Folk on the skill, or one waiting to move onto it', () => {
  const held = setup({ folks: [{ id: 'a', skillId: 'test:Mining' }] });
  assert.equal(held.hiring.startGoesToFolk(held.skill), true);
  const moving = setup({ folks: [{ id: 'a', skillId: 'test:Other' }], pending: ['a'] });
  assert.equal(moving.hiring.startGoesToFolk(moving.skill), true);
});

test('startGoesToFolk: the player\'s starts stay the player\'s', () => {
  const none = setup();
  assert.equal(none.hiring.startGoesToFolk(none.skill), false);
  assert.equal(none.hiring.startGoesToFolk({ id: 'test:NotDelegable' }), false);
  const back = setup({ folks: [{ id: 'a', skillId: 'test:Mining' }], pending: [null] });
  assert.equal(back.hiring.startGoesToFolk(back.skill), false);
  const off = setup({ folks: [{ id: 'a', skillId: 'test:Mining' }], disabled: true });
  assert.equal(off.hiring.startGoesToFolk(off.skill), false);
  const raid = setup({ folks: [{ id: 'a', skillId: 'test:Mining' }] });
  game.isGolbinRaid = true;
  assert.equal(raid.hiring.startGoesToFolk(raid.skill), false);
});

test('startGoesToFolk changes nothing, a pending Folk who has left included', () => {
  const s = setup({ pending: ['gone'] });
  assert.equal(s.hiring.startGoesToFolk(s.skill), false);
  assert.equal(s.hiring.pending.get(s.skill), 'gone');
});

test('a start that goes to a Folk never reaches the game', () => {
  const cases = [
    ['delegated', setup({ folks: [{ id: 'a', skillId: 'test:Mining' }] }), false],
    ['no free slot', setup({ folks: [{ id: 'a', skillId: 'test:Mining' }], slots: 0 }), true],
    ['unavailable', setup({ folks: [{ id: 'a', skillId: 'test:Mining', available: false }] }), true],
    ['moved onto it', setup({ folks: [{ id: 'a', skillId: 'test:Other' }], pending: ['a'] }), false],
    ['move that failed', setup({ folks: [{ id: 'a', skillId: 'test:Other' }], pending: ['a'], assignFails: true }), true],
  ];
  for (const [name, s, refused] of cases) {
    assert.equal(s.hiring.startGoesToFolk(s.skill), true, name);
    assert.equal(s.start(), refused, name);
    assert.equal(s.reached(), 0, name);
  }
});

test('a start that is the player\'s still goes on to the game', () => {
  const none = setup();
  none.start();
  assert.equal(none.reached(), 1);
  const back = setup({ folks: [{ id: 'a', skillId: 'test:Mining' }], pending: [null] });
  back.start();
  assert.equal(back.reached(), 1);
});
