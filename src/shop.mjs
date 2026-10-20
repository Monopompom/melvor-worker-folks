// Shop integration: exponential hire and Shift Slot pricing, live "crew space"
// and "slot cap" requirement lines, and turning a paid hire into a Folk.
// Game-facing.

export function install(ctx, { getHiring, pricing, licencePurchase, hirePurchase, shiftSlotPurchase, log }) {
  const { hirePriceForQuantity, shiftSlotPrice, shiftSlotCap } = pricing;
  let hiring;
  /** cost object (as the shop passes it to getCurrencyCost) → tier */
  const hireCostTier = new WeakMap();
  const shiftSlotCost = new WeakSet();
  const hireTier = new Map();
  const licenceTier = new Map();
  let shiftSlot;
  /** Requirement objects whose text must follow the crew. */
  const liveRequirements = [];

  /** A requirement the engine renders and checks like its own (needs type, check, getNodes). */
  class LiveRequirement extends GameRequirement {
    constructor(type, isMet, text) {
      super(game);
      this.type = type;
      this._isMet = isMet;
      this._text = text;
      this.textNodes = new Set();
    }
    isMet() {
      return hiring !== undefined && this._isMet();
    }
    notifyFailure() {
      game.notifications.createErrorNotification(`worker_folks:${this.type}`, this._text());
    }
    getNodes(imageClass) {
      const node = document.createTextNode(hiring === undefined ? '' : this._text());
      this.textNodes.add(node);
      return [this.createImage(hiring === undefined ? '' : hiring.media, imageClass), node];
    }
    refresh() {
      const text = this._text();
      this.textNodes.forEach((node) => { node.textContent = text; });
    }
  }

  const indexPurchases = () => {
    hireTier.clear();
    licenceTier.clear();
    for (const [tier, localId] of Object.entries(hirePurchase)) {
      const purchase = hiring.purchase(localId);
      if (purchase === undefined) continue;
      hireTier.set(purchase, tier);
      [purchase._defaultCosts, ...purchase._costs.values()].forEach((costs) => costs?.currencies.forEach((c) => hireCostTier.set(c, tier)));
    }
    for (const [tier, localId] of Object.entries(licencePurchase)) {
      const purchase = hiring.purchase(localId);
      if (purchase !== undefined) licenceTier.set(purchase, tier);
    }
    shiftSlot = hiring.purchase(shiftSlotPurchase);
    if (shiftSlot !== undefined) {
      [shiftSlot._defaultCosts, ...shiftSlot._costs.values()].forEach((costs) => costs?.currencies.forEach((c) => shiftSlotCost.add(c)));
    }
  };

  /** Called right after the shop package registered (soft dependencies already resolved). */
  const addLiveRequirements = () => {
    const crewSpace = new LiveRequirement(
      'WorkerFolksCrewSpace',
      () => hiring.crew.size < hiring.folkCap && hiring.crew.freeSlot({ limit: hiring.folkCap }) >= 0,
      () => (hiring.crew.size < hiring.folkCap && hiring.health !== undefined && hiring.crew.frozenSlots().size > 0
        ? hiring.health.thawText()
        : templateLangString('MOD_WF_REQ_CREW_SPACE', { size: `${hiring.crew.size}`, cap: `${hiring.folkCap}` })),
    );
    hireTier.forEach((_, purchase) => purchase._defaultPurchaseRequirements.push(crewSpace));
    const slotCap = new LiveRequirement(
      'WorkerFolksSlotCap',
      () => hiring.shiftSlots - hiring.extraShiftSlots < shiftSlotCap(hiring.highestLicence, hiring.folkCap),
      () => {
        // Before any Licence there is nothing to own yet: say what opens the slots, not "0 of 0" (scan B-22, B-25, build .112).
        if (hiring.highestLicence === null) return getLangString('MOD_WF_REQ_SLOT_NO_LICENCE');
        const cap = shiftSlotCap(hiring.highestLicence, hiring.folkCap);
        const owned = hiring.shiftSlots - hiring.extraShiftSlots;
        const text = cap >= hiring.folkCap
          ? templateLangString('MOD_WF_REQ_SLOT_CAP_SKILLS', { owned: `${owned}`, cap: `${cap}` })
          : templateLangString('MOD_WF_REQ_SLOT_CAP', { owned: `${owned}`, cap: `${cap}`, role: hiring.roleName(hiring.highestLicence) });
        // Free slots from Hiring levels count in "owned"; say so, or the count looks higher than what was bought.
        const free = hiring.levels?.freeShiftSlots() ?? 0;
        return free > 0 ? text + templateLangString('MOD_WF_REQ_SLOT_FREE', { free: `${free}` }) : text;
      },
    );
    if (shiftSlot !== undefined) shiftSlot._defaultPurchaseRequirements.push(slotCap);
    liveRequirements.push(crewSpace, slotCap);
    addStaffRequirement();
  };

  // Another mod's staff guard (Voyage: hire only in a town) as a line on every hire, met or not, so the Shop says
  // before the click. Added once the first staff guard exists; without one the hires look as before.
  let staffRequirement;
  const addStaffRequirement = () => {
    if (staffRequirement !== undefined || hiring === undefined || hireTier.size === 0 || hiring.guards.count('staff') === 0) return;
    const why = () => hiring.refusal('staff', { action: 'hire' });
    staffRequirement = new LiveRequirement('WorkerFolksStaff', () => why() === '', () => why() || getLangString('MOD_WF_REQ_HIRE_HERE'));
    hireTier.forEach((_, purchase) => purchase._defaultPurchaseRequirements.push(staffRequirement));
    liveRequirements.push(staffRequirement);
  };

  const refreshShop = () => {
    addStaffRequirement();
    liveRequirements.forEach((r) => r.refresh());
    game.shop.renderQueue.costs = true;
    game.shop.renderQueue.requirements = true;
  };

  // 1. Prices: hires = base × 1.2^(owned of that tier); Shift Slot = 3M × 1.4^(n−1).
  ctx.patch(Shop, 'getCurrencyCost').replace(function (original, cost, buyQuantity, boughtQuantity) {
    if (hiring === undefined) return original(cost, buyQuantity, boughtQuantity);
    if (shiftSlotCost.has(cost)) {
      let total = 0;
      for (let i = 0; i < buyQuantity; i += 1) total += shiftSlotPrice(boughtQuantity + i);
      return total;
    }
    const tier = hireCostTier.get(cost);
    if (tier === undefined) return original(cost, buyQuantity, boughtQuantity);
    return hirePriceForQuantity(tier, hiring.crew.countByTier(tier), buyQuantity);
  });

  return {
    /** Run after the shop package is registered and before the shop menu is built. */
    afterShopData() {
      hiring = getHiring();
      hiring.refreshShop = refreshShop;
      indexPurchases();
      addLiveRequirements();
    },
    onCharacterLoaded() {
      // 2. A paid hire becomes a Folk; the shop re-prices itself right after.
      game.shop.on('purchaseMade', (e) => {
        const tier = hireTier.get(e.purchase);
        if (tier !== undefined) {
          for (let i = 0; i < e.quantity; i += 1) {
            if (hiring.crew.hire(tier, { source: 'shop', limit: hiring.folkCap }) === null) console.error('[Worker Folks] hire paid but no free slot');
          }
          return;
        }
        if (e.purchase === shiftSlot) {
          log(`shift slot bought; slots now ${hiring.shiftSlots}`);
          refreshShop();
          return;
        }
        const licence = licenceTier.get(e.purchase);
        if (licence !== undefined) {
          log(`licence bought: ${licence}; shift slots now ${hiring.shiftSlots}`);
          game.notifications.createSuccessNotification(
            'worker_folks:licence',
            templateLangString('MOD_WF_LICENCE_BOUGHT', {
              role: hiring.roleName(licence),
              slots: `${hiring.shiftSlots - hiring.extraShiftSlots}`,
              cap: `${shiftSlotCap(hiring.highestLicence, hiring.folkCap)}`,
            }),
            e.purchase.media,
          );
          refreshShop();
        }
      });
      hiring.events.on('crewChanged', refreshShop);
      // The live requirements were built before the save loaded: refresh them once, or the Shop shows the empty
      // character's texts until the first purchase (scan C-01, build .112).
      refreshShop();
    },
  };
}
