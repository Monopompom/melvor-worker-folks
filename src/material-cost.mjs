// What an item costs in work, read from the game's own data (build .248). Game-facing; the rules and find rates are
// in material-cost-model.mjs, passed in from setup.mjs. Work Orders and Township Commissions ask how long an item
// takes from raw materials, so a card's hours are the hours it takes, and leave out what no Folk can get.
//
// The sources: Woodcutting trees, Fishing spots and Mining rocks at their base pace (a gem vein and Meteorite Ore at
// their find rates), the random gems and superior gems Mining gives, farm produce on the plots you own, and what the
// shop sells that no skill gets or makes (no work: it costs GP). The recipes: every action of every skill in the
// Melvor realm that uses items and makes one (a Fletching recipe's other logs and a Summoning tablet's other items are
// other ways). The book is built at most once a minute: the data never changes, the farm plots you own seldom.

const METEORITE_ID = 'melvorTotH:Meteorite_Ore';
const REBUILD_MS = 60000;

export function create({ model, log = () => {} }) {
  let cached = null;
  let builtAt = 0;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const melvorRealm = (action) => action?.realm === undefined || action.realm === game.defaultRealm;
  const actionsOf = (skill) => {
    try { return skill?.actions?.allObjects ?? [...(skill?.actions ?? [])]; } catch { return []; }
  };

  /** An action's own time at base pace: its interval, the middle of a Fishing range, or the skill's. */
  const intervalOf = (skill, action) => {
    const own = num(action?.baseInterval);
    if (own > 0) return own;
    const lo = num(action?.baseMinInterval);
    const hi = num(action?.baseMaxInterval);
    if (lo > 0 && hi > 0) return (lo + hi) / 2;
    return Math.max(0, num(skill?.baseInterval));
  };

  /** The items an action makes: its product, a perfect cook, every potion tier (the tier follows mastery). */
  const productsOf = (action) => {
    const items = [];
    if (action?.product instanceof Item) items.push(action.product);
    if (action?.perfectCook instanceof Item) items.push(action.perfectCook);
    if (Array.isArray(action?.potions)) action.potions.forEach((p) => { if (p instanceof Item) items.push(p); });
    return items;
  };

  const costsOf = (list) => (Array.isArray(list) ? list : [])
    .map((c) => ({ id: c?.item?.id, qty: num(c?.quantity) }))
    .filter((c) => typeof c.id === 'string' && c.qty > 0);

  /** Every way to do one action: { ms, out, costs }; none for an action that uses no items (gathering). */
  const waysOf = (skill, action) => {
    const ms = intervalOf(skill, action);
    const out = Math.max(1, num(action?.baseQuantity) || 1);
    if (Array.isArray(action?.alternativeCosts) && action.alternativeCosts.length > 0) {
      return action.alternativeCosts.map((alt) => ({ ms, out: out * Math.max(1, num(alt?.quantityMultiplier) || 1), costs: costsOf(alt?.itemCosts) }));
    }
    if (Array.isArray(action?.nonShardItemCosts) && action.nonShardItemCosts.length > 0 && typeof skill?.getAltRecipeCosts === 'function') {
      const ways = [];
      for (const item of action.nonShardItemCosts) {
        try { ways.push({ ms, out, costs: costsOf(skill.getAltRecipeCosts(action, item).getItemQuantityArray()) }); } catch {}
      }
      if (ways.length > 0) return ways;
    }
    if (!Array.isArray(action?.itemCosts) || action.itemCosts.length === 0) return [];
    return [{ ms, out, costs: costsOf(action.itemCosts) }];
  };

  const build = () => {
    const sources = {};
    const recipes = {};
    const add = (map, id, entry) => {
      if (typeof id !== 'string') return;
      (map[id] ??= []).push(entry);
    };
    const gatherers = new Set([game.woodcutting, game.fishing, game.mining, game.farming].filter(Boolean));

    for (const skill of [game.woodcutting, game.fishing]) {
      actionsOf(skill).forEach((a) => { if (melvorRealm(a)) add(sources, a.product?.id, { ms: intervalOf(skill, a) }); });
    }

    const mining = game.mining;
    const miningMs = Math.max(1, num(mining?.baseInterval) || 3000);
    const rocks = actionsOf(mining).filter(melvorRealm);
    const veins = rocks.filter((r) => num(r.gemVeinWeight) > 0);
    const veinTotal = veins.reduce((s, r) => s + num(r.gemVeinWeight), 0);
    const astrology = game.astrology;
    const astrologyMs = intervalOf(astrology, actionsOf(astrology)[0]) || 3000;
    rocks.forEach((rock) => {
      const id = rock.product?.id;
      if (num(rock.gemVeinWeight) > 0) add(sources, id, { ms: model.gemVeinMs({ miningMs, weight: num(rock.gemVeinWeight), totalWeight: veinTotal }), kind: 'find' });
      else if (id === METEORITE_ID) add(sources, id, { ms: model.meteoriteMs({ astrologyMs, miningMs }), kind: 'find' });
      // A rock that only has what something else finds for it (none other in the Melvor realm) is no source.
      else if (rock.fixedMaxHP === undefined || rock.hasPassiveRegen !== false) add(sources, id, { ms: miningMs / Math.max(1, num(rock.baseQuantity) || 1) });
    });
    const table = (t) => (Array.isArray(t?.drops) ? t.drops : []).filter((d) => d?.item instanceof Item && num(d.weight) > 0);
    const gems = table(game.randomGemTable);
    const gemTotal = gems.reduce((s, d) => s + num(d.weight), 0);
    gems.forEach((d) => add(sources, d.item.id, { ms: model.randomGemMs({ miningMs, weight: num(d.weight), totalWeight: gemTotal }) / Math.max(1, num(d.minQuantity) || 1), kind: 'find' }));
    const superior = table(game.randomSuperiorGemTable);
    const superiorTotal = superior.reduce((s, d) => s + num(d.weight), 0);
    // The veins' own superior gem chance, weighted as the veins are found.
    const chance = veinTotal > 0 ? veins.reduce((s, r) => s + num(r.superiorGemChance) * num(r.gemVeinWeight), 0) / veinTotal : 0;
    superior.forEach((d) => add(sources, d.item.id, { ms: model.superiorGemMs({ miningMs, chance, weight: num(d.weight), totalWeight: superiorTotal }), kind: 'find' }));

    const farming = game.farming;
    actionsOf(farming).forEach((r) => {
      if (!melvorRealm(r)) return;
      let plots = 0;
      try { plots = farming.getPlotsForCategory(r.category).filter((p) => p.state !== 0).length; } catch {}
      const harvest = num(r.baseQuantity) || num(r.seedCost?.quantity) * num(r.category?.harvestMultiplier) || 1;
      add(sources, r.product?.id, { ms: model.farmMs({ growthMs: num(r.baseInterval), harvest, plots }), kind: 'farm' });
    });

    for (const skill of game.skills.allObjects) {
      if (gatherers.has(skill)) continue;
      try {
        actionsOf(skill).forEach((a) => {
          if (!melvorRealm(a)) return;
          const items = productsOf(a);
          if (items.length === 0) return;
          const ways = waysOf(skill, a);
          if (ways.length === 0) return;
          items.forEach((item) => ways.forEach((w) => add(recipes, item.id, w)));
        });
      } catch (err) { log(`material costs: ${skill?.id} skipped`, err); }
    }
    // The shop last, and only for what no skill gets or makes (Feathers, hides, shards): a resupply pack's Lobsters are
    // still Fishing and Cooking, or every tablet that eats fish would cost no work.
    try {
      actionsOf({ actions: game.shop.purchases }).forEach((p) => {
        (p?.contains?.items ?? []).forEach((c) => {
          const id = c?.item?.id;
          if (typeof id === 'string' && (sources[id] === undefined || sources[id].every((x) => x.kind === 'shop')) && recipes[id] === undefined) add(sources, id, { ms: 0, kind: 'shop' });
        });
      });
    } catch {}
    return model.costBook({ sources, recipes });
  };

  const book = () => {
    const now = Date.now();
    if (cached === null || now - builtAt > REBUILD_MS) {
      try { cached = build(); } catch (err) { log('material costs not built', err); cached = null; }
      builtAt = now;
    }
    return cached;
  };

  return {
    /**
     * One action's item, the whole chain: { unitMs, knownMs, askable }, or null when the book can't be read (then
     * the boards fall back to the Folk's own time). Gathering costs what its source does (a gem vein its find rate).
     */
    actionCost(skill, action) {
      const b = book();
      if (b === null) return null;
      const ways = waysOf(skill, action);
      let best;
      if (ways.length === 0) {
        const id = productsOf(action)[0]?.id;
        if (id === undefined) return null;
        best = b.unit(id);
        // Never cheaper than the action itself.
        const own = intervalOf(skill, action) / Math.max(1, num(action?.baseQuantity) || 1);
        if (Number.isFinite(best.ms) && best.ms < own) best = { ...best, ms: own, known: Math.max(own, best.known) };
      } else {
        best = ways.map((w) => b.action(w)).reduce((x, y) => (y.ms < x.ms || (y.ms === x.ms && y.known < x.known) ? y : x));
      }
      return { unitMs: best.ms, knownMs: best.known, askable: model.askable(best.ms) };
    },
    /** Drops the book: the next question builds it again. */
    reset() { cached = null; },
  };
}
