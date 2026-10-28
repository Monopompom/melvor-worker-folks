// Worker Folks — entry point for Melvor Idle v1.3.1 mod loader.
// Everything game-facing lives in src/*.mjs and is loaded through ctx.loadModule
// (relative ES imports do not resolve inside the mod loader's resource URLs).
// Pure helpers (src/delegable.mjs, src/lang-merge.mjs) have no game globals and
// are covered by Node tests in tests/.

/** Bumped on every zip build so the console shows which build is running. */
export const BUILD = '2026-10-28.148';
/**
 * Dev tooling switch. false for shipping builds: no `[Worker Folks]` debug logging and no
 * `workerFolksDev` console helpers (src/dev.mjs is not loaded and the release build leaves it out of
 * the zip). Set to true while developing from the unpacked folder.
 */
const DEV = false;

export async function setup(ctx) {
  const log = DEV ? (...args) => console.log('[Worker Folks]', ...args) : () => {};
  console.info(`[Worker Folks] Hiring — build ${BUILD}`);

  const { selectDelegable } = await ctx.loadModule('src/delegable.mjs');
  const { mergeLang } = await ctx.loadModule('src/lang-merge.mjs');
  const lang = await ctx.loadModule('src/lang.mjs');
  const conflicts = await ctx.loadModule('src/conflicts.mjs');
  // Every popup we open runs this on render: skill names get their icon and bold.
  const { didRender: popupDidRender, titleName } = await ctx.loadModule('src/skill-names.mjs');

  // 0. Incompatible mods (Multitasking): both change which skill the game treats as active.
  //    Checked now (mods loaded before us) and again once every mod is in (loaded after us).
  await lang.install(ctx, { mergeLang });
  const state = { disabled: false };
  const loadedNames = () => { try { return mod.manager.getLoadedModList(); } catch { return []; } };
  const hasNamespace = (ns) => { try { return game.registeredNamespaces.hasNamespace(ns); } catch { return false; } };
  const disable = (conflict) => {
    if (state.disabled) return;
    state.disabled = true;
    console.warn(`[Worker Folks] disabled: incompatible mod "${conflict.title}" is loaded`);
    ctx.onInterfaceReady(() => {
      SwalLocale.fire({
        icon: 'warning',
        title: getLangString('MOD_WF_CONFLICT_TITLE'),
        didRender: popupDidRender,
        // Message popup layout: centred however many lines (build .109; left past two lines before), the
        // mod's name bold each time; OK is green like every agree (build .75).
        html: `<div class="text-center">${templateLangString('MOD_WF_CONFLICT_TEXT', { mod: conflict.title })}</div>`,
        customClass: (() => { const c = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1' }; return typeof createSwalCustomClass === 'function' ? createSwalCustomClass(c) : c; })(),
      });
    });
  };
  const early = conflicts.findConflict(loadedNames(), { hasNamespace });
  if (early !== null) {
    disable(early);
    return; // nothing registered: no skill, no shop entries, no patches
  }
  ctx.onModsLoaded(() => {
    const late = conflicts.findConflict(loadedNames(), { hasNamespace });
    if (late !== null) disable(late); // registered already: delegation and the Worker box stay inert
  });

  const { createHiringClass } = await ctx.loadModule('src/hiring-skill.mjs');
  const page = await ctx.loadModule('src/page.mjs');
  const folkModel = await ctx.loadModule('src/folk.mjs');
  const { createEventBus } = await ctx.loadModule('src/events.mjs');
  const { createGuards } = await ctx.loadModule('src/guards.mjs');
  const apiModule = await ctx.loadModule('src/api.mjs');
  const { pickName } = await ctx.loadModule('src/names.mjs');
  const { createCrew } = await ctx.loadModule('src/crew.mjs');
  const { renderFolkCards, effectsFragment } = await ctx.loadModule('src/cards.mjs');
  const { renderReservePanel } = await ctx.loadModule('src/reserve-panel.mjs');
  // One way to write a time left (build .112, scan A-12 / C-26).
  const time = await ctx.loadModule('src/time-format.mjs');
  const wages = await ctx.loadModule('src/wages.mjs');
  const perks = await ctx.loadModule('src/mastery-perks.mjs');
  const promotion = await ctx.loadModule('src/promotion.mjs');
  const loadoutRules = await ctx.loadModule('src/loadout-model.mjs');
  const loadout = await ctx.loadModule('src/loadout.mjs');
  // Every tooltip in the mod goes through one module (build .91, the user: the same look as Voyage's).
  const tips = (await ctx.loadModule('src/tips.mjs')).install(ctx, { log });
  const layoutModel = await ctx.loadModule('src/layout-model.mjs');
  const layout = (await ctx.loadModule('src/layout.mjs')).install(ctx, { log, tips, model: layoutModel });
  const dashboard = (await ctx.loadModule('src/dashboard.mjs')).install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    model: await ctx.loadModule('src/dashboard-model.mjs'),
    milestones: await ctx.loadModule('src/milestones.mjs'),
    tips,
    popupDidRender,
    log,
  });
  const consumptionRules = await ctx.loadModule('src/consumption-model.mjs');
  const consumption = await ctx.loadModule('src/consumption.mjs');
  const milestones = await ctx.loadModule('src/milestones.mjs');
  const levels = await ctx.loadModule('src/levels.mjs');
  const quietPopups = await ctx.loadModule('src/quiet-popups.mjs');
  const popupRules = await ctx.loadModule('src/popup-model.mjs');
  const healthRules = await ctx.loadModule('src/health-model.mjs');
  const health = await ctx.loadModule('src/health.mjs');
  const resume = await ctx.loadModule('src/resume.mjs');
  const payroll = await ctx.loadModule('src/payroll.mjs');
  const dev = DEV ? await ctx.loadModule('src/dev.mjs') : null;
  const pricing = await ctx.loadModule('src/pricing.mjs');
  const shop = await ctx.loadModule('src/shop.mjs');
  const hiringModule = await ctx.loadModule('src/hiring-skill.mjs');
  const delegationRules = await ctx.loadModule('src/delegation-model.mjs');
  const skillControl = await ctx.loadModule('src/skill-control.mjs');
  const delegation = await ctx.loadModule('src/delegation.mjs');
  const offline = await ctx.loadModule('src/offline.mjs');
  const produceRate = await ctx.loadModule('src/produce-rate.mjs');
  const acting = await ctx.loadModule('src/acting.mjs');
  const shopData = await ctx.loadModule('src/shop-data.mjs');
  const gearData = await ctx.loadModule('src/gear-data.mjs');
  const discoveryRules = await ctx.loadModule('src/discovery-model.mjs');
  const discoveries = await ctx.loadModule('src/discoveries.mjs');
  const stewardRules = await ctx.loadModule('src/steward-model.mjs');
  const steward = await ctx.loadModule('src/steward.mjs');
  const traitRules = await ctx.loadModule('src/traits-model.mjs');
  const traits = await ctx.loadModule('src/traits.mjs');
  const qualificationRules = await ctx.loadModule('src/qualification-model.mjs');
  const qualification = await ctx.loadModule('src/qualification.mjs');
  const workOrderRules = await ctx.loadModule('src/work-orders-model.mjs');
  const workOrders = await ctx.loadModule('src/work-orders.mjs');

  // 1. Language strings were installed in step 0 (needed before any skill/page name is read).

  // 2. Styles + templates.
  ctx.loadStylesheet('css/worker-folks.css');
  await ctx.loadTemplates('ui/templates.html');

  // 3. Register the skill class first, then the data package that references it.
  const { Hiring } = createHiringClass({
    popupDidRender, titleName, time,
    selectDelegable, log, createCrew, createEventBus, createGuards, folkView: apiModule.folkView, folkModel, pickName, renderFolkCards, renderReservePanel, produceRate,
    rules: delegationRules,
    perks,
    promotion,
    pricing,
    tips,
    layout,
    dashboard,
  });
  ctx.gameData.buildPackage((pkg) => {
    pkg.skills.add(Hiring);
  }).add();
  await ctx.gameData.addPackage('data/hiring.json');
  // 3b. The API other mods read as mod.api.worker_folks (Voyage, phase 6): Folks, places, events, guards.
  ctx.api(apiModule.createApi({ getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'), model: folkModel, pricing,
    rules: { promotion: { level: milestones.PROMOTION_LEVEL, mastery: promotion.MASTERY_GATE, costRate: promotion.PROMOTION_COST_RATE }, slotCaps: pricing.SHIFT_SLOT_CAP,
      tiers: { hireBase: pricing.HIRE_BASE_PRICE, wages: wages.WAGE_PER_HOUR, produceRates: produceRate.RATE_BY_TIER,
        hiringXPPerHour: milestones.HIRING_XP_PER_HOUR, qualification: qualificationRules.QUALIFICATION_LEVELS },
      levels: { workOrders: workOrderRules.BOARD_LEVEL, marks: milestones.MARKS_LEVEL, marksShare: milestones.folkMarkShare(milestones.MARKS_LEVEL),
        crewBonus: { per: produceRate.CREW_BONUS_PER_EXPERT, max: produceRate.CREW_BONUS_MAX, topLevel: milestones.CREW_CAP_LEVEL, topMax: milestones.crewBonusMax(milestones.CREW_CAP_LEVEL) },
        severance: [[1, milestones.firingSeveranceRate(1)], [milestones.SEVERANCE_HALF_LEVEL, milestones.firingSeveranceRate(milestones.SEVERANCE_HALF_LEVEL)], [milestones.SEVERANCE_NONE_LEVEL, milestones.firingSeveranceRate(milestones.SEVERANCE_NONE_LEVEL)]],
        qualificationLowering: qualificationRules.LOWERING_MASTERY } } }));
  // Shop purchases depend on which expansions are loaded (game data is registered
  // before the Mod Manager starts, so namespace presence is reliable here).
  const expansions = {
    hasTotH: game.registeredNamespaces.hasNamespace('melvorTotH'),
    hasAoD: game.registeredNamespaces.hasNamespace('melvorAoD'),
    hasItA: game.registeredNamespaces.hasNamespace('melvorItA'),
  };
  const t = (key, vars = {}) => templateLangString(key, vars);
  await ctx.gameData.addPackage({ $schema: '', namespace: 'worker_folks', data: shopData.buildShopData(expansions, t) });
  // Names that live in data/hiring.json come from the language file too.
  const category = game.shop.categories.getObjectByID('worker_folks:WorkerFolks');
  if (category !== undefined) category._name = getLangString('MOD_WF_SHOP_CATEGORY');
  const token = game.items.getObjectByID('worker_folks:Mastery_Token_Hiring');
  if (token !== undefined) token._name = getLangString('MOD_WF_ITEM_MASTERY_TOKEN');
  // Overseer's Outfit, Hiring Skillcape(s), the pet Bruno and the Ancient Relics set. Added after
  // the shop package so the outfit lands after the licences in the Worker Folks category.
  await ctx.gameData.addPackage('data/extras.json');
  const hasPurchase = (id) => game.shop.purchases.getObjectByID(id) !== undefined;
  for (const pkg of gearData.expansionGearPackages(expansions, hasPurchase)) {
    await ctx.gameData.addPackage({ $schema: '', namespace: 'worker_folks', data: pkg });
  }
  // The Steward, Hiring's Summoning familiar: its tablet, recipe (Summoning 30) and synergies.
  await ctx.gameData.addPackage({ $schema: '', namespace: 'worker_folks', data: stewardRules.stewardPackage() });
  Object.entries(gearData.LANG.items).forEach(([id, keys]) => {
    const item = game.items.getObjectByID(`worker_folks:${id}`);
    if (item === undefined) return;
    item._name = getLangString(keys.name);
    if (keys.description !== undefined) item._customDescription = getLangString(keys.description);
  });
  Object.entries(gearData.LANG.pet).forEach(([id, keys]) => {
    const pet = game.pets.getObjectByID(`worker_folks:${id}`);
    if (pet === undefined) return;
    pet._name = getLangString(keys.name);
    pet._hint = getLangString(keys.hint);
  });
  Object.entries(gearData.LANG.relics).forEach(([id, key]) => {
    const relic = game.ancientRelics.getObjectByID(`worker_folks:${id}`);
    if (relic !== undefined) relic._name = getLangString(key);
  });
  // Ancient Relics: Hiring joins the random level-cap increase picks of the expansions' cap tables.
  const capMods = milestones.capIncreaseModifications(expansions);
  if (capMods !== undefined) await ctx.gameData.addPackage({ $schema: '', namespace: 'worker_folks', modifications: capMods });
  log('shop data built for expansions', expansions);
  const shopHooks = shop.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    pricing,
    licencePurchase: hiringModule.LICENCE_PURCHASE,
    hirePurchase: hiringModule.HIRE_PURCHASE,
    shiftSlotPurchase: hiringModule.SHIFT_SLOT_PURCHASE,
    log,
  });
  shopHooks.afterShopData();

  // 4. Page container must be in the DOM before the game initialises skill menus
  //    (that happens right after the interfaceAvailable hook).
  page.install(ctx, { log });

  // 5. Delegation core: Folk-held skills run beside game.activeAction.
  delegation.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: delegationRules,
    resume,
    isDisabled: () => state.disabled,
    log,
  });

  // 5b. "Worker" control on every delegable skill page.
  skillControl.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    isDisabled: () => state.disabled,
    popupDidRender,
    effectsFragment,
    log,
  });

  // 5b2. Loadouts: slots by tier, picker, modifier sources.
  loadout.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: loadoutRules,
    consumptionRules,
    popupDidRender,
    titleName,
    tips,
    log,
  });

  // 5b3. Tablets, consumables and charge gloves used per Folk action.
  consumption.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: consumptionRules,
    log,
  });

  // Mod Settings lists sections in the order they are first named: Hiring (XP share, quiet popups) above Wages
  // (the user, 22 Oct 2026). The slices below add their settings to these same sections; the names stay as they are
  // (saved values are keyed by them).
  ctx.settings.section('Hiring');
  ctx.settings.section('Wages');

  // 5c. Wages, Payroll Reserve, strikes, cooldowns (settings registered here).
  payroll.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    wages,
    pricing,
    milestones,
    resume,
    log,
  });

  // 5d. Hiring level milestones, Hiring XP share, level gates.
  levels.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: milestones,
    log,
  });

  // 5d2. "Hide Folks' gain popups" (setting in the Hiring section, after the XP share).
  quietPopups.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: popupRules,
    log,
  });

  // 5d3. Qualification: a Folk works a skill once your level in it reaches its tier's (setting in the Hiring section).
  qualification.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    model: qualificationRules,
    log,
  });

  // 5e. Folk hitpoints: Thieving damage, food, regen, death and frozen slots.
  health.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: healthRules,
    time,
    log,
  });

  // 6. Offline: summary modal for Folk-only sessions, per-Folk lines, offlineTicks hook.
  offline.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    time,
    log,
  });

  // 7. Acting Folk: modifier table swap, Produce Rate, tier flavour.
  acting.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rate: produceRate,
    log,
  });

  // 8. Finds: the pet Bruno (every Folk action) and the Ancient Relics set (that gamemode only).
  discoveries.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: discoveryRules,
    petId: `worker_folks:${gearData.PET_ID}`,
    log,
  });

  // 8b. The Steward: worn by the player, a charge per 30 s of crew work, Hiring's mark rolled at the same beat.
  steward.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: stewardRules,
    log,
  });

  // 9. Earned traits: counted from what each Folk does, after payroll (Frugal reads whether a wage was paid).
  traits.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    model: traitRules,
    popupDidRender,
    titleName,
    log,
  });

  // 10. Work Orders: the board on the Hiring page, after payroll (an order's wages are the ones its actions paid).
  workOrders.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    model: workOrderRules,
    time,
    tips,
    popupDidRender,
    log,
  });

  ctx.onCharacterLoaded(() => {
    if (state.disabled) return;
    const hiring = game.skills.getObjectByID('worker_folks:Hiring');
    if (hiring === undefined) {
      console.error('[Worker Folks] Hiring skill is not registered.');
      return;
    }
    log(`Hiring loaded. Delegable skills: ${hiring.delegableCount}`, hiring.delegableSkills.map((s) => s.id));
    hiring.events.on('folkHired', ({ folk, source }) => {
      log(`folkHired: ${folk.name} (${folk.tier}) in slot ${folk.slot + 1} via ${source}`);
      game.notifications.createSuccessNotification(
        'worker_folks:hired',
        templateLangString('MOD_WF_HIRED_NOTIFICATION', { name: folk.name, aRole: getLangString(`MOD_WF_A_ROLE_${folk.tier}`) }),
        hiring.portrait(folk.tier),
      );
    });
    hiring.events.on('folkFired', ({ folk, reason }) => log(`folkFired: ${folk.name} (${reason})`));
    hiring.events.on('folkAssigned', ({ folk, skillId }) => log(`folkAssigned: ${folk.name} -> ${skillId}`));
    shopHooks.onCharacterLoaded();
    if (dev !== null) dev.install({ hiring, log, tiers: folkModel.TIERS });
  });
}
