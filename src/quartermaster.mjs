// The Quartermaster job in the game (joint order round 3): at each look a Folk tops your equipped food, ammo,
// familiar tablets and consumable back up to the lines set in Mod Settings, with the same item, from your bank. The
// rules are in quartermaster-model.mjs; this module reads and changes the game's slots. Game-facing.

const SLOT_KIND = {
  'melvorD:Quiver': 'ammo',
  'melvorD:Summon1': 'summon',
  'melvorD:Summon2': 'summon',
  'melvorD:Consumable': 'consumable',
};

export function install(ctx, { getHiring, jobs, model, log }) {
  let hiring;
  const section = ctx.settings.section('Hiring');
  // One line per slot type, the game's own dropdown, the default marked (as the eat line's).
  section.add(model.KINDS.map((kind) => ({
    type: 'dropdown',
    name: `qmLine_${kind}`,
    label: getLangString(`MOD_WF_SETTING_QM_${kind}`),
    hint: getLangString('MOD_WF_SETTING_QM_HINT'),
    default: model.DEFAULT_LINES[kind],
    options: model.LINE_CHOICES[kind].map((n) => ({
      value: n,
      display: templateLangString(n === model.DEFAULT_LINES[kind] ? 'MOD_WF_SETTING_QM_LINE_DEFAULT' : 'MOD_WF_SETTING_QM_LINE', { count: numberWithCommas(n) }),
    })),
  })));
  const lines = () => Object.fromEntries(model.KINDS.map((k) => [k, model.lineOf(k, section.get(`qmLine_${k}`))]));

  const player = () => game.combat.player;
  const itemOf = (id) => game.items.getObjectByID(id);

  /** Your slots as the model reads them, with what the bank holds of each one's item (or the one it last held). */
  const readSlots = (memory) => {
    const p = player();
    const out = [];
    const bankOf = (id) => {
      const item = id === undefined || id === null ? undefined : itemOf(id);
      return item === undefined ? 0 : game.bank.getQty(item);
    };
    p.food.slots.forEach((slot, i) => {
      const key = `food${i}`;
      const itemId = slot.item === game.emptyFoodItem || !(slot.quantity > 0) ? null : slot.item.id;
      out.push({ key, kind: 'food', itemId, qty: slot.quantity, bank: bankOf(itemId ?? memory[key]) });
    });
    for (const [slotId, kind] of Object.entries(SLOT_KIND)) {
      const equipped = p.equipment.equippedItems[slotId];
      if (equipped === undefined) continue;
      const itemId = equipped.isEmpty || equipped.item === game.emptyEquipmentItem ? null : equipped.item.id;
      out.push({ key: slotId, kind, itemId, qty: equipped.quantity, bank: bankOf(itemId ?? memory[slotId]) });
    }
    return out;
  };

  const blocked = () => {
    const p = player();
    const inArea = game.combat.selectedArea !== undefined;
    const t = p.manager?.areaType;
    const areaType = !inArea ? null : t === CombatAreaType.Dungeon ? 'Dungeon' : t === CombatAreaType.Stronghold ? 'Stronghold' : 'Area';
    return model.equipBlocked({ areaType, dungeonSwap: p.modifiers.dungeonEquipmentSwapping, strongholdSwap: p.modifiers.strongholdEquipmentSwapping, raid: game.isGolbinRaid });
  };

  /** Moves one refill from the bank into its slot; returns the quantity moved (0 when the game would not take it). */
  const apply = (r) => {
    const p = player();
    const item = itemOf(r.itemId);
    if (item === undefined) return 0;
    const add = Math.min(r.add, game.bank.getQty(item));
    if (!(add > 0)) return 0;
    if (r.kind === 'food') {
      const i = Number(r.key.slice(4));
      const slot = p.food.slots[i];
      if (slot === undefined) return 0;
      if (r.empty) {
        // The slot it held ran empty: the same item back in the same slot (the game's own equip picks a slot itself).
        if (slot.item !== game.emptyFoodItem && slot.item !== item) return 0;
        slot.item = item;
      } else if (slot.item !== item) return 0;
      slot.quantity += add;
      game.bank.removeItemQuantity(item, add, false);
      if (i === p.food.selectedSlot && r.empty) p.onSelectedFoodChange?.(game.emptyFoodItem, item);
      p.renderQueue.food = true;
      return add;
    }
    const equipped = p.equipment.equippedItems[r.key];
    if (equipped === undefined) return 0;
    if (!r.empty) {
      if (equipped.item !== item) return 0;
      // As the game's own equip adds to a stack already worn (Player.equipItem).
      p.equipment.addQuantityToSlot(equipped.slot, add);
      game.bank.removeItemQuantity(item, add, false);
      p.renderQueue.equipment = true;
      return add;
    }
    if (!equipped.isEmpty && equipped.item !== game.emptyEquipmentItem) return 0;
    // An emptied slot is equipped again the game's way: requirements, stats, what it may not be worn with.
    const before = game.bank.getQty(item);
    try { p.equipItem(item, p.selectedEquipmentSet, equipped.slot, add); } catch (err) { log('quartermaster equip failed', err); return 0; }
    return Math.max(0, before - game.bank.getQty(item));
  };

  /** Items already told as gone, by Folk id: told again only once the bank has some again. */
  const told = new Map();

  const work = (folk, ms, { offline }) => {
    if (blocked()) return getLangString('MOD_WF_QM_WAIT_BLOCKED');
    folk.jobMemory = model.remember(folk.jobMemory, readSlots({}).filter((s) => model.watches(folk.tier).includes(s.kind)));
    const plan = model.plan(readSlots(folk.jobMemory), { tier: folk.tier, lines: lines(), memory: folk.jobMemory });
    for (const r of plan.refills) {
      const moved = apply(r);
      if (moved > 0) hiring.events.emit('folkRefilled', { folk, item: itemOf(r.itemId), quantity: moved, offline });
    }
    const seen = told.get(folk.id) ?? new Set();
    const outNow = new Set(plan.out.map((o) => o.itemId));
    [...seen].forEach((id) => { if (!outNow.has(id)) seen.delete(id); });
    for (const id of outNow) {
      if (seen.has(id)) continue;
      seen.add(id);
      const item = itemOf(id);
      hiring.events.emit('folkRefillOut', { folk, item, offline });
      if (!offline && item !== undefined) {
        game.notifications.createInfoNotification('worker_folks:qm-out', templateLangString('MOD_WF_QM_OUT', { name: folk.name, item: item.name }), item.media);
      }
    }
    told.set(folk.id, seen);
    if (plan.refills.length > 0) hiring.renderQueue.folks = true;
    return outNow.size > 0 ? getLangString('MOD_WF_QM_WAIT_OUT') : '';
  };

  const kind = jobs.register({
    id: model.JOB_ID,
    name: () => getLangString('MOD_WF_JOB_QUARTERMASTER'),
    // The game's own quiver slot art (no hand-drawn icon).
    media: () => cdnMedia('assets/media/bank/weapon_quiver.png'),
    everyMs: (folk) => model.checkMs(folk.tier),
    // It keeps your slots filled, so it goes where you go (with Voyage, it has to come along with you: the user, 10 Nov
    // 2026; Voyage's guards hold it to that).
    travels: true,
    work,
    unlocked: () => (hiring?.level ?? 0) >= model.UNLOCK_LEVEL,
    // The card: the blue pill how often it looks, the effects line what it watches to which line (its tooltip both).
    badge: (folk) => templateLangString('MOD_WF_QM_BADGE', { seconds: `${model.checkMs(folk.tier) / 1000}` }),
    effects: (folk) => model.watches(folk.tier).map((k) => {
      const [before, after = ''] = templateLangString(`MOD_WF_QM_KIND_${k}`, { count: '\u0001' }).split('\u0001');
      return { before, value: numberWithCommas(lines()[k]), after };
    }),
    describe: (folk) => [
      model.watches(folk.tier).map((k) => templateLangString(`MOD_WF_QM_KIND_${k}`, { count: numberWithCommas(lines()[k]) })).join(' · '),
      templateLangString('MOD_WF_QM_EVERY', { seconds: `${model.checkMs(folk.tier) / 1000}` }),
    ],
    lockText: () => hiring?.levels?.lockText(model.UNLOCK_LEVEL) ?? `${model.UNLOCK_LEVEL}`,
  });

  // What a Folk was told stays told through a new pick (a strike's restart included): the card's wait line still says
  // it, and a burst of the same notices again is noise (the user, 10 Nov 2026). An item is told again only once the
  // bank has had some since.
  ctx.onModsLoaded(() => {
    hiring = getHiring();
  });

  return { kind };
}
