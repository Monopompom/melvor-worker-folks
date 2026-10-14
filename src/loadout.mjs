// Folk loadouts: slot grid, bank picker, item moves, modifier sources for the
// acting-Folk table. Game-facing.

const CAPE = 'melvorD:Cape';
const SUMMON1 = 'melvorD:Summon1';
const SUMMON2 = 'melvorD:Summon2';
const SUMMON_SLOTS = new Set([SUMMON1, SUMMON2]);
const CONSUMABLE = 'melvorD:Consumable';
const SOURCE = 'Skill.worker_folks:Hiring';
/** Capes that carry every skillcape's effect; AoD skillcapes are inherited like the player does. */
const MAX_CAPES = new Set(['melvorF:Max_Skillcape', 'melvorTotH:Superior_Max_Skillcape', 'melvorF:Cape_of_Completion', 'melvorTotH:Superior_Cape_Of_Completion']);
const AOD_INHERIT = {
  'melvorAoD:Archaeology': ['melvorAoD:Archaeology_Skillcape', 'melvorAoD:Superior_Archaeology_Skillcape'],
  'melvorAoD:Cartography': ['melvorAoD:Cartography_Skillcape', 'melvorAoD:Superior_Cartography_Skillcape'],
};

export function install(ctx, { getHiring, rules, consumptionRules, log }) {
  let hiring;
  const expansions = () => ({
    hasAoD: game.registeredNamespaces.hasNamespace('melvorAoD'),
    hasItA: game.registeredNamespaces.hasNamespace('melvorItA'),
  });
  const slotObj = (id) => game.equipmentSlots.getObjectByID(id);
  const itemObj = (id) => game.items.getObjectByID(id);
  const isEquipment = (item) => typeof EquipmentItem !== 'undefined' && item instanceof EquipmentItem;
  const fits = (item, slotId) => isEquipment(item) && item.fitsInSlot(slotId);

  const api = {
    /** EquipmentSlot objects the Folk's tier opens (registered ones only). */
    slotsFor(folk) {
      return rules.slotsForTier(folk.tier, expansions()).map(slotObj).filter((s) => s !== undefined);
    },
    entry(folk, slotId) {
      const e = folk.loadout[slotId];
      if (e === undefined) return undefined;
      const item = itemObj(e.id);
      return item === undefined ? undefined : { item, qty: e.qty };
    },
    items(folk) {
      return Object.keys(folk.loadout).map((slotId) => api.entry(folk, slotId)).filter((e) => e !== undefined);
    },
    /** Any non-combat modifier, plain or conditional (charge gloves only have conditional ones). */
    hasNonCombat(item) {
      const nonCombat = (mvs) => (mvs ?? []).some((mv) => !mv.modifier.isCombat);
      return nonCombat(item.modifiers) || (item.conditionalModifiers ?? []).some((cm) => nonCombat(cm.modifiers));
    },
    isSkilling(item, slotId) {
      return rules.isSkillingItem({
        hasNonCombatModifier: api.hasNonCombat(item),
        providesRunes: (item.providedRunes?.length ?? 0) > 0,
        hasSynergy: game.itemSynergies.has(item),
        isSummon: SUMMON_SLOTS.has(slotId),
        isConsumable: slotId === CONSUMABLE,
      });
    },
    /** Skill ids (null = every skill) of every non-combat modifier the item can bring. */
    skillScopes(item) {
      const scopes = [];
      const take = (mvs) => (mvs ?? []).forEach((mv) => { if (!mv.modifier.isCombat) scopes.push(mv.skill?.id ?? null); });
      take(item.modifiers);
      (item.conditionalModifiers ?? []).forEach((cm) => take(cm.modifiers));
      (game.itemSynergies.get(item) ?? []).forEach((synergy) => take(synergy.playerModifiers));
      const partners = game.summoning.synergiesByItem.get(item);
      if (partners !== undefined) partners.forEach((synergy) => take(synergy.modifiers));
      return scopes;
    },
    /** Does the item help this skill (narrowed picker)? */
    helpsSkill(item, skill) {
      const recipe = game.summoning.actions.allObjects.find((a) => a.product === item);
      return rules.helpsSkill({
        scopes: api.skillScopes(item),
        familiarSkillIds: recipe === undefined ? [] : recipe.skills.map((s) => s.id),
        providesRunes: (item.providedRunes?.length ?? 0) > 0,
        skillId: skill.id,
      });
    },
    /**
     * Bank items that fit the slot. Default: items that help the Folk's skill, or any
     * skilling item when the Folk has no skill yet. showAll: everything that fits.
     */
    candidates(folk, slotId, { showAll = false } = {}) {
      const skill = hiring.skillOf(folk);
      return game.bank.filterItems((bankItem) => {
        const item = bankItem.item;
        if (!fits(item, slotId) || !rules.isFolkGear(item.id)) return false;
        if (showAll) return true;
        return skill === undefined ? api.isSkilling(item, slotId) : api.helpsSkill(item, skill);
      });
    },
    /** Moves `qty` of the item from the bank into the Folk's slot; a previous item goes back. */
    equip(folk, slotId, item, requested = 1) {
      const slot = slotObj(slotId);
      if (slot === undefined || !fits(item, slotId) || !rules.isFolkGear(item.id)) return false;
      if (!api.slotsFor(folk).includes(slot)) return false;
      if (!game.checkRequirements(item.equipRequirements, true)) return false;
      const qty = rules.equipQuantity(requested, { allowQuantity: slot.allowQuantity, available: game.bank.getQty(item) });
      if (qty === 0) return false;
      const previous = api.entry(folk, slotId);
      if (previous !== undefined && previous.item === item && slot.allowQuantity) {
        game.bank.removeItemQuantity(item, qty, false); // false: leaving the bank must keep the item's charges
        folk.loadout[slotId] = { id: item.id, qty: previous.qty + qty };
      } else {
        if (previous !== undefined && !api.unequip(folk, slotId)) return false;
        game.bank.removeItemQuantity(item, qty, false); // false: leaving the bank must keep the item's charges
        folk.loadout[slotId] = { id: item.id, qty };
      }
      log(`${folk.name} equips ${qty}× ${item.id} in ${slotId}`);
      api.changed(folk);
      return true;
    },
    /** Returns the slot's item to the bank. Fails (and keeps the item) when the bank is full. */
    unequip(folk, slotId, { force = false } = {}) {
      const e = api.entry(folk, slotId);
      if (e === undefined) {
        delete folk.loadout[slotId];
        return true;
      }
      if (!game.bank.addItem(e.item, e.qty, false, true, force, true, SOURCE)) {
        game.notifications.createErrorNotification('worker_folks:bankfull', getLangString('MOD_WF_LOADOUT_BANK_FULL'));
        return false;
      }
      delete folk.loadout[slotId];
      api.changed(folk);
      return true;
    },
    /** Loadout edits: tables rebuild on crewChanged, consumption handlers on loadoutChanged. */
    changed(folk) {
      hiring.crew.touch();
      hiring.events.emit('loadoutChanged', { folk });
    },
    /** Firing: everything goes back, bank space or not. */
    returnAll(folk) {
      Object.keys(folk.loadout).forEach((slotId) => api.unequip(folk, slotId, { force: true }));
    },
    /** After load: items from removed mods are dropped; slots the tier cannot use and Hiring gear are returned. */
    reconcile() {
      hiring.crew.all.forEach((folk) => {
        const r = rules.reconcileLoadout(folk.loadout, {
          allowedSlots: rules.slotsForTier(folk.tier, expansions()),
          itemExists: (id) => itemObj(id) !== undefined,
        });
        if (r.returned.length === 0 && r.dropped.length === 0) return;
        folk.loadout = r.kept;
        r.returned.forEach(({ id, qty }) => game.bank.addItem(itemObj(id), qty, false, true, true, false, SOURCE));
        r.dropped.forEach(({ id, qty }) => console.warn(`[Worker Folks] ${folk.name}: item ${id} ×${qty} no longer exists and was dropped`));
        log(`${folk.name}: loadout reconciled (${r.returned.length} returned, ${r.dropped.length} dropped)`);
        hiring.events.emit('loadoutChanged', { folk });
      });
    },
    /** Modifier sources for the Folk's table: items, item synergies, inherited capes, summoning synergy. */
    modifierSources(folk, skill) {
      const sources = [];
      const items = api.items(folk).map((e) => e.item);
      items.forEach((item) => {
        if (item.modifiers !== undefined && item.modifiers.length > 0) sources.push({ source: item, modifiers: item.modifiers });
        (item.conditionalModifiers ?? []).forEach((cm) => {
          if (!api.conditionHolds(cm)) return;
          if (cm.modifiers !== undefined && cm.modifiers.length > 0) sources.push({ source: item, modifiers: cm.modifiers });
        });
      });
      const ids = new Set(items.map((i) => i.id));
      const seen = new Set();
      items.forEach((item) => {
        (game.itemSynergies.get(item) ?? []).forEach((synergy) => {
          if (seen.has(synergy)) return;
          seen.add(synergy);
          const complete = synergy.items.every((i) => (typeof i === 'string' ? ids.has(i) : ids.has(i.id)));
          if (complete && synergy.playerModifiers !== undefined) sources.push({ source: synergy, modifiers: synergy.playerModifiers });
        });
      });
      const cape = api.entry(folk, CAPE)?.item;
      if (cape !== undefined && MAX_CAPES.has(cape.id) && skill !== undefined) {
        const pair = AOD_INHERIT[skill.id];
        if (pair !== undefined) {
          const inherit = itemObj(skill.level < 120 ? pair[0] : pair[1]);
          if (inherit !== undefined && isEquipment(inherit) && game.checkRequirements(inherit.equipRequirements) && inherit.modifiers !== undefined) {
            sources.push({ source: cape, modifiers: inherit.modifiers });
          }
        }
      }
      const s1 = api.entry(folk, SUMMON1)?.item;
      const s2 = api.entry(folk, SUMMON2)?.item;
      if (s1 !== undefined && s2 !== undefined) {
        const synergy = game.summoning.getUnlockedSynergy(s1, s2);
        if (synergy !== undefined && synergy.modifiers.length > 0) sources.push({ source: synergy, modifiers: synergy.modifiers });
      }
      return sources;
    },
    /**
     * Charge gloves and bank-item conditions read pools the Folk shares with the player
     * (game.itemCharges, the bank); the combat manager exposes both to the condition.
     */
    conditionHolds(cm) {
      const type = cm.condition?.type;
      if (!consumptionRules.folkEvaluatesCondition(type)) return false;
      try {
        return cm.condition.checkIfMet(game.combat) === true;
      } catch (err) {
        console.warn('[Worker Folks] conditional modifier check failed', err);
        return false;
      }
    },
    /** Printed non-combat modifiers of the whole loadout that touch the Folk's skill (or every skill). */
    summaryLines(folk, skill) {
      const lines = [];
      api.modifierSources(folk, skill).forEach(({ modifiers }) => {
        modifiers.forEach((mv) => {
          if (mv.modifier.isCombat) return;
          if (mv.skill !== undefined && skill !== undefined && mv.skill !== skill) return;
          const { text, isNegative } = mv.print();
          lines.push({ text, isNegative });
        });
      });
      return lines;
    },
    /** Slot tiles for the gear modal: { id, name, media, qty, charges, empty }. */
    slotTiles(folk) {
      return api.slotsFor(folk).map((slot) => {
        const e = api.entry(folk, slot.id);
        return {
          id: slot.id,
          name: e === undefined ? slot.emptyName : e.item.name,
          media: e === undefined ? slot.emptyMedia : e.item.media,
          qty: e !== undefined && slot.allowQuantity ? e.qty : 0,
          charges: e === undefined ? undefined : hiring.consumption?.chargesOf(e.item),
          empty: e === undefined,
        };
      });
    },
    /**
     * The gear modal: the Folk's slot grid with the bonus summary; clicking a slot swaps
     * the modal body for the bank picker of that slot (Back returns). One modal, sized
     * to its content.
     */
    openLoadout(folk, initialSlotId) {
      const root = document.createElement('div');
      root.className = 'text-left font-size-sm wf-gear';
      const skill = hiring.skillOf(folk);

      const showGrid = () => {
        root.replaceChildren();
        const head = document.createElement('small');
        head.className = 'text-muted d-block wf-gear-head';
        head.textContent = `${hiring.roleName(folk.tier)} · ${skill === undefined ? getLangString('MOD_WF_UNASSIGNED') : skill.name} · ${getLangString('MOD_WF_GEAR_HINT')}`;
        root.append(head);
        const grid = document.createElement('div');
        grid.className = 'wf-slot-grid';
        for (const slot of api.slotTiles(folk)) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `btn btn-sm wf-slot${slot.empty ? ' btn-outline-info' : ' btn-info'}`;
          const img = document.createElement('img');
          img.src = slot.media;
          b.append(img);
          if (slot.charges !== undefined) {
            const q = document.createElement('span');
            q.className = `wf-slot-qty${slot.charges === 0 ? ' text-danger' : ''}`;
            q.textContent = slot.charges > 9999 ? `${Math.floor(slot.charges / 1000)}k` : `${slot.charges}`;
            b.append(q);
          } else if (slot.qty > 0) {
            const q = document.createElement('small');
            q.className = 'wf-slot-qty';
            q.textContent = slot.qty > 9999 ? `${Math.floor(slot.qty / 1000)}k` : `${slot.qty}`;
            b.append(q);
          }
          if (typeof tippy === 'function') {
            const e = api.entry(folk, slot.id);
            tippy(b, { content: e === undefined ? slot.name : createItemInformationTooltip(e.item), allowHTML: true, placement: 'top', interactive: false });
          } else b.title = slot.name;
          b.onclick = () => showPicker(slot.id);
          grid.append(b);
        }
        root.append(grid);
        const summary = document.createElement('div');
        summary.className = 'wf-gear-summary';
        const lines = api.summaryLines(folk, skill);
        if (lines.length === 0) {
          const s = document.createElement('small');
          s.className = 'text-muted';
          s.textContent = getLangString('MOD_WF_LOADOUT_EMPTY');
          summary.append(s);
        }
        for (const line of lines) {
          const s = document.createElement('small');
          s.className = `d-block ${line.isNegative ? 'text-danger' : 'text-success'}`;
          s.textContent = line.text;
          summary.append(s);
        }
        root.append(summary);
      };

      const showPicker = (slotId) => {
        const slot = slotObj(slotId);
        if (slot === undefined) return;
        root.replaceChildren();
        const current = api.entry(folk, slotId);
        // Order: title row (Back · slot icon · slot name) → current item → "Showing …" line →
        // item grid (or "nothing") → Show all checkbox with its explanation → quantity.
        const head = document.createElement('div');
        head.className = 'wf-picker-head';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn btn-sm btn-outline-primary';
        back.textContent = `← ${getLangString('MOD_WF_BUTTON_BACK')}`;
        back.onclick = showGrid;
        const slotIcon = document.createElement('img');
        slotIcon.className = 'skill-icon-xs';
        slotIcon.src = slot.emptyMedia;
        const slotName = document.createElement('span');
        slotName.className = 'font-w600';
        slotName.textContent = slot.emptyName;
        head.append(back, slotIcon, slotName);
        root.append(head);
        const showAll = document.createElement('input');
        showAll.type = 'checkbox';
        showAll.className = 'custom-control-input';
        showAll.id = `wf-show-all-${slotId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
        const hint = document.createElement('small');
        hint.className = 'text-muted d-block mb-2';
        if (current !== undefined) {
          const cur = document.createElement('div');
          cur.className = 'mb-2 d-flex align-items-center';
          cur.innerHTML = `<img class="skill-icon-xs mr-1" src="${current.item.media}">${current.item.name}${slot.allowQuantity ? ` ×${numberWithCommas(current.qty)}` : ''}`;
          const un = document.createElement('button');
          un.type = 'button';
          un.className = 'btn btn-sm btn-outline-danger ml-2';
          un.textContent = getLangString('MOD_WF_BUTTON_UNEQUIP');
          un.onclick = () => { if (api.unequip(folk, slotId)) showGrid(); };
          cur.append(un);
          root.append(cur);
        }
        root.append(hint);
        const grid = document.createElement('div');
        grid.className = 'wf-picker-grid mb-2';
        const fill = () => {
          grid.replaceChildren();
          const narrowed = !showAll.checked && skill !== undefined;
          const items = api.candidates(folk, slotId, { showAll: showAll.checked });
          if (items.length === 0) {
            hint.textContent = narrowed ? templateLangString('MOD_WF_PICKER_NONE_FOR_SKILL', { skill: skill.name }) : getLangString('MOD_WF_PICKER_NONE');
            return;
          }
          hint.textContent = narrowed ? templateLangString('MOD_WF_PICKER_FOR_SKILL', { skill: skill.name }) : getLangString('MOD_WF_PICKER_ALL');
          items.forEach((item) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-sm btn-outline-info wf-picker-item';
            b.innerHTML = `<img src="${item.media}"><small>${numberWithCommas(game.bank.getQty(item))}</small>`;
            if (typeof tippy === 'function') tippy(b, { content: createItemInformationTooltip(item), allowHTML: true, placement: 'top', interactive: false });
            b.onclick = () => { if (api.equip(folk, slotId, item, qtyInput === undefined ? 1 : qtyInput.value)) showGrid(); };
            grid.append(b);
          });
        };
        showAll.addEventListener('change', fill);
        fill();
        root.append(grid);
        // Controls: one row with the Show All checkbox and the quantity field, then the
        // explanation on its own line in small muted text (outside the label: labels are bold here).
        const controls = document.createElement('div');
        controls.className = 'wf-picker-controls';
        const row = document.createElement('div');
        row.className = 'd-flex align-items-center flex-wrap';
        controls.append(row);
        if (skill !== undefined) {
          const box = document.createElement('div');
          box.className = 'custom-control custom-checkbox mr-3';
          const showAllLabel = document.createElement('label');
          showAllLabel.className = 'custom-control-label pointer-enabled font-w600';
          showAllLabel.htmlFor = showAll.id;
          showAllLabel.textContent = getLangString('MOD_WF_PICKER_SHOW_ALL');
          box.append(showAll, showAllLabel);
          row.append(box);
          const desc = document.createElement('small');
          desc.className = 'text-muted d-block mt-1';
          desc.textContent = templateLangString('MOD_WF_PICKER_SHOW_ALL_DESC', { skill: skill.name });
          controls.append(desc);
        }
        let qtyInput;
        if (slot.allowQuantity) {
          qtyInput = document.createElement('input');
          qtyInput.type = 'number';
          qtyInput.min = '1';
          qtyInput.value = '1';
          qtyInput.className = 'form-control form-control-sm wf-picker-qty mr-2';
          const qtyLabel = document.createElement('span');
          qtyLabel.className = 'mr-1';
          qtyLabel.textContent = getLangString('MOD_WF_PICKER_QTY');
          row.append(qtyLabel, qtyInput);
        }
        root.append(controls);
      };

      if (initialSlotId !== undefined) showPicker(initialSlotId);
      else showGrid();
      SwalLocale.fire({
        title: templateLangString('MOD_WF_GEAR_TITLE', { name: folk.name }),
        html: root,
        imageUrl: hiring.portrait(folk.tier),
        imageWidth: 48,
        imageHeight: 48,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: (typeof createSwalCustomClass === 'function' ? createSwalCustomClass({ popup: 'wf-gear-popup wf-ui' }) : { popup: 'wf-gear-popup wf-ui' }),
      });
    },
    /** Kept for callers that open one slot directly. */
    openPicker(folk, slotId) {
      return api.openLoadout(folk, slotId);
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.loadout = api;
  });
  ctx.onCharacterLoaded(() => api.reconcile());
  return api;
}
