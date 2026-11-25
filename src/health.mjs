// Folk hitpoints in the game: damage from failed pickpockets, eating from the
// Folk's own Food slot, regeneration on game ticks, death (crew slot frozen for
// 24 h) and the card/shop views of it. Game-facing.

export function install(ctx, { getHiring, rules, time, log }) {
  let hiring;
  let regenCounter = 0;
  /**
   * The death keeper (API v13, Voyage's cairns): { keep(folk, things), textFor(folkId), heldIds() }, or undefined. One
   * at a time; registering again replaces it.
   */
  let keeper;
  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const keeperText = (folkId) => {
    try {
      const text = keeper?.textFor?.(folkId);
      return typeof text === 'string' ? text : '';
    } catch (e) {
      log(`death keeper text failed: ${e?.message ?? e}`);
      return '';
    }
  };
  /** What a Folk has on it, as plain ids for the keeper: gear by slot, its room's three sides, its purse. */
  const thingsOf = (folk) => {
    const side = (name) => Object.entries(folk.room?.[name] ?? {}).map(([itemId, { qty }]) => ({ itemId, qty }));
    return {
      gear: Object.entries(folk.loadout ?? {}).map(([slot, { id, qty }]) => ({ slot, itemId: id, qty })),
      room: { haul: side('haul'), stock: side('stock'), town: side('town') },
      purse: Object.entries(folk.room?.purse ?? {}).map(([currencyId, amount]) => ({ currencyId, amount })),
    };
  };
  /** Offers a Folk dying on the road to the keeper. True when it took everything; the Folk then holds nothing. */
  const keptByKeeper = (folk, cause) => {
    if (keeper === undefined || folk.travel !== 'walking') return false;
    let kept = false;
    try {
      kept = keeper.keep(folk, { ...thingsOf(folk), cause: cause ?? null }) === true;
    } catch (e) {
      log(`death keeper failed for ${folk.name}: ${e?.message ?? e}`);
      return false;
    }
    if (!kept) return false;
    folk.loadout = {};
    folk.room = { haul: {}, stock: {}, town: {}, purse: {} };
    return true;
  };
  // When a thieving Folk eats and how far it heals (build .219, joint order round 2): two settings in the Hiring
  // section, after the ones added before this module.
  const section = ctx.settings.section('Hiring');
  // The cards' food line tooltip names the line: redrawn once a setting changes.
  const redraw = () => { if (hiring !== undefined) hiring.renderQueue.folks = true; };
  section.add([
    {
      type: 'dropdown',
      name: 'eatAt',
      label: getLangString('MOD_WF_SETTING_EAT_AT'),
      hint: getLangString('MOD_WF_SETTING_EAT_AT_HINT'),
      default: rules.DEFAULT_EAT_AT,
      // The default marked, as the wage dropdown marks its own.
      options: rules.EAT_AT_CHOICES.map((percent) => ({
        value: percent,
        display: templateLangString(percent === rules.DEFAULT_EAT_AT ? 'MOD_WF_SETTING_EAT_AT_DEFAULT' : 'MOD_WF_SETTING_EAT_AT_OPTION', { percent: `${percent}` }),
      })),
      onChange: () => redraw(),
    },
    {
      type: 'dropdown',
      name: 'healMode',
      label: getLangString('MOD_WF_SETTING_HEAL'),
      hint: getLangString('MOD_WF_SETTING_HEAL_HINT'),
      default: 'full',
      options: rules.HEAL_MODES.map((mode) => ({ value: mode, display: getLangString(`MOD_WF_HEAL_${mode}`) })),
      onChange: () => redraw(),
    },
  ]);
  const eatAt = () => rules.eatShare(section.get('eatAt'));
  const mode = () => rules.healMode(section.get('healMode'));

  const api = {
    maxHpOf(folk) {
      return rules.maxHpFor(folk.tier);
    },
    hpOf(folk) {
      return rules.currentHp(folk, api.maxHpOf(folk));
    },
    setHp(folk, hp) {
      const max = api.maxHpOf(folk);
      folk.hp = hp >= max ? null : Math.max(0, Math.floor(hp));
      hiring.renderQueue.folks = true;
    },
    /** Folks eat the player's selected food (the combat food slot), never a loadout item. */
    food() {
      const slot = game.combat.player.food.currentSlot;
      if (slot === undefined || slot.item === game.emptyFoodItem || !(slot.quantity > 0)) return undefined;
      return { item: slot.item, qty: slot.quantity };
    },
    /** Under the eat line (60% HP unless set): eats the player's food, back to full or one item. Returns the count eaten. */
    eat(folk) {
      const e = api.food();
      if (e === undefined) return 0;
      const max = api.maxHpOf(folk);
      const plan = rules.eatPlan({ hp: api.hpOf(folk), max, healsFor: e.item.healsFor, qty: e.qty, at: eatAt(), mode: mode() });
      if (plan.eaten === 0) return 0;
      const player = game.combat.player;
      player.food.consume(plan.eaten);
      player.renderQueue.food = true;
      if (plan.qtyLeft === 0) {
        game.notifications.createErrorNotification('worker_folks:food', templateLangString('MOD_WF_FOOD_OUT', { name: folk.name, item: e.item.name }));
      }
      api.setHp(folk, plan.hp);
      return plan.eaten;
    },
    /**
     * Hurts the Folk, and it dies at zero. It eats if it can (`eat` false: it can't, as for hunger on the road), and
     * `cause` ('hunger') names the death. Returns true when it died.
     */
    damage(folk, amount, { skill, eat = true, cause } = {}) {
      if (!(amount > 0)) return false;
      const before = api.hpOf(folk);
      const result = rules.applyDamage(before, amount);
      api.setHp(folk, result.hp);
      if (!result.dead) {
        hiring.traits?.onHurt(folk, result.hp, api.maxHpOf(folk));
        hiring.looks?.onHurt(folk, before, result.hp, api.maxHpOf(folk));
      }
      log(`${folk.name} takes ${amount} damage${cause === undefined ? '' : ` (${cause})`} (${result.hp}/${api.maxHpOf(folk)})`);
      if (result.dead) {
        api.kill(folk, { skill, cause });
        return true;
      }
      if (eat && rules.shouldEat(result.hp, api.maxHpOf(folk), eatAt())) api.eat(folk);
      return false;
    },
    /**
     * Death: the skill stops, gear returns to the bank as far as it has space, the Folk leaves and its slot freezes for
     * 24 h. A Folk dying on the road goes to the death keeper first (v13): when it keeps everything, nothing goes to the
     * bank and nothing is lost, and the frozen slot shows the keeper's text instead.
     */
    kill(folk, { skill, cause } = {}) {
      const working = skill ?? hiring.skillOf(folk);
      const offline = !game._isInOnlineLoop;
      hiring.forceStop(working); // also clears a Thieving stun so the skill really ends
      const cairn = keptByKeeper(folk, cause);
      const lost = cairn ? [] : (hiring.returnLoadout?.(folk) ?? []);
      const until = rules.freezeUntil(Date.now());
      hiring.crew.freeze(folk.slot, until);
      if (cairn) hiring.crew.setCairn(folk.slot, folk.id);
      hiring.crew.fire(folk.id, { reason: 'died', lost });
      hiring.events.emit('folkDied', { folk, skill: working, offline, cause, cairn });
      // The death names its cause (hunger on the road) or the skill it died at; a Folk with neither just died.
      const vars = { name: folk.name, skill: working === undefined ? '' : hiring.skillName(working), slot: `${folk.slot + 1}` };
      const key = cause === 'hunger' ? 'MOD_WF_DIED_HUNGER' : working === undefined ? 'MOD_WF_DIED_PLAIN' : 'MOD_WF_DIED';
      const where = cairn ? keeperText(folk.id) : '';
      game.notifications.createErrorNotification('worker_folks:died', `${templateLangString(key, vars)}${where === '' ? '' : ` ${where}`}`, hiring.portraitOf(folk));
      const at = working?.id ?? (cause === 'hunger' || cairn ? 'the road' : 'no skill');
      log(`${folk.name} died on ${at}${cause ? ` (${cause})` : ''}; slot ${folk.slot + 1} frozen until ${new Date(until).toISOString()}`);
    },
    /**
     * Heals a Folk by `hp` (v13), up to its max HP. A Folk not in the crew (dead, its slot frozen) gets nothing. `cause`
     * ('rest', 'food') is only logged. Returns its HP after, or undefined.
     */
    heal(folk, hp, { cause } = {}) {
      if (folk === undefined || hiring.crew.byId(folk.id) !== folk) return undefined;
      const before = api.hpOf(folk);
      if (!(hp > 0) || folk.hp === null) return before;
      api.setHp(folk, Math.min(api.maxHpOf(folk), before + Math.floor(hp)));
      hiring.markCard(folk);
      const after = api.hpOf(folk);
      log(`${folk.name} heals ${after - before}${cause === undefined ? '' : ` (${cause})`} (${after}/${api.maxHpOf(folk)})`);
      return after;
    },
    /** Sets the death keeper (v13), or clears it with undefined. Returns the function that removes this one. */
    setKeeper(def) {
      keeper = def;
      return () => { if (keeper === def) keeper = undefined; };
    },
    /** The keeper's text for a Folk that left a cairn ('' without one), drawn fresh so it follows the language. */
    cairnText(folkId) {
      return keeperText(folkId);
    },
    /** Item ids the keeper holds in its cairns (Heirlooms count them as held, so none is found twice). */
    keptIds() {
      try {
        const ids = keeper?.heldIds?.();
        return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
      } catch (e) {
        log(`death keeper heldIds failed: ${e?.message ?? e}`);
        return [];
      }
    },
    /** Failed pickpocket: the Folk takes the NPC's hit instead of the player. */
    onPickpocketFail(folk, npc, skill) {
      const abyssal = npc.realm?.id === 'melvorItA:Abyssal';
      const dmg = rules.damageRoll(npc.maxHit, { abyssal });
      return api.damage(folk, dmg, { skill });
    },
    regenTick() {
      regenCounter += 1;
      if (regenCounter < rules.REGEN_INTERVAL_TICKS) return;
      regenCounter = 0;
      hiring.crew.all.forEach((folk) => {
        // A Folk on the road (with you, or walking alone) doesn't rest, so it heals only once put down somewhere.
        if (folk.hp === null || folk.travel !== 'idle') return;
        const max = api.maxHpOf(folk);
        folk.hp = Math.min(max, folk.hp + rules.regenAmount(max));
        if (folk.hp >= max) folk.hp = null;
        hiring.markCard(folk);
      });
    },
    /** Card view: { hp, max, percent, text }. */
    hpView(folk) {
      const max = api.maxHpOf(folk);
      const hp = api.hpOf(folk);
      const food = api.food();
      const text = templateLangString('MOD_WF_CARD_HP', { hp: numberWithCommas(hp), max: numberWithCommas(max) });
      // Folks lose HP only on Thieving, so the food line only matters there (build .55).
      const state = rules.foodLineState({ skillId: folk.skillId, foodQty: food?.qty ?? 0 });
      const args = { name: folk.name, item: food?.item.name ?? '', count: numberWithCommas(food?.qty ?? 0) };
      const key = { off: 'MOD_WF_CARD_FOOD_OFF', none: 'MOD_WF_CARD_NO_FOOD', low: 'MOD_WF_CARD_FOOD_LOW', ok: 'MOD_WF_CARD_FOOD' }[state];
      // When it eats, in the food line's tooltip (the settings can change it).
      const tip = state === 'off' ? '' : templateLangString(`MOD_WF_CARD_FOOD_TIP_${mode()}`, { percent: `${Math.round(eatAt() * 100)}` });
      return { hp, max, percent: Math.round((hp / max) * 100), text, food: { state, text: templateLangString(key, args), tip } };
    },
    /** Frozen slots for the Hiring page: [{ slot, text }]. */
    frozenSlotsView() {
      const now = Date.now();
      const out = [];
      hiring.crew.frozenSlots().forEach((until, slot) => {
        // What the dead Folk's room lost to a full bank, under the countdown while the slot stays frozen (build .151).
        const lost = hiring.crew.lostAt(slot);
        // A Folk that died on the road and left a cairn (v13): the keeper's line instead, drawn each time.
        const cairnId = hiring.crew.cairnAt?.(slot);
        const cairn = cairnId === undefined ? '' : keeperText(cairnId);
        out.push({
          slot,
          text: templateLangString('MOD_WF_SLOT_FROZEN', { slot: `${slot + 1}`, time: time.shortTime(rules.freezeRemaining(until, now)) }), // never "23h 59m 60s" (scan C-26, .112)
          // HTML: each item with its own icon.
          lostHtml: cairn !== '' ? `<div>${escHtml(cairn)}</div>`
            : lost.length === 0 || hiring.room === undefined ? '' : `<div>${getLangString('MOD_WF_SLOT_FROZEN_LOST')}</div>${hiring.room.itemTiles(lost, { lost: true, small: true })}`,
        });
      });
      return out;
    },
    /** Why a slot is frozen (shown on its card). */
    freezeReason() {
      return templateLangString('MOD_WF_SLOT_FROZEN_WHY', { hours: `${Math.round(rules.FREEZE_MS / 3600000)}` });
    },
    /** Shop requirement text when only frozen slots are left. */
    thawText() {
      const next = hiring.crew.nextThaw();
      if (next === undefined) return '';
      return templateLangString('MOD_WF_REQ_SLOT_FROZEN', { time: time.shortTime(rules.freezeRemaining(next, Date.now())) });
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.health = api;
  });

  // Regeneration runs on game ticks, online and offline alike.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring !== undefined) api.regenTick();
  });

  ctx.onCharacterLoaded(() => {
    // Frozen-slot countdowns on the Hiring page refresh once a second.
    setInterval(() => {
      if (hiring.crew.frozenSlots().size > 0 && game.openPage?.id === 'worker_folks:Hiring') hiring.renderQueue.folks = true;
    }, 1000);
    log('Folk health ready');
  });
  return api;
}
