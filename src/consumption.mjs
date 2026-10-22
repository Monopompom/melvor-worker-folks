// Consumption during Folk actions: familiar tablets (with Summoning XP for the
// player), Consumable-slot items, charge gloves from the shared charge pool. The
// engine's own event matchers decide relevance (an Ent tablet only goes on
// Woodcutting actions), the Folk's modifier table decides preservation, and the
// player's equipped items are never touched while a Folk acts. Game-facing.

export function install(ctx, { getHiring, rules, log }) {
  let hiring;
  /** folk.id → unassigner functions for that Folk's current loadout. */
  const unassigners = new Map();

  const acting = () => hiring?.acting;
  const isActingFolk = (folk) => {
    const a = acting();
    return a !== undefined && a.folk === folk;
  };
  const intervalOf = (e) => (typeof IntervaledGameEvent !== 'undefined' && e instanceof IntervaledGameEvent ? e.interval : 0);
  // A worn item running out stops its effect: one kind of toast for every run-out, an error with the fix in one
  // sentence, as food running out (scan B-11, B-12, B-29, build .112). The game's error toast takes no picture; the info
  // toast used before drew a broken image and a green "+1" without one. The game has only error, success and info
  // toasts (build .83 called a createWarningNotification that doesn't exist; fixed .86).
  const notify = (text) => game.notifications.createErrorNotification('worker_folks:loadout', text);

  const clearSlot = (folk, slotId, item) => {
    delete folk.loadout[slotId];
    const key = rules.slotKind(slotId) === 'summon' ? 'MOD_WF_LOADOUT_TABLETS_OUT' : 'MOD_WF_LOADOUT_STACK_OUT';
    notify(templateLangString(key, { name: folk.name, item: item.name }));
    log(`${folk.name}: ${item.id} used up in ${slotId}`);
    hiring.loadout.changed(folk);
  };

  /** One tablet from a Summon slot: XP first (like the engine), then the preservation roll. */
  const useTablet = (folk, slotId, interval) => {
    const a = acting();
    if (!rules.firstThisAction(a.consumed, slotId)) return;
    const e = hiring.loadout.entry(folk, slotId);
    if (e === undefined) return;
    game.summoning.addXPForTabletConsumption(e.item, interval);
    const table = a.table;
    const chance = rules.tabletPreservation({
      chance: table.summoningChargePreservationChance,
      bypass: table.summoningChargePreservationChanceBypass,
      alwaysPreserve: e.item.id === 'melvorItA:Summoning_Familiar_Abyssal_Octopus' && table.useNoSummoningChargesAbyssalOctopus > 0,
    });
    if (rollPercentage(chance)) return;
    if (typeof SummoningStats !== 'undefined') game.stats.Summoning.inc(SummoningStats.TabletsUsed);
    const { qty, emptied } = rules.consumeOne(e.qty);
    if (emptied) clearSlot(folk, slotId, e.item);
    else folk.loadout[slotId].qty = qty;
    game.summoning.renderQueue.synergyQuantities = true;
  };

  const useQuantity = (folk, slotId) => {
    const a = acting();
    if (!rules.firstThisAction(a.consumed, slotId)) return;
    const e = hiring.loadout.entry(folk, slotId);
    if (e === undefined) return;
    if (rules.slotKind(slotId) === 'consumable' && rollPercentage(rules.clampPreservation(a.table.consumablePreservationChance))) return;
    const { qty, emptied } = rules.consumeOne(e.qty);
    if (emptied) clearSlot(folk, slotId, e.item);
    else folk.loadout[slotId].qty = qty;
    hiring.renderQueue.folks = true;
  };

  const onQuantityEvent = (folk, slotId) => (e) => {
    if (!isActingFolk(folk)) return;
    if (rules.slotKind(slotId) === 'summon') useTablet(folk, slotId, intervalOf(e));
    else useQuantity(folk, slotId);
  };

  const onSynergyEvent = (folk) => (e) => {
    if (!isActingFolk(folk)) return;
    const interval = intervalOf(e);
    rules.SUMMON_SLOTS.forEach((slotId) => useTablet(folk, slotId, interval));
  };

  const onChargeEvent = (folk, item) => () => {
    if (!isActingFolk(folk)) return;
    if (!rules.firstThisAction(acting().consumed, `charge:${item.id}`)) return;
    if (game.itemCharges.itemHasCharge(item)) game.itemCharges.removeCharges(item, 1);
  };

  const api = {
    /** Re-registers the engine event handlers for everything the Folk wears. */
    sync(folk) {
      api.clear(folk);
      const list = [];
      Object.keys(folk.loadout).forEach((slotId) => {
        const e = hiring.loadout.entry(folk, slotId);
        if (e === undefined) return;
        if (e.item.consumesOn !== undefined) list.push(...game.events.assignMatchers(e.item.consumesOn, onQuantityEvent(folk, slotId)));
        if (e.item.consumesChargesOn !== undefined) list.push(...game.events.assignMatchers(e.item.consumesChargesOn, onChargeEvent(folk, e.item)));
      });
      const s1 = hiring.loadout.entry(folk, rules.SUMMON_SLOTS[0])?.item;
      const s2 = hiring.loadout.entry(folk, rules.SUMMON_SLOTS[1])?.item;
      if (s1 !== undefined && s2 !== undefined) {
        const synergy = game.summoning.getUnlockedSynergy(s1, s2);
        if (synergy?.consumesOn !== undefined) list.push(...game.events.assignMatchers(synergy.consumesOn, onSynergyEvent(folk)));
      }
      if (list.length > 0) unassigners.set(folk.id, list);
    },
    clear(folk) {
      const list = unassigners.get(folk.id);
      if (list !== undefined) game.events.unassignMatchers(list);
      unassigners.delete(folk.id);
    },
    syncAll() {
      hiring.crew.all.forEach((folk) => api.sync(folk));
    },
    /** Charges of a worn charge item, or undefined when the item does not use charges. */
    chargesOf(item) {
      if (item.consumesChargesOn === undefined) return undefined;
      return game.itemCharges.getCharges(item);
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.consumption = api;
  });

  // The player's own tablets, consumables, charges and bank-item costs stay untouched
  // while a Folk acts: the Folk's handlers above consume from the loadout instead.
  const guard = (method) => {
    ctx.patch(Player, method).replace(function (original, ...args) {
      if (acting() !== undefined) return undefined;
      return original(...args);
    });
  };
  ['consumeItemQuantities', 'consumeItemCharges', 'consumeSynergyTablets', 'consumeBankItem'].forEach(guard);

  // Folks do not discover Summoning marks (v1). Hiring's own mark (the Steward, rolled for the
  // player after a Folk action) goes through: that roll is the player's, not the Folk's.
  if (typeof Summoning !== 'undefined') {
    ctx.patch(Summoning, 'rollMarksForSkill').replace(function (original, ...args) {
      if (acting() !== undefined && args[0] !== hiring) return undefined;
      return original(...args);
    });
  }

  ctx.onCharacterLoaded(() => {
    api.syncAll();
    hiring.events.on('loadoutChanged', ({ folk }) => api.sync(folk));
    hiring.events.on('folkFired', ({ folk }) => api.clear(folk));
    // A synergy may unlock while a Folk wears both tablets: refresh when it next starts.
    hiring.events.on('folkStarted', ({ folk } = {}) => { if (folk !== undefined) api.sync(folk); });
    // Charge gloves apply only while charges remain: rebuild tables when a worn item crosses zero.
    game.itemCharges.on('chargesChanged', (e) => {
      const wearers = hiring.crew.all.filter((folk) => Object.values(folk.loadout).some((entry) => entry.id === e.item.id));
      const worn = wearers.length > 0;
      // Charges reaching 0 on a worn item get a toast too, as tablets and stacks do (scan B-12, build .112).
      if (worn && e.oldCharges > 0 && e.newCharges <= 0) {
        wearers.forEach((folk) => notify(templateLangString('MOD_WF_LOADOUT_CHARGES_OUT', { name: folk.name, item: e.item.name })));
      }
      if (rules.chargeChangeInvalidates({ oldCharges: e.oldCharges, newCharges: e.newCharges, worn })) {
        hiring.invalidateFolkTables?.();
        hiring.renderQueue.folks = true;
      } else if (worn) {
        hiring.renderQueue.folks = true;
      }
    });
    log('Folk consumption handlers ready');
  });
  return api;
}
