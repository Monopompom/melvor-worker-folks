// The Hiring skill: a SkillWithMastery whose mastery actions are Folk slots.
// A fixed pool of slots is registered from data (registration happens before the
// save is read, and other mods may add skills later), and only the first
// `delegableCount` slots are exposed to the mastery UI, pool cap and token odds.

export const SKILL_ID = 'worker_folks:Hiring';
export const MAX_FOLK_SLOTS = 24;
/** Shop purchase ids (local part) per tier. */
export const LICENCE_PURCHASE = { Newbie: 'Licence_Newbie', Junior: 'Licence_Junior', Middle: 'Licence_Middle', Senior: 'Licence_Senior', Expert: 'Licence_Expert' };
export const HIRE_PURCHASE = { Newbie: 'Hire_Newbie', Junior: 'Hire_Junior', Middle: 'Hire_Middle', Senior: 'Hire_Senior', Expert: 'Hire_Expert' };
export const SHIFT_SLOT_PURCHASE = 'Shift_Slot';
/** Marks the start of mod data inside the skill's save region ("WOLK"). */
export const SAVE_MAGIC = 0x574f4c4b;
/**
 * Popup buttons (build .55): confirm green, cancel blue outline (the game's default cancel is red and grey
 * means disabled). Promote is an upgrade and stays the game's primary blue; Fire loses the Folk, so its confirm is red.
 */
const swalClass = (extra = {}) => {
  const cls = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1', cancelButton: 'btn btn-outline-info m-1', ...extra };
  return typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls;
};

export function createHiringClass({ popupDidRender, titleName = (s) => s, time, selectDelegable, log, createCrew, createEventBus, folkModel, pickName, renderFolkCards, renderReservePanel, produceRate, rules, perks, promotion, pricing, tips, layout, dashboard }) {
  class FolkSlotAction extends MasteryAction {
    constructor(namespace, data, game, skill) {
      super(namespace, data, game);
      this.index = data.index;
      this.hiring = skill;
    }
    get name() {
      return this.hiring.getSlotName(this);
    }
    get media() {
      return this.hiring.getSlotMedia(this);
    }
  }

  class Hiring extends SkillWithMastery {
    constructor(namespace, game) {
      super(namespace, 'Hiring', game, 'FolkSlot');
      // The gold-ringed icon, as Voyage's in the sidebar (the user, build .90).
      this._media = 'img/icon.webp';
      this.renderQueue = new MasterySkillRenderQueue();
      /** Active actions a Folk may hold, computed on character load. */
      this.delegableSkills = [];
      /** Skill ids excluded by the player (settings, later ticket). */
      this.excludedSkillIds = [];
      /** Mod-wide event bus; other slices subscribe here instead of patching each other. */
      this.events = createEventBus();
      /** Every hired Folk. Persisted inside this skill's save region (see encode). */
      this.crew = createCrew({
        bus: this.events,
        model: folkModel,
        pickName,
        maxSlots: MAX_FOLK_SLOTS,
      });
      this.renderQueue.folks = false;
      /** Skills currently running beside the main action (delegation.mjs). */
      this.delegated = new Set();
      /** The delegated skill whose stop() is in progress (delegation.mjs). */
      this.stopping = undefined;
      /** True while forceStop runs: the mod stops a skill, not the player (delegation.mjs hand-over). */
      this.forcing = false;
      /**
       * skill → folk id | null: a working Folk picked on another page moves when that page
       * starts; null means the player takes the skill over at its next start.
       */
      this.pending = new Map();
      /** Testing aid: extra Shift Slots granted by the dev console (not saved). */
      this.devExtraShiftSlots = 0;
      /** { folk, skill, table, outcome } while a delegated skill resolves (acting.mjs). */
      this.acting = undefined;
      /** Outcome of the most recent delegated action: 'fail' | 'ok' | 'bonus'. */
      this.lastOutcome = undefined;
      this.events.on('crewChanged', () => {
        this.renderQueue.folks = true;
        this.sortedMasteryActions.forEach((a) => this.renderQueue.actionMastery.add(a));
      });
      this.events.on('folkReleased', ({ skill: released, folk }) => {
        if (folk === undefined) return;
        this.pending.forEach((id, skill) => {
          if (id === folk.id || (id === null && skill === released)) this.applyPending(skill);
        });
      });
      this.events.on('folkFired', ({ folk }) => {
        this.pending.forEach((id, skill) => { if (id === folk.id) this.clearPending(skill); });
        this.resetSlotMastery(folk.slot);
      });
      /** Cards unfolded by the player (not saved). */
      this.expanded = new Set();
    }

    // ---- persistence -------------------------------------------------------
    // Folks live in the game save (cloud-synced, no 8 KB characterStorage cap).
    // The game wraps each skill's region with a byte length, so a save made with
    // this mod still loads when the mod is removed. A magic word guards against
    // saves written by builds that wrote nothing after the base skill data.

    encode(writer) {
      super.encode(writer);
      writer.writeUint32(SAVE_MAGIC);
      writer.writeString(this.crew.serialize());
      return writer;
    }

    decode(reader, version) {
      super.decode(reader, version);
      if (peekUint32(reader) !== SAVE_MAGIC) return;
      reader.getUint32();
      const json = reader.getString();
      const report = this.crew.load(json);
      if (report.corrupt) console.warn('[Worker Folks] crew data was unreadable; starting with an empty crew');
      if (report.applied.length > 0) log(`migrated crew save from v${report.applied[0]} to v${folkModel.SAVE_VERSION}`);
      if (report.dropped > 0) console.warn(`[Worker Folks] dropped ${report.dropped} invalid Folk record(s)`);
    }

    // ---- presentation --------------------------------------------------------

    roleName(tier) {
      return getLangString(`MOD_WF_ROLE_${tier}`);
    }

    portrait(tier) {
      return this.getMediaURL(`img/worker_folk_${tier.toLowerCase()}.webp`);
    }

    /**
     * On strike / owing wages right now. With wages off (No sweat) both are parked, not forgiven: the Folk works free
     * and the state comes back when a paid difficulty returns, so No sweat is no free way out of a strike (build .86).
     */
    struck(folk) {
      return folk.onStrike && this.payroll?.enabled !== false;
    }

    owing(folk) {
      return folk.debt > 0 && this.payroll?.enabled !== false;
    }

    statusOf(folk) {
      if (this.struck(folk)) return 'strike';
      if (folk.cooldownTicks > 0) return 'cooldown';
      if (this.owing(folk)) return 'debt';
      const skill = this.skillOf(folk);
      if (skill === undefined || !this.delegated.has(skill)) return 'idle';
      return this.perksOf(folk).overtimeActive ? 'overtime' : 'working';
    }

    /** May the Folk start work? Debt alone is fine (grace time); strikes and cooldowns are not. */
    folkAvailable(folk) {
      const status = this.statusOf(folk);
      return status !== 'cooldown' && status !== 'strike';
    }

    stopFolk(folk) {
      const skill = this.skillOf(folk);
      if (skill === undefined || !this.delegated.has(skill)) return false;
      const stopped = skill.stop();
      this.renderQueue.folks = true;
      return stopped;
    }

    /**
     * Ends a delegated run no matter what: a death, a strike or a firing must not
     * leave the skill active. Thieving refuses stop() while stunned, so the stun is
     * cleared first (the engine does the same in its own stopOnDeath). When the
     * engine still refuses (Golbin Raid) the skill is dropped from the roster.
     */
    forceStop(skill) {
      if (skill === undefined || !this.delegated.has(skill)) return; // never touches the player's own run
      if (skill.stunTimer !== undefined && 'stunState' in skill) {
        skill.stunState = 0;
        skill.stunTimer.stop();
      }
      // forcing: the mod's own stop (strike, fire, reassign…), never the player's hand-over click (delegation.mjs).
      const previous = this.forcing;
      this.forcing = true;
      try {
        if (!skill.stop()) this.release(skill);
      } finally {
        this.forcing = previous;
      }
      // stop() inside an action: GatheringSkill.action restarts the timer afterwards
      // (acting.mjs clears it); outside one, nothing should keep ticking.
      if (!skill.isActive && skill.actionTimer?.isActive && this.acting?.skill !== skill) skill.actionTimer.stop();
      skill.renderQueue.progressBar = true;
    }

    /** What a delegated skill is doing right now (tree, recipe, NPC...) as `{ name, media }`, or null. */
    currentAction(skill) {
      if (skill === undefined || !this.delegated.has(skill)) return null;
      try {
        const action = skill.masteryAction;
        if (typeof action?.name !== 'string') return null;
        let media;
        try { media = action.media; } catch { media = undefined; }
        return { name: action.name, media: typeof media === 'string' ? media : undefined };
      } catch {
        return null;
      }
    }

    currentActionName(skill) {
      return this.currentAction(skill)?.name ?? null;
    }

    /** Hourly wage for working `skill` as `{ text, icon }` (its currency), or null when wages are off. */
    wageLine(folk, skill) {
      const payroll = this.payroll;
      if (payroll === undefined || !payroll.enabled) return null;
      const currencyId = payroll.currencyIdFor(skill);
      const currency = this.game.currencies.getObjectByID(currencyId);
      return {
        text: templateLangString('MOD_WF_CTRL_WAGE', { wage: numberWithCommas(Math.round(payroll.hourlyWageOf(folk))), currency: currency?.name ?? currencyId }),
        icon: currency?.media,
      };
    }

    /** A cooldown's time left as the page writes times ("4m 59s", never "0h 4m 60s"; src/time-format.mjs, build .112). */
    cooldownLeft(folk) {
      return time.shortTime(folk.cooldownTicks * TICK_INTERVAL);
    }

    /** Opens the Shop on the Worker Folks tab (the empty card, the Worker popup with nobody hired). */
    openShop() {
      // false, false: a page link must not toggle the game menu open on narrow screens (the plain changePage call does that below 992px).
      const page = this.game.pages.getObjectByID('melvorD:Shop');
      if (page === undefined) return;
      changePage(page, -1, undefined, false, false);
      // The Shop opens on its last tab (General Upgrades on a fresh character); show ours (build .83).
      try {
        const category = this.game.shop.categories.getObjectByID('worker_folks:WorkerFolks');
        if (category !== undefined) shopMenu.showSingleTab(category);
      } catch (err) { log('shop tab failed', err); }
      this.closeNarrowMenu();
    }

    /** Opens the Hiring page from another page (the Worker box's link). */
    openPage() {
      const page = this.game.pages.getObjectByID('worker_folks:Hiring');
      if (page === undefined) return;
      changePage(page, -1, undefined, false, false);
      this.closeNarrowMenu();
    }

    /** Below 992px a page link left the game menu open over the page (Voyage's lesson, build .83). */
    closeNarrowMenu() {
      try {
        const narrow = !window.matchMedia('(min-width: 992px)').matches;
        if (narrow && document.getElementById('page-container')?.classList.contains('sidebar-o-xs')) One.layout('sidebar_close');
      } catch (err) { log('menu close failed', err); }
    }

    /**
     * Worker-modal tile lines under "name (role)", styled like the Hiring card:
     * Produce Rate (blue badge) and wage (yellow badge) on their own lines, the tier effects as pieces,
     * then the status in colour with its icon, skill and action ("Idle · Fishing · Raw Shrimp").
     */
    folkLines(folk, pageSkill) {
      const lines = [{ badges: [{ cls: 'badge badge-info', text: templateLangString('MOD_WF_CARD_RATE', { rate: `${produceRate.produceRate(folk.tier)}` }) }] }];
      const wage = this.wageLine(folk, pageSkill);
      if (wage !== null) lines.push({ badges: [{ cls: 'badge badge-warning', text: wage.text }] });
      const effects = this.tierEffects(folk.tier);
      if (effects.length > 0) lines.push({ effects });
      const status = this.statusOf(folk);
      const skill = this.skillOf(folk);
      const cls = `wf-text-${status} font-w700`;
      lines.push({ icon: this.getMediaURL(`img/status_${status}.webp`), text: getLangString(`MOD_WF_STATUS_${status}`), cls });
      // A Folk that can't be picked says how to get it back (build .55).
      if (status === 'strike') lines.push({ text: getLangString('MOD_WF_TILE_FIX_strike'), cls: 'text-warning' });
      if (status === 'cooldown') lines.push({ text: templateLangString('MOD_WF_TILE_FIX_cooldown', { time: this.cooldownLeft(folk) }), cls: 'text-warning' });
      if (folk.skillId !== null) {
        // "⛏ Woodcutting (🌳 Oak Tree)": skill icon + name, then the current action in brackets.
        const segments = [{ icon: this.game.skills.getObjectByID(folk.skillId)?.media, text: this.skillName(folk.skillId) }];
        const action = this.currentAction(skill);
        if (action !== null) segments.push({ text: ' (' }, { icon: action.media, text: action.name }, { text: ')' });
        lines.push({ segments, cls });
      }
      return lines;
    }

    /**
     * A skill's name as the mod prints it (a skill or its id). Magic is one skill shared by combat and Alt. Magic, and
     * the game names it "Magic"; a Folk only ever does Alt. Magic, so it is named after its page (build .83).
     */
    skillName(skillOrId) {
      const skill = typeof skillOrId === 'string' ? this.game.skills.getObjectByID(skillOrId) : skillOrId;
      if (skill === undefined || skill === null) return typeof skillOrId === 'string' ? skillOrId : '';
      if (typeof AltMagic !== 'undefined' && skill instanceof AltMagic) return getLangString('PAGE_NAME_AltMagic');
      return skill.name;
    }

    /** Entries for a skill page's Worker dropdown. */
    workerOptions(skill) {
      return rules.workerOptions({
        folks: this.crew.all.map((f) => ({ id: f.id, name: f.name, tier: f.tier, skillId: f.skillId, available: this.folkAvailable(f), lines: this.folkLines(f, skill) })),
        skillId: skill.id,
        skillNameOf: (id) => this.skillName(id),
      });
    }

    /**
     * Who takes this skill at its next start: a Folk waiting to move here, null when
     * the player takes it back from a working Folk, undefined when nothing is pending.
     */
    pendingFor(skill) {
      const id = this.pending.get(skill);
      if (id === undefined) return undefined;
      if (id === null) return null;
      const folk = this.crew.byId(id);
      if (folk === undefined) this.pending.delete(skill);
      return folk;
    }

    clearPending(skill) {
      if (this.pending.delete(skill)) this.events.emit('folkPending', { skill, folk: undefined });
    }

    /**
     * Puts a Folk on a skill (folkId null: the player works it; the holder is unassigned).
     * A Folk busy on another skill keeps working there until this skill is started, and a
     * Folk working this skill keeps going until the player starts an action here.
     */
    setWorker(skill, folkId) {
      this.clearPending(skill);
      if (folkId === null) {
        const holder = this.crew.bySkill(skill.id);
        if (holder === undefined) return true;
        if (rules.releaseMode({ working: this.delegated.has(skill) }) === 'now') return this.crew.assign(holder.id, null);
        this.pending.set(skill, null);
        this.events.emit('folkPending', { skill, folk: null });
        return true;
      }
      const folk = this.crew.byId(folkId);
      if (folk === undefined) return false;
      const current = this.skillOf(folk);
      const mode = rules.moveMode({
        currentSkillId: folk.skillId,
        targetSkillId: skill.id,
        working: current !== undefined && this.delegated.has(current),
      });
      if (mode === 'none') return true;
      if (mode === 'now') return this.crew.assign(folkId, skill.id);
      this.pending.forEach((id, other) => { if (id === folkId) this.pending.delete(other); });
      this.pending.set(skill, folkId);
      this.events.emit('folkPending', { skill, folk });
      return true;
    }

    /**
     * Called when a skill starts: a pending Folk moves onto it now (its old skill stops),
     * or the player takes it back (the working Folk is unassigned and stops).
     */
    applyPending(skill) {
      const folk = this.pendingFor(skill);
      if (folk === undefined) return;
      this.pending.delete(skill);
      if (folk === null) {
        const holder = this.crew.bySkill(skill.id);
        if (holder !== undefined) this.crew.assign(holder.id, null);
        else this.events.emit('folkPending', { skill, folk: undefined });
        return;
      }
      this.crew.assign(folk.id, skill.id);
    }

    assignmentText(folk) {
      if (folk.skillId === null) return getLangString('MOD_WF_UNASSIGNED');
      return this.skillName(folk.skillId);
    }

    /** The "?" buttons on the Hiring page (reserve, frozen slot): explanations live behind them. */
    wireHelp() {
      const container = document.getElementById('worker-folks-container');
      // Its own flag: `dataset.wfHelp` would be `data-wf-help`, the "?" buttons' own attribute, so closest() below
      // matched the page itself and every click on it opened the frozen-slot popup (user report, build .57).
      if (container === null || container.dataset.wfHelpWired === '1') return;
      container.dataset.wfHelpWired = '1';
      // Each "?" is named after its topic, as Voyage's (scan A-29, C-33, build .112).
      container.querySelectorAll('[data-wf-help]').forEach((b) => b.setAttribute('aria-label', getLangString(`MOD_WF_HELP_LABEL_${b.dataset.wfHelp}`)));
      container.addEventListener('click', (e) => {
        const button = e.target instanceof Element ? e.target.closest('[data-wf-help]') : null;
        if (button === null) return;
        const topic = button.dataset.wfHelp;
        if (topic !== 'reserve' && topic !== 'frozen') return;
        const capacity = this.payroll?.capacityHours?.() ?? 0;
        // Help popup layout: a grey band per idea, a heading, one sentence a line.
        // Every band with its heading (scan A-28, C-23, build .112).
        const sections = topic === 'reserve'
          ? [
            { head: getLangString('MOD_WF_RESERVE_HELP_ORDER_HEAD'), body: [getLangString('MOD_WF_RESERVE_HELP_ORDER'), getLangString('MOD_WF_RESERVE_HELP_STRIKE')] },
            ...(capacity > 0 && capacity !== Infinity ? [{
              head: getLangString('MOD_WF_RESERVE_HELP_CAP_HEAD'),
              body: [templateLangString('MOD_WF_RESERVE_HELP_CAP', { hours: `${capacity}` }), getLangString('MOD_WF_RESERVE_HELP_COVERS'), getLangString('MOD_WF_RESERVE_HELP_GROWS')],
            }] : []),
          ]
          : [{ head: getLangString('MOD_WF_SLOT_FROZEN_HEAD'), body: (this.health?.freezeReason() ?? '').split(/(?<=[.!?])\s+/) }]; // one sentence a line
        const html = sections.map((sec) => `<div class="wf-band">${sec.head ? `<div class="wf-help-head">${sec.head}</div>` : ''}`
          + `${sec.body.filter(Boolean).map((l) => `<p class="wf-help-p">${l}</p>`).join('')}</div>`).join('');
        SwalLocale.fire({
          didRender: popupDidRender,
          title: getLangString(topic === 'reserve' ? 'MOD_WF_RESERVE_TITLE' : 'MOD_WF_SLOT_FROZEN_TITLE'),
          width: '38rem', // a little wider than the game's 32em default
          html: `<div class="text-left wf-help-body">${html}</div>`,
          confirmButtonText: getLangString('MOD_WF_BUTTON_GOT_IT'),
          customClass: swalClass(),
        });
      });
    }

    renderReserve() {
      const payroll = this.payroll;
      if (payroll === undefined) return;
      const capacityHours = payroll.capacityHours();
      // Owed wages per currency (a Folk in debt, not on strike: a strike is settled on its card), for the band's amber
      // line (scan A-13, build .112: strikes were counted in, against this comment).
      const owed = new Map();
      this.crew.all.forEach((f) => {
        if (!this.owing(f) || this.struck(f)) return;
        const id = f.debtCurrency ?? 'melvorD:GP';
        owed.set(id, (owed.get(id) ?? 0) + f.debt);
      });
      renderReservePanel({
        off: !payroll.enabled,
        locked: capacityHours === 0,
        noCrew: this.crew.size === 0,
        tip: (el, content) => tips?.set(el, content),
        owed: [...owed].map(([id, amount]) => ({ amount, name: this.game.currencies.getObjectByID(id)?.name ?? id })),
        currencies: ['melvorD:GP', 'melvorItA:AbyssalPieces']
          .map((id) => ({ id, currency: this.game.currencies.getObjectByID(id) }))
          .filter(({ id, currency }) => currency !== undefined && (id === 'melvorD:GP' || this.crew.reserveOf(id) > 0 || (payroll.crewPerHour()[id] ?? 0) > 0))
          .map(({ id, currency }) => ({
            id,
            name: currency.name,
            media: currency.media,
            amount: this.crew.reserveOf(id),
            perHour: Math.round(payroll.crewPerHour()[id] ?? 0),
            hours: payroll.hoursCovered(id),
            low: payroll.reserveLow?.(id) ?? false,
            capacity: payroll.capacityOf(id),
            room: payroll.roomFor(id),
            bank: currency.amount,
          })),
        // A deposit says what happened (build .55): refused, cut to the room, or done.
        onDeposit: (id, amount) => {
          const plan = payroll.planDeposit(id, amount);
          const cur = this.game.currencies.getObjectByID(id);
          const name = cur?.name ?? id;
          const n = (v) => numberWithCommas(Math.floor(v));
          const error = (key, args) => { this.game.notifications.createErrorNotification('worker_folks:reserve', templateLangString(key, { currency: name, ...args })); return false; };
          if (plan.outcome === 'empty') return error('MOD_WF_RESERVE_NO_AMOUNT', {});
          if (plan.outcome === 'full') return error('MOD_WF_RESERVE_FULL', { capacity: n(payroll.capacityOf(id)) });
          if (plan.outcome === 'nothing') return error('MOD_WF_RESERVE_NOTHING', {});
          if (!payroll.deposit(id, plan.deposit)) return false;
          // More than the room or the bank: what fits goes in, and the toast says so (scan A-25, build .112).
          const doneKey = { cut: 'MOD_WF_RESERVE_CUT', bank: 'MOD_WF_RESERVE_BANK' }[plan.outcome] ?? 'MOD_WF_RESERVE_DONE';
          this.game.notifications.createSuccessNotification('worker_folks:reserve',
            templateLangString(doneKey, { amount: n(plan.deposit), currency: name }),
            this.getMediaURL('img/payroll_reserve.webp'));
          return true;
        },
      });
    }

    renderFolks() {
      if (!this.renderQueue.folks) return;
      this.wireHelp();
      dashboard?.wire(); // before the layout: it finds the Overview block by id
      layout?.wire({ rerender: () => { this.renderQueue.folks = true; } });
      this.renderReserve();
      layout?.refresh();
      dashboard?.markDirty();
      const done = renderFolkCards(layout?.orderFolks(this.crew.all) ?? this.crew.all, {
        tip: (el, content) => tips?.set(el, content),
        roleName: (tier) => this.roleName(tier),
        portrait: (tier) => this.portrait(tier),
        slotText: (folk) => templateLangString('MOD_WF_CARD_SLOT', { slot: `${folk.slot + 1}` }),
        helpLabel: (topic) => getLangString(`MOD_WF_HELP_LABEL_${topic}`),
        emptyText: () => getLangString(this.hasLicence('Newbie') ? 'MOD_WF_NO_WORKERS_DESC_LICENSED' : 'MOD_WF_NO_WORKERS_DESC'),
        onOpenShop: () => this.openShop(),
        status: (folk) => this.statusOf(folk),
        statusIcon: (status) => this.getMediaURL(`img/status_${status}.webp`),
        statusText: (status) => getLangString(`MOD_WF_STATUS_${status}`),
        assignmentText: (folk) => this.assignmentText(folk),
        // The assignment line says it on its own; the line under it says how (build .61, user layout).
        unassignedText: () => getLangString('MOD_WF_CARD_SKILL_NONE'),
        skillMedia: (folk) => this.skillOf(folk)?.media,
        rateText: (folk) => templateLangString('MOD_WF_CARD_RATE', { rate: `${produceRate.produceRate(folk.tier)}` }),
        effects: (folk) => this.tierEffects(folk.tier),
        isWorking: (folk) => {
          const skill = this.skillOf(folk);
          return skill !== undefined && this.delegated.has(skill);
        },
        detailText: (folk) => {
          const skill = this.skillOf(folk);
          if (skill === undefined) return getLangString('MOD_WF_CARD_SKILL_NONE_HINT');
          if (!this.delegated.has(skill)) {
            // Not "ready" while striking or resting (build .81); the strike band and the cooldown line say the rest.
            if (this.struck(folk)) return templateLangString('MOD_WF_CARD_STOPPED_STRIKE', { skill: this.skillName(skill) });
            if (folk.cooldownTicks > 0) return getLangString('MOD_WF_CARD_STOPPED_RESTING');
            return templateLangString('MOD_WF_CARD_READY', { skill: this.skillName(skill) });
          }
          const action = this.currentActionName(skill);
          return action === null ? getLangString('MOD_WF_CARD_WORKING') : templateLangString('MOD_WF_CARD_WORKING_ON', { action });
        },
        onStop: (folk) => this.stopFolk(folk),
        stopText: () => getLangString('MOD_WF_BUTTON_STOP'),
        // In the currency the Folk's skill pays right now (AP on an Abyssal action), like the Worker popup (build .55).
        wageText: (folk) => this.wageLine(folk, this.skillOf(folk))?.text ?? '',
        strikeInfo: (folk) => {
          const payroll = this.payroll;
          if (payroll === undefined) return null;
          if (!this.struck(folk)) {
            const d = this.debtText(folk);
            if (d === null) return null;
            // Idle, the grace doesn't run: the debt waits for its next action (scan A-24, build .112).
            const skill = this.skillOf(folk);
            const working = skill !== undefined && this.delegated.has(skill);
            // The amount on one line, what happens next on its own line under it (the user, build .112).
            return {
              debtOnly: true,
              owedText: templateLangString('MOD_WF_DEBT_OWED', { amount: d.amount }),
              noteText: working ? templateLangString('MOD_WF_DEBT_NOTE_WORKING', { minutes: d.minutes }) : getLangString('MOD_WF_DEBT_NOTE_IDLE'),
            };
          }
          const fmt = (parts) => Object.entries(parts).map(([id, amount]) => `${numberWithCommas(amount)} ${this.game.currencies.getObjectByID(id)?.name ?? id}`).join(' + ');
          const plain = payroll.settlementOf(folk);
          const apology = payroll.settlementOf(folk, { apology: true });
          // What is missing, per currency, for a settlement the bank can't cover.
          const shortOf = (parts) => fmt(Object.fromEntries(Object.entries(parts)
            .map(([id, amount]) => [id, Math.ceil(amount - (this.game.currencies.getObjectByID(id)?.amount ?? 0))])
            .filter(([, missing]) => missing > 0)));
          const canSettle = payroll.canSettle(folk);
          const apologyOpen = this.levels === undefined || this.levels.apologyUnlocked();
          const canApologise = payroll.canSettle(folk, { apology: true });
          const reason = !canSettle ? templateLangString('MOD_WF_SETTLE_NEED', { amount: shortOf(plain.parts) })
            : apologyOpen && !canApologise ? templateLangString('MOD_WF_APOLOGY_NEED', { amount: shortOf(apology.parts) })
              : '';
          return {
            reason,
            owedText: templateLangString('MOD_WF_STRIKE_OWED', { amount: fmt({ [plain.debtCurrency]: plain.debt }) }),
            // its own line (the user, build .108): a long amount never wraps the severance; none when it is free
            severanceText: plain.severance > 0 ? templateLangString('MOD_WF_STRIKE_SEVERANCE', { severance: numberWithCommas(plain.severance) }) : '',
            settleText: templateLangString('MOD_WF_BUTTON_SETTLE', { amount: fmt(plain.parts) }),
            apologyText: this.levels !== undefined && !this.levels.apologyUnlocked()
              ? `${templateLangString('MOD_WF_BUTTON_APOLOGY', { amount: fmt(apology.parts) })} (${this.levels.lockText(this.levels.apologyLevel)})`
              : templateLangString('MOD_WF_BUTTON_APOLOGY', { amount: fmt(apology.parts) }),
            canSettle,
            canApologise,
            onSettle: () => payroll.settle(folk),
            onApologise: () => payroll.settle(folk, { apology: true }),
          };
        },
        masterySlot: (folk) => this.slotOf(folk),
        masteryProgress: (folk) => this.masteryProgressOf(folk),
        skill: this,
        isExpanded: (folk) => this.expanded.has(folk.id),
        onToggleExpand: (folk) => {
          if (!this.expanded.delete(folk.id)) this.expanded.add(folk.id);
          this.renderQueue.folks = true;
        },
        detailsText: () => getLangString('MOD_WF_BUTTON_DETAILS'),
        promoteText: () => (this.levels !== undefined && !this.levels.promotionsUnlocked()
          ? `${getLangString('MOD_WF_BUTTON_PROMOTE')} (${this.levels.lockText(this.levels.promotionLevel)})`
          : getLangString('MOD_WF_BUTTON_PROMOTE')),
        fireText: () => getLangString('MOD_WF_BUTTON_FIRE'),
        canPromote: (folk) => promotion.NEXT_TIER[folk.tier] !== null,
        promoteReady: (folk) => this.promotionPlanFor(folk).ok,
        onPromote: (folk) => this.promote(folk),
        onFire: (folk) => this.fire(folk),
        perkLines: (folk) => this.perkLines(folk),
        overtime: (folk) => {
          const p = this.perksOf(folk);
          // The button exists only once mastery 30 unlocks it; the perk list already explains the effect.
          return { unlocked: p.overtimeUnlocked, on: p.overtimeActive, text: getLangString(p.overtimeActive ? 'MOD_WF_OVERTIME_ON' : 'MOD_WF_OVERTIME_OFF') };
        },
        onToggleOvertime: (folk) => this.setOvertime(folk, !folk.overtime),
        perksTitle: () => getLangString('MOD_WF_PERKS_TITLE'),
        /** The card's Gear button: "Gear 3/9", worn items in the tooltip, amber when something ran out (build .54). */
        gear: (folk) => {
          const s = this.loadout?.summary(folk);
          if (s === undefined) return { text: getLangString('MOD_WF_BUTTON_GEAR'), tip: [], out: false };
          // One line per worn item, its icon before its name (src/tips.mjs, build .91); a run-out line names each item
          // with its icon too.
          const line = (t) => ({ media: t.media, text: `${t.name}${t.qty > 0 ? ` ×${numberWithCommas(t.qty)}` : ''}${t.charges !== undefined ? ` (${templateLangString('MOD_WF_GEAR_TIP_CHARGES', { count: numberWithCommas(t.charges) })})` : ''}` });
          const tip = s.filled === 0 ? [getLangString('MOD_WF_GEAR_TIP_EMPTY')] : s.worn.map(line);
          if (s.out.length > 0) {
            const [before, after = ''] = templateLangString('MOD_WF_GEAR_TIP_OUT', { items: '\u0000' }).split('\u0000');
            const parts = [{ text: before }];
            s.out.forEach((t, i) => { if (i > 0) parts.push({ text: ', ' }); parts.push({ media: t.media, text: t.name }); });
            parts.push({ text: after });
            tip.push({ parts });
          }
          return { text: templateLangString('MOD_WF_BUTTON_GEAR_COUNT', { filled: `${s.filled}`, open: `${s.open}` }), tip, out: s.out.length > 0 };
        },
        onGear: (folk) => this.loadout?.openLoadout(folk),
        hp: (folk) => this.health?.hpView(folk),
        frozenSlots: () => this.health?.frozenSlotsView() ?? [],
        frozenTitle: () => getLangString('MOD_WF_SLOT_FROZEN_TITLE'),
        frozenReason: () => this.health?.freezeReason() ?? '',
        cooldownText: (folk) => (folk.cooldownTicks > 0 ? templateLangString('MOD_WF_CARD_COOLDOWN', { time: this.cooldownLeft(folk) }) : ''),
      });
      layout?.dressCards();
      if (done) this.renderQueue.folks = false;
    }

    render() {
      this.renderPageOpen();
      super.render();
      this.renderFolks();
      dashboard?.render();
    }

    /**
     * The page-open work. changePage only calls page.action.onPageChange(), and a page with only `skills` has no
     * action, so an onPageChange here never ran: it runs from the render loop instead (scan C-02, build .112).
     */
    renderPageOpen() {
      const open = game.openPage?.id === 'worker_folks:Hiring';
      // Cards show live skill state: refresh whenever this page opens.
      if (open && !this.pageWasOpen) this.renderQueue.folks = true;
      this.pageWasOpen = open;
      if (!open) return;
      // The game shows "Game Guide" under every skill page's title, but Hiring has no guide page, so the link did
      // nothing. changePage shows it again on the next skill page.
      const link = document.getElementById('game-guide-header-link');
      if (link !== null && !link.classList.contains('d-none')) link.classList.add('d-none');
    }

    // Hiring is never an active action itself: no activeTick/passiveTick here,
    // so Game.registerSkill does not put it into game.activeActions. The skill minibar
    // (settings, pet, mastery, milestones, relics, quick-equip of Hiring gear) is the engine's.

    get delegableCount() {
      return this.delegableSkills.length;
    }

    /** Shared cap: total Folks can never exceed the delegable-skill count. */
    get folkCap() {
      return this.delegableCount;
    }

    purchase(localId) {
      return this.game.shop.purchases.getObjectByID(`${this.namespace}:${localId}`);
    }

    purchaseCount(localId) {
      const purchase = this.purchase(localId);
      return purchase === undefined ? 0 : this.game.shop.getPurchaseCount(purchase);
    }

    hasLicence(tier) {
      return this.purchaseCount(LICENCE_PURCHASE[tier]) > 0;
    }

    /** Highest tier licence owned, or null. */
    get highestLicence() {
      const tiers = Object.keys(LICENCE_PURCHASE);
      for (let i = tiers.length - 1; i >= 0; i -= 1) if (this.hasLicence(tiers[i])) return tiers[i];
      return null;
    }

    /** Shift Slots outside the licence cap: the dev console only (`workerFolksDev`). */
    get extraShiftSlots() {
      return this.devExtraShiftSlots;
    }

    /** Folks allowed to work at once: 1 from the Trainee licence + bought Shift Slots + free level slots, within the licence cap, plus extras. */
    get shiftSlots() {
      const owned = (this.hasLicence('Newbie') ? 1 : 0) + this.purchaseCount(SHIFT_SLOT_PURCHASE);
      const free = this.levels?.freeShiftSlots() ?? 0;
      const cap = pricing.shiftSlotCap(this.highestLicence, this.folkCap);
      return Math.min(owned + free, Math.max(cap, owned)) + this.extraShiftSlots;
    }

    /**
     * A `worker_folks:*` modifier from the player's own table. Read there, not through
     * `game.modifiers`, because while a Folk acts that getter returns the Folk's table, which
     * leaves out what the player wears (Overseer's Outfit, Hiring Skillcape).
     */
    playerModifier(localId) {
      const table = this.game.combat?.player?.modifiers;
      if (table === undefined || typeof table.getValue !== 'function') return 0;
      return table.getValue(`worker_folks:${localId}`, ModifierQuery.EMPTY);
    }

    /** Pool bonuses, pet, worn gear and relics, as one perk object (see mastery-perks.bonusPerks); the Master Relic's free overtime included. */
    bonusPerks() {
      return perks.bonusPerks({
        wageDiscountPercent: this.playerModifier('folkWageDiscount'),
        graceMinutes: this.playerModifier('folkStrikeGrace'),
        cooldownPercent: this.playerModifier('folkCooldown'),
        autoSettle: this.playerModifier('folkAutoSettle') > 0,
        freeOvertime: this.playerModifier('folkFreeOvertime') > 0,
      });
    }

    /** Hiring is the player's skill: its XP modifiers come from the player's own table even while a Folk is acting. */
    getXPModifier(action) {
      const table = this.game.combat.player.modifiers;
      return table.getValue('melvorD:skillXP', this.getActionModifierQuery(action)) + table.getValue('melvorD:nonCombatSkillXP', ModifierQuery.EMPTY);
    }

    getMasteryXPModifier(action) {
      const table = this.game.combat.player.modifiers;
      let modifier = table.getValue('melvorD:masteryXP', this.getActionModifierQuery(action));
      this.game.astrology.masteryXPConstellations.forEach((constellation) => {
        const value = table.getValue(constellation.masteryXPModifier.id, this.modQuery);
        if (value > 0) modifier += value * constellation.maxValueModifiers;
      });
      return modifier;
    }

    isDelegated(skill) {
      return this.delegated.has(skill);
    }

    /** Removes a skill from the delegated set and tells the other slices. */
    release(skill) {
      if (!this.delegated.delete(skill)) return;
      this.renderQueue.folks = true;
      log(`released: ${skill.id}`);
      this.events.emit('folkReleased', { skill, folk: this.crew.bySkill(skill.id), offline: !this.game._isInOnlineLoop });
    }

    /** A delegated skill's action timer just fired: mastery, tokens, then the wage/offline listeners. */
    delegatedActionDone(skill, intervalMs = 0) {
      const folk = this.crew.bySkill(skill.id);
      const outcome = this.lastOutcome ?? 'ok';
      this.lastOutcome = undefined;
      if (folk !== undefined && intervalMs > 0) this.addFolkMastery(folk, intervalMs);
      this.events.emit('folkActionDone', { skill, folk, outcome, intervalMs, offline: !this.game._isInOnlineLoop });
    }

    // ---- Folk mastery ---------------------------------------------------------

    slotOf(folk) {
      return this.sortedMasteryActions[folk.slot];
    }

    masteryLevelOf(folk) {
      const slot = this.slotOf(folk);
      return slot === undefined ? 1 : this.getMasteryLevel(slot);
    }

    masteryProgressOf(folk) {
      const slot = this.slotOf(folk);
      return slot === undefined ? { xp: 0, level: 1, percent: 0, nextLevelXP: 0 } : this.getMasteryProgress(slot);
    }

    poolPercent() {
      return this.getMasteryPoolProgress(this.game.defaultRealm);
    }

    perksOf(folk) {
      return perks.combinedPerks(this.masteryLevelOf(folk), this.bonusPerks(), { overtimeOn: folk.overtime, overtimeWageFactor: this.levels?.overtimeWageFactor() ?? 2 });
    }

    // Hooks read by payroll.mjs and acting.mjs
    wageDiscount(folk) {
      const p = this.perksOf(folk);
      // The Hiring 100 milestone is in percent (10), the other parts are fractions: it used to fill the cap on its own.
      return perks.totalWageDiscount(p.wageRaise, p.wageDiscount, (this.levels?.wageDiscount() ?? 0) / 100);
    }

    /** Multiplier on the tier wage: the seniority raise (40% → 100% by mastery) times the overtime factor. */
    wageFactor(folk) {
      const p = this.perksOf(folk);
      return p.wageFactor * p.wageRaise;
    }

    wageRaise(folk) {
      return this.perksOf(folk).wageRaise;
    }

    graceMs(folk) {
      return this.perksOf(folk).graceMs;
    }

    /** "In debt" details for the card, the Worker box and the offline summary, or null. */
    debtText(folk) {
      const payroll = this.payroll;
      if (payroll === undefined || this.struck(folk) || !this.owing(folk)) return null;
      const currency = this.game.currencies.getObjectByID(folk.debtCurrency ?? 'melvorD:GP');
      const minutes = Math.ceil(payroll.graceLeftMs(folk) / 60000);
      return { amount: `${numberWithCommas(folk.debt)} ${currency?.name ?? ''}`.trim(), minutes: `${minutes}` };
    }

    cooldownFactor(folk) {
      return this.perksOf(folk).cooldownMult;
    }

    severanceFree(folk) {
      return this.perksOf(folk).trusted;
    }

    autoSettle() {
      return this.bonusPerks().autoSettle;
    }

    setOvertime(folk, on) {
      if (!this.perksOf(folk).overtimeUnlocked) on = false;
      if (folk.overtime === on) return;
      folk.overtime = on;
      this.crew.touch(); // acting tables rebuild on crewChanged
    }

    addFolkMastery(folk, intervalMs) {
      const slot = this.slotOf(folk);
      if (slot === undefined) return;
      let xp = perks.masteryXPForAction({ level: this.getMasteryLevel(slot), intervalMs, tier: folk.tier, modifierPercent: this.getMasteryXPModifier(slot) });
      if (this.game.modifiers.halveMasteryXP > 0) xp /= 2;
      this.addMasteryXP(slot, xp);
      this.addMasteryPoolXP(slot.realm, this.getMasteryXPToAddToPool(xp));
      this.rollFolkMasteryToken(slot.realm);
    }

    rollFolkMasteryToken(realm) {
      const tokens = this.masteryTokens.get(realm);
      if (tokens === undefined) return;
      tokens.forEach((token) => {
        if (!token.rollInSkill || !rollPercentage(this.masteryTokenChance)) return;
        this.game.bank.addItem(token, 1 + this.game.modifiers.flatMasteryTokens, true, true, false, true, `Skill.${this.id}`);
      });
    }

    /** Firing clears the slot's mastery; the next hire in that slot starts at 1. */
    resetSlotMastery(slotIndex) {
      const slot = this.sortedMasteryActions[slotIndex];
      if (slot === undefined || !this.actionMastery.has(slot)) return;
      this.actionMastery.delete(slot);
      this.updateTotalCurrentMasteryLevel();
      this.renderQueue.actionMastery.add(slot);
      this.updateMasteryDisplays(slot);
    }

    // ---- promotion and firing ---------------------------------------------------

    diplomaItem(targetTier) {
      const id = promotion.diplomaFor(targetTier, { hasTotH: this.game.registeredNamespaces.hasNamespace('melvorTotH') });
      return id === null ? undefined : this.game.items.getObjectByID(id);
    }

    promotionPlanFor(folk) {
      const nextTier = promotion.NEXT_TIER[folk.tier] ?? null;
      const diploma = nextTier === null ? undefined : this.diplomaItem(nextTier);
      const plan = promotion.promotionPlan({
        tier: folk.tier,
        masteryLevel: this.masteryLevelOf(folk),
        hasLicence: nextTier !== null && this.hasLicence(nextTier),
        nextHirePrice: nextTier === null ? 0 : pricing.hirePrice(nextTier, this.crew.countByTier(nextTier)),
        hasDiploma: diploma !== undefined && this.game.bank.getQty(diploma) > 0,
        gp: this.game.gp.amount,
        hiringLevel: this.level,
        promotionLevel: this.levels?.promotionLevel ?? 0,
        costRate: this.levels?.promotionCostRate() ?? promotion.PROMOTION_COST_RATE,
      });
      return { ...plan, diploma };
    }

    /** Opens the promotion modal; applies the promotion when confirmed and still valid. */
    promote(folk) {
      const plan = this.promotionPlanFor(folk);
      if (plan.nextTier === null) return;
      // The requirements on a grey band; the fee after the GP icon in bold amber, red when you can't pay (scan C-22, build .112). Body size throughout.
      const row = (met, text) => `<div class="${met ? 'text-success' : 'text-danger'}">${met ? '✓' : '✗'} ${text}</div>`;
      const diplomaText = plan.diploma === undefined ? '?' : `<img class="skill-icon-xs mr-1" src="${plan.diploma.media}" alt="">${plan.diploma.name}`;
      const gpShort = plan.blockers.includes('gp');
      const fee = `<img class="skill-icon-xs mr-1" src="${this.game.gp.media}" alt="GP"><span class="font-w600 ${gpShort ? 'text-danger' : 'text-warning'}">${numberWithCommas(plan.cost)}</span>`;
      const feeRow = `<div><span class="${gpShort ? 'text-danger' : 'text-success'}">${gpShort ? '✗' : '✓'}</span> ${templateLangString('MOD_WF_PROMO_COST', { cost: fee, percent: `${Math.round((this.levels?.promotionCostRate() ?? promotion.PROMOTION_COST_RATE) * 100)}` })}</div>`;
      const html = `
        <div class="text-left">
          <div class="wf-band">
          ${this.levels === undefined ? '' : row(!plan.blockers.includes('level'), templateLangString('MOD_WF_PROMO_LEVEL', { level: `${this.levels.promotionLevel}`, now: `${this.level}` }))}
          ${row(!plan.blockers.includes('licence'), templateLangString('MOD_WF_PROMO_LICENCE', { role: this.roleName(plan.nextTier) }))}
          ${row(!plan.blockers.includes('mastery'), templateLangString('MOD_WF_PROMO_MASTERY', { gate: `${plan.gate}`, level: `${this.masteryLevelOf(folk)}` }))}
          ${row(!plan.blockers.includes('diploma'), templateLangString('MOD_WF_PROMO_DIPLOMA', { item: diplomaText }))}
          ${feeRow}
          </div>
          ${plan.ok ? '' : `<div class="text-warning mt-2">${this.promotionNeedsText(folk, plan)}</div>`}
          <div class="mt-2">${getLangString('MOD_WF_PROMO_KEEPS')}</div>
        </div>`;
      SwalLocale.fire({
        didRender: popupDidRender,
        // The Folk's name kept whole when it fits; the title wraps, never cut (build .109).
        title: templateLangString('MOD_WF_PROMO_TITLE', { name: titleName(folk.name), role: this.roleName(plan.nextTier) }),
        html,
        imageUrl: this.portrait(plan.nextTier),
        imageWidth: 64,
        imageHeight: 64,
        imageAlt: folk.name,
        // Promote is an upgrade: the game's primary blue, not the green of agreeing (user, build .55).
        customClass: swalClass({ popup: 'wf-ui wf-pic', confirmButton: 'btn btn-primary m-1' }),
        showCancelButton: true,
        // Blocked: focus on Cancel, so a keyboard user lands in the dialog (scan C-32, build .112).
        focusCancel: !plan.ok,
        confirmButtonText: getLangString('MOD_WF_BUTTON_PROMOTE'),
        // Disabled while a requirement is missing: the red rows and the amber line say which.
        didOpen: () => { if (!plan.ok) { const b = Swal.getConfirmButton(); if (b) b.disabled = true; } },
      }).then((result) => {
        if (!result.isConfirmed) return;
        const fresh = this.promotionPlanFor(folk);
        if (!fresh.ok) {
          this.game.notifications.createErrorNotification('worker_folks:promo', this.promotionNeedsText(folk, fresh));
          return;
        }
        this.game.gp.remove(fresh.cost);
        this.game.bank.removeItemQuantity(fresh.diploma, 1, true);
        this.crew.promote(folk.id, fresh.nextTier);
        this.game.notifications.createSuccessNotification(
          'worker_folks:promoted',
          templateLangString('MOD_WF_PROMOTED', { name: folk.name, role: this.roleName(fresh.nextTier), aRole: getLangString(`MOD_WF_A_ROLE_${fresh.nextTier}`) }),
          this.portrait(fresh.nextTier),
        );
      });
    }

    /** "Can't promote X yet. Still needed: …", naming each missing requirement. */
    promotionNeedsText(folk, plan) {
      const needs = plan.blockers.map((b) => {
        switch (b) {
          case 'level': return templateLangString('MOD_WF_PROMO_NEED_level', { level: `${this.levels?.promotionLevel ?? ''}` });
          case 'licence': return templateLangString('MOD_WF_PROMO_NEED_licence', { role: this.roleName(plan.nextTier) });
          case 'mastery': return templateLangString('MOD_WF_PROMO_NEED_mastery', { gate: `${plan.gate}` });
          case 'diploma': return templateLangString('MOD_WF_PROMO_NEED_diploma', { item: plan.diploma?.name ?? '?' });
          case 'gp': return templateLangString('MOD_WF_PROMO_NEED_gp', { cost: numberWithCommas(plan.cost) });
          default: return b;
        }
      });
      return templateLangString('MOD_WF_PROMO_BLOCKED', { name: folk.name, needs: needs.join(', ') });
    }

    returnLoadout(folk) {
      this.loadout?.returnAll(folk);
    }

    /** Confirms, returns the loadout, then fires. */
    fire(folk) {
      SwalLocale.fire({
        didRender: popupDidRender,
        title: templateLangString('MOD_WF_FIRE_TITLE', { name: titleName(folk.name) }),
        html: `<div class="text-center text-warning">${getLangString('MOD_WF_FIRE_TEXT')}</div>`,
        imageUrl: this.portrait(folk.tier),
        imageWidth: 64,
        imageHeight: 64,
        imageAlt: folk.name,
        // Firing loses the Folk for good: red confirm, blue-outline cancel; the portrait alone, no second icon.
        customClass: swalClass({ popup: 'wf-ui wf-pic', confirmButton: 'btn btn-danger m-1' }),
        showCancelButton: true,
        confirmButtonText: getLangString('MOD_WF_BUTTON_FIRE'),
      }).then((result) => {
        if (!result.isConfirmed) return;
        this.returnLoadout?.(folk);
        this.crew.fire(folk.id, { reason: 'fired' });
      });
    }

    /** Text lines for the card's details panel: unlocked and next perks. */
    perkLines(folk) {
      const level = this.masteryLevelOf(folk);
      const lines = [];
      // With wages off (No sweat) the wage and strike lines say nothing true: left out (scan C-31, build .112).
      const paid = this.payroll?.enabled !== false;
      if (paid) {
        // The wage is a fact, not a bonus: body ink; the cut green only once one applies (scan A-16).
        lines.push({ tone: 'info', text: templateLangString('MOD_WF_PERK_WAGE', { value: (this.wageRaise(folk) * 100).toFixed(0) }) });
        // No cut yet read "−0.0%" (regression pass, build .83).
        const relief = (this.wageDiscount(folk) * 100).toFixed(1);
        lines.push(relief === '0.0' ? { tone: 'info', text: getLangString('MOD_WF_PERK_RELIEF_NONE') } : { met: true, text: templateLangString('MOD_WF_PERK_RELIEF', { value: relief }) });
      }
      const wageOnly = new Set(['grace', 'cooldown60', 'cooldown90', 'trusted']);
      perks.LEVEL_MILESTONES.forEach(([at, key]) => {
        if (!paid && wageOnly.has(key)) return;
        lines.push({ met: level >= at, text: `${at}: ${getLangString(`MOD_WF_PERK_${key}`)}` });
      });
      return lines;
    }

    /**
     * A tier's effects (Produce Rate is shown separately) as { before, value, after, tone } pieces, so the value can
     * stand out in its colour: 'good' green, 'bad' amber (build .73). The value's place comes from the language string.
     */
    tierEffects(tier) {
      const mods = produceRate.tierModifiers(tier, { preservationDisabled: !!this.game.currentGamemode.disablePreservation });
      const pct = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n)}%`;
      const piece = (key, value, tone, extra = {}) => {
        const [before, after = ''] = templateLangString(key, { ...extra, value: '\u0001' }).split('\u0001');
        return { before, value, after, tone };
      };
      const out = [];
      // A shorter action is the good direction for the interval.
      if (mods.skillInterval !== 0) out.push(piece('MOD_WF_EFFECT_INTERVAL', pct(mods.skillInterval), mods.skillInterval < 0 ? 'good' : 'bad'));
      if (mods.skillPreservationChance !== 0) out.push(piece('MOD_WF_EFFECT_PRESERVATION', pct(mods.skillPreservationChance), mods.skillPreservationChance > 0 ? 'good' : 'bad'));
      if (mods.skillXP !== 0) out.push(piece('MOD_WF_EFFECT_XP', pct(mods.skillXP), mods.skillXP > 0 ? 'good' : 'bad'));
      if (!produceRate.rollsPets(tier)) out.push({ before: '', value: getLangString('MOD_WF_EFFECT_NO_PETS'), after: '', tone: 'bad' });
      if (tier === 'Expert') out.push(piece('MOD_WF_EFFECT_CREW_BONUS', pct(3), 'good', { max: pct(15) }));
      return out;
    }

    skillOf(folk) {
      return folk.skillId === null ? undefined : this.delegableSkills.find((s) => s.id === folk.skillId);
    }

    registerData(namespace, data) {
      super.registerData(namespace, data);
      if (data.folkSlots !== undefined) {
        data.folkSlots.forEach((slotData) => {
          this.actions.registerObject(new FolkSlotAction(namespace, slotData, this.game, this));
        });
      }
    }

    postDataRegistration() {
      super.postDataRegistration();
      this.sortedMasteryActions = this.actions.allObjects.sort((a, b) => a.index - b.index);
    }

    /** Only the first N slots exist from the player's point of view. */
    isMasteryActionUnlocked(action) {
      return action.index < this.delegableCount;
    }

    /** Mastery screens list hired Folks only. */
    getSortedMasteryActionsInRealm(realm) {
      return this.sortedMasteryActions.filter((a) => a.realm === realm && this.isMasteryActionUnlocked(a) && this.crew.bySlot(a.index) !== undefined);
    }

    getBaseMasteryPoolCap(realm) {
      const count = realm === this.game.defaultRealm ? this.delegableCount : 0;
      return count * 500000;
    }

    getSlotName(action) {
      const folk = this.crew.bySlot(action.index);
      if (folk !== undefined) return `${folk.name} (${this.roleName(folk.tier)})`;
      return templateLangString('MOD_WF_FOLK_SLOT', { index: `${action.index + 1}` });
    }

    getSlotMedia(action) {
      const folk = this.crew.bySlot(action.index);
      return this.portrait(folk !== undefined ? folk.tier : 'Newbie');
    }

    computeDelegableSkills() {
      const combatLikeIds = [this.game.combat.id, this.game.golbinRaid.id];
      this.delegableSkills = selectDelegable(this.game.activeActions.allObjects, {
        combatLikeIds,
        excludeIds: this.excludedSkillIds,
      });
    }

    /**
     * True when the current gamemode could lock Hiring with no way to unlock it:
     * it ships a fixed starting-skill list (so a new character locks every other
     * skill) and sells no skill unlocks. Ancient Relics is the shipped example.
     */
    get mustStayUnlocked() {
      const mode = this.game.currentGamemode;
      return mode.startingSkills !== undefined && !mode.allowSkillUnlock;
    }

    setUnlock(isUnlocked) {
      // Game.setupCurrentGamemode() runs AFTER skill.onLoad() on a new character
      // and calls setUnlock(startingSkills.has(skill)) — false for a mod skill.
      super.setUnlock(isUnlocked || this.mustStayUnlocked);
    }

    onLoad() {
      this.computeDelegableSkills();
      // A skill added to an existing save starts locked. In gamemodes without
      // skill-unlock purchases that would just show a padlock forever.
      if (!this._unlocked && !this.game.currentGamemode.allowSkillUnlock) {
        this._unlocked = true;
      }
      super.onLoad();
      this.renderQueue.folks = true;
      log(`delegable skills: ${this.delegableCount}; crew: ${this.crew.size}`);
    }

    getErrorLog() {
      return `Delegable skills: ${this.delegableCount}\nUnlocked: ${this._unlocked}\n`;
    }
  }

  return { Hiring, FolkSlotAction };
}

/** Reads the next Uint32 without consuming it (undefined when fewer than 4 bytes remain). */
function peekUint32(reader) {
  if (reader.dataView.byteLength - reader.byteOffset < 4) return undefined;
  return reader.dataView.getUint32(reader.byteOffset);
}
