// Worker Folks — entry point for Melvor Idle v1.3.1 mod loader.
// Everything game-facing lives in src/*.mjs and is loaded through ctx.loadModule
// (relative ES imports do not resolve inside the mod loader's resource URLs).
// Pure helpers (src/delegable.mjs, src/lang-merge.mjs) have no game globals and
// are covered by Node tests in tests/.

/** Bumped on every zip build so the console shows which build is running. */
export const BUILD = '2026-10-16.56';
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
        html: `<div class="text-left">${templateLangString('MOD_WF_CONFLICT_TEXT', { mod: conflict.title })}</div>`,
        customClass: (typeof createSwalCustomClass === 'function' ? createSwalCustomClass({ popup: 'wf-ui' }) : { popup: 'wf-ui' }),
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
  const { pickName } = await ctx.loadModule('src/names.mjs');
  const { createCrew } = await ctx.loadModule('src/crew.mjs');
  const { renderFolkCards } = await ctx.loadModule('src/cards.mjs');
  const { renderReservePanel } = await ctx.loadModule('src/reserve-panel.mjs');
  const wages = await ctx.loadModule('src/wages.mjs');
  const perks = await ctx.loadModule('src/mastery-perks.mjs');
  const promotion = await ctx.loadModule('src/promotion.mjs');
  const loadoutRules = await ctx.loadModule('src/loadout-rules.mjs');
  const loadout = await ctx.loadModule('src/loadout.mjs');
  const consumptionRules = await ctx.loadModule('src/consumption-rules.mjs');
  const consumption = await ctx.loadModule('src/consumption.mjs');
  const milestones = await ctx.loadModule('src/milestones.mjs');
  const levels = await ctx.loadModule('src/levels.mjs');
  const healthRules = await ctx.loadModule('src/health-rules.mjs');
  const health = await ctx.loadModule('src/health.mjs');
  const payroll = await ctx.loadModule('src/payroll.mjs');
  const dev = DEV ? await ctx.loadModule('src/dev.mjs') : null;
  const pricing = await ctx.loadModule('src/pricing.mjs');
  const shop = await ctx.loadModule('src/shop.mjs');
  const hiringModule = await ctx.loadModule('src/hiring-skill.mjs');
  const delegationRules = await ctx.loadModule('src/delegation-rules.mjs');
  const skillControl = await ctx.loadModule('src/skill-control.mjs');
  const delegation = await ctx.loadModule('src/delegation.mjs');
  const offline = await ctx.loadModule('src/offline.mjs');
  const produceRate = await ctx.loadModule('src/produce-rate.mjs');
  const acting = await ctx.loadModule('src/acting.mjs');
  const shopData = await ctx.loadModule('src/shop-data.mjs');
  const gearData = await ctx.loadModule('src/gear-data.mjs');
  const discoveryRules = await ctx.loadModule('src/discovery-rules.mjs');
  const discoveries = await ctx.loadModule('src/discoveries.mjs');

  // 1. Language strings were installed in step 0 (needed before any skill/page name is read).

  // 2. Styles + templates.
  ctx.loadStylesheet('css/worker-folks.css');
  await ctx.loadTemplates('ui/templates.html');

  // 3. Register the skill class first, then the data package that references it.
  const { Hiring } = createHiringClass({
    selectDelegable, log, createCrew, createEventBus, folkModel, pickName, renderFolkCards, renderReservePanel, produceRate,
    rules: delegationRules,
    perks,
    promotion,
    pricing,
  });
  ctx.gameData.buildPackage((pkg) => {
    pkg.skills.add(Hiring);
  }).add();
  await ctx.gameData.addPackage('data/hiring.json');
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
    isDisabled: () => state.disabled,
    log,
  });

  // 5b. "Worker" control on every delegable skill page.
  skillControl.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    isDisabled: () => state.disabled,
    log,
  });

  // 5b2. Loadouts: slots by tier, picker, modifier sources.
  loadout.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: loadoutRules,
    consumptionRules,
    log,
  });

  // 5b3. Tablets, consumables and charge gloves used per Folk action.
  consumption.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: consumptionRules,
    log,
  });

  // 5c. Wages, Payroll Reserve, strikes, cooldowns (settings registered here).
  payroll.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    wages,
    pricing,
    milestones,
    log,
  });

  // 5d. Hiring level milestones, Hiring XP share, level gates.
  levels.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: milestones,
    log,
  });

  // 5e. Folk hitpoints: Thieving damage, food, regen, death and frozen slots.
  health.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
    rules: healthRules,
    log,
  });

  // 6. Offline: summary modal for Folk-only sessions, per-Folk lines, offlineTicks hook.
  offline.install(ctx, {
    getHiring: () => game.skills.getObjectByID('worker_folks:Hiring'),
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
        templateLangString('MOD_WF_HIRED_NOTIFICATION', { name: folk.name, role: hiring.roleName(folk.tier) }),
        hiring.portrait(folk.tier),
      );
    });
    hiring.events.on('folkFired', ({ folk, reason }) => log(`folkFired: ${folk.name} (${reason})`));
    hiring.events.on('folkAssigned', ({ folk, skillId }) => log(`folkAssigned: ${folk.name} -> ${skillId}`));
    shopHooks.onCharacterLoaded();
    if (dev !== null) dev.install({ hiring, log, tiers: folkModel.TIERS });
  });
}
