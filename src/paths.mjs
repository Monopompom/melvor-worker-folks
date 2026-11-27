// Paths at Master and Foreman, game side: the names, icons and effect lines, the pick inside the promotion popup, the
// card's path chip and the Change path popup (the first pick free, a change for the tier's diploma and a fee). The rules
// are in src/paths-model.mjs. Game-facing.

const GP_ID = 'melvorD:GP';

export function install(ctx, { swalClass, getHiring, model, popupDidRender, titleName = (s) => s, effectsFragment, numbers, tips, log }) {
  let hiring;

  const el = (tag, className = '', text) => {
    const node = document.createElement(tag);
    if (className !== '') node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const gp = () => game.currencies.getObjectByID(GP_ID);
  // The game's percent, so German and French get their space before "%", as on the card's other effect lines.
  const pct = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatPercent(Math.abs(n), Number.isInteger(n) ? 0 : 1)}`;
  const piece = (key, value, tone) => {
    const [before, after = ''] = templateLangString(key, { value: '\u0001' }).split('\u0001');
    return { before, value, after, tone };
  };
  const wagesOn = () => hiring?.payroll?.enabled !== false;

  /** "Hustler", or "Hustler II" at the Foreman step. */
  const nameOf = (id, tier) => {
    const base = getLangString(`MOD_WF_PATH_${id}`);
    return model.stepOf(tier) === 2 ? templateLangString('MOD_WF_PATH_STEP2', { name: base }) : base;
  };
  const mediaOf = (id) => hiring.getMediaURL(`assets/${model.PATHS[id].icon}.webp`);

  /** What a path does at `tier`, as the card's effect pieces: what it gains first, then what it costs. */
  const effectPieces = (id, tier) => {
    const e = model.pathEffects(id, tier);
    const wage = Math.round((e.wageFactor - 1) * 100);
    const all = [
      e.rate === 0 ? null : piece('MOD_WF_EFFECT_RATE', pct(e.rate), e.rate > 0 ? 'good' : 'bad'),
      e.xp === 0 ? null : piece('MOD_WF_EFFECT_XP', pct(e.xp), e.xp > 0 ? 'good' : 'bad'),
      e.masteryXP === 0 ? null : piece('MOD_WF_EFFECT_MASTERY_XP', pct(e.masteryXP), e.masteryXP > 0 ? 'good' : 'bad'),
      // A longer action is the cost here.
      e.interval === 0 ? null : piece('MOD_WF_EFFECT_INTERVAL', pct(e.interval), e.interval < 0 ? 'good' : 'bad'),
      wage === 0 ? null : piece(wagesOn() ? 'MOD_WF_EFFECT_WAGE' : 'MOD_WF_EFFECT_WAGE_OFF', pct(wage), wage < 0 ? 'good' : 'bad'),
    ].filter((p) => p !== null);
    return [...all.filter((p) => p.tone === 'good'), ...all.filter((p) => p.tone === 'bad')];
  };
  const lineOf = (p) => `${p.before}${p.value}${p.after}`;

  /** The selected (or current) path's lines: its name, what it gains and costs, who it suits. */
  const fillDetail = (box, id, tier, head) => {
    if (id === null) {
      box.replaceChildren(el('div', 'wf-path-hint', getLangString('MOD_WF_PATH_PICK_HINT')));
      return;
    }
    const effects = el('div', 'wf-effects');
    effects.append(effectsFragment(effectPieces(id, tier)));
    box.replaceChildren(el('div', 'font-w600', head ?? nameOf(id, tier)), effects, el('div', 'wf-path-suits wf-subtle', getLangString(`MOD_WF_PATH_${id}_SUITS`)));
  };

  /**
   * The three path chips, tap to select (filled btn-info), and under them a band with the selected path's lines. The
   * current path (a change) is marked and can't be picked again. `onPick(id)` follows each selection.
   */
  const picker = (tier, { current = null, onPick = () => {}, lockedWhy = '' } = {}) => {
    const root = el('div', 'wf-paths');
    const chips = el('div', 'wf-path-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', getLangString('MOD_WF_PATH_GROUP'));
    // Every path's lines (and the hint, or the current path) stacked in one grid cell, only the selected one visible:
    // the band is as tall as the longest from the start, so a tap never moves the chips under the finger.
    const detail = el('div', 'wf-band wf-path-detail wf-path-stack');
    detail.setAttribute('aria-live', 'polite');
    const panes = new Map();
    const pane = (key, fill) => {
      const p = el('div', 'wf-path-pane');
      fill(p);
      detail.append(p);
      panes.set(key, p);
    };
    pane(null, (p) => fillDetail(p, current, tier, current === null ? undefined : templateLangString('MOD_WF_PATH_NOW', { name: nameOf(current, tier) })));
    model.PATH_IDS.filter((id) => id !== current).forEach((id) => pane(id, (p) => fillDetail(p, id, tier)));
    const show = (key) => panes.forEach((p, k) => {
      const on = k === key;
      p.classList.toggle('wf-path-pane-off', !on);
      p.setAttribute('aria-hidden', String(!on));
    });
    show(null);
    const buttons = model.PATH_IDS.map((id) => {
      const b = el('button', 'btn btn-outline-info wf-path-pick');
      b.type = 'button';
      b.dataset.wfPath = id;
      b.setAttribute('aria-pressed', 'false');
      const img = el('img', 'wf-path-icon');
      img.src = mediaOf(id);
      img.alt = '';
      b.append(img, el('span', '', id === current ? templateLangString('MOD_WF_PATH_CURRENT', { name: nameOf(id, tier) }) : nameOf(id, tier)));
      // Grey with its reason: the path it already follows, or (all of them) why no change can be made now.
      const why = id === current ? getLangString('MOD_WF_PATH_IS_CURRENT') : lockedWhy;
      if (why !== '') {
        b.classList.add('disabled');
        b.setAttribute('aria-disabled', 'true');
        tips?.set(b, why);
      }
      b.onclick = () => {
        if (why !== '') return;
        buttons.forEach((x) => {
          const on = x === b;
          x.classList.toggle('btn-info', on);
          x.classList.toggle('btn-outline-info', !on);
          x.setAttribute('aria-pressed', String(on));
        });
        show(id);
        onPick(id);
      };
      chips.append(b);
      return b;
    });
    root.append(chips, detail);
    return root;
  };

  /** A requirement row as the promotion popup draws it: ✓ green or ✗ red, then the text (DOM pieces). */
  const reqRow = (met, ...parts) => {
    const row = el('div', met ? 'text-success' : 'text-danger');
    row.tabIndex = 0;
    row.append(`${met ? '✓' : '✗'} `, ...parts);
    return row;
  };
  /** A lang string with one value given as '\u0001', split around `node`. */
  const textAround = (key, vars, node) => {
    const [before, after = ''] = templateLangString(key, vars).split('\u0001');
    return [before, node, after];
  };
  const itemNode = (item) => {
    const span = el('span', 'text-nowrap');
    if (item === undefined) { span.textContent = '?'; return span; }
    const img = el('img', 'skill-icon-xs mr-1');
    img.src = item.media;
    img.alt = '';
    span.append(img, item.name);
    return span;
  };
  const gpNode = (amount, short) => {
    const span = el('span', 'text-nowrap');
    const img = el('img', 'skill-icon-xs mr-1');
    img.src = game.gp.media;
    img.alt = 'GP';
    span.append(img, el('span', `font-w600 ${short ? 'text-danger' : 'text-warning'}`, numbers.shortNumber(amount)));
    return span;
  };

  /** What a change costs this Folk now: { free, diploma, haveDiploma, cost, canPay }. */
  const priceOf = (folk) => {
    const free = model.needsPick(folk);
    const diploma = hiring.diplomaItem(folk.tier);
    const cost = model.changeCost(hiring.payroll?.nextHirePrice(folk.tier) ?? 0);
    return {
      free,
      diploma,
      haveDiploma: diploma !== undefined && game.bank.getQty(diploma) > 0,
      cost,
      canPay: gp()?.canAfford(cost) === true,
    };
  };

  const api = {
    nameOf,
    mediaOf,
    effectPieces,

    /** The card's chip: null below Master; else { pick, media, text, tip } (pick: no path yet, the free first pick). */
    cardView(folk) {
      if (!model.holdsPath(folk.tier)) return null;
      if (model.needsPick(folk)) {
        return { pick: true, media: null, text: getLangString('MOD_WF_PATH_CHOOSE'), tip: getLangString('MOD_WF_PATH_CHOOSE_TIP') };
      }
      const onJob = folk.job !== null && folk.job !== undefined;
      const lines = [
        { text: nameOf(folk.path, folk.tier), cls: 'font-w600' },
        ...effectPieces(folk.path, folk.tier).map((p) => ({ text: lineOf(p), cls: p.tone === 'bad' ? 'text-warning' : 'text-success' })),
        ...(onJob ? [{ text: getLangString('MOD_WF_PATH_ON_JOB'), cls: 'text-warning' }] : []),
        getLangString('MOD_WF_PATH_CHANGE_TIP'),
      ];
      return { pick: false, media: mediaOf(folk.path), text: nameOf(folk.path, folk.tier), tip: lines };
    },

    /**
     * The promotion popup's part, or null when the target tier holds no path. { needsPick, rowText(chosen), mount(box,
     * onPick) }: a Master to be picks here (so does a Master without a path on its way to Foreman, for free); a Master
     * with a path sees its stronger Foreman step.
     */
    promotionPart(folk, toTier) {
      if (!model.holdsPath(toTier)) return null;
      const keeps = model.isPath(folk.path) && model.holdsPath(folk.tier);
      return {
        needsPick: !keeps,
        rowText: (chosen) => {
          if (keeps) return templateLangString('MOD_WF_PROMO_PATH_STEP', { from: nameOf(folk.path, folk.tier), to: nameOf(folk.path, toTier) });
          return chosen === null ? getLangString('MOD_WF_PROMO_PATH_PICK') : templateLangString('MOD_WF_PROMO_PATH', { path: nameOf(chosen, toTier) });
        },
        mount(box, onPick) {
          if (keeps) {
            const detail = el('div', 'wf-band wf-path-detail');
            fillDetail(detail, folk.path, toTier);
            box.replaceChildren(detail);
          } else {
            box.replaceChildren(picker(toTier, { onPick }));
          }
        },
      };
    },

    /** The free first pick, or Change path for the diploma and a fee. Not while the Folk is on strike (a change). */
    openPick(folk) {
      if (!model.holdsPath(folk.tier)) return;
      // A staff action like Promote: another mod (Voyage) may say no while the Folk is far away.
      if (hiring.refused('staff', { action: 'path', folk })) return;
      const price = priceOf(folk);
      const current = price.free ? null : folk.path;
      const strike = !price.free && folk.onStrike === true;
      let selected = null;
      const root = el('div', 'wf-paths-popup');
      const confirmOk = () => selected !== null && (price.free || (price.haveDiploma && price.canPay));
      const update = () => {
        const b = Swal.getConfirmButton();
        if (b) b.disabled = !confirmOk();
      };
      const strikeWhy = strike ? templateLangString('MOD_WF_PATH_STRIKE', { name: folk.name }) : '';
      root.append(picker(folk.tier, { current, lockedWhy: strikeWhy, onPick: (id) => { selected = id; update(); } }));
      if (strike) {
        // Keep the block, say why where the button would be, and leave the button out.
        root.append(el('div', 'text-warning mt-2', strikeWhy));
      } else if (price.free) {
        root.append(el('div', 'text-success mt-2', getLangString('MOD_WF_PATH_FREE')));
      } else {
        const band = el('div', 'wf-band text-left mt-2 wf-path-cost');
        const diplomaRow = reqRow(price.haveDiploma, ...textAround('MOD_WF_PROMO_DIPLOMA', { item: '\u0001' }, itemNode(price.diploma)));
        const gpRow = reqRow(price.canPay, ...textAround('MOD_WF_PROMO_COST', { cost: '\u0001', percent: `${Math.round(model.CHANGE_PRICE_RATE * 100)}` }, gpNode(price.cost, !price.canPay)));
        band.append(diplomaRow, gpRow);
        root.append(band);
        tips?.set(diplomaRow, price.diploma === undefined ? '' : [{ parts: [{ text: getLangString('MOD_WF_PATH_TIP_DIPLOMA') }, { item: price.diploma }] }]);
        tips?.set(gpRow, templateLangString('MOD_WF_PATH_TIP_GP', { cost: numberWithCommas(price.cost) }));
      }
      SwalLocale.fire({
        didRender: popupDidRender,
        title: templateLangString(price.free ? 'MOD_WF_PATH_PICK_TITLE' : 'MOD_WF_PATH_CHANGE_TITLE', { name: titleName(folk.name) }),
        html: root,
        imageUrl: hiring.portraitOf(folk),
        imageWidth: 64,
        imageHeight: 64,
        imageAlt: folk.name,
        // A pick commits: the green of agreeing. On a strike the confirm stays out and the same bottom button reads
        // Close (no ✕ in a corner, which took the focus ring alone; the user, 27 Nov 2026).
        customClass: swalClass({ popup: 'wf-ui wf-pic', confirmButton: 'btn btn-success m-1' }),
        showConfirmButton: !strike,
        showCancelButton: true,
        cancelButtonText: getLangString(strike ? 'MOD_WF_BUTTON_CLOSE' : 'MOD_WF_BUTTON_CANCEL'),
        confirmButtonText: getLangString(price.free ? 'MOD_WF_BUTTON_PICK_PATH' : 'MOD_WF_BUTTON_CHANGE_PATH'),
        focusCancel: true,
        didOpen: () => update(),
        didDestroy: () => tips?.sweep(),
      }).then((result) => {
        if (result.isConfirmed && selected !== null) api.choose(folk, selected);
      });
    },

    /** Takes `id` for `folk`: free as its first pick, else for the diploma and the fee. Returns true when it changed. */
    choose(folk, id) {
      const plan = model.pickPlan(folk, id);
      const fail = (key) => {
        game.notifications.createErrorNotification('worker_folks:path', templateLangString(key, { name: folk.name }));
        return false;
      };
      if (!plan.ok) return fail(plan.why === 'strike' ? 'MOD_WF_PATH_STRIKE' : 'MOD_WF_PATH_CANT');
      if (!plan.free) {
        const price = priceOf(folk);
        if (!price.haveDiploma || !price.canPay) return fail('MOD_WF_PATH_SHORT');
        gp().remove(price.cost);
        game.bank.removeItemQuantity(price.diploma, 1, true);
      }
      if (!hiring.crew.setPath(folk.id, id)) return fail('MOD_WF_PATH_CANT');
      log(`${folk.name} took the ${id} path${plan.free ? ' (free)' : ''}`);
      hiring.invalidateFolkTables?.();
      hiring.markCard?.(folk);
      hiring.renderQueue.folks = true;
      game.notifications.createSuccessNotification('worker_folks:path', templateLangString('MOD_WF_PATH_TAKEN', { name: folk.name, path: nameOf(id, folk.tier) }), mediaOf(id));
      return true;
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.paths = api;
  });
  return api;
}
