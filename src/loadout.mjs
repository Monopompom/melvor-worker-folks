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

export function install(ctx, { getHiring, rules, consumptionRules, popupDidRender, log }) {
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
    /** Filled / open slots, worn items and the ones that ran out (card button, Worker popup). */
    summary(folk) {
      return rules.gearSummary(api.slotTiles(folk));
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
      // Tooltips of buttons this modal replaces: a shown tooltip never gets its mouseleave once its button is gone,
      // so it stayed on screen after a view change (user report, build .51). Destroyed before every redraw and on close.
      const tips = [];
      // touch: 'hold' on a phone a tap selects or opens; holding shows the item tooltip.
      const tip = (el, opts) => { if (typeof tippy !== 'function') return false; tips.push(tippy(el, { touch: 'hold', ...opts })); return true; };
      const clearTips = () => { tips.splice(0).forEach((t) => { try { t.destroy(); } catch {} }); };

      // The views redraw inside the open popup, so the skill-name pass (didRender) runs again after each one.
      const names = () => { try { if (Swal.isVisible()) popupDidRender?.(Swal.getPopup()); } catch {} };
      // The title names the slot while picking (build .64, user layout): "Jel's gear – [icon] Feet".
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const baseTitle = esc(templateLangString('MOD_WF_GEAR_TITLE', { name: folk.name }));
      let title = baseTitle;
      const setTitle = (html) => {
        title = html;
        try { const el = Swal.isVisible() ? Swal.getTitle() : null; if (el !== null && el.innerHTML !== html) el.innerHTML = html; } catch {}
      };
      const showGrid = () => {
        setTitle(baseTitle);
        clearTips();
        root.replaceChildren();
        const head = document.createElement('small');
        head.className = 'wf-subtle d-block text-center wf-gear-head';
        head.textContent = `${hiring.roleName(folk.tier)} · ${skill === undefined ? getLangString('MOD_WF_UNASSIGNED') : hiring.skillName(skill)} · ${getLangString('MOD_WF_GEAR_HINT')}`;
        root.append(head);
        // Laid out like the character's equipment (build .65, user request): every slot at the game's own grid
        // position; slots this tier hasn't opened yet greyed out in place, a tap saying which tier opens them.
        const grid = document.createElement('div');
        grid.className = 'wf-slot-grid';
        const lockedLine = document.createElement('div');
        lockedLine.className = 'wf-slot-locked-line d-none';
        const layout = rules.slotLayout(folk.tier, expansions())
          .map((l) => ({ ...l, slot: slotObj(l.id) }))
          .filter((l) => l.slot !== undefined);
        const pos = (l) => l.slot.gridPosition ?? { col: 0, row: 0 };
        const minCol = Math.min(...layout.map((l) => pos(l).col));
        const rows = [...new Set(layout.map((l) => pos(l).row))].sort((x, y) => x - y);
        const tiles = new Map(api.slotTiles(folk).map((t) => [t.id, t]));
        for (const l of layout) {
          const b = document.createElement('button');
          b.type = 'button';
          b.style.gridColumn = `${pos(l).col - minCol + 1}`;
          b.style.gridRow = `${rows.indexOf(pos(l).row) + 1}`;
          const img = document.createElement('img');
          img.alt = '';
          b.append(img);
          if (!l.open) {
            const reason = templateLangString('MOD_WF_GEAR_LOCKED', { slot: l.slot.emptyName, role: hiring.roleName(l.opensAt) });
            b.className = 'btn btn-sm wf-slot wf-slot-locked';
            b.setAttribute('aria-disabled', 'true');
            b.setAttribute('aria-label', reason);
            img.src = l.slot.emptyMedia;
            if (!tip(b, { content: reason, placement: 'top', interactive: false })) b.title = reason;
            b.onclick = () => { lockedLine.textContent = reason; lockedLine.classList.remove('d-none'); };
            grid.append(b);
            continue;
          }
          const slot = tiles.get(l.id);
          b.className = `btn btn-sm wf-slot${slot.empty ? ' btn-outline-info' : ' btn-info'}`;
          img.src = slot.media;
          b.setAttribute('aria-label', slot.empty ? slot.name : `${slot.name}${slot.qty > 0 ? ` ×${slot.qty}` : ''}`);
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
          const e = api.entry(folk, slot.id);
          if (!tip(b, { content: e === undefined ? slot.name : createItemInformationTooltip(e.item), allowHTML: true, placement: 'top', interactive: false })) b.title = slot.name;
          b.onclick = () => showPicker(slot.id);
          grid.append(b);
        }
        root.append(grid, lockedLine);
        // A worn item that ran out of charges does nothing: say so in the window, not only on the card's tooltip.
        const out = api.summary(folk).out;
        if (out.length > 0) {
          const warn = document.createElement('div');
          warn.className = 'text-warning font-w600 text-center mt-2';
          warn.textContent = templateLangString('MOD_WF_GEAR_OUT', { items: out.map((t) => t.name).join(', ') });
          root.append(warn);
        }
        // The bonuses fold behind a toggle at the bottom (build .65, user request), closed by default; the choice
        // is a per-browser convenience.
        const STATS_KEY = 'wf-gear-stats-open';
        let statsOpen = false;
        try { statsOpen = localStorage.getItem(STATS_KEY) === '1'; } catch {}
        const lines = api.summaryLines(folk, skill);
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'wf-stats-toggle';
        const summary = document.createElement('div');
        summary.className = 'wf-gear-summary';
        summary.id = `wf-gear-stats-${String(folk.id).replace(/[^A-Za-z0-9_-]/g, '_')}`;
        toggle.setAttribute('aria-controls', summary.id);
        const drawToggle = () => {
          toggle.textContent = `${statsOpen ? '▾' : '▸'} ${templateLangString('MOD_WF_GEAR_STATS', { count: `${lines.length}` })}`;
          toggle.setAttribute('aria-expanded', statsOpen ? 'true' : 'false');
          summary.classList.toggle('d-none', !statsOpen);
        };
        toggle.onclick = () => {
          statsOpen = !statsOpen;
          try { localStorage.setItem(STATS_KEY, statsOpen ? '1' : '0'); } catch {}
          drawToggle();
        };
        if (lines.length === 0) {
          const s = document.createElement('div');
          s.className = 'wf-subtle';
          s.textContent = getLangString('MOD_WF_LOADOUT_EMPTY');
          summary.append(s);
        }
        for (const line of lines) {
          const s = document.createElement('div');
          s.className = line.isNegative ? 'text-danger' : 'text-success';
          s.textContent = line.text;
          summary.append(s);
        }
        drawToggle();
        root.append(toggle, summary);
        names();
      };

      const showPicker = (slotId, { all = false } = {}) => {
        const slot = slotObj(slotId);
        if (slot === undefined) return;
        clearTips();
        root.replaceChildren();
        const current = api.entry(folk, slotId);
        // Order (build .55, .62, .64): the popup title names the slot → current item, centred → "Showing …" line → quantity
        // with its All preset → item grid on a grey band (when empty, the reason in its middle) → picked item → one
        // row: Back, green Equip, Show all with its "?" (build .71) → the explanation under it.
        // A tap only selects; Equip commits, so a stray tap on a phone moves nothing out of the bank.
        setTitle(`${baseTitle} – <span class="wf-title-slot"><img src="${slot.emptyMedia}" alt="">${esc(slot.emptyName)}</span>`);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn btn-outline-info wf-picker-back';
        back.textContent = `← ${getLangString('MOD_WF_BUTTON_BACK')}`;
        back.onclick = showGrid;
        const showAll = document.createElement('input');
        showAll.type = 'checkbox';
        showAll.className = 'custom-control-input';
        showAll.id = `wf-show-all-${slotId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
        showAll.checked = all;
        const hint = document.createElement('small');
        hint.className = 'wf-block text-center mb-2'; // not d-block: it outranks the d-none that hides this line (build .63)
        if (current !== undefined) {
          const cur = document.createElement('div');
          cur.className = 'mb-2 d-flex align-items-center justify-content-center';
          // The name in its own span: as a bare flex text run it lost its spaces around a skill-name chip, and an
          // item name is not a skill mention ("Meteorite Woodcutting Amulet", build .67).
          cur.innerHTML = `<img class="skill-icon-xs mr-1" src="${current.item.media}" alt=""><span data-no-skill-names>${esc(current.item.name)}${slot.allowQuantity ? ` ×${numberWithCommas(current.qty)}` : ''}</span>`;
          const un = document.createElement('button');
          un.type = 'button';
          un.className = 'btn btn-sm btn-outline-danger ml-2';
          un.textContent = getLangString('MOD_WF_BUTTON_UNEQUIP');
          // Stay on this slot's picker after Unequip, Show all as it was, so the next item can go straight in (build .69).
          un.onclick = () => { if (api.unequip(folk, slotId)) showPicker(slotId, { all: showAll.checked }); };
          cur.append(un);
          root.append(cur);
        }
        root.append(hint);

        let picked;
        let qtyInput;
        let allQty;
        if (slot.allowQuantity) {
          const row = document.createElement('div');
          row.className = 'd-flex align-items-center justify-content-center flex-wrap wf-picker-qty-row mb-2';
          const qtyLabel = document.createElement('span');
          qtyLabel.className = 'font-w600';
          qtyLabel.textContent = getLangString('MOD_WF_PICKER_QTY');
          qtyInput = document.createElement('input');
          qtyInput.type = 'number';
          qtyInput.min = '1';
          qtyInput.inputMode = 'numeric';
          qtyInput.value = '1';
          qtyInput.className = 'form-control wf-picker-qty';
          qtyInput.setAttribute('aria-label', getLangString('MOD_WF_PICKER_QTY'));
          allQty = document.createElement('button');
          allQty.type = 'button';
          allQty.className = 'btn btn-sm btn-info';
          allQty.textContent = getLangString('MOD_WF_RESERVE_QUICK_ALL');
          allQty.disabled = true;
          allQty.onclick = () => { if (picked !== undefined) qtyInput.value = `${game.bank.getQty(picked)}`; };
          row.append(qtyLabel, qtyInput, allQty);
          root.append(row);
        }

        const grid = document.createElement('div');
        grid.className = 'wf-picker-grid mb-2';
        const pickedLine = document.createElement('div');
        pickedLine.className = 'wf-picked text-center mb-2';
        const equip = document.createElement('button');
        equip.type = 'button';
        equip.className = 'btn btn-success wf-picker-equip';
        equip.textContent = getLangString('MOD_WF_BUTTON_EQUIP');
        equip.onclick = () => {
          if (picked !== undefined && api.equip(folk, slotId, picked, qtyInput === undefined ? 1 : qtyInput.value)) showGrid();
        };
        const select = (item, button) => {
          picked = item;
          grid.querySelectorAll('.wf-picker-item').forEach((b) => {
            const on = b === button;
            b.classList.toggle('btn-info', on);
            b.classList.toggle('btn-outline-info', !on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          refreshPicked();
        };
        // Your levels gate what a Folk may wear: such items stay listed (greyed, last) and say what they need,
        // instead of Equip ending in the game's level toast (regression pass, build .83).
        const needs = (item) => {
          if (game.checkRequirements(item.equipRequirements, false)) return null;
          const levels = (item.equipRequirements ?? [])
            .filter((r) => r.type === 'SkillLevel' && r.skill !== undefined && r.skill.level < r.level)
            .map((r) => `${hiring.skillName(r.skill)} ${r.level}`);
          return levels.length > 0 ? levels.join(', ') : getLangString('MOD_WF_PICKER_LOCKED_OTHER');
        };
        const refreshPicked = () => {
          const missing = picked === undefined ? null : needs(picked);
          equip.disabled = picked === undefined || missing !== null;
          if (allQty !== undefined) allQty.disabled = picked === undefined || missing !== null;
          pickedLine.classList.toggle('font-w600', picked !== undefined);
          pickedLine.classList.toggle('text-warning', missing !== null);
          pickedLine.textContent = picked === undefined ? getLangString('MOD_WF_PICKER_PICK')
            : missing !== null ? templateLangString('MOD_WF_PICKER_LOCKED', { item: picked.name, needs: missing })
              : templateLangString('MOD_WF_PICKER_PICKED', { item: picked.name, count: numberWithCommas(game.bank.getQty(picked)) });
        };
        const fill = () => {
          clearTips();
          grid.replaceChildren();
          picked = undefined;
          refreshPicked();
          const narrowed = !showAll.checked && skill !== undefined;
          const all = api.candidates(folk, slotId, { showAll: showAll.checked });
          const items = [...all.filter((it) => needs(it) === null), ...all.filter((it) => needs(it) !== null)];
          pickedLine.classList.toggle('d-none', items.length === 0);
          equip.classList.toggle('d-none', items.length === 0);
          hint.classList.toggle('d-none', items.length === 0);
          grid.classList.toggle('wf-picker-grid-empty', items.length === 0);
          if (items.length === 0) {
            // The reason fills the empty grid, centred both ways (build .62, user layout).
            const none = document.createElement('div');
            none.className = 'wf-picker-none';
            none.textContent = narrowed ? templateLangString('MOD_WF_PICKER_NONE_FOR_SKILL', { skill: hiring.skillName(skill) }) : getLangString('MOD_WF_PICKER_NONE');
            grid.append(none);
            return;
          }
          hint.textContent = narrowed ? templateLangString('MOD_WF_PICKER_FOR_SKILL', { skill: hiring.skillName(skill) }) : getLangString('MOD_WF_PICKER_ALL');
          items.forEach((item) => {
            const count = numberWithCommas(game.bank.getQty(item));
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `btn btn-sm btn-outline-info wf-picker-item${needs(item) !== null ? ' wf-picker-locked' : ''}`;
            b.innerHTML = `<img src="${item.media}" alt=""><small>${count}</small>`;
            b.setAttribute('aria-label', `${item.name} ×${count}`);
            b.setAttribute('aria-pressed', 'false');
            tip(b, { content: createItemInformationTooltip(item), allowHTML: true, placement: 'top', interactive: false });
            b.onclick = () => select(item, b);
            grid.append(b);
          });
        };
        showAll.addEventListener('change', () => { fill(); names(); });
        fill();
        root.append(grid, pickedLine);
        const controls = document.createElement('div');
        controls.className = 'wf-picker-controls';
        const row = document.createElement('div');
        row.className = 'wf-picker-foot';
        // One line (build .71): Back left, Equip in the middle, Show all and its "?" right in a frame that only lines
        // them up with the buttons (not a button itself). Phones: Equip on top, Back and Show all under it.
        // Without Show all (no skill), Equip fills the rest of the line after Back, phones too (build .72).
        row.append(back, equip);
        row.classList.toggle('wf-picker-foot-solo', skill === undefined);
        controls.append(row);
        root.append(controls);
        // Show all, with its explanation behind "?". Inline, not a second popup: that would close this one.
        if (skill !== undefined) {
          const right = document.createElement('div');
          right.className = 'wf-picker-showall';
          const box = document.createElement('div');
          box.className = 'custom-control custom-checkbox';
          const showAllLabel = document.createElement('label');
          showAllLabel.className = 'custom-control-label pointer-enabled font-w600';
          showAllLabel.htmlFor = showAll.id;
          showAllLabel.textContent = getLangString('MOD_WF_PICKER_SHOW_ALL');
          box.append(showAll, showAllLabel);
          const desc = document.createElement('small');
          // Not d-block: Bootstrap's d-block outranks d-none, so the text never hid and "?" did nothing (build .63).
          desc.className = 'wf-picker-desc mt-2 d-none';
          desc.id = `${showAll.id}-desc`;
          desc.textContent = templateLangString('MOD_WF_PICKER_SHOW_ALL_DESC', { skill: hiring.skillName(skill) });
          const help = document.createElement('button');
          help.type = 'button';
          help.className = 'btn btn-sm wf-help ml-2';
          help.innerHTML = '<i class="fa fa-question-circle"></i>';
          help.setAttribute('aria-label', getLangString('MOD_WF_HELP_BUTTON'));
          help.setAttribute('aria-expanded', 'false');
          help.setAttribute('aria-controls', desc.id);
          help.onclick = () => {
            const open = desc.classList.toggle('d-none') === false;
            help.setAttribute('aria-expanded', open ? 'true' : 'false');
          };
          right.append(box, help);
          row.append(right);
          controls.append(desc);
        }
        names();
      };

      if (initialSlotId !== undefined) showPicker(initialSlotId);
      else showGrid();
      SwalLocale.fire({
        didRender: popupDidRender,
        title,
        html: root,
        imageUrl: hiring.portrait(folk.tier),
        imageWidth: 48,
        imageHeight: 48,
        showConfirmButton: false,
        showCloseButton: true,
        willClose: clearTips,
        customClass: (typeof createSwalCustomClass === 'function' ? createSwalCustomClass({ popup: 'wf-ui' }) : { popup: 'wf-ui' }),
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
