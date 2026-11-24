// A Folk's recipe queue in the game (round 5): up to three steps in its skill, each a recipe with a count or "until
// inputs run out" (the rules are in queue-model.mjs). Steps are added from the Worker box's Queue popup and shown on
// the card, each removable. What the Folk makes of the current step's products counts towards it (folkMade). A step
// done switches the skill to the next recipe in place and the Folk goes on; the last step done leaves it on that
// recipe. A step that can't start stops the Folk with its reason, and the queue waits on it. Chains: the current
// step's products that a later step uses go to the Folk's own stock as far as its room holds (room.mjs asks `route`
// inside the action), and the later step reads that stock first, then your bank.
//
// Only recipe skills that pick one recipe at a time (Smithing, Fletching, Crafting, Runecrafting, Herblore,
// Summoning): their next action reads the selected recipe, so the switch needs no stop and works offline. The game's
// own recipe click is never used for it (on a phone it scrolls the page). Alt. Magic is left out: a spell needs its
// item too. Game-facing.

const NOTICE = 'worker_folks:queue';

export function install(ctx, { swalClass, getHiring, model, popupDidRender, titleName, tips, log }) {
  let hiring;
  const room = () => hiring.room;

  // ---- Recipes ----------------------------------------------------------------

  /** Whether this skill's recipe can be queued: one picked recipe, read on every action. */
  const queueable = (skill) => {
    if (skill === undefined || skill === null) return false;
    if (typeof ArtisanSkill !== 'function' || !(skill instanceof ArtisanSkill)) return false;
    if (typeof AltMagic === 'function' && skill instanceof AltMagic) return false;
    return typeof skill.actions?.getObjectByID === 'function';
  };
  const recipeOf = (skill, id) => {
    try { return skill.actions.getObjectByID(id); } catch { return undefined; }
  };
  /** The items a recipe makes: its product, or every tier of a potion. */
  const productIds = (recipe) => {
    const ids = [];
    if (typeof recipe?.product?.id === 'string') ids.push(recipe.product.id);
    (recipe?.potions ?? []).forEach((p) => { if (typeof p?.id === 'string') ids.push(p.id); });
    return ids;
  };
  /** The item that stands for a recipe (its icon and tooltip). */
  const itemOf = (recipe) => recipe?.product ?? recipe?.potions?.[0];
  const nameOf = (recipe) => {
    if (recipe === undefined) return '?';
    try {
      if (Array.isArray(recipe.potions) && typeof recipe.name === 'string') return recipe.name;
      return itemOf(recipe)?.name ?? recipe.name ?? recipe.id;
    } catch { return recipe.id; }
  };
  const mediaOf = (recipe) => itemOf(recipe)?.media ?? recipe?.media ?? '';
  const inputIdsOf = (recipe) => (recipe?.itemCosts ?? []).map(({ item }) => item?.id).filter((id) => typeof id === 'string');
  /** Your levels allow it, and a Summoning tablet's mark is found. */
  const canRun = (skill, recipe) => {
    if (recipe === undefined) return false;
    if ((recipe.level ?? 1) > skill.level || (recipe.abyssalLevel ?? 0) > (skill.abyssalLevel ?? 0)) return false;
    if (typeof skill.getMarkCount === 'function' && skill.getMarkCount(recipe) <= 0) return false;
    return true;
  };
  /** The recipes the popup offers: the skill's realm on the page, the ones you can run. */
  const choices = (skill) => {
    const realm = skill.selectedRecipe?.realm ?? skill.currentRealm;
    return skill.actions.allObjects.filter((r) => (realm === undefined || r.realm === undefined || r.realm === realm) && canRun(skill, r));
  };

  /** The three fields the game's own recipe click sets, without its stop and its scroll. */
  const select = (skill, recipe) => {
    skill.selectedRecipe = recipe;
    skill.selectedRecipeInRealm?.set?.(recipe.realm, recipe);
    if (skill.renderQueue !== undefined) {
      skill.renderQueue.selectedRecipe = true;
      skill.renderQueue.quantities = true;
      skill.renderQueue.recipeInfo = true;
      skill.renderQueue.progressBar = true;
    }
  };
  /** Whether the Folk has the inputs of one action of the selected recipe now (its stock first, then your bank). */
  const covered = (folk, skill) => {
    try {
      return hiring.asFolk(folk, skill, () => skill.getCurrentRecipeCosts().checkIfOwned());
    } catch { return false; }
  };
  /** One action's inputs of `recipe` as the Folk, read with that recipe selected for the moment. */
  const inputsFor = (folk, skill, recipe) => {
    const before = skill.selectedRecipe;
    skill.selectedRecipe = recipe;
    try {
      return room()?.inputsOf(folk) ?? { perAction: [], intervalMs: 0 };
    } finally {
      skill.selectedRecipe = before;
    }
  };

  // ---- The queue --------------------------------------------------------------

  const queueOf = (folk) => (Array.isArray(folk?.queue) ? folk.queue : []);
  const skillFor = (folk) => {
    const skill = folk === undefined || folk.job !== null ? undefined : hiring.skillOf(folk);
    return queueable(skill) ? skill : undefined;
  };
  const changed = (folk) => {
    hiring.markCard(folk);
    hiring.renderQueue.folks = true;
    hiring.events.emit('queueChanged', { folk });
  };
  const online = () => game._isInOnlineLoop === true;
  const info = (text, media) => { if (online()) game.notifications.createInfoNotification(NOTICE, text, media ?? hiring.media); };
  const stopWith = (folk, skill, text) => {
    if (hiring.delegated.has(skill)) hiring.forceStop(skill, text);
    else hiring.noteStop(folk, skill, text);
  };
  const waitText = (recipe) => templateLangString('MOD_WF_QUEUE_STOP_INPUTS', { recipe: nameOf(recipe) });

  /**
   * Puts the Folk on its queue's first step: the recipe is selected and the Folk goes on with it (a running Folk on
   * its next action, an idle one is started). A step it can't run stops it with the reason, and the queue waits.
   */
  const startHead = (folk, skill, { start = true } = {}) => {
    const step = model.headOf(queueOf(folk));
    if (step === undefined) return;
    const recipe = recipeOf(skill, step.recipeId);
    if (recipe === undefined) {
      // A recipe that is gone (its mod left): the step goes, the next one is tried.
      folk.queue = model.advance(queueOf(folk));
      log(`queue: ${folk.name} dropped ${step.recipeId} (no such recipe)`);
      changed(folk);
      startHead(folk, skill, { start });
      return;
    }
    if (!canRun(skill, recipe)) {
      stopWith(folk, skill, templateLangString('MOD_WF_QUEUE_STOP_LEVEL', { recipe: nameOf(recipe) }));
      return;
    }
    const running = hiring.delegated.has(skill) && skill.isActive;
    if (skill.selectedRecipe !== recipe) select(skill, recipe);
    if (!covered(folk, skill)) {
      stopWith(folk, skill, waitText(recipe));
      return;
    }
    if (running) {
      // The timer was started for the last recipe: started again for this one, as the Folk (acting.mjs).
      skill.startActionTimer?.();
      return;
    }
    if (!start || skill.isActive) return;
    // Stopped inside its last action (inputs ran out): the roster lets it go now rather than on the next tick.
    if (hiring.delegated.has(skill)) hiring.release(skill);
    const why = room()?.startFolk(folk) ?? 'notStarted';
    if (why === 'notStarted') hiring.noteStop(folk, skill, waitText(recipe));
  };

  /** The step is done: the next one starts, or the queue ends and the Folk stays on its recipe. */
  const next = (folk, skill, endedByInputs) => {
    const done = model.headOf(queueOf(folk));
    const doneRecipe = done === undefined ? undefined : recipeOf(skill, done.recipeId);
    folk.queue = model.advance(queueOf(folk));
    changed(folk);
    const head = model.headOf(folk.queue);
    if (head === undefined) {
      info(templateLangString(endedByInputs ? 'MOD_WF_QUEUE_END_OUT_NOTICE' : 'MOD_WF_QUEUE_END_NOTICE', { name: folk.name, recipe: nameOf(doneRecipe) }), mediaOf(doneRecipe));
      log(`queue: ${folk.name} finished its queue on ${done?.recipeId}`);
      return;
    }
    const recipe = recipeOf(skill, head.recipeId);
    info(templateLangString('MOD_WF_QUEUE_NEXT_NOTICE', { name: folk.name, done: nameOf(doneRecipe), next: nameOf(recipe) }), mediaOf(recipe));
    log(`queue: ${folk.name} ${done?.recipeId} done → ${head.recipeId}`);
    startHead(folk, skill);
  };

  /** After each of the Folk's actions: a step that made its count, or ran out of inputs ("until inputs run out"). */
  const afterAction = ({ skill, folk }) => {
    if (folk === undefined || queueOf(folk).length === 0 || skillFor(folk) !== skill) return;
    const head = model.headOf(queueOf(folk));
    const recipe = recipeOf(skill, head.recipeId);
    if (recipe !== undefined && skill.selectedRecipe !== recipe) return; // switched elsewhere; the player's click clears
    if (model.stepDone(head)) { next(folk, skill, false); return; }
    // The game stops a recipe at the end of the action that left too little for the next one.
    if (skill.isActive || covered(folk, skill)) return;
    if (head.count === null) next(folk, skill, true);
    else hiring.noteStop(folk, skill, waitText(recipe), () => !covered(folk, skill));
  };

  /** What the Folk made counts towards its step (a commission's goods are the town's, not yours). */
  const onMade = ({ folk, skill, item, quantity, town }) => {
    if (town === true || folk === undefined || queueOf(folk).length === 0 || skillFor(folk) !== skill) return;
    const head = model.headOf(queueOf(folk));
    if (model.countMade(queueOf(folk), item?.id, quantity, productIds(recipeOf(skill, head.recipeId))) > 0) hiring.markCard(folk);
  };

  const clear = (folk, key) => {
    if (queueOf(folk).length === 0) return;
    folk.queue = [];
    changed(folk);
    if (key !== undefined) info(templateLangString(key, { name: folk.name }));
  };

  const api = {
    queueable,
    // For crew plans: a recipe by id, whether your levels allow it, its name, and selecting it without the game's stop.
    recipeOf,
    canRun,
    nameOf,
    select,
    /** The Folk's skill when its recipe can be queued, else undefined. */
    skillFor,
    stepsOf: (folk) => queueOf(folk).map((s) => ({ ...s })),
    /** Puts these steps in place as they are (a saved crew plan's), from nothing made; the caller selects the recipe. */
    setSteps(folk, steps) {
      if (skillFor(folk) === undefined) return;
      folk.queue = steps.map((s) => ({ ...s, made: 0 }));
      changed(folk);
    },
    /**
     * Adds a step: { ok: true } or { ok: false, why } ('full' | 'count' | 'recipe' | 'skill' | 'level'). The first step
     * puts the Folk on its recipe at once (a running Folk on its next action; an idle one waits for its start).
     */
    add(folk, recipeId, count) {
      const skill = skillFor(folk);
      if (skill === undefined) return { ok: false, why: 'skill' };
      const recipe = recipeOf(skill, recipeId);
      if (recipe === undefined) return { ok: false, why: 'recipe' };
      if (!canRun(skill, recipe)) return { ok: false, why: 'level' };
      const r = model.addStep(queueOf(folk), recipeId, count);
      if (r.error !== undefined) return { ok: false, why: r.error };
      const first = queueOf(folk).length === 0;
      folk.queue = r.queue;
      changed(folk);
      // A running Folk changes over on its next action; an idle one waits for its start. Already on it: nothing to do.
      if (first && skill.selectedRecipe !== recipe) {
        if (hiring.delegated.has(skill) && skill.isActive) startHead(folk, skill);
        else select(skill, recipe);
      }
      log(`queue: ${folk.name} + ${recipeId} ×${count ?? 'out'}`);
      return { ok: true };
    },
    /** Removes step `index`; removing the first moves the Folk to the next step at once. */
    remove(folk, index) {
      const before = queueOf(folk);
      if (!(index >= 0 && index < before.length)) return false;
      folk.queue = index === 0 ? model.advance(before) : model.removeStep(before, index);
      changed(folk);
      const skill = skillFor(folk);
      if (index === 0 && skill !== undefined && folk.queue.length > 0) startHead(folk, skill, { start: false });
      return true;
    },
    clear,
    /** Every item a step of the Folk's queue uses: its stock keeps them when the room is collected. */
    inputIds(folk) {
      const skill = skillFor(folk);
      if (skill === undefined) return [];
      return [...new Set(queueOf(folk).flatMap((s) => inputIdsOf(recipeOf(skill, s.recipeId))))];
    },
    /**
     * A product of the Folk's step on its way to the bank, inside its action (room.mjs): what a later step uses goes
     * to its stock as far as its room holds. Returns the quantity kept there.
     */
    route(acting, item, quantity) {
      const folk = acting?.folk;
      if (folk?.room === undefined || queueOf(folk).length < 2 || !Number.isInteger(quantity) || quantity <= 0) return 0;
      const skill = acting.skill;
      if (!queueable(skill) || hiring.skillOf(folk) !== skill) return 0;
      const steps = queueOf(folk).map((s) => recipeOf(skill, s.recipeId));
      if (steps[0] === undefined) return 0;
      const later = steps.slice(1).filter((r) => r !== undefined);
      if (!model.chainItems(productIds(steps[0]), later.map(inputIdsOf)).includes(item.id)) return 0;
      const user = later.find((r) => inputIdsOf(r).includes(item.id));
      const { perAction, intervalMs } = inputsFor(folk, skill, user);
      const per = perAction.find((p) => p.id === item.id)?.qty ?? 0;
      const unitMs = per > 0 && intervalMs > 0 ? intervalMs / per : 0;
      const kept = model.roomFor(quantity, room().capMs(folk) - room().usedMs(folk), unitMs);
      if (kept > 0) room().putStock(folk, item.id, kept, kept * unitMs);
      return kept;
    },
    /** The card's rows: null without a queue, else { key, fill(el) }. */
    cardView(folk) {
      const steps = queueOf(folk);
      const skill = skillFor(folk);
      if (steps.length === 0 || skill === undefined) return null;
      const rows = steps.map((s, i) => {
        const recipe = recipeOf(skill, s.recipeId);
        const p = model.progressOf(s);
        const amount = i === 0
          ? (p.count === null ? templateLangString('MOD_WF_QUEUE_MADE_OUT', { made: numberWithCommas(p.made) })
            : templateLangString('MOD_WF_QUEUE_PROGRESS', { made: numberWithCommas(p.made), count: numberWithCommas(p.count) }))
          : (p.count === null ? getLangString('MOD_WF_QUEUE_OUT') : templateLangString('MOD_WF_QUEUE_TO_MAKE', { count: numberWithCommas(p.count) }));
        return { i, recipe, name: nameOf(recipe), amount };
      });
      const key = JSON.stringify(rows.map((r) => [r.recipe?.id, r.name, r.amount]));
      return {
        key,
        fill(el) {
          el.querySelectorAll('[data-wf-tip]').forEach((t) => tips?.clear(t));
          el.replaceChildren();
          rows.forEach((r) => {
            const row = document.createElement('div');
            row.className = `wf-queue-row${r.i === 0 ? ' wf-queue-now' : ''}`;
            const img = document.createElement('img');
            img.className = 'wf-queue-icon';
            img.alt = '';
            img.src = mediaOf(r.recipe);
            const item = itemOf(r.recipe);
            if (item !== undefined) tips?.set(img, [{ item }]);
            const text = document.createElement('div');
            text.className = 'wf-queue-text';
            const label = document.createElement('span');
            label.className = 'font-w600';
            label.textContent = templateLangString(r.i === 0 ? 'MOD_WF_QUEUE_NOW' : 'MOD_WF_QUEUE_THEN', { recipe: r.name });
            const amount = document.createElement('span');
            amount.className = 'd-block wf-subtle';
            amount.textContent = r.amount;
            text.append(label, amount);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-sm btn-outline-danger wf-queue-remove';
            remove.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
            remove.setAttribute('aria-label', templateLangString('MOD_WF_QUEUE_REMOVE_LABEL', { step: `${r.i + 1}`, recipe: r.name }));
            remove.onclick = () => api.remove(folk, r.i);
            row.append(img, text, remove);
            el.append(row);
          });
        },
      };
    },
    /** The Worker box's button: { label } while a Folk holds a skill whose recipe can be queued, else null. */
    buttonView(skill) {
      const folk = hiring.crew.bySkill(skill.id);
      if (folk === undefined || !queueable(skill) || folk.job !== null) return null;
      return { label: templateLangString('MOD_WF_QUEUE_BUTTON', { count: `${queueOf(folk).length}`, max: `${model.QUEUE_MAX}` }), folk };
    },
    open: (folk) => openPopup(folk),
  };

  // ---- The popup ----------------------------------------------------------------

  const openPopup = (folk) => {
    const skill = skillFor(folk);
    if (skill === undefined) return;
    const root = document.createElement('div');
    root.className = 'text-left wf-queue-pop';
    const tipped = [];
    const tip = (el, content, opts) => { tips?.set(el, content, opts); tipped.push(el); };
    const itemTip = (el, item, extra) => tip(el, [{ item }], {
      onShow: (inst) => { inst.setContent(tips.box([{ gameItem: item }, ...extra()])); },
    });
    const clearTips = () => { tipped.splice(0).forEach((el) => tips?.clear(el)); };
    const names = () => { try { if (Swal.isVisible()) popupDidRender?.(Swal.getPopup()); } catch {} };
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const title = esc(templateLangString('MOD_WF_QUEUE_TITLE', { name: '\u0000' })).replace('\u0000', titleName ? titleName(folk.name) : esc(folk.name));

    // The count and its "until inputs run out" switch stay through redraws.
    let countText = `${model.DEFAULT_COUNT}`;
    let untilOut = false;
    let picked;

    const draw = () => {
      clearTips();
      root.replaceChildren();
      const head = document.createElement('small');
      head.className = 'wf-subtle d-block text-center wf-gear-head';
      head.textContent = `${hiring.roleName(folk.tier)} · ${hiring.skillName(skill)}`;
      const hint = document.createElement('span');
      hint.className = 'd-block';
      hint.textContent = getLangString('MOD_WF_QUEUE_HINT');
      head.append(hint);
      root.append(head);

      // The steps: what it works now first, each with its remove button.
      const list = document.createElement('div');
      list.className = 'wf-traits mb-3';
      // Recipe names hold skill names ("Melee Strength Potion"): no skill icon inside them.
      list.dataset.noSkillNames = '';
      const steps = queueOf(folk);
      if (steps.length === 0) {
        const none = document.createElement('div');
        none.className = 'wf-trait-row wf-trait-empty';
        none.textContent = getLangString('MOD_WF_QUEUE_EMPTY');
        list.append(none);
      }
      steps.forEach((s, i) => {
        const recipe = recipeOf(skill, s.recipeId);
        const p = model.progressOf(s);
        const row = document.createElement('div');
        row.className = 'wf-trait-row';
        const img = document.createElement('img');
        img.className = 'wf-trait-icon';
        img.alt = '';
        img.src = mediaOf(recipe);
        const item = itemOf(recipe);
        if (item !== undefined) tip(img, [{ item }]);
        const text = document.createElement('div');
        text.className = 'wf-min0';
        const name = document.createElement('div');
        name.className = 'font-w600';
        name.textContent = templateLangString(i === 0 ? 'MOD_WF_QUEUE_NOW' : 'MOD_WF_QUEUE_THEN', { recipe: nameOf(recipe) });
        const amount = document.createElement('small');
        amount.className = 'd-block wf-subtle';
        amount.textContent = i === 0
          ? (p.count === null ? templateLangString('MOD_WF_QUEUE_MADE_OUT', { made: numberWithCommas(p.made) })
            : templateLangString('MOD_WF_QUEUE_PROGRESS', { made: numberWithCommas(p.made), count: numberWithCommas(p.count) }))
          : (p.count === null ? getLangString('MOD_WF_QUEUE_OUT') : templateLangString('MOD_WF_QUEUE_TO_MAKE', { count: numberWithCommas(p.count) }));
        text.append(name, amount);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-sm btn-outline-danger';
        remove.textContent = getLangString('MOD_WF_QUEUE_REMOVE');
        remove.setAttribute('aria-label', templateLangString('MOD_WF_QUEUE_REMOVE_LABEL', { step: `${i + 1}`, recipe: nameOf(recipe) }));
        remove.onclick = () => { api.remove(folk, i); draw(); };
        row.append(img, text, remove);
        list.append(row);
      });
      root.append(list);

      if (steps.length >= model.QUEUE_MAX) {
        const full = document.createElement('div');
        full.className = 'wf-picked text-center';
        full.textContent = templateLangString('MOD_WF_QUEUE_FULL', { max: `${model.QUEUE_MAX}` });
        root.append(full);
        names();
        return;
      }

      // How many: a count, or until the inputs run out.
      const row = document.createElement('div');
      row.className = 'd-flex align-items-center justify-content-center flex-wrap wf-picker-qty-row mb-2';
      const qtyLabel = document.createElement('span');
      qtyLabel.className = 'font-w600';
      qtyLabel.textContent = getLangString('MOD_WF_QUEUE_COUNT');
      const qty = document.createElement('input');
      // Text, not a number field: that one reports "" for what it can't read.
      qty.type = 'text';
      qty.inputMode = 'numeric';
      qty.className = 'form-control wf-picker-qty';
      qty.value = countText;
      qty.setAttribute('aria-label', getLangString('MOD_WF_QUEUE_COUNT'));
      const out = document.createElement('button');
      out.type = 'button';
      const markOut = () => {
        out.className = `btn btn-sm ${untilOut ? 'btn-info' : 'btn-outline-info'}`;
        out.setAttribute('aria-pressed', `${untilOut}`);
        qty.disabled = untilOut;
      };
      out.textContent = getLangString('MOD_WF_QUEUE_OUT');
      out.onclick = () => { untilOut = !untilOut; markOut(); refresh(); };
      qty.addEventListener('input', () => { countText = qty.value; refresh(); });
      markOut();
      row.append(qtyLabel, qty, out);
      root.append(row);

      const grid = document.createElement('div');
      grid.className = 'wf-picker-grid mb-2';
      const pickedLine = document.createElement('div');
      pickedLine.className = 'wf-picked text-center mb-2';
      pickedLine.dataset.noSkillNames = '';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-success wf-picker-equip';
      add.textContent = getLangString('MOD_WF_QUEUE_ADD');
      const amount = () => (untilOut ? { kind: 'out' } : model.countOf(countText));
      const refresh = () => {
        const a = amount();
        const bad = a.kind === 'bad';
        add.disabled = picked === undefined || bad;
        pickedLine.classList.toggle('font-w600', picked !== undefined || bad);
        pickedLine.classList.toggle('text-warning', bad);
        const step = `${steps.length + 1}`;
        pickedLine.textContent = bad ? templateLangString('MOD_WF_QUEUE_COUNT_BAD', { max: numberWithCommas(model.COUNT_MAX) })
          : picked === undefined ? getLangString('MOD_WF_QUEUE_PICK')
            : a.kind === 'out' ? templateLangString('MOD_WF_QUEUE_PICKED_OUT', { step, recipe: nameOf(picked) })
              : templateLangString('MOD_WF_QUEUE_PICKED', { step, recipe: nameOf(picked), count: numberWithCommas(a.qty) });
      };
      const recipes = choices(skill);
      grid.classList.toggle('wf-picker-grid-empty', recipes.length === 0);
      if (recipes.length === 0) {
        const none = document.createElement('div');
        none.className = 'wf-picker-none';
        none.textContent = templateLangString('MOD_WF_QUEUE_NONE', { skill: hiring.skillName(skill) });
        grid.append(none);
      }
      recipes.forEach((recipe) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn btn-sm ${picked === recipe ? 'btn-info' : 'btn-outline-info'} wf-picker-item`;
        const img = document.createElement('img');
        img.src = mediaOf(recipe);
        img.alt = '';
        b.append(img);
        b.setAttribute('aria-label', nameOf(recipe));
        b.setAttribute('aria-pressed', `${picked === recipe}`);
        const item = itemOf(recipe);
        if (item !== undefined) {
          itemTip(b, item, () => [{ text: templateLangString('MOD_WF_PICKER_IN_BANK', { count: numberWithCommas(game.bank.getQty(item)) }), cls: 'font-w600' }]);
        }
        b.onclick = () => {
          picked = recipe;
          grid.querySelectorAll('.wf-picker-item').forEach((o) => {
            const on = o === b;
            o.classList.toggle('btn-info', on);
            o.classList.toggle('btn-outline-info', !on);
            o.setAttribute('aria-pressed', `${on}`);
          });
          refresh();
        };
        grid.append(b);
      });
      add.onclick = () => {
        const a = amount();
        if (picked === undefined || a.kind === 'bad') return;
        const r = api.add(folk, picked.id, a.kind === 'out' ? null : a.qty);
        if (!r.ok) {
          game.notifications.createErrorNotification(NOTICE, getLangString(r.why === 'full' ? 'MOD_WF_QUEUE_FULL_SHORT' : 'MOD_WF_QUEUE_ADD_FAILED'));
          return;
        }
        picked = undefined;
        draw();
      };
      refresh();
      const foot = document.createElement('div');
      foot.className = 'wf-picker-controls text-center';
      foot.append(add);
      root.append(grid, pickedLine, foot);
      names();
    };

    draw();
    SwalLocale.fire({
      didRender: popupDidRender,
      title,
      html: root,
      imageUrl: hiring.portraitOf(folk),
      imageWidth: 64,
      imageHeight: 64,
      imageAlt: folk.name,
      showConfirmButton: false,
      showCloseButton: true,
      willClose: clearTips,
      customClass: swalClass({ popup: 'wf-ui wf-tool wf-pic wf-queue-popup' }),
    });
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.queue = api;
    hiring.events.on('folkMade', onMade);
    hiring.events.on('folkActionDone', afterAction);
    // A new skill (or none, or a job) ends the queue: its steps were recipes of the last one.
    hiring.events.on('folkAssigned', ({ folk, previous, skillId }) => { if (previous !== skillId) clear(folk); });
  });

  // Your own recipe click on the page while a Folk works through a queue: the queue goes, with a toast.
  if (typeof ArtisanSkill === 'function') {
    ctx.patch(ArtisanSkill, 'selectRecipeOnClick').after(function (_, recipe) {
      const folk = hiring?.crew.bySkill(this.id);
      const step = model.headOf(queueOf(folk));
      if (step === undefined || recipe?.id === step.recipeId) return;
      clear(folk, 'MOD_WF_QUEUE_CLEARED_NOTICE');
    });
  }

  // On load: each queue's skill on its first step's recipe (a step whose recipe is gone is dropped).
  ctx.onCharacterLoaded(() => {
    hiring.crew.all.forEach((folk) => {
      if (queueOf(folk).length === 0) return;
      const skill = skillFor(folk);
      if (skill === undefined) { folk.queue = []; return; }
      folk.queue = queueOf(folk).filter((s) => recipeOf(skill, s.recipeId) !== undefined);
      const head = model.headOf(folk.queue);
      if (head !== undefined) select(skill, recipeOf(skill, head.recipeId));
    });
  });

  return api;
}
