// Net GP per hour for a Folk on the recipe open on a skill page, for the Worker popup's tiles. Game-facing: it reads
// the recipe's product, inputs and time as the Folk (its modifiers swapped in, src/acting.mjs) and leaves the sums to
// src/profit-model.mjs. Nothing is rolled or recorded: the game's own reward getters also count stats, mastery XP and
// pet rolls, so only the side-effect-free parts they are built from are read.
//
// Skills it knows: Woodcutting, Fishing, Mining, Thieving, Cooking, Alt. Magic, Firemaking and every crafting skill
// with a product (Smithing, Fletching, Crafting, Runecrafting, Herblore, Summoning, and mod skills built the same way).
// Anything else, or a page with nothing selected, gives no estimate.

const GP_ID = 'melvorD:GP';
const pctOf = (v) => Math.min(100, Math.max(0, Number(v) || 0)) / 100;

export function install(ctx, { getHiring, model, rate, log }) {
  let hiring;

  const gpValue = (item) => (item?.sellsFor?.currency?.id === GP_ID ? Math.max(0, item.sellsFor.quantity ?? 0) : 0);
  const out = (item, qty) => ({ item, qty, value: gpValue(item) });

  /** The expected primary quantity of one action, from the same modifier reads as the game's roll. */
  const primary = (skill, item, base, action) => {
    if (typeof skill.getActionModifierQuery !== 'function') return base;
    const query = skill.getActionModifierQuery(action);
    const m = skill.game.modifiers;
    const v = (id) => m.getValue(id, query) ?? 0;
    const call = (name, ...args) => (typeof skill[name] === 'function' ? skill[name](...args) ?? 0 : 0);
    return model.expectedPrimaryQuantity({
      base,
      flatBase: call('getFlatBasePrimaryProductQuantityModifier', item, query),
      plusOneChance: v('melvorD:flatBasePrimaryProductQuantityChance'),
      basePercent: call('getBasePrimaryProductQuantityModifier', item, query),
      doublingChance: call('getDoublingChance', action),
      doublePowers: v('melvorD:doubleItemsSkill') + v('melvorD:bypassDoubleItemsSkill'),
      flatAdditional: call('getFlatAdditionalPrimaryProductQuantity', item, query),
      additionalChances: {
        1: v('melvorD:additionalPrimaryProductChance'),
        2: v('melvorD:additional2PrimaryProductChance'),
        3: v('melvorD:additional3PrimaryProductChance'),
        5: v('melvorD:additional5PrimaryProductChance'),
        8: v('melvorD:additional8PrimaryProductChance'),
      },
    });
  };

  /** One action's inputs as [{ item, qty, value }], GP costs at 1 GP. */
  const inputsFrom = (costs) => {
    if (costs === undefined || costs === null) return [];
    const list = costs.getItemQuantityArray().filter(({ quantity }) => quantity > 0).map(({ item, quantity }) => out(item, quantity));
    if (typeof costs.getCurrencyQuantityArray === 'function') {
      costs.getCurrencyQuantityArray().forEach(({ currency, quantity }) => {
        if (currency?.id === GP_ID && quantity > 0) list.push({ qty: quantity, value: 1 });
      });
    }
    return list;
  };
  const currentInputs = (skill) => {
    const costs = skill.getCurrentRecipeCosts().clone();
    if (typeof skill.getCurrentRecipeRuneCosts === 'function') costs.addCosts(skill.getCurrentRecipeRuneCosts());
    return inputsFrom(costs);
  };

  /** What the recipe on the page makes and costs, read as the Folk: the arguments of model.netPerHour, or null. */
  const readRecipe = (skill) => {
    const yieldOf = (folk) => model.folkYield(hiring.rateOf(folk));
    if (typeof Thieving !== 'undefined' && skill instanceof Thieving) {
      const npc = skill.currentNPC;
      if (npc === undefined) return null;
      let gp = 0;
      (npc.currencyDrops ?? []).forEach(({ currency, quantity }) => {
        if (currency?.id !== GP_ID) return;
        const { min, max } = skill.getNPCCurrencyRange(npc, currency, quantity);
        gp += (min + max) / 2;
      });
      if (npc.lootTable?.size > 0 && typeof npc.lootTable.getAverageDropValue === 'function') {
        const drop = npc.lootTable.getAverageDropValue().get(skill.game.gp) ?? 0;
        gp += (pctOf(skill.itemChance ?? 75)) * drop * (1 + pctOf(skill.getDoublingChance(npc)));
      }
      const stunMs = typeof skill.getStunInterval === 'function' ? skill.getStunInterval(npc) * (1 - pctOf(skill.stunAvoidanceChance ?? 0)) : 0;
      return { intervalMs: skill.getNPCInterval(npc), outputs: [{ qty: gp, value: 1 }], npcRate: skill.getNPCSuccessRate(npc), failExtraMs: stunMs, yieldOf };
    }
    if (typeof Woodcutting !== 'undefined' && skill instanceof Woodcutting) {
      const trees = [...(skill.activeTrees ?? [])];
      if (trees.length === 0) return null;
      const outputs = trees.map((tree) => out(tree.product, primary(skill, tree.product, 1, tree) * (skill.getTreeMultiplier?.(tree) ?? 1)));
      return { intervalMs: skill.actionInterval, outputs, yieldOf };
    }
    if (typeof Fishing !== 'undefined' && skill instanceof Fishing) {
      const area = skill.activeFishingArea;
      if (area === undefined) return null;
      const fish = skill.activeFish;
      const share = pctOf(skill.getAreaChances(area)?.fish ?? 100);
      return { intervalMs: skill.actionInterval, outputs: [out(fish.product, share * primary(skill, fish.product, 1, fish))], yieldOf };
    }
    if (typeof Mining !== 'undefined' && skill instanceof Mining) {
      const rock = skill.activeRock;
      return { intervalMs: skill.actionInterval, outputs: [out(rock.product, primary(skill, rock.product, rock.baseQuantity ?? 1, rock))], yieldOf };
    }
    if (typeof Cooking !== 'undefined' && skill instanceof Cooking) {
      // Before its first Cook click no category is active: the first category's chosen recipe stands in, as for Restock.
      const recipe = skill.activeCookingCategory !== undefined
        ? skill.activeRecipe
        : skill.categories?.allObjects?.map((c) => skill.selectedRecipes?.get(c)).find((r) => r !== undefined);
      if (recipe === undefined) return null;
      const perfect = pctOf(skill.getRecipePerfectChance(recipe));
      const qty = primary(skill, recipe.product, recipe.baseQuantity ?? 1, recipe);
      const value = (1 - perfect) * gpValue(recipe.product) + perfect * gpValue(recipe.perfectItem);
      return {
        intervalMs: skill.getRecipeCookingInterval(recipe),
        outputs: [{ qty, value }],
        inputs: inputsFrom(skill.getRecipeCosts(recipe)),
        preservation: skill.getPreservationChance(recipe),
        cookChance: pctOf(skill.getRecipeSuccessChance(recipe)),
        yieldOf,
      };
    }
    if (typeof AltMagic !== 'undefined' && skill instanceof AltMagic) {
      const spell = skill.selectedSpell;
      if (spell === undefined) return null;
      const ratio = spell.productionRatio ?? 1;
      const doubled = 1 + pctOf(skill.selectedSpellDoublingChance ?? 0);
      const P = typeof AltMagicProductionID === 'undefined' ? {} : AltMagicProductionID;
      let outputs;
      if (spell.produces === P.GP) {
        if (skill.selectedConversionItem === undefined) return null;
        outputs = [{ qty: skill.getAlchemyGP(skill.selectedConversionItem, ratio), value: 1 }];
      } else if (spell.produces === P.Bar) {
        const product = skill.selectedSmithingRecipe?.product;
        if (product === undefined) return null;
        outputs = [out(product, ratio * doubled)];
      } else if (spell.produces === P.PerfectFood) {
        const recipe = skill.game.cooking?.actions?.find((r) => r.product === skill.selectedConversionItem);
        if (recipe === undefined) return null;
        outputs = [out(recipe.perfectItem, ratio * doubled)];
      } else if (spell.produces === P.RandomGem || spell.produces === P.RandomSuperiorGem) {
        const table = spell.produces === P.RandomGem ? skill.game.randomGemTable : skill.game.randomSuperiorGemTable;
        const avg = table?.getAverageDropValue?.().get(skill.game.gp);
        if (!(avg > 0)) return null;
        outputs = [{ qty: ratio * doubled, value: avg }];
      } else if (typeof spell.produces === 'object' && spell.produces?.sellsFor !== undefined) {
        outputs = [out(spell.produces, ratio * doubled)];
      } else return null;
      return { intervalMs: skill.actionInterval, outputs, inputs: currentInputs(skill), yieldOf };
    }
    if (typeof Firemaking !== 'undefined' && skill instanceof Firemaking) {
      if (skill.selectedRecipe === undefined) return null;
      // Burning makes nothing to sell here (its XP is the point); the logs and the wage are the cost.
      return { intervalMs: skill.actionInterval, outputs: [], inputs: currentInputs(skill), preservation: skill.getPreservationChance(skill.selectedRecipe), yieldOf };
    }
    // A crafting skill with a product: its recipe's item, base quantity and costs.
    if (typeof skill.getCurrentRecipeCosts === 'function' && skill.selectedRecipe !== undefined) {
      const item = skill.actionItem;
      if (item === undefined || item === null) return null;
      const action = skill.masteryAction;
      return {
        intervalMs: skill.actionInterval,
        outputs: [out(item, primary(skill, item, skill.unmodifiedActionQuantity ?? 1, action))],
        inputs: currentInputs(skill),
        preservation: typeof skill.getPreservationChance === 'function' ? skill.getPreservationChance(action) : 0,
        yieldOf,
      };
    }
    return null;
  };

  /**
   * The estimate for `folk` on the recipe open on `skill`'s page:
   * { actionsPerHour, makes, spends, wage, net, wageCounted } per hour in GP, or null when there is none.
   */
  const profitOf = (folk, skill) => {
    if (folk === undefined || skill === undefined || typeof hiring?.asFolk !== 'function') return null;
    let read;
    try {
      read = hiring.asFolk(folk, skill, () => readRecipe(skill));
    } catch (err) {
      // A recipe skill with nothing selected throws on its getters: no estimate.
      log('no GP/h estimate', skill?.id, err?.message ?? err);
      return null;
    }
    if (read === null || read === undefined) return null;
    const { chance, batches } = read.yieldOf(folk);
    // Thieving: the Folk's own roll, then the NPC's (src/produce-rate.mjs folkSuccessRate). Cooking: a burn gives nothing.
    const success = chance * (read.npcRate === undefined ? 1 : pctOf(read.npcRate)) * (read.cookChance ?? 1);
    const payroll = hiring.payroll;
    const wageCounted = payroll !== undefined && payroll.enabled && payroll.currencyIdFor(skill) === GP_ID;
    const result = model.netPerHour({
      intervalMs: read.intervalMs,
      outputs: read.outputs,
      inputs: read.inputs ?? [],
      preservation: read.preservation ?? 0,
      chance: success,
      batches,
      failExtraMs: read.failExtraMs ?? 0,
      wagePerHour: wageCounted ? payroll.hourlyWageOf(folk) : 0,
    });
    return result === null ? null : { ...result, wageCounted };
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.profitOf = profitOf;
  });
}
