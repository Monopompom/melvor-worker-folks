// Wages, Payroll Reserve, strikes, settlement and cooldowns. Game-facing.
// Math lives in wages.mjs; this module moves currency and drives the Folk state.

const GP_ID = 'melvorD:GP';
const AP_ID = 'melvorItA:AbyssalPieces';
const ABYSSAL_REALM = 'melvorItA:Abyssal';

export function install(ctx, { getHiring, wages, pricing, milestones, log }) {
  let hiring;
  const section = ctx.settings.section('Wages');
  section.add([
    {
      type: 'dropdown',
      name: 'wageDifficulty',
      label: getLangString('MOD_WF_SETTING_WAGE_DIFF'),
      hint: getLangString('MOD_WF_SETTING_WAGE_DIFF_HINT'),
      default: wages.DEFAULT_WAGE_PRESET,
      options: wages.WAGE_PRESETS.map((p) => ({
        value: p.key,
        display: getLangString(`MOD_WF_WAGE_PRESET_${p.key}`),
      })),
    },
    {
      type: 'switch',
      name: 'abyssalWagesInAP',
      label: getLangString('MOD_WF_SETTING_AP_WAGES'),
      hint: getLangString('MOD_WF_SETTING_AP_WAGES_HINT'),
      default: true,
    },
  ]);
  const multiplier = () => wages.presetMultiplier(section.get('wageDifficulty'));
  const currency = (id) => game.currencies.getObjectByID(id);

  const api = {
    get enabled() {
      return multiplier() > 0;
    },
    /** Currency a skill's wages are charged in right now. */
    currencyIdFor(skill) {
      if (section.get('abyssalWagesInAP') && skill?.currentRealm?.id === ABYSSAL_REALM && currency(AP_ID) !== undefined) return AP_ID;
      return GP_ID;
    },
    hourlyWageOf(folk) {
      return wages.hourlyWage(folk.tier, { multiplier: multiplier() * (hiring.wageFactor?.(folk) ?? 1), discount: hiring.wageDiscount?.(folk) ?? 0 });
    },
    /** Hourly cost of the working crew, per currency id; `all` counts idle Folks too (in GP). */
    crewPerHour({ all = false } = {}) {
      const out = {};
      hiring.crew.all.forEach((folk) => {
        const skill = hiring.skillOf(folk);
        const working = skill !== undefined && hiring.delegated.has(skill);
        if (!working && !all) return;
        const id = working ? api.currencyIdFor(skill) : GP_ID;
        out[id] = (out[id] ?? 0) + api.hourlyWageOf(folk);
      });
      return out;
    },
    hoursCovered(currencyId) {
      return wages.hoursCovered(hiring.crew.reserveOf(currencyId), api.crewPerHour()[currencyId] ?? 0);
    },
    /** Reserve capacity in hours of the whole crew's wages (0 while the milestone is locked). */
    capacityHours() {
      return hiring.levels?.reserveCapacityHours() ?? Infinity;
    },
    capacityOf(currencyId) {
      const hours = api.capacityHours();
      if (hours === Infinity) return Infinity;
      return milestones.reserveRoom({ hours, perHour: api.crewPerHour({ all: true })[currencyId] ?? 0, reserve: hiring.crew.reserveOf(currencyId) }).capacity;
    },
    roomFor(currencyId) {
      const hours = api.capacityHours();
      if (hours === Infinity) return Infinity;
      return milestones.reserveRoom({ hours, perHour: api.crewPerHour({ all: true })[currencyId] ?? 0, reserve: hiring.crew.reserveOf(currencyId) }).room;
    },
    /** What a deposit of `amount` would do (wages.depositPlan): the panel reports refusals instead of failing silently. */
    planDeposit(currencyId, amount) {
      return wages.depositPlan({ amount, bank: currency(currencyId)?.amount ?? 0, room: api.roomFor(currencyId) });
    },
    /** True while a non-empty reserve covers less than an hour of the working crew (the panel's amber hours). */
    reserveLow(currencyId) {
      return wages.reserveLow(api.hoursCovered(currencyId), hiring.crew.reserveOf(currencyId));
    },
    /** Moves `amount` of a currency from the bank into the reserve, clamped to the level capacity. */
    deposit(currencyId, amount) {
      const cur = currency(currencyId);
      amount = Math.min(Math.floor(amount), api.roomFor(currencyId));
      if (cur === undefined || !(amount > 0) || !cur.canAfford(amount)) return false;
      cur.remove(amount);
      hiring.crew.adjustReserve(currencyId, amount);
      log(`reserve +${amount} ${currencyId}`);
      return true;
    },
    nextHirePrice(tier) {
      return pricing.hirePrice(tier, hiring.crew.countByTier(tier));
    },
    /** Unpaid work time this Folk tolerates (mastery and pool perks). */
    graceMsOf(folk) {
      return hiring.graceMs?.(folk) ?? wages.STRIKE_GRACE_MS;
    },
    /** Unpaid work time left before this Folk strikes. */
    graceLeftMs(folk) {
      return wages.graceLeftMs(folk.debtMs, api.graceMsOf(folk));
    },
    settlementOf(folk, { apology = false } = {}) {
      const s = wages.settlement(folk.debt, hiring.severanceFree?.(folk) ? 0 : api.nextHirePrice(folk.tier), { apology });
      const debtId = folk.debtCurrency ?? GP_ID;
      // debt is paid in its own currency; severance always in GP
      const parts = {};
      if (s.debt > 0) parts[debtId] = (parts[debtId] ?? 0) + s.debt;
      const sevTotal = s.total - s.debt;
      if (sevTotal > 0) parts[GP_ID] = (parts[GP_ID] ?? 0) + sevTotal;
      return { ...s, parts, debtCurrency: debtId };
    },
    canSettle(folk, options = {}) {
      if (options.apology && hiring.levels !== undefined && !hiring.levels.apologyUnlocked()) return false;
      const { parts } = api.settlementOf(folk, options);
      return Object.entries(parts).every(([id, amount]) => currency(id)?.canAfford(amount) === true);
    },
    /** Pays the settlement; the Folk leaves the strike and enters its cooldown (skipped with apology). */
    settle(folk, { apology = false } = {}) {
      if (!folk.onStrike || !api.canSettle(folk, { apology })) return false;
      const { parts } = api.settlementOf(folk, { apology });
      Object.entries(parts).forEach(([id, amount]) => currency(id).remove(amount));
      folk.debt = 0;
      folk.debtCurrency = null;
      folk.debtMs = 0;
      folk.onStrike = false;
      folk.cooldownTicks = Math.floor(wages.cooldownAfterSettlement(folk.tier, { apology }) * (hiring.cooldownFactor?.(folk) ?? 1));
      log(`settled ${folk.name}${apology ? ' with apology' : ''}; cooldown ${folk.cooldownTicks} ticks`);
      // Level 55: the Folk picks its skill back up once it may work again.
      if (hiring.levels?.autoRestart() && folk.skillId !== null) {
        folk.restartWhenReady = true;
        if (folk.cooldownTicks === 0) restartFolk(folk);
      }
      hiring.crew.touch();
      return true;
    },
  };

  /** Starts the Folk's last skill again (online only); clears the flag either way. */
  const restartFolk = (folk) => {
    folk.restartWhenReady = false;
    if (!game._isInOnlineLoop || !(hiring.levels?.autoRestart())) return false;
    const skill = folk.skillId === null ? undefined : game.skills.getObjectByID(folk.skillId);
    if (skill === undefined || skill.isActive || hiring.delegated.has(skill) || typeof skill.start !== 'function') return false;
    if (!hiring.folkAvailable(folk)) return false;
    try {
      skill.start();
    } catch (err) {
      console.warn('[Worker Folks] auto-restart failed', err);
    }
    if (!hiring.delegated.has(skill)) return false;
    game.notifications.createSuccessNotification(
      'worker_folks:restart',
      templateLangString('MOD_WF_AUTO_RESTARTED', { name: folk.name, skill: skill.name }),
      hiring.portrait(folk.tier),
    );
    log(`${folk.name} restarted ${skill.id} after settlement`);
    return true;
  };

  /** Outstanding debt from the grace period is collected as soon as the reserve or bank can pay. */
  const repayDebt = (folk) => {
    if (folk.onStrike || !(folk.debt > 0) || folk.debtCurrency === null) return;
    const id = folk.debtCurrency;
    const cur = currency(id);
    const r = wages.repayDebt({ debt: folk.debt, debtMs: folk.debtMs }, hiring.crew.reserveOf(id), cur === undefined ? 0 : cur.amount);
    if (r.fromReserve === 0 && r.fromBank === 0) return;
    if (r.fromReserve > 0) hiring.crew.adjustReserve(id, -r.fromReserve);
    if (r.fromBank > 0) cur.remove(r.fromBank);
    folk.debt = r.debt;
    folk.debtMs = r.debtMs;
    if (r.cleared) {
      folk.debtCurrency = null;
      log(`${folk.name} repaid its debt (${r.fromReserve + r.fromBank} ${id})`);
    }
    hiring.renderQueue.folks = true;
  };

  /** One finished action: collect old debt if possible, charge the prorated wage; unpaid wages pile up into a strike. */
  const charge = ({ skill, folk, intervalMs }) => {
    if (folk === undefined || !api.enabled || !(intervalMs > 0)) return;
    repayDebt(folk);
    const { amount, carry } = wages.wholeCharge(wages.wageForAction(folk.tier, intervalMs, { multiplier: multiplier() * (hiring.wageFactor?.(folk) ?? 1), discount: hiring.wageDiscount?.(folk) ?? 0 }), folk.wageCarry);
    folk.wageCarry = carry;
    if (amount === 0) return;
    const id = api.currencyIdFor(skill);
    const cur = currency(id);
    const bank = cur === undefined ? 0 : cur.amount;
    const split = wages.splitPayment(amount, hiring.crew.reserveOf(id), bank);
    if (split.fromReserve > 0) hiring.crew.adjustReserve(id, -split.fromReserve);
    if (split.fromBank > 0) cur.remove(split.fromBank);
    warnReserve(id);
    if (split.unpaid === 0) {
      if (folk.debt === 0 && folk.debtMs !== 0) folk.debtMs = 0;
      return;
    }
    const wasClear = !(folk.debt > 0);
    const next = wages.onUnpaid({ debt: folk.debt, debtMs: folk.debtMs }, split.unpaid, intervalMs, api.graceMsOf(folk));
    folk.debt = next.debt;
    folk.debtCurrency = id;
    folk.debtMs = next.debtMs;
    hiring.renderQueue.folks = true;
    if (next.strike) {
      strike(folk, skill);
      return;
    }
    if (wasClear) warnDebt(folk, skill);
  };

  /** First unpaid action of an episode: one notification (online) and an event for the offline summary. */
  const warnDebt = (folk, skill) => {
    const offline = !game._isInOnlineLoop;
    hiring.events.emit('folkInDebt', { folk, skill, debt: folk.debt, graceLeftMs: api.graceLeftMs(folk), offline });
    if (offline) return;
    const d = hiring.debtText(folk);
    if (d === null) return;
    game.notifications.createInfoNotification(
      'worker_folks:debt',
      templateLangString('MOD_WF_DEBT_NOTIFICATION', { name: folk.name, skill: skill.name, amount: d.amount, minutes: d.minutes }),
      hiring.portrait(folk.tier),
    );
  };

  /** Reserve dropped under RESERVE_WARN_HOURS of the working crew: warn once until it is refilled past the line. */
  const reserveWarned = new Set();
  const warnReserve = (id) => {
    const hours = api.hoursCovered(id);
    const reserve = hiring.crew.reserveOf(id);
    if (!wages.reserveLow(hours, reserve)) {
      if (hours >= wages.RESERVE_WARN_HOURS) reserveWarned.delete(id);
      return;
    }
    if (reserveWarned.has(id) || !game._isInOnlineLoop) return;
    reserveWarned.add(id);
    const cur = currency(id);
    game.notifications.createInfoNotification(
      'worker_folks:reserve-low',
      templateLangString('MOD_WF_RESERVE_LOW', { hours: hours.toFixed(1), amount: numberWithCommas(reserve), currency: cur?.name ?? id }),
      hiring.getMediaURL('img/payroll_reserve.png'),
    );
  };

  const strike = (folk, skill) => {
    folk.onStrike = true;
    folk.strikes += 1;
    log(`${folk.name} strikes on ${skill.id}, owed ${folk.debt} ${folk.debtCurrency}`);
    hiring.forceStop(skill);
    game.notifications.createErrorNotification(
      'worker_folks:strike',
      templateLangString('MOD_WF_STRIKE_NOTIFICATION', { name: folk.name, skill: skill.name }),
      hiring.portrait(folk.tier),
    );
    hiring.events.emit('folkStruck', { folk, skill, debt: folk.debt, offline: !game._isInOnlineLoop });
    // 50% pool checkpoint: the strike settles itself when the bank can pay (cooldown still applies).
    if (hiring.autoSettle?.() && api.settle(folk)) {
      game.notifications.createSuccessNotification(
        'worker_folks:autosettle',
        templateLangString('MOD_WF_AUTO_SETTLED', { name: folk.name }),
        hiring.portrait(folk.tier),
      );
    }
    hiring.crew.touch();
  };

  // Cooldowns run on game ticks, online and offline alike.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined) return;
    let changed = false;
    hiring.crew.all.forEach((folk) => {
      if (folk.cooldownTicks > 0) {
        folk.cooldownTicks = wages.tickCooldown(folk.cooldownTicks, 1);
        if (folk.cooldownTicks === 0) changed = true;
      }
      if (folk.restartWhenReady && folk.cooldownTicks === 0 && game._isInOnlineLoop) restartFolk(folk);
    });
    if (changed) hiring.crew.touch();
  });

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.payroll = api;
  });
  ctx.onCharacterLoaded(() => {
    hiring.events.on('folkActionDone', charge);
    // Cooldown countdown on cards: refresh once a second while someone cools down.
    setInterval(() => {
      if (hiring.crew.all.some((f) => f.cooldownTicks > 0) && game.openPage?.id === 'worker_folks:Hiring') hiring.renderQueue.folks = true;
    }, 1000);
  });

  return api;
}
