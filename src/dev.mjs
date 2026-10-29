// Developer console commands (window.workerFolksDev). Lets later slices be
// tested before the shop exists. Ticket 14 decides whether to gate this.

export function install({ hiring, log, tiers }) {
  /**
   * Which Folk a command means: its row in workerFolksDev.list() (0, 1, …), its id, or its name (any case). Returns
   * the id, or the input unchanged so the command reports "no Folk".
   */
  const ref = (x) => {
    const all = hiring.crew.all;
    if (typeof x === 'number' && Number.isInteger(x)) return all[x]?.id ?? x;
    if (typeof x !== 'string') return x;
    if (all.some((f) => f.id === x)) return x;
    const byName = all.filter((f) => f.name?.toLowerCase() === x.toLowerCase());
    return byName.length === 1 ? byName[0].id : x;
  };
  const api = {
    /** workerFolksDev.spawn('Middle', 'Ada') — adds a Folk and emits folkHired. */
    spawn(tier = 'Newbie', name) {
      if (!tiers.includes(tier)) {
        console.error(`[Worker Folks] unknown tier "${tier}"; use one of ${tiers.join(', ')}`);
        return null;
      }
      const folk = hiring.crew.hire(tier, { name, source: 'dev', limit: hiring.folkCap });
      if (folk === null) console.error('[Worker Folks] no free Folk slot');
      return folk;
    },
    fire(id) {
      return hiring.crew.fire(ref(id), { reason: 'dev' });
    },
    /** Sets a Folk's current HP (clamped to its tier max). */
    hp(id, hp) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined || hiring.health === undefined) return false;
      hiring.health.setHp(folk, hp);
      hiring.crew.touch();
      return true;
    },
    /** Kills a Folk: slot frozen for 24 h. */
    kill(id) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined || hiring.health === undefined) return false;
      hiring.health.kill(folk);
      return true;
    },
    /** Lifts every frozen slot (or one). */
    thaw(slot) {
      hiring.crew.thaw(slot);
      return true;
    },
    /** Forces a strike with the given debt (GP) for UI testing. */
    strike(id, debt = 1000) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined) return false;
      folk.debt = debt;
      folk.debtCurrency = 'melvorD:GP';
      folk.onStrike = true;
      hiring.forceStop(hiring.skillOf(folk));
      hiring.crew.touch();
      return true;
    },
    /** Puts the Folk in debt (unpaid wages, still allowed to work) without a strike; `minutesUsed` of the grace already spent. */
    debt(id, debt = 500, minutesUsed = 0) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined) return false;
      folk.debt = debt;
      folk.debtCurrency = 'melvorD:GP';
      folk.debtMs = Math.max(0, minutesUsed) * 60000;
      folk.onStrike = false;
      hiring.crew.touch();
      return true;
    },
    /** Clears strike, debt and cooldown: back to Idle (or Working if its skill still runs). */
    reset(id) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined) return false;
      folk.onStrike = false;
      folk.debt = 0;
      folk.cooldownTicks = 0;
      hiring.crew.touch();
      return true;
    },
    cooldown(id, ticks) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined) return false;
      folk.cooldownTicks = ticks;
      hiring.crew.touch();
      return true;
    },
    /**
     * Prints what a Folk's worn items contribute: each item's plain and conditional
     * modifiers (and whether the condition holds right now), its charges, the entries
     * those items put into the Folk's modifier table, and the Details summary lines.
     */
    loadout(id) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined || hiring.loadout === undefined) return false;
      const skill = hiring.skillOf(folk);
      const items = hiring.loadout.items(folk);
      console.table(items.map(({ item, qty }) => ({
        item: item.id,
        qty,
        modifiers: (item.modifiers ?? []).length,
        conditional: (item.conditionalModifiers ?? []).map((cm) => `${cm.condition?.type ?? '?'}: ${hiring.loadout.conditionHolds(cm) ? 'holds' : 'NOT met'}`).join(', ') || '-',
        charges: hiring.consumption?.chargesOf(item) ?? '-',
      })));
      if (skill === undefined || hiring.debugTable === undefined) {
        console.log('[Worker Folks] Folk has no skill: table not built');
        return true;
      }
      const table = hiring.debugTable(folk, skill);
      const rows = [];
      items.forEach(({ item }) => (table.entries.get(item) ?? []).forEach((e) => rows.push({
        source: item.id,
        modifier: e.modValue.modifier.id,
        value: e.modValue.value,
        skill: e.modValue.skill?.id ?? '-',
        category: e.modValue.category?.id ?? '-',
        action: e.modValue.action?.id ?? '-',
      })));
      console.table(rows);
      console.log('summary:', hiring.loadout.summaryLines(folk, skill).map((l) => l.text));
      return true;
    },
    /**
     * workerFolksDev.gear(id, skillId?, { replace, qty }) — fills every open slot of a Folk with the best item for its
     * skill (or `skillId`), taken from the whole game: the item is added to the bank, then equipped through the normal
     * equip path, so every Folk-gear rule still applies. Items made for that skill win over all-skill ones, then the
     * higher sell price. Stackable slots (consumable, familiars) get `qty` (1000). Filled slots are kept unless
     * `replace` is true. Prints and returns what went where.
     */
    gear(id, skillId, { replace = false, qty = 1000 } = {}) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined || hiring.loadout === undefined) { console.error(`[Worker Folks] no Folk "${id}"; pass its row in workerFolksDev.list(), its name or its id`); return false; }
      if (skillId !== undefined && typeof skillId !== 'string') { console.error('[Worker Folks] the second argument is a skill id, e.g. gear(0, "melvorD:Woodcutting"); leave it out for the Folk\'s own skill'); return false; }
      const skill = skillId !== undefined ? game.skills.getObjectByID(skillId) : hiring.skillOf(folk);
      if (skill === undefined) { console.error('[Worker Folks] the Folk has no skill: assign one or pass a skill id, e.g. gear(id, "melvorD:Woodcutting")'); return false; }
      const L = hiring.loadout;
      const isGear = (item) => typeof EquipmentItem !== 'undefined' && item instanceof EquipmentItem;
      const own = (item) => L.skillScopes(item).includes(skill.id);
      const used = new Set(L.items(folk).map((e) => e.item.id));
      const rows = [];
      for (const slot of L.slotsFor(folk)) {
        if (L.entry(folk, slot.id) !== undefined && !replace) { rows.push({ slot: slot.id, item: L.entry(folk, slot.id).item.id, result: 'kept' }); continue; }
        const pool = game.items.allObjects
          .filter((item) => isGear(item) && item.fitsInSlot(slot.id) && !used.has(item.id) && L.helpsSkill(item, skill))
          .filter((item) => game.checkRequirements(item.equipRequirements, false))
          .sort((a, b) => (own(b) - own(a)) || ((b.sellsFor ?? 0) - (a.sellsFor ?? 0)));
        let done;
        for (const item of pool) {
          const n = slot.allowQuantity ? qty : 1;
          if (!game.bank.addItem(item, n, false, false, true, false, 'worker_folks:Dev')) continue;
          if (L.equip(folk, slot.id, item, n)) { done = { item: item.id, qty: n }; used.add(item.id); break; }
          game.bank.removeItemQuantity(item, n, false); // not Folk gear after all: take it back and try the next
        }
        rows.push({ slot: slot.id, item: done?.item ?? '-', qty: done?.qty ?? '-', result: done ? 'equipped' : `nothing fits for ${skill.name}` });
      }
      console.table(rows);
      return rows;
    },
    /** Sets a Folk's mastery level directly (XP of that level). */
    mastery(id, level) {
      const folk = hiring.crew.byId(ref(id));
      const slot = folk === undefined ? undefined : hiring.slotOf(folk);
      if (slot === undefined) return false;
      hiring.actionMastery.delete(slot);
      hiring.addMasteryXP(slot, exp.levelToXP(level) + 1);
      hiring.updateTotalCurrentMasteryLevel();
      hiring.crew.touch();
      return true;
    },
    /** workerFolksDev.trait(0, 'Lucky'): the Folk learns that trait now (Specialist in its current skill). */
    trait(id, traitId) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined || hiring.traits === undefined) return false;
      return hiring.traits.devTeach(folk, traitId);
    },
    /** A Folk's traits: held, waiting for a slot, and the counts toward the others. */
    traits(id) {
      return hiring.crew.byId(ref(id))?.traitState;
    },
    poolXP(xp) {
      hiring.addMasteryPoolXP(game.defaultRealm, xp);
      return hiring.poolPercent();
    },
    reserve(currencyId = 'melvorD:GP') {
      return hiring.crew.reserveOf(currencyId);
    },
    assign(id, skillId) {
      return hiring.crew.assign(ref(id), skillId);
    },
    list() {
      const rows = hiring.crew.all.map((f) => ({ id: f.id, slot: f.slot + 1, tier: f.tier, name: f.name, skill: f.skillId ?? '-' }));
      console.table(rows);
      return rows;
    },
    clear() {
      // Fires everyone the way the Fire button does, so their skills are released and the slots' mastery goes back to 1
      // (build .83). Emptying the crew alone left a delegated skill with no Folk: a tick error on its next action
      // (live check, build .116). Then the reserve and frozen slots go too.
      hiring.crew.all.slice().forEach((folk) => hiring.crew.fire(folk.id, { reason: 'dev' }));
      hiring.crew.clear();
    },
    /** The exact JSON that goes into the save. */
    dump() {
      return hiring.crew.serialize();
    },
    /** Loads a root object/JSON (e.g. a pre-version root) through the migration runner. */
    load(root) {
      return hiring.crew.load(root);
    },
    /** Temporary Shift Slots for testing without licences (not saved). */
    shiftSlots(extra) {
      hiring.devExtraShiftSlots = Math.max(0, Math.floor(extra));
      return hiring.shiftSlots;
    },
    delegated() {
      return Array.from(hiring.delegated, (s) => s.id);
    },
    /** Unlocks the Hiring pet now. */
    pet() {
      const pet = hiring.discoveries?.pet();
      if (pet !== undefined) game.petManager.unlockPet(pet);
      return pet?.id;
    },
    /** Finds `count` random Hiring relics now (Ancient Relics gamemode only); returns found ids. */
    relics(count = 1) {
      const set = hiring.discoveries?.relicSet();
      if (set !== undefined && game.currentGamemode.allowAncientRelicDrops) hiring.unlockRelicDrops(set, count);
      return set === undefined ? [] : Array.from(set.foundRelics.keys(), (r) => r.id);
    },
    /** The Work Orders board as a table (null before Hiring 8). */
    orders() {
      const board = hiring.workOrders?.board ?? null;
      if (board === null) return null;
      const rows = board.orders.map((o) => ({ id: o.id, size: o.size, skill: o.skillId, item: o.itemId, done: `${o.delivered}/${o.qty}`, state: o.state, aged: o.aged, gpRate: o.gpRate, wages: Math.floor(o.wages), extra: o.extra === null ? '-' : JSON.stringify(o.extra) }));
      console.table(rows);
      return rows;
    },
    /** Moves the board's clock by `hours` of game time (a refresh when it reaches 24 h). */
    orderClock(hours = 24) {
      hiring.workOrders?.advance(Math.round(hours * 72000));
      return hiring.workOrders?.board?.ticks;
    },
    /** What a Folk holds in its room: one row a stack, its work in minutes. */
    room(id) {
      const folk = hiring.crew.byId(ref(id));
      if (folk === undefined) return null;
      const rows = Object.entries(folk.room?.haul ?? {}).map(([item, e]) => ({ item, qty: e.qty, minutes: Math.round((e.ms / 60000) * 100) / 100 }));
      console.table(rows);
      return rows;
    },
    /** bankFull(true): the bank reads as having no free slot (nothing is moved); bankFull(false) puts it back. */
    bankFull(on = true) {
      if (on) Object.defineProperty(game.bank, 'maximumSlots', { get: () => game.bank.occupiedSlots, configurable: true });
      else delete game.bank.maximumSlots;
      return { occupied: game.bank.occupiedSlots, maximum: game.bank.maximumSlots };
    },
    tiers: tiers.slice(),
  };
  globalThis.workerFolksDev = api;
  log('dev commands (a Folk = its row in list(), its name or its id): workerFolksDev.spawn(tier, name?) | fire(id) | assign(id, skillId) | strike(id, debt?) | debt(id, gp?) | cooldown(id, ticks) | reset(id) | hp(id, hp) | kill(id) | thaw(slot?) | loadout(id) | gear(id, skillId?, {replace, qty}) | reserve() | mastery(id, level) | poolXP(xp) | list() | clear() | dump() | load(root) | shiftSlots(n) | delegated() | pet() | relics(n) | orders() | orderClock(hours) | room(id) | bankFull(on)');
  return api;
}
