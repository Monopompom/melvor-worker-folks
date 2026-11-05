// Worker Folks backups at the Hiring page's foot (the user, 5 Nov 2026: the same as Voyage's): Back up shows a code to
// copy or download; Restore takes a pasted code or a file, shows what it holds and what it replaces and, once
// confirmed, writes it back, saves and reloads the game, as the game itself does after changing a save. Nothing runs
// by itself. The shape, the code and the restore's arithmetic are src/backup-model.mjs.
//
// The same backup through the API (v8, `api` below) for Voyage's one backup of both mods: the code to carry, what a
// restore would do as the confirm's bands, and the restore itself without the save and the reload, which the caller
// does once after its own part.
//
// Every Worker Folks timer counts game time (commission runs, strikes and cooldowns, unpaid work, Work Orders), so
// the record carries them as they are. The one real-clock timer, a slot frozen after a death, keeps its end time: by
// the restore it has run on or ended.

const SWAL = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1', cancelButton: 'btn btn-outline-info m-1' };
const SWAL_WARN = { ...SWAL, confirmButton: 'btn btn-warning m-1' };
/** Settings by section, as the slices register them (the names are the saved keys). */
const SETTINGS = { Hiring: ['hiringXPRate', 'quietFolkPopups', 'qualification', 'fastMasteryDisplays'], Wages: ['wageDifficulty', 'abyssalWagesInAP'] };
/** Why a pasted code was refused (backup-model decode's reasons), as literal keys. */
const WHY = {
  empty: 'MOD_WF_RESTORE_WHY_EMPTY', notCode: 'MOD_WF_RESTORE_WHY_NOTCODE', voyage: 'MOD_WF_RESTORE_WHY_VOYAGE',
  broken: 'MOD_WF_RESTORE_WHY_BROKEN', checksum: 'MOD_WF_RESTORE_WHY_CHECKSUM', format: 'MOD_WF_RESTORE_WHY_FORMAT',
  newer: 'MOD_WF_RESTORE_WHY_NEWER', record: 'MOD_WF_RESTORE_WHY_RECORD', cantUnzip: 'MOD_WF_RESTORE_WHY_CANTUNZIP',
};
const WIDTH = '38rem';
const SHOWN = 6;

export function install(ctx, { getHiring, B, folkModel, BUILD, popupDidRender, log }) {
  const NS = B.NS;
  const t = (key, vars) => (vars === undefined ? getLangString(key) : templateLangString(key, vars));
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const swalClass = (c) => (typeof createSwalCustomClass === 'function' ? createSwalCustomClass(c) : c);
  const num = (n) => { try { return numberWithCommas(Math.floor(n)); } catch { return `${Math.floor(n)}`; } };
  const level = (xp) => { try { return exp.xpToLevel(xp); } catch { return 1; } };
  const when = (at) => { try { return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return new Date(at).toISOString(); } };
  const ours = (o) => o?.namespace === NS;
  const voyageLoaded = () => { try { return game.registeredNamespaces.hasNamespace('voyage'); } catch { return false; } };
  const plural = (n, one, many) => t(n === 1 ? one : many, { n: num(n) });
  const names = (list) => list.map((f) => f.name).join(', ');
  const bold = (x) => `<strong>${esc(x)}</strong>`;

  // ---- the popups' look: the help bands, a heading each, amber-edged where something is lost ----------------------
  /** sections [{ head, warn, body: [string | { html } | { rows: [[label, value, media?]] }] }] */
  const bands = (sections, foot) => sections.map((s) => `<div class="wf-band${s.warn ? ' wf-band-warn' : ''}">`
    + `<div class="wf-help-head">${esc(s.head)}</div>`
    + s.body.filter((x) => x !== undefined && x !== null && x !== '').map((x) => {
      if (typeof x === 'string') return `<p class="wf-help-p">${esc(x)}</p>`;
      if (x.rows !== undefined) {
        return `<table class="wf-help-table wf-backup-rows"><tbody>${x.rows.map(([label, value, media]) => `<tr><td>${media ? `<img src="${esc(media)}" alt="">` : ''}${esc(label)}</td><td class="wf-num">${esc(value)}</td></tr>`).join('')}</tbody></table>`;
      }
      return `<p class="wf-help-p${x.cls ? ` ${x.cls}` : ''}">${x.html}</p>`;
    }).join('') + '</div>').join('')
    + (foot === undefined ? '' : `<p class="wf-help-p wf-backup-foot-line">${esc(foot)}</p>`);
  // No skill icons in the bodies: "Township" is said in a row label, the bank band and the boards' line.
  const body = (sections, foot) => `<div class="text-center wf-help-body" data-no-skill-names>${bands(sections, foot)}</div>`;
  const codeBox = (attrs) => `<textarea class="form-control wf-backup-code" rows="4" spellcheck="false" autocomplete="off" aria-label="${esc(t('MOD_WF_BACKUP_CODE'))}" ${attrs}`;
  /** A refusal or a failure: one sentence under the Swal sign, OK green, as the mod's other refusals. */
  const tell = (title, line, icon = 'info') => SwalLocale.fire({
    customClass: swalClass(SWAL), icon, title, html: `<div class="text-center">${esc(line)}</div>`, confirmButtonText: t('MOD_WF_BUTTON_GOT_IT'), didRender: popupDidRender,
  });

  // ---- what there is now ------------------------------------------------------------------------------------------
  /** This mod's items, in the bank and worn in every equipment set (the Overseer's Outfit, a cape, the Steward). */
  const itemsNow = () => {
    const out = {};
    const add = (item, n) => { if (ours(item) && n > 0) out[item.id] = (out[item.id] ?? 0) + n; };
    try { for (const [item, b] of game.bank.items) add(item, b.quantity); } catch (e) { log('backup: bank read failed', e); }
    try {
      for (const set of game.combat.player.equipmentSets) {
        for (const slot of set.equipment.equippedArray) if (!slot.isEmpty && slot.occupiedBy === undefined) add(slot.item, Math.max(1, slot.quantity));
      }
    } catch (e) { log('backup: equipment read failed', e); }
    return out;
  };
  const buysNow = () => {
    const out = {};
    try { for (const [p, n] of game.shop.upgradesPurchased) if (ours(p)) out[p.id] = n; } catch (e) { log('backup: shop read failed', e); }
    return out;
  };
  /** { biomeId: { buildingId: { n, eff } } }, this mod's buildings only. */
  const buildingsNow = () => {
    const out = {};
    try {
      for (const biome of game.township?.biomes?.allObjects ?? []) {
        biome.buildingsBuilt.forEach((n, building) => {
          if (!ours(building) || !(n > 0)) return;
          (out[biome.id] ??= {})[building.id] = { n, eff: biome.getBuildingEfficiency(building) };
        });
      }
    } catch (e) { log('backup: Township read failed', e); }
    return out;
  };
  const petsNow = () => { try { return [...game.petManager.unlocked].filter(ours).map((p) => p.id); } catch { return []; } };
  const settingsNow = () => {
    const out = {};
    for (const [section, list] of Object.entries(SETTINGS)) {
      for (const name of list) { try { const v = ctx.settings.section(section).get(name); if (v !== undefined) out[name] = v; } catch {} }
    }
    return out;
  };
  const writeSettings = (o) => {
    for (const [section, list] of Object.entries(SETTINGS)) {
      for (const name of list) {
        if (o[name] === undefined) continue;
        try { const s = ctx.settings.section(section); if (s.get(name) !== o[name]) s.set(name, o[name]); } catch (e) { log(`backup: setting ${name} not restored`, e); }
      }
    }
  };
  const have = () => ({ items: itemsNow(), buys: buysNow(), buildings: buildingsNow(), pets: petsNow() });
  /** How many of an item sit in the bank now (worn ones don't count: a Folk's gear goes back to the bank). */
  const inBank = (id) => { try { const it = game.items.getObjectByID(id); return it === undefined ? 0 : game.bank.items.get(it)?.quantity ?? 0; } catch { return 0; } };
  /** The bank now for the items the backup's crew holds. */
  const bankFor = (record) => Object.fromEntries(Object.keys(B.heldBy(record).items).map((id) => [id, inBank(id)]));

  // ---- Back up ----------------------------------------------------------------------------------------------------
  const take = (h) => {
    const mastery = {};
    h.actionMastery.forEach(({ xp }, action) => { if (action?.id !== undefined) mastery[action.id] = xp; });
    const pool = {};
    h._masteryPoolXP?.data?.forEach((xp, realm) => { if (realm?.id !== undefined) pool[realm.id] = xp; });
    const relics = {};
    h.ancientRelicSets?.forEach((set, realm) => {
      const found = {};
      set.foundRelics?.forEach((n, relic) => { if (relic?.id !== undefined) found[relic.id] = n; });
      if (realm?.id !== undefined) relics[realm.id] = found;
    });
    const record = h.crew.serialize();
    return B.make({
      record, xp: h._xp, abyssalXP: h._abyssalXP, unlocked: h._unlocked,
      caps: { level: h._currentLevelCap, abyssal: h._currentAbyssalLevelCap },
      mastery, pool, relics, ...have(), settings: settingsNow(), bank: B.bankSnapshot(record, inBank),
      name: game.characterName, mode: game.currentGamemode?.id, mod: ctx.version, build: BUILD, save: folkModel.SAVE_VERSION, at: Date.now(),
    });
  };

  /** What a backup holds, as label and value rows. */
  const holdsRows = (b) => {
    const folks = B.folksIn(b.record).length;
    const built = Object.values(b.buildings).reduce((s, list) => s + Object.values(list).reduce((a, x) => a + x.n, 0), 0);
    const rows = [
      [t('MOD_WF_BACKUP_ROW_LEVEL'), num(level(b.xp))],
      [t('MOD_WF_BACKUP_ROW_FOLKS'), num(folks)],
      [t('MOD_WF_BACKUP_ROW_ITEMS'), plural(Object.keys(b.items).length, 'MOD_WF_BACKUP_KIND', 'MOD_WF_BACKUP_KINDS')],
      [t('MOD_WF_BACKUP_ROW_BUYS'), num(Object.keys(b.buys).length)],
    ];
    if (built > 0) rows.push([t('MOD_WF_BACKUP_ROW_BUILDINGS'), num(built)]);
    return { rows };
  };

  const backUp = async () => {
    const h = getHiring();
    if (h === undefined) return;
    let backup;
    let code;
    try { backup = take(h); code = await B.encode(backup); } catch (e) { log('backup: failed', e); tell(t('MOD_WF_BACKUP_TITLE'), t('MOD_WF_BACKUP_FAILED'), 'error'); return; }
    const file = B.fileName(backup.name, backup.at);
    const html = body([
      { head: t('MOD_WF_BACKUP_IN_HEAD'), body: [holdsRows(backup), t('MOD_WF_BACKUP_ALSO')] },
      { head: t('MOD_WF_BACKUP_KEEP_HEAD'), warn: true, body: [t('MOD_WF_BACKUP_KEEP')] },
      { head: t('MOD_WF_BACKUP_CODE_HEAD'), body: [{ html: `${codeBox('readonly')}>${esc(code)}</textarea>`
        + `<span class="wf-backup-acts"><button type="button" class="btn btn-outline-info" data-wf-backup="copy">${esc(t('MOD_WF_BACKUP_COPY'))}</button>`
        + `<button type="button" class="btn btn-outline-info" data-wf-backup="download">${esc(t('MOD_WF_BACKUP_DOWNLOAD'))}</button></span>`
        + `<span class="wf-backup-note wf-subtle" data-wf-backup="note" aria-live="polite">${esc(t('MOD_WF_BACKUP_SIZE', { kb: num(Math.max(1, Math.round(code.length / 1024))) }))}</span>` }] },
    ]);
    SwalLocale.fire({
      customClass: swalClass(SWAL),
      width: WIDTH,
      title: t('MOD_WF_BACKUP_TITLE'),
      html,
      confirmButtonText: t('MOD_WF_BACKUP_DONE'),
      didRender: (el) => {
        try { popupDidRender?.(el); } catch {}
        const box = el?.querySelector?.('.wf-backup-acts');
        if (box == null || box.dataset.wfBound === '1') return;
        box.dataset.wfBound = '1';
        const note = el.querySelector('[data-wf-backup="note"]');
        const area = el.querySelector('.wf-backup-code');
        // What the last button did, under them: green when done, amber when it needs the player's hand.
        const say = (key, ok, vars) => { if (note === null) return; note.textContent = t(key, vars); note.className = `wf-backup-note ${ok ? 'text-success' : 'text-warning'}`; };
        box.addEventListener('click', async (e) => {
          const btn = e.target instanceof Element ? e.target.closest('[data-wf-backup]') : null;
          if (btn === null) return;
          if (btn.dataset.wfBackup === 'copy') {
            // The old copy first: it runs inside the click and never waits. The clipboard API can hang without focus.
            let ok = false;
            try { area.focus(); area.select(); ok = document.execCommand('copy') === true; } catch {}
            if (!ok && navigator.clipboard?.writeText !== undefined) {
              try { ok = await Promise.race([navigator.clipboard.writeText(code).then(() => true), new Promise((res) => setTimeout(() => res(false), 2000))]); } catch {}
            }
            say(ok ? 'MOD_WF_BACKUP_COPIED' : 'MOD_WF_BACKUP_COPY_FAILED', ok);
          } else {
            try {
              const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url; a.download = file; document.body.append(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 10_000);
              say('MOD_WF_BACKUP_SAVED', true, { file });
            } catch (err) { log('backup: download failed', err); say('MOD_WF_BACKUP_DOWNLOAD_FAILED', false); }
          }
        });
      },
    });
  };

  // ---- Restore ----------------------------------------------------------------------------------------------------
  /** Writes a backup back into the game; no save, no reload. Throws when it can't (the caller reloads unsaved). */
  const applyBackup = (b) => {
    const h = getHiring();
    // No tick between here and the reload: a Folk-held skill must never act with half a crew.
    try { game.stopMainLoop(); } catch {}
    const nowRecord = h.crew.serialize();
    const back = B.returns(nowRecord, b.record);
    // Read before anything is added: gear and stacks moved to the bank since the backup come out of it again.
    const taken = B.takes(nowRecord, b, bankFor(b.record));
    const plan = B.restorePlan(b, have());
    // A crew that lived on keeps its Work Orders and commissions: nothing finished since is paid twice.
    const live = B.livedOn(h._xp, b.xp);
    const boardNow = h.crew.board;
    const commissionsNow = h.crew.commissions;
    // The crew, as the save's own load does it (older records migrate); walking Folks stand still without Voyage.
    const report = h.crew.load(b.record);
    if (report.corrupt) throw new Error('backup record unreadable');
    if (live) {
      h.crew.board = boardNow;
      const kept = B.keepCommissions(commissionsNow, h.crew.all);
      h.crew.commissions = kept.commissions;
      for (const id of kept.home) { try { h.room?.townHome(h.crew.byId(id)); } catch (e) { log(`backup: ${id} kept its town stacks`, e); } }
    }
    const voyage = voyageLoaded();
    h.crew.all.forEach((f) => { f.travel = B.travelAfter(f.travel, voyage); });
    // The skill as it was: XP, mastery by slot, the pool, relics and level caps (caps only within one game mode).
    h._xp = b.xp;
    if (b.abyssalXP > 0 || h._abyssalXP > 0) h._abyssalXP = b.abyssalXP;
    if (b.unlocked) h._unlocked = true;
    if (b.mode === game.currentGamemode?.id) {
      if (b.caps.level !== null) h._currentLevelCap = b.caps.level;
      if (b.caps.abyssal !== null) h._currentAbyssalLevelCap = b.caps.abyssal;
    }
    h.actionMastery = new Map();
    for (const [id, xp] of Object.entries(b.mastery)) {
      const action = h.actions.getObjectByID(id);
      if (action !== undefined) h.actionMastery.set(action, { xp, level: Math.min(h.masteryLevelCap, level(xp)) });
    }
    h._masteryPoolXP.data.clear();
    for (const [id, xp] of Object.entries(b.pool)) { const realm = game.realms.getObjectByID(id); if (realm !== undefined) h._masteryPoolXP.set(realm, xp); }
    for (const [id, found] of Object.entries(b.relics)) {
      const set = h.ancientRelicSets?.get(game.realms.getObjectByID(id));
      if (set === undefined) continue;
      set.foundRelics = new Map(Object.entries(found).map(([r, n]) => [game.ancientRelics.getObjectByID(r), n]).filter(([r]) => r !== undefined));
    }
    // Around the skill: what the backup's crew holds again out of the bank, what the crew held beyond the backup's back
    // to you, then the bank, shop, Township and pets.
    for (const [id, n] of taken) {
      try { const it = game.items.getObjectByID(id); if (it !== undefined) game.bank.removeItemQuantity(it, n, false); } catch (e) { log(`backup: ${id} not taken`, e); }
    }
    for (const [id, n] of back.items) { try { game.bank.addItemByID(id, n, false, false, true); } catch (e) { log(`backup: ${id} not handed back`, e); } }
    for (const [id, n] of back.currencies) { try { game.currencies.getObjectByID(id)?.add(n); } catch (e) { log(`backup: ${id} not handed back`, e); } }
    for (const [id, n] of plan.add) { try { game.bank.addItemByID(id, n, false, false, true); } catch (e) { log(`backup: ${id} not added`, e); } }
    for (const [id, n] of plan.buys) {
      try { const p = game.shop.purchases.getObjectByID(id); if (p !== undefined) game.shop.upgradesPurchased.set(p, n); } catch (e) { log(`backup: ${id} not bought`, e); }
    }
    for (const x of plan.buildings) {
      try {
        const biome = game.township.biomes.getObjectByID(x.biome);
        const building = game.township.buildings.getObjectByID(x.id);
        if (biome !== undefined && building !== undefined) { biome.buildingsBuilt.set(building, x.n); biome.buildingEfficiency.set(building, x.eff); }
      } catch (e) { log(`backup: ${x.id} not built`, e); }
    }
    for (const id of plan.pets) { try { const pet = game.pets.getObjectByID(id); if (pet !== undefined) game.petManager.unlocked.add(pet); } catch (e) { log(`backup: ${id} not found`, e); } }
    writeSettings(b.settings);
    log(`backup restored: Hiring ${level(b.xp)}, ${h.crew.size} Folks, ${taken.length} kinds taken from the bank, ${back.items.length} kinds handed back, ${plan.add.length} items topped up, ${plan.buys.length} purchases, ${plan.buildings.length} buildings, ${plan.pets.length} pets`);
  };
  const apply = (b) => {
    applyBackup(b);
    saveData();
    setTimeout(() => location.reload(), 300);
  };

  const itemRows = (list) => list.slice(0, SHOWN).map(([id, n]) => { let it; try { it = game.items.getObjectByID(id); } catch {} return [it?.name ?? id, num(n), it?.media]; });
  const nameOf = (list, id) => { try { return list.getObjectByID(id)?.name ?? id; } catch { return id; } };

  /**
   * The confirm's bands for a backup: what it holds, what it replaces (amber), what comes back around the skill and,
   * in Worker Folks' own popup, a Voyage band. Voyage's popup has its own order to tell, so `voyageBand` false.
   */
  const planSections = (b, { voyageBand = true } = {}) => {
    const h = getHiring();
    const nowRecord = h.crew.serialize();
    const sections = [];
    const from = t(b.mod !== '' ? 'MOD_WF_RESTORE_FROM' : 'MOD_WF_RESTORE_FROM_DEV', { mod: esc(b.mod), name: bold(b.name || '?'), when: bold(when(b.at)) });
    const live = B.livedOn(h._xp, b.xp);
    sections.push({ head: t('MOD_WF_BACKUP_IN_HEAD'), body: [{ html: from }, holdsRows(b), t('MOD_WF_BACKUP_ALSO'), live ? t('MOD_WF_RESTORE_KEEPS_BOARDS') : ''] });
    // What is lost: the skill and crew as they are now, Folks hired since, a backup of another character.
    const lost = [];
    if (h._xp > 0 || h.crew.size > 0) lost.push({ html: t('MOD_WF_RESTORE_REPLACES', { now: bold(num(level(h._xp))), then: bold(num(level(b.xp))) }) });
    const gone = B.leaving(nowRecord, b.record);
    if (gone.length > 0) lost.push({ html: t('MOD_WF_RESTORE_LEAVE', { names: bold(names(gone)) }) });
    const back = B.returns(nowRecord, b.record);
    if (back.items.length + back.currencies.length > 0) lost.push(t('MOD_WF_RESTORE_HANDED_BACK'));
    const taken = B.takes(nowRecord, b, bankFor(b.record));
    if (taken.length > 0) {
      lost.push(t('MOD_WF_RESTORE_TAKEN'));
      lost.push({ rows: itemRows(taken) });
      if (taken.length > SHOWN) lost.push(t('MOD_WF_RESTORE_ITEMS_MORE', { more: num(taken.length - SHOWN) }));
    }
    if (b.name !== '' && b.name !== game.characterName) lost.push({ html: t('MOD_WF_RESTORE_OTHER', { name: bold(b.name), here: bold(game.characterName) }) });
    if (b.mode !== '' && b.mode !== game.currentGamemode?.id) lost.push(t('MOD_WF_RESTORE_OTHER_MODE'));
    if (lost.length > 0) sections.push({ head: t('MOD_WF_RESTORE_LOST_HEAD'), warn: true, body: lost });
    // What comes back around the skill.
    const plan = B.restorePlan(b, have());
    const bank = [];
    if (plan.add.length > 0) {
      bank.push({ rows: itemRows(plan.add) });
      if (plan.add.length > SHOWN) bank.push(t('MOD_WF_RESTORE_ITEMS_MORE', { more: num(plan.add.length - SHOWN) }));
    }
    if (plan.buys.length > 0) bank.push(t('MOD_WF_RESTORE_BUYS', { buys: plan.buys.map(([id]) => nameOf(game.shop.purchases, id)).join(', ') }));
    if (plan.buildings.length > 0) bank.push(t('MOD_WF_RESTORE_BUILDINGS', { buildings: [...new Set(plan.buildings.map((x) => nameOf(game.township.buildings, x.id)))].join(', ') }));
    if (plan.pets.length > 0) bank.push(t('MOD_WF_RESTORE_PETS', { pets: plan.pets.map((id) => nameOf(game.pets, id)).join(', ') }));
    if (bank.length === 0) bank.push(t('MOD_WF_RESTORE_BANK_NONE'));
    sections.push({ head: t('MOD_WF_RESTORE_BANK_HEAD'), body: bank });
    // Voyage: Folks first, then Voyage's own backup; walkers stand still without it.
    let walkers = [];
    try { walkers = (JSON.parse(b.record).folks ?? []).filter((f) => f?.travel === 'walking').map((f) => ({ name: String(f.name ?? f.id) })); } catch {}
    if (!voyageBand) return sections;
    if (voyageLoaded()) sections.push({ head: t('MOD_WF_RESTORE_VOYAGE_HEAD'), body: [t('MOD_WF_RESTORE_VOYAGE_AFTER')] });
    else if (walkers.length > 0) sections.push({ head: t('MOD_WF_RESTORE_VOYAGE_HEAD'), body: [t('MOD_WF_RESTORE_VOYAGE_OFF', { names: names(walkers) })] });
    return sections;
  };

  const confirmRestore = (b) => {
    const sections = planSections(b);
    SwalLocale.fire({
      customClass: swalClass(SWAL_WARN),
      width: WIDTH,
      title: t('MOD_WF_RESTORE_TITLE'),
      html: body(sections, t('MOD_WF_RESTORE_RELOAD')),
      showCancelButton: true,
      confirmButtonText: t('MOD_WF_RESTORE_GO'),
      cancelButtonText: t('MOD_WF_BUTTON_CANCEL'),
      didRender: (el) => { try { popupDidRender?.(el); } catch {} },
    }).then((res) => {
      if (!res.isConfirmed) return;
      try { apply(b); } catch (e) {
        // Nothing was saved: the reload after OK brings back the last save as it was.
        log('backup: restore failed', e);
        tell(t('MOD_WF_RESTORE_TITLE'), t('MOD_WF_RESTORE_FAILED'), 'error').then(() => location.reload());
      }
    });
  };

  const restore = () => {
    if (getHiring() === undefined) return;
    const html = body([{ head: t('MOD_WF_BACKUP_CODE_HEAD'), body: [t('MOD_WF_RESTORE_PASTE'), { html: `${codeBox('id="wf-restore-code"')}></textarea>`
      + `<span class="wf-backup-acts"><label class="btn btn-outline-info mb-0">${esc(t('MOD_WF_RESTORE_FILE'))}`
      + '<input type="file" accept=".txt,text/plain" class="d-none" data-wf-backup="file"></label></span>'
      + '<span class="wf-backup-note text-success" data-wf-backup="loaded" aria-live="polite"></span>' }] }]);
    SwalLocale.fire({
      customClass: swalClass(SWAL),
      width: WIDTH,
      title: t('MOD_WF_RESTORE_TITLE'),
      html,
      showCancelButton: true,
      confirmButtonText: t('MOD_WF_RESTORE_NEXT'),
      cancelButtonText: t('MOD_WF_BUTTON_CANCEL'),
      didRender: (el) => {
        try { popupDidRender?.(el); } catch {}
        const input = el?.querySelector?.('[data-wf-backup="file"]');
        if (input == null || input.dataset.wfBound === '1') return;
        input.dataset.wfBound = '1';
        // A new code or file clears the last refusal under the field: it was about the code before.
        const fresh = () => { try { Swal.resetValidationMessage(); } catch {} };
        el.querySelector('#wf-restore-code')?.addEventListener('input', fresh);
        input.addEventListener('change', async () => {
          const f = input.files?.[0];
          if (f === undefined) return;
          fresh();
          const loaded = el.querySelector('[data-wf-backup="loaded"]');
          try {
            document.getElementById('wf-restore-code').value = await f.text();
            if (loaded !== null) { loaded.textContent = t('MOD_WF_RESTORE_LOADED', { file: f.name }); loaded.className = 'wf-backup-note text-success'; }
          } catch (e) {
            log('backup: file read failed', e);
            if (loaded !== null) { loaded.textContent = t('MOD_WF_RESTORE_LOAD_FAILED'); loaded.className = 'wf-backup-note text-warning'; }
          }
        });
      },
      preConfirm: async () => {
        const r = await B.decode(document.getElementById('wf-restore-code')?.value ?? '', folkModel.SAVE_VERSION);
        if (r.backup !== undefined) return r.backup;
        Swal.showValidationMessage(t(WHY[r.why] ?? WHY.broken));
        return false;
      },
    }).then((res) => { if (res.isConfirmed && res.value) confirmRestore(res.value); });
  };

  // ---- the page's foot --------------------------------------------------------------------------------------------
  /** The two buttons under everything on the Hiring page, once. */
  const mount = (tips) => {
    const foot = document.querySelector('#worker-folks-container [data-wf="backup-foot"]');
    if (foot === null || foot.firstChild !== null) return;
    foot.innerHTML = `<button type="button" class="btn btn-sm btn-outline-secondary" data-wf-backup="out">${esc(t('MOD_WF_BACKUP_BUTTON'))}</button>`
      + `<button type="button" class="btn btn-sm btn-outline-secondary" data-wf-backup="in">${esc(t('MOD_WF_RESTORE_BUTTON'))}</button>`;
    const [out, inn] = foot.querySelectorAll('button');
    const tip = (el, key) => { if (tips?.set !== undefined) tips.set(el, t(key)); else el.title = t(key); };
    tip(out, 'MOD_WF_BACKUP_HINT');
    tip(inn, 'MOD_WF_RESTORE_HINT');
    out.onclick = () => { backUp().catch((e) => log('backup failed', e)); };
    inn.onclick = () => restore();
  };

  // ---- the API (v8): Voyage's one backup of both mods -------------------------------------------------------------
  /** A backup in numbers, for the caller's own "In this backup" rows. */
  const summary = (b) => Object.freeze({
    name: b.name, at: b.at, mod: b.mod, build: b.build, mode: b.mode,
    level: level(b.xp),
    folks: B.folksIn(b.record).length,
    itemKinds: Object.keys(b.items).length,
    buys: Object.keys(b.buys).length,
    buildings: Object.values(b.buildings).reduce((s, list) => s + Object.values(list).reduce((a, x) => a + x.n, 0), 0),
    pets: b.pets.length,
  });
  /** The bands as plain data: body lines are text, { html } (already escaped) or { rows: [[label, value, media?]] }. */
  const plainSections = (sections) => Object.freeze(sections.map((x) => Object.freeze({
    head: x.head, warn: x.warn === true,
    body: Object.freeze(x.body.filter((l) => l !== undefined && l !== null && l !== '')),
  })));
  const opened = async (code) => {
    if (getHiring() === undefined) return { why: 'unavailable' };
    return B.decode(typeof code === 'string' ? code : '', folkModel.SAVE_VERSION);
  };
  const api = {
    /** { ok: true, code, summary } with this game's backup, or { ok: false, why: 'unavailable' | 'failed' }. */
    backup: async () => {
      const h = getHiring();
      if (h === undefined) return Object.freeze({ ok: false, why: 'unavailable' });
      try {
        const b = take(h);
        return Object.freeze({ ok: true, code: await B.encode(b), summary: summary(b) });
      } catch (e) { log('backup (api): failed', e); return Object.freeze({ ok: false, why: 'failed' }); }
    },
    /** { ok: true, summary, keepsBoards, replaces, sections } or { ok: false, why } (decode's reasons, 'unavailable'). */
    restorePlan: async (code) => {
      const r = await opened(code);
      if (r.backup === undefined) return Object.freeze({ ok: false, why: r.why ?? 'broken' });
      const b = r.backup;
      const h = getHiring();
      const sections = planSections(b, { voyageBand: false });
      return Object.freeze({
        ok: true,
        summary: summary(b),
        keepsBoards: B.livedOn(h._xp, b.xp),
        replaces: sections.some((x) => x.warn),
        sections: plainSections(sections),
      });
    },
    /**
     * Writes the backup back, with no save and no reload: the game loop is stopped, the caller restores its own part,
     * saves and reloads once. { ok: true, summary } or { ok: false, why }; 'failed' means it broke part way and nothing
     * was saved: reload without saving.
     */
    restore: async (code) => {
      const r = await opened(code);
      if (r.backup === undefined) return Object.freeze({ ok: false, why: r.why ?? 'broken' });
      try { applyBackup(r.backup); } catch (e) { log('backup (api): restore failed', e); return Object.freeze({ ok: false, why: 'failed' }); }
      return Object.freeze({ ok: true, summary: summary(r.backup) });
    },
  };

  return { mount, backUp, restore, api };
}
