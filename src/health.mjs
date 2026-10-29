// Folk hitpoints in the game: damage from failed pickpockets, eating from the
// Folk's own Food slot, regeneration on game ticks, death (crew slot frozen for
// 24 h) and the card/shop views of it. Game-facing.

export function install(ctx, { getHiring, rules, time, log }) {
  let hiring;
  let regenCounter = 0;

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
    /** Below 60% HP: eats the player's food back to full. Returns the number of items eaten. */
    eat(folk) {
      const e = api.food();
      if (e === undefined) return 0;
      const max = api.maxHpOf(folk);
      const plan = rules.eatPlan({ hp: api.hpOf(folk), max, healsFor: e.item.healsFor, qty: e.qty });
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
      const result = rules.applyDamage(api.hpOf(folk), amount);
      api.setHp(folk, result.hp);
      if (!result.dead) hiring.traits?.onHurt(folk, result.hp, api.maxHpOf(folk));
      log(`${folk.name} takes ${amount} damage${cause === undefined ? '' : ` (${cause})`} (${result.hp}/${api.maxHpOf(folk)})`);
      if (result.dead) {
        api.kill(folk, { skill, cause });
        return true;
      }
      if (eat && rules.shouldEat(result.hp, api.maxHpOf(folk))) api.eat(folk);
      return false;
    },
    /** Death: the skill stops, gear returns to the bank as far as it has space, the Folk leaves and its slot freezes for 24 h. */
    kill(folk, { skill, cause } = {}) {
      const working = skill ?? hiring.skillOf(folk);
      const offline = !game._isInOnlineLoop;
      hiring.forceStop(working); // also clears a Thieving stun so the skill really ends
      const lost = hiring.returnLoadout?.(folk) ?? [];
      const until = rules.freezeUntil(Date.now());
      hiring.crew.freeze(folk.slot, until);
      hiring.crew.fire(folk.id, { reason: 'died', lost });
      hiring.events.emit('folkDied', { folk, skill: working, offline, cause });
      // The death names its cause (hunger on the road) or the skill it died at; a Folk with neither just died.
      const vars = { name: folk.name, skill: working === undefined ? '' : hiring.skillName(working), slot: `${folk.slot + 1}` };
      const key = cause === 'hunger' ? 'MOD_WF_DIED_HUNGER' : working === undefined ? 'MOD_WF_DIED_PLAIN' : 'MOD_WF_DIED';
      game.notifications.createErrorNotification('worker_folks:died', templateLangString(key, vars), hiring.portrait(folk.tier));
      log(`${folk.name} died on ${working?.id ?? '-'}; slot ${folk.slot} frozen until ${new Date(until).toISOString()}`);
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
      let changed = false;
      hiring.crew.all.forEach((folk) => {
        // A Folk on the road (with you, or walking alone) doesn't rest, so it heals only once put down somewhere.
        if (folk.hp === null || folk.travel !== 'idle') return;
        const max = api.maxHpOf(folk);
        folk.hp = Math.min(max, folk.hp + rules.regenAmount(max));
        if (folk.hp >= max) folk.hp = null;
        changed = true;
      });
      if (changed) hiring.renderQueue.folks = true;
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
      return { hp, max, percent: Math.round((hp / max) * 100), text, food: { state, text: templateLangString(key, args) } };
    },
    /** Frozen slots for the Hiring page: [{ slot, text }]. */
    frozenSlotsView() {
      const now = Date.now();
      const out = [];
      hiring.crew.frozenSlots().forEach((until, slot) => {
        // What the dead Folk's room lost to a full bank, under the countdown while the slot stays frozen (build .151).
        const lost = hiring.crew.lostAt(slot);
        out.push({
          slot,
          text: templateLangString('MOD_WF_SLOT_FROZEN', { slot: `${slot + 1}`, time: time.shortTime(rules.freezeRemaining(until, now)) }), // never "23h 59m 60s" (scan C-26, .112)
          // HTML: each item with its own icon.
          lostHtml: lost.length === 0 || hiring.room === undefined ? '' : `<div>${getLangString('MOD_WF_SLOT_FROZEN_LOST')}</div>${hiring.room.itemTiles(lost, { lost: true, small: true })}`,
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
