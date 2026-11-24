// Drives the real jobs tick and carrier moves through long offline stretches of courier rounds (3 couriers, 5 stops
// each, 12 working Folks whose goods the couriers carry) and reads the heap after forced full GCs, as JSON on stdout.
// Run by carry.test.mjs: node --expose-gc courier-rounds.mjs [off] [hour marks, e.g. 1,24,48]

const OFF = process.argv[2] === 'off';
const MARKS = (process.argv[3] ?? '1,6,24').split(',').map(Number);
const mod = (p) => import(new URL(`../../${p}`, import.meta.url).href);
const { install: installJobs } = await mod('src/jobs.mjs');
const { install: installCarry } = await mod('src/carry.mjs');
const carryModel = await mod('src/carry-model.mjs');
const roomModel = await mod('src/room-model.mjs');
const depotModel = await mod('src/depot-model.mjs');

if (typeof globalThis.gc !== 'function') throw new Error('run with --expose-gc');
const HOUR = 3_600_000;
globalThis.TICK_INTERVAL = 50;
let tickFn;
globalThis.Game = class {};

const counts = {};
const items = new Map();
const itemOf = (id) => { if (!items.has(id)) items.set(id, { id }); return items.get(id); };
globalThis.game = {
  items: { getObjectByID: itemOf },
  bank: {
    getQty: (item) => counts[item.id] ?? 0,
    removeItemQuantity: (item, qty) => { counts[item.id] -= qty; },
  },
};

const emptyRoom = () => ({ haul: {}, stock: {}, town: {}, purse: {} });
const folks = [];
const byId = new Map();
const add = (id, o) => { const f = { id, name: id, room: emptyRoom(), capMs: 6 * HOUR, job: null, travel: 'idle', ...o }; folks.push(f); byId.set(id, f); return f; };
// 12 working Folks: even ones make ore (no inputs), odd ones smelt it (ore in, bars out).
for (let i = 0; i < 12; i += 1) add(`w${i}`, { makes: i % 2 === 0 ? `ore${i}` : `bar${i}`, needs: i % 2 === 0 ? null : `ore${i - 1}` });
const couriers = [0, 1, 2].map((i) => add(`c${i}`, { job: OFF ? null : 'test:Courier', carrier: true }));
const stopsOf = (i) => [0, 1, 2, 3, 4].map((k) => folks[(i * 4 + k) % 12].id);

const collect = (f) => {
  for (const side of ['haul', 'town']) for (const { id } of roomModel.entries(f.room, side)) {
    const { qty } = roomModel.take(f.room, id, Infinity, side);
    counts[id] = (counts[id] ?? 0) + qty;
  }
  return { items: [], left: [], purse: [] };
};
const hiring = {
  crew: { all: folks, byId: (id) => byId.get(id) },
  delegated: new Set(),
  shiftSlots: 20,
  renderQueue: { folks: false },
  folkAvailable: () => true,
  refusal: () => '',
  markCard: () => {},
  addFolkMastery: () => {},
  payroll: { chargeJob: () => {} },
  events: { on: () => {}, emit: () => {} },
  room: {
    isCarrier: (f) => f.carrier === true,
    capMs: (f) => f.capMs,
    inputsOf: (f) => (f.needs ? { perAction: [{ id: f.needs, qty: 1 }], intervalMs: 3000 } : { perAction: [], intervalMs: 0 }),
    membersOf: () => [],
    roomMoved: () => {},
    wake: () => {},
    wakeDepot: () => {},
    collect,
    stockHome: (f, ids) => ({ items: ids.map((id) => { const { qty } = roomModel.take(f.room, id, Infinity, 'stock'); counts[id] = (counts[id] ?? 0) + qty; return { itemId: id, qty }; }), left: [] }),
    townQty: () => 0,
  },
  depots: { roomFor: () => undefined, touched: () => {}, members: () => [] },
  commissions: { onRun: () => false, handIn: () => ({ delivered: [], home: [] }) },
  supply: { carriedIds: () => [] },
};
const ctx = { patch: () => ({ after(fn) { tickFn = fn; } }), onModsLoaded: (fn) => fn() };
const jobs = installJobs(ctx, { getHiring: () => hiring, log() {} });
const carry = installCarry({ onModsLoaded: (fn) => fn() }, { getHiring: () => hiring, model: carryModel, roomModel, depotModel, log: () => {} });

// The courier round, as Voyage's job runs it at a look: collect at each stop, hand over inputs, plan and load at the
// bank, empty the haul there.
let rounds = 0;
jobs.register({
  id: 'test:Courier',
  roomScale: 3,
  everyMs: () => 5000,
  work: (folk) => {
    const i = Number(folk.id.slice(1));
    const stops = stopsOf(i).map((id) => ({ folk: id }));
    for (const s of stops) { carry.take(folk.id, s, { forReceiver: s.folk }); carry.give(folk.id, s); }
    const plan = carry.inputsPlan(folk.id, stops);
    carry.loadInputs(folk.id, plan);
    carry.toTown(folk.id);
    carry.toBank(folk.id);
    rounds += 1;
    return rounds % 7 === 0 ? 'waiting' : '';
  },
});

const self = { isGolbinRaid: false, _isPaused: false, _isInOnlineLoop: false };
const TICKS_PER_HOUR = HOUR / 50;
let tick = 0;
const runHours = (h) => {
  const end = tick + h * TICKS_PER_HOUR;
  for (; tick < end; tick += 1) {
    // Each working Folk finishes an action every 60 ticks (3 s), its goods to its room.
    if (tick % 60 === 0) for (let i = 0; i < 12; i += 1) {
      const f = folks[i];
      if (f.needs && roomModel.take(f.room, f.needs, 1, 'stock').qty < 1) continue;
      roomModel.put(f.room, f.makes, 1, 3000, 'haul');
    }
    tickFn.call(self);
  }
};
const heap = () => { for (let k = 0; k < 4; k += 1) globalThis.gc(); return process.memoryUsage().heapUsed; };
const MB = (b) => (b / 1048576).toFixed(3);

runHours(0.25); // warm up: every code path compiled, rooms at their working size
const start = heap();
const rows = [];
let done = 0.25;
for (const at of MARKS) {
  const t0 = process.hrtime.bigint();
  runHours(at - done);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  done = at;
  const h = heap();
  rows.push({ hours: at, heapMB: MB(h), deltaMB: MB(h - start), rounds, runMs: Math.round(ms) });
}
const roomKinds = folks.reduce((n, f) => n + roomModel.SIDES.reduce((m, s) => m + roomModel.entries(f.room, s).length, 0), 0);
const bars = Object.entries(counts).filter(([k]) => k.startsWith('bar')).reduce((n, [, v]) => n + v, 0);
console.log(JSON.stringify({ off: OFF, bars, node: process.version, startMB: MB(start), rows, roomKinds, bankKinds: Object.keys(counts).length, ticks: tick }, null, 1));
