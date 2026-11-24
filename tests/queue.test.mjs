import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/queue.mjs';
import * as model from '../src/queue-model.mjs';

/** A Smithing-like skill with a Folk on it, its bank, its room, the events the queue listens to. */
function world() {
  const notices = [];
  globalThis.getLangString = (key) => key;
  globalThis.templateLangString = (key, vars) => `${key}${vars === undefined ? '' : `:${Object.values(vars).join('|')}`}`;
  globalThis.numberWithCommas = (n) => `${n}`;
  globalThis.ArtisanSkill = class {};
  globalThis.AltMagic = class {};
  const bank = new Map([['i:Ore', 100]]);
  globalThis.game = {
    _isInOnlineLoop: true,
    bank: { getQty: (item) => bank.get(item.id) ?? 0 },
    notifications: {
      createInfoNotification: (id, text) => notices.push(['info', text]),
      createErrorNotification: (id, text) => notices.push(['error', text]),
    },
  };
  const item = (id) => ({ id, name: id.slice(2), media: `${id}.png` });
  const recipe = (id, product, costs, more = {}) => ({ id, product: item(product), itemCosts: costs.map(([c, quantity]) => ({ item: item(c), quantity })), level: 1, abyssalLevel: 0, ...more });
  const recipes = [
    recipe('a:Bar', 'i:Bar', [['i:Ore', 1]]),
    recipe('a:Dagger', 'i:Dagger', [['i:Bar', 2]]),
    recipe('a:Helm', 'i:Helm', [['i:Bar', 3]], { level: 50 }),
  ];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const stock = new Map();
  let timers = 0;
  const skill = Object.assign(new ArtisanSkill(), {
    id: 's:Smithing',
    level: 40,
    abyssalLevel: 0,
    isActive: true,
    selectedRecipe: byId.get('a:Bar'),
    selectedRecipeInRealm: new Map(),
    renderQueue: {},
    actions: { getObjectByID: (id) => byId.get(id), allObjects: recipes },
    startActionTimer() { timers += 1; },
    getCurrentRecipeCosts() {
      const costs = this.selectedRecipe.itemCosts;
      return { checkIfOwned: () => costs.every(({ item: i, quantity }) => (stock.get(i.id) ?? 0) + (bank.get(i.id) ?? 0) >= quantity) };
    },
  });
  const folk = { id: 'f1', name: 'Jel', tier: 'Junior', skillId: skill.id, job: null, queue: [], room: { stock: {} } };
  const handlers = new Map();
  const notes = [];
  const delegated = new Set([skill]);
  let used = 0;
  const put = [];
  const starts = [];
  const hiring = {
    media: 'hiring.png',
    crew: { all: [folk], bySkill: (id) => (id === skill.id ? folk : undefined) },
    skillOf: (f) => (f.skillId === skill.id ? skill : undefined),
    delegated,
    asFolk: (f, s, fn) => fn(),
    forceStop: (s, why) => { notes.push(why); s.isActive = false; },
    noteStop: (f, s, text) => notes.push(text),
    release: (s) => delegated.delete(s),
    markCard: () => {},
    renderQueue: {},
    events: {
      on: (name, fn) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
      emit: (name, payload) => (handlers.get(name) ?? []).forEach((fn) => fn(payload)),
    },
    room: {
      startFolk: (f) => { starts.push(f.id); skill.isActive = true; delegated.add(skill); return ''; },
      inputsOf: () => ({ perAction: skill.selectedRecipe.itemCosts.map(({ item: i, quantity }) => ({ id: i.id, qty: quantity })), intervalMs: 2000 }),
      capMs: () => 20000,
      usedMs: () => used,
      putStock: (f, id, qty, ms) => { put.push([id, qty, ms]); stock.set(id, (stock.get(id) ?? 0) + qty); used += ms; },
    },
  };
  const patches = new Map();
  const loaded = [];
  const ctx = {
    onModsLoaded: (fn) => fn(),
    onCharacterLoaded: (fn) => loaded.push(fn),
    patch: (Class, name) => ({ after: (fn) => patches.set(name, fn) }),
  };
  const api = install(ctx, { swalClass: () => '', getHiring: () => hiring, model, log: () => {} });
  const made = (id, quantity, more = {}) => hiring.events.emit('folkMade', { folk, skill, item: item(id), quantity, ...more });
  const actionDone = () => hiring.events.emit('folkActionDone', { folk, skill });
  return { api, skill, folk, bank, stock, notices, notes, put, starts, made, actionDone, patches, hiring, timers: () => timers, setUsed: (ms) => { used = ms; }, item };
}

let w;
beforeEach(() => { w = world(); });

test('only one-recipe skills take a queue; Alt. Magic is left out', () => {
  assert.equal(w.api.queueable(w.skill), true);
  assert.equal(w.api.queueable(Object.assign(new AltMagic(), { actions: w.skill.actions })), false);
  assert.equal(w.api.queueable({ actions: w.skill.actions }), false);
  assert.equal(w.api.buttonView(w.skill).label, 'MOD_WF_QUEUE_BUTTON:0|3');
});

test('the first step puts a working Folk on its recipe at once; a step it is already on changes nothing', () => {
  assert.deepEqual(w.api.add(w.folk, 'a:Bar', 10), { ok: true });
  assert.equal(w.timers(), 0, 'already on Bar: the action in hand goes on');
  w.api.clear(w.folk);
  w.bank.set('i:Bar', 10);
  assert.deepEqual(w.api.add(w.folk, 'a:Dagger', 5), { ok: true });
  assert.equal(w.skill.selectedRecipe.id, 'a:Dagger');
  assert.equal(w.timers(), 1, 'the timer starts again for the new recipe');
  assert.equal(w.skill.isActive, true);
  // An idle Folk only has the recipe picked; its start runs it.
  w.api.clear(w.folk);
  w.skill.isActive = false;
  w.api.add(w.folk, 'a:Bar', 5);
  assert.equal(w.skill.selectedRecipe.id, 'a:Bar');
  assert.equal(w.timers(), 1);
});

test('a step out of your levels, a fourth step or a bad count is refused', () => {
  assert.deepEqual(w.api.add(w.folk, 'a:Helm', 1), { ok: false, why: 'level' });
  w.api.add(w.folk, 'a:Bar', 1);
  w.api.add(w.folk, 'a:Dagger', null);
  w.api.add(w.folk, 'a:Bar', 2);
  assert.deepEqual(w.api.add(w.folk, 'a:Bar', 3), { ok: false, why: 'full' });
  w.api.clear(w.folk);
  assert.deepEqual(w.api.add(w.folk, 'a:Bar', 0), { ok: false, why: 'count' });
});

test('made products count; at the count the Folk switches to the next step and goes on', () => {
  w.api.add(w.folk, 'a:Bar', 4);
  w.api.add(w.folk, 'a:Dagger', 2);
  w.made('i:Bar', 3);
  w.made('i:Bar', 5, { town: true });
  w.made('i:Slag', 5);
  w.actionDone();
  assert.equal(w.folk.queue[0].made, 3, 'a commission\'s goods and other items do not count');
  w.bank.set('i:Bar', 10);
  w.made('i:Bar', 1);
  w.actionDone();
  assert.deepEqual(w.folk.queue, [{ recipeId: 'a:Dagger', count: 2, made: 0 }]);
  assert.equal(w.skill.selectedRecipe.id, 'a:Dagger');
  assert.equal(w.skill.isActive, true);
  assert.equal(w.timers(), 1);
  assert.deepEqual(w.notices.at(-1), ['info', 'MOD_WF_QUEUE_NEXT_NOTICE:Jel|Bar|Dagger']);
  // The last step done: the queue ends, the Folk stays on its recipe.
  w.made('i:Dagger', 2);
  w.actionDone();
  assert.deepEqual(w.folk.queue, []);
  assert.equal(w.skill.selectedRecipe.id, 'a:Dagger');
  assert.equal(w.skill.isActive, true);
  assert.deepEqual(w.notices.at(-1), ['info', 'MOD_WF_QUEUE_END_NOTICE:Jel|Dagger']);
});

test('a next step without its inputs stops the Folk with the reason, and the queue waits on it', () => {
  w.api.add(w.folk, 'a:Bar', 1);
  w.api.add(w.folk, 'a:Dagger', 2);
  w.made('i:Bar', 1);
  w.actionDone();
  assert.equal(w.skill.isActive, false);
  assert.deepEqual(w.notes, ['MOD_WF_QUEUE_STOP_INPUTS:Dagger']);
  assert.equal(w.folk.queue[0].recipeId, 'a:Dagger');
  assert.equal(w.skill.selectedRecipe.id, 'a:Dagger', 'its start later runs this step');
});

test('"until inputs run out" ends when the game stops the Folk for want of inputs, and the next step starts', () => {
  w.api.add(w.folk, 'a:Bar', null);
  w.api.add(w.folk, 'a:Bar', 3);
  w.bank.set('i:Ore', 0);
  w.skill.isActive = false; // the game's own stop at the end of the action
  w.bank.set('i:Ore', 0);
  w.actionDone();
  // The next step (Bar again) has no ore either: it waits with the reason.
  assert.deepEqual(w.folk.queue, [{ recipeId: 'a:Bar', count: 3, made: 0 }]);
  assert.deepEqual(w.notes, ['MOD_WF_QUEUE_STOP_INPUTS:Bar']);
  w.api.clear(w.folk);
  w.notes.length = 0;
  // With the next step's inputs in the bank, it starts.
  w.skill.isActive = true;
  w.api.add(w.folk, 'a:Bar', null);
  w.api.add(w.folk, 'a:Dagger', 1);
  w.bank.set('i:Bar', 2);
  w.skill.isActive = false;
  w.actionDone();
  assert.deepEqual(w.starts, ['f1']);
  assert.equal(w.skill.selectedRecipe.id, 'a:Dagger');
  assert.equal(w.skill.isActive, true);
});

test('a count step that runs dry waits on its inputs; nothing advances', () => {
  w.api.add(w.folk, 'a:Bar', 50);
  w.bank.set('i:Ore', 0);
  w.skill.isActive = false;
  w.actionDone();
  assert.equal(w.folk.queue.length, 1);
  assert.deepEqual(w.notes, ['MOD_WF_QUEUE_STOP_INPUTS:Bar']);
});

test('a chain keeps what a later step uses in the Folk\'s stock, as far as its room holds', () => {
  w.api.add(w.folk, 'a:Bar', 30);
  w.api.add(w.folk, 'a:Dagger', 5);
  const acting = { folk: w.folk, skill: w.skill };
  // Dagger: 2 bars per 2 s action, so a bar takes 1 s of room; 20 s of room.
  assert.equal(w.api.route(acting, w.item('i:Bar'), 4), 4);
  assert.deepEqual(w.put, [['i:Bar', 4, 4000]]);
  assert.equal(w.skill.selectedRecipe.id, 'a:Bar', 'the read leaves the recipe as it was');
  w.setUsed(19500);
  assert.equal(w.api.route(acting, w.item('i:Bar'), 4), 0, 'a full room: on to the bank');
  w.setUsed(0);
  assert.equal(w.api.route(acting, w.item('i:Ore'), 4), 0, 'not the step\'s product');
  w.api.remove(w.folk, 1);
  assert.equal(w.api.route(acting, w.item('i:Bar'), 4), 0, 'no later step');
});

test('a collected room keeps what any step of the queue uses', () => {
  w.api.add(w.folk, 'a:Bar', 30);
  w.api.add(w.folk, 'a:Dagger', 5);
  assert.deepEqual(w.api.inputIds(w.folk).sort(), ['i:Bar', 'i:Ore']);
  w.api.clear(w.folk);
  assert.deepEqual(w.api.inputIds(w.folk), []);
});

test('removing the first step moves the Folk to the next one; removing a later one keeps it', () => {
  w.bank.set('i:Bar', 10);
  w.api.add(w.folk, 'a:Bar', 30);
  w.api.add(w.folk, 'a:Dagger', 5);
  w.api.add(w.folk, 'a:Bar', 5);
  assert.equal(w.api.remove(w.folk, 2), true);
  assert.equal(w.skill.selectedRecipe.id, 'a:Bar');
  w.api.remove(w.folk, 0);
  assert.equal(w.skill.selectedRecipe.id, 'a:Dagger');
  assert.equal(w.api.remove(w.folk, 4), false);
});

test('your own recipe click and a new skill clear the queue', () => {
  w.api.add(w.folk, 'a:Bar', 30);
  w.patches.get('selectRecipeOnClick').call(w.skill, undefined, w.skill.actions.getObjectByID('a:Bar'));
  assert.equal(w.folk.queue.length, 1, 'the same recipe: kept');
  w.patches.get('selectRecipeOnClick').call(w.skill, undefined, w.skill.actions.getObjectByID('a:Dagger'));
  assert.deepEqual(w.folk.queue, []);
  assert.deepEqual(w.notices.at(-1), ['info', 'MOD_WF_QUEUE_CLEARED_NOTICE:Jel']);
  w.api.add(w.folk, 'a:Bar', 30);
  w.hiring.events.emit('folkAssigned', { folk: w.folk, previous: w.skill.id, skillId: null });
  assert.deepEqual(w.folk.queue, []);
});

test('the card shows the step it works now and the ones after', () => {
  w.api.add(w.folk, 'a:Bar', 30);
  w.api.add(w.folk, 'a:Dagger', null);
  w.made('i:Bar', 7);
  const v = w.api.cardView(w.folk);
  assert.match(v.key, /MOD_WF_QUEUE_PROGRESS:7\|30/);
  assert.match(v.key, /MOD_WF_QUEUE_OUT/);
  w.api.clear(w.folk);
  assert.equal(w.api.cardView(w.folk), null);
});
