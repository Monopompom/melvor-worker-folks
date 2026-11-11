// Supply lines in the game (joint order round 3): a Folk sends what it makes to another Folk whose recipe uses it. The
// rules are in supply-model.mjs. The link is set on the supplier's card ("Supplies"); what it makes goes into the
// receiver's stock as far as its room holds (room.mjs routes it from Bank.addItem, offline too), the rest to your bank.
// The receiver takes its inputs from that stock first, then your bank (room.mjs), and gains one tier's step of Produce
// Rate while a supplier of it works. A receiver stopped for want of inputs starts again once a delivery covers an
// action. Another mod's staff guard is asked at a pick ({ action: 'link', folk, receiverId }). Game-facing.

export function install(ctx, { getHiring, model, log }) {
  let hiring;
  /** Folk id → item ids it made since it took its skill (what it makes when the skill's selection can't say). */
  const madeBy = new Map();
  /** Folk id → { at, value } of its recipe's inputs, read at most every 250 ms (each read runs the recipe as the Folk). */
  const inputsCache = new Map();
  /** Receivers a delivery may have unblocked: looked at after the tick (never inside the supplier's action). */
  const toWake = new Set();

  const unlocked = () => (hiring?.level ?? 0) >= model.UNLOCK_LEVEL;
  const room = () => hiring.room;
  const crew = () => hiring.crew;

  /** The recipe's inputs of a Folk now: { perAction: [{ id, qty }], intervalMs }. */
  const inputsOf = (folk) => {
    const now = Date.now();
    const kept = inputsCache.get(folk.id);
    if (kept !== undefined && now - kept.at < 250) return kept.value;
    const value = room()?.inputsOf?.(folk) ?? { perAction: [], intervalMs: 0 };
    inputsCache.set(folk.id, { at: now, value });
    return value;
  };
  const inputIds = (folk) => (folk.job !== null ? [] : inputsOf(folk).perAction.map(({ id }) => id));

  /** What the Folk's skill makes with its selection now, plus what it made since it took the skill. */
  const productsOf = (folk) => {
    const ids = new Set(madeBy.get(folk?.id) ?? []);
    const skill = folk === undefined || folk.job !== null ? undefined : hiring.skillOf(folk);
    if (skill === undefined) return [...ids];
    const add = (item) => { if (typeof item?.id === 'string') ids.add(item.id); };
    try {
      if (typeof Woodcutting !== 'undefined' && skill instanceof Woodcutting) [...(skill.activeTrees ?? [])].forEach((t) => add(t.product));
      else if (typeof Fishing !== 'undefined' && skill instanceof Fishing) add(skill.activeFish?.product);
      else if (typeof Mining !== 'undefined' && skill instanceof Mining) add(skill.activeRock?.product);
      else if (typeof Cooking !== 'undefined' && skill instanceof Cooking) {
        const recipe = skill.activeCookingCategory !== undefined
          ? skill.activeRecipe
          : skill.categories?.allObjects?.map((c) => skill.selectedRecipes?.get(c)).find((r) => r !== undefined);
        add(recipe?.product);
        add(recipe?.perfectItem);
      } else if (typeof AltMagic !== 'undefined' && skill instanceof AltMagic) {
        add(skill.selectedSmithingRecipe?.product);
        if (typeof skill.selectedSpell?.produces === 'object') add(skill.selectedSpell.produces);
      } else {
        const recipe = skill.activeRecipe ?? skill.selectedRecipe;
        add(recipe?.product);
        (recipe?.potions ?? []).forEach(add);
      }
    } catch {
      // A skill with nothing selected has no product to read.
    }
    return [...ids];
  };

  /** Folks this supplier may feed now: [{ folk, items: [item] }] (the model's open receivers). */
  const openFor = (folk) => {
    const others = crew().all.filter((f) => f !== folk && f.job === null).map((f) => ({ id: f.id, inputs: inputIds(f) }));
    const productsById = (id) => {
      const f = crew().byId(id);
      return f === undefined ? [] : productsOf(f);
    };
    return model.receivers({ id: folk.id, products: productsOf(folk) }, others, crew().links, productsById)
      .map((r) => ({ folk: crew().byId(r.id), items: r.items.map((id) => game.items.getObjectByID(id)).filter((i) => i !== undefined) }))
      .filter((r) => r.folk !== undefined);
  };

  const names = (items) => items.map((i) => i.name).join(', ');

  /** Why this supplier can't feed this receiver now ('' = it can). */
  const refusal = (folk, receiverId) => {
    if (!unlocked()) return hiring.levels?.lockText(model.UNLOCK_LEVEL) ?? '';
    if (folk.job !== null) return getLangString('MOD_WF_SUPPLY_NO_JOB');
    const receiver = crew().byId(receiverId);
    if (receiver === undefined) return '';
    if (!openFor(folk).some((r) => r.folk === receiver)) return templateLangString('MOD_WF_SUPPLY_NOT_USED', { name: receiver.name });
    return hiring.refusal('staff', { action: 'link', folk, receiverId }) ?? '';
  };

  const api = {
    unlocked,
    productsOf,
    /** Whether this Folk's inputs come from its stock, then your bank: it has a supplier, or supplied stock left. */
    fed(folk) {
      if (folk?.room === undefined || !unlocked()) return false;
      return crew().suppliersOf(folk.id).length > 0 || Object.keys(folk.room.stock ?? {}).length > 0;
    },
    /** The receiver's Produce Rate bonus now. */
    bonus(folk) {
      if (!unlocked() || folk === undefined) return 0;
      return model.bonus(folk.id, crew().links, (id) => {
        const f = crew().byId(id);
        return f !== undefined && hiring.isWorking(f);
      });
    },
    refusal,
    /** Sets who the Folk supplies (null: none). A refusal shows as a toast. True when it is set. */
    set(folk, receiverId) {
      if (folk.supplies === receiverId) return true;
      if (receiverId !== null) {
        const why = refusal(folk, receiverId);
        if (why !== '') {
          game.notifications.createErrorNotification('worker_folks:supply', why);
          return false;
        }
      }
      crew().setSupply(folk.id, receiverId);
      log(`${folk.name} supplies → ${receiverId}`);
      return true;
    },
    /**
     * A supplier's item on its way to the bank (room.mjs, inside the supplier's action): what goes into its receiver's
     * stock instead, as far as the receiver's room holds and its recipe uses the item. Returns the quantity taken.
     */
    route(acting, item, quantity) {
      const folk = acting?.folk;
      if (folk?.supplies == null || !unlocked() || !Number.isInteger(quantity) || quantity <= 0) return 0;
      const receiver = crew().byId(folk.supplies);
      if (receiver?.room === undefined || receiver.job !== null) return 0;
      const { perAction, intervalMs } = inputsOf(receiver);
      const per = model.unitMs(perAction, intervalMs, item.id);
      const free = room().capMs(receiver) - room().usedMs(receiver);
      const { toRoom } = model.split(quantity, free, per);
      if (toRoom === 0) return 0;
      room().putStock(receiver, item.id, toRoom, toRoom * per);
      hiring.events.emit('folkSupplied', { folk, receiver, item, quantity: toRoom, offline: !game._isInOnlineLoop });
      toWake.add(receiver.id);
      return toRoom;
    },
    /** The supplier card's picker: undefined while locked or on a job. */
    view(folk) {
      if (!unlocked() || folk.job !== null) return undefined;
      // A Folk with no skill makes nothing: no row, unless a line is still set (so it can be ended).
      if (folk.skillId === null && folk.supplies === null) return undefined;
      const open = openFor(folk);
      const current = folk.supplies === null ? null : crew().byId(folk.supplies) ?? null;
      const options = [{ id: null, text: getLangString('MOD_WF_CARD_JOB_NONE'), why: '' }];
      open.forEach((r) => options.push({
        id: r.folk.id,
        text: templateLangString('MOD_WF_SUPPLY_OPTION', { name: r.folk.name, items: names(r.items) }),
        media: r.items[0]?.media,
        why: hiring.refusal('staff', { action: 'link', folk, receiverId: r.folk.id }) ?? '',
      }));
      // A receiver no longer open (its recipe changed) stays listed while it is the pick, so it can be seen and ended.
      if (current !== null && !open.some((r) => r.folk === current)) options.push({ id: current.id, text: current.name, why: '' });
      const made = productsOf(folk).map((id) => game.items.getObjectByID(id)).filter((i) => i !== undefined);
      return {
        label: getLangString('MOD_WF_CARD_SUPPLY'),
        pickLabel: getLangString('MOD_WF_CARD_SUPPLY_PICK'),
        current: current?.id ?? null,
        currentText: current?.name ?? getLangString('MOD_WF_CARD_JOB_NONE'),
        options,
        tip: [
          // The receiver's whole name first: on a narrow card the button cuts it.
          ...(current === null ? [] : [{ text: templateLangString('MOD_WF_CARD_SUPPLY_TO', { name: current.name }), cls: 'font-w600' }]),
          getLangString('MOD_WF_CARD_SUPPLY_TIP'),
          made.length > 0
            ? { text: templateLangString('MOD_WF_CARD_SUPPLY_MAKES', { items: names(made) }), cls: 'font-w600' }
            // No skill (a line left from before): give it one. A skill with no product (Thieving, or no recipe picked)
            // says so instead.
            : { text: getLangString(folk.skillId === null ? 'MOD_WF_CARD_SUPPLY_MAKES_NONE' : 'MOD_WF_CARD_SUPPLY_MAKES_NO_ITEM'), cls: 'font-w600' },
        ],
      };
    },
    /**
     * The receiver card's panel: "Supplied by", the rate step (green while a supplier works), and each supplier with
     * the items of its recipe it brings. undefined for none.
     */
    suppliedView(folk) {
      if (!unlocked()) return undefined;
      const suppliers = crew().suppliersOf(folk.id);
      if (suppliers.length === 0) return undefined;
      const inputs = new Set(inputIds(folk));
      const rows = suppliers.map((s) => ({
        name: s.name,
        items: productsOf(s).filter((id) => inputs.has(id)).map((id) => game.items.getObjectByID(id)).filter((i) => i !== undefined)
          .map((i) => ({ name: i.name, media: i.media })),
      }));
      const bonus = api.bonus(folk);
      const step = `${model.LINK_BONUS}`;
      return {
        head: getLangString('MOD_WF_SUPPLY_BY_HEAD'),
        rate: templateLangString('MOD_WF_SUPPLY_BY_RATE', { bonus: step }),
        on: bonus > 0,
        rateTip: templateLangString(bonus > 0 ? 'MOD_WF_SUPPLY_BY_RATE_ON_TIP' : 'MOD_WF_SUPPLY_BY_RATE_OFF_TIP', { bonus: step }),
        rows,
      };
    },
  };

  // Receivers a delivery may have unblocked start again after the tick, as a Restock starts a Folk.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || toWake.size === 0) return;
    const ids = [...toWake];
    toWake.clear();
    ids.forEach((id) => {
      const folk = crew().byId(id);
      if (folk !== undefined) room()?.wake?.(folk);
    });
  });

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.supply = api;
    hiring.events.on('folkMade', ({ folk, item }) => {
      if (folk === undefined || item === undefined) return;
      const set = madeBy.get(folk.id) ?? new Set();
      if (!set.has(item.id)) {
        set.add(item.id);
        madeBy.set(folk.id, set);
      }
    });
    // A new skill makes other things.
    hiring.events.on('folkAssigned', ({ folk }) => { madeBy.delete(folk.id); inputsCache.delete(folk.id); });
    hiring.events.on('folkFired', ({ folk }) => { madeBy.delete(folk.id); inputsCache.delete(folk.id); });
    hiring.events.on('folkSupplyChanged', () => { hiring.renderQueue.folks = true; });
  });

  return api;
}
