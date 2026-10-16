// Offline progress for delegated skills. The engine's offline loop runs
// Game.tick, which (patched in delegation.mjs) already ticks delegated skills.
// This module: opens the summary modal when only Folks were working, appends a
// per-Folk block to the summary, and emits `offlineTicks` for later timers.

export function install(ctx, { getHiring, log }) {
  let hiring;
  /** Per offline session: actions completed and skills released, by skill id. */
  let tracker = { actions: new Map(), released: new Set(), died: [], debts: [], struck: [], active: false };
  const reset = () => {
    tracker = { actions: new Map(), released: new Set(), died: [], debts: [], struck: [], active: true };
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
  });

  // Summary modal when the main slot is idle but Folks are working.
  ctx.patch(Game, 'enterOfflineLoop').after(function () {
    if (hiring === undefined) return;
    reset();
    hiring.delegated.forEach((skill) => skill.createOfflineSnapshot?.());
    const info = this._offlineInfo;
    if (info.action !== undefined || hiring.delegated.size === 0) return;
    const [first] = hiring.delegated;
    info.action = first;
    const offlineProgress = createElement('offline-progress');
    addModalToQueue({
      title: getLangString('MISC_STRING_3'),
      html: offlineProgress,
      imageUrl: hiring.media,
      imageWidth: 64,
      imageHeight: 64,
      imageAlt: getLangString('CHARACTER_SELECT_88'),
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
    info.offlineProgress = offlineProgress;
  });

  let exiting;
  ctx.patch(Game, 'exitOfflineLoop').before(function () {
    exiting = this._offlineInfo;
  });
  ctx.patch(Game, 'exitOfflineLoop').after(function () {
    if (hiring === undefined || exiting === undefined) return;
    const info = exiting;
    exiting = undefined;
    const ms = info.timeProcessed;
    const ticks = Math.floor(ms / TICK_INTERVAL);
    tracker.active = false;
    hiring.events.emit('offlineTicks', { ticks, ms });
    if (info.offlineProgress === undefined || (tracker.actions.size === 0 && tracker.released.size === 0 && tracker.died.length === 0 && tracker.debts.length === 0 && tracker.struck.length === 0)) return;
    const container = info.offlineProgress.messageContainer;
    if (container === undefined) return;
    const lines = [];
    const describe = (skillId) => {
      const folk = hiring.crew.bySkill(skillId);
      const skill = this.skills.getObjectByID(skillId);
      return { name: folk?.name ?? '?', skill: skill?.name ?? skillId, media: skill?.media };
    };
    tracker.actions.forEach((count, skillId) => {
      const d = describe(skillId);
      lines.push({ media: d.media, text: templateLangString('MOD_WF_OFFLINE_LINE', { name: d.name, skill: d.skill, count: numberWithCommas(count) }) });
    });
    tracker.released.forEach((skillId) => {
      const d = describe(skillId);
      lines.push({ media: d.media, text: templateLangString('MOD_WF_OFFLINE_STOPPED', { name: d.name, skill: d.skill }), warn: true });
    });
    tracker.died.forEach(({ name, skill, media }) => {
      lines.push({ media, text: templateLangString('MOD_WF_OFFLINE_DIED', { name, skill }), tone: 'text-danger' });
    });
    // Debt and strikes are reported with their state on return (a strike may have settled itself).
    tracker.debts.forEach(({ folk, skill, media }) => {
      const d = hiring.debtText(folk);
      if (d !== null) lines.push({ media, text: templateLangString('MOD_WF_OFFLINE_DEBT', { name: folk.name, skill, amount: d.amount, minutes: d.minutes }), warn: true });
    });
    tracker.struck.forEach(({ folk, skill, media }) => {
      const currency = this.currencies.getObjectByID(folk.debtCurrency ?? 'melvorD:GP');
      const text = folk.onStrike
        ? templateLangString('MOD_WF_OFFLINE_STRUCK', { name: folk.name, skill, amount: `${numberWithCommas(folk.debt)} ${currency?.name ?? ''}`.trim() })
        : templateLangString('MOD_WF_OFFLINE_STRUCK_SETTLED', { name: folk.name, skill });
      // Still on strike: red (work stopped); it settled itself from the reserve: plain, nothing to do (build .55).
      lines.push({ media, text, tone: folk.onStrike ? 'text-danger' : '' });
    });
    // Icon and text on one centred flex row: an inline icon in a heading hangs below the baseline.
    const row = (className, media, text) => {
      const el = createElement('h5', { className: `d-flex align-items-center justify-content-center mb-1 ${className}`, parent: container });
      el.innerHTML = `${media ? `<img class="skill-icon-xs mr-1" src="${media}" alt="">` : ''}<span>${text}</span>`;
    };
    row('font-w600 font-size-sm mt-2 text-info', hiring.media, getLangString('MOD_WF_OFFLINE_HEADER'));
    lines.forEach((line) => row(`font-w400 font-size-sm ${line.tone ?? (line.warn ? 'text-warning' : '')}`, line.media, line.text));
    log(`offline: ${ticks} ticks, ${tracker.actions.size} delegated skill(s) acted`);
  });

  ctx.onCharacterLoaded(() => {
    hiring.events.on('folkActionDone', ({ skill }) => {
      if (!tracker.active) return;
      tracker.actions.set(skill.id, (tracker.actions.get(skill.id) ?? 0) + 1);
    });
    hiring.events.on('folkReleased', ({ skill }) => {
      if (!tracker.active) return;
      tracker.released.add(skill.id);
    });
    hiring.events.on('folkDied', ({ folk, skill }) => {
      if (!tracker.active) return;
      tracker.died.push({ name: folk.name, skill: skill?.name ?? '', media: hiring.portrait(folk.tier) });
    });
    hiring.events.on('folkInDebt', ({ folk, skill }) => {
      if (!tracker.active) return;
      tracker.debts.push({ folk, skill: skill?.name ?? '', media: hiring.portrait(folk.tier) });
    });
    hiring.events.on('folkStruck', ({ folk, skill }) => {
      if (!tracker.active) return;
      tracker.struck.push({ folk, skill: skill?.name ?? '', media: hiring.portrait(folk.tier) });
    });
  });
}
