// Saved crew plans (round 5): the Plans button under the Overview's At work list. A plan is the crew as it works
// now, Folk by Folk (its skill and recipe, or its job, and its queue), kept under a name; applying it shows who moves
// where and who can't first, then moves each Folk as a click on its card would. Folks the plan doesn't list are left
// alone. Game-facing; the rules are in crew-plans-model.mjs.

export function install(ctx, { swalClass, getHiring, model, resume, popupDidRender, tips, log }) {
  let hiring;
  let api;
  ctx.onModsLoaded(() => { hiring = getHiring(); hiring.plans = api; });
  // Whoever shows the plan count (the Overview's Plans button) hears of a save or a delete.
  const watchers = [];
  const changed = () => watchers.forEach((f) => { try { f(); } catch (err) { log('plans: watcher failed', err); } });

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const sep = () => getLangString('MOD_WF_LIST_SEP');
  const notify = (kind, text) => {
    const n = hiring.game.notifications;
    if (kind === 'success') n.createSuccessNotification('worker_folks:plans', text, hiring.media);
    else n.createInfoNotification('worker_folks:plans', text, hiring.media);
  };
  const plans = () => model.normalizePlans(hiring.crew.plans);
  const queue = () => hiring.queue;
  const skillById = (id) => { try { return hiring.game.skills.getObjectByID(id); } catch { return undefined; } };
  const jobKind = (id) => hiring.jobs?.kind(id);
  /** The recipe its skill has selected, for a skill whose recipe a queue can pick. */
  const recipeIdOf = (skill) => (queue()?.queueable(skill) ? skill.selectedRecipe?.id ?? null : null);
  const working = (folk) => {
    if (folk.job !== null) return hiring.jobs?.isRunning(folk) === true;
    const skill = hiring.skillOf(folk);
    return skill !== undefined && hiring.delegated.has(skill);
  };

  // ---- Reading the crew ----

  /** The crew now, Folk by Folk: who works what, as a plan keeps it. */
  const capture = () => hiring.crew.all.flatMap((folk) => {
    if (folk.job !== null) return [{ folkId: folk.id, jobId: folk.job }];
    const skill = hiring.skillOf(folk);
    if (skill === undefined) return [];
    const atWork = working(folk);
    const pick = atWork ? resume.toSaved(resume.selectionOf(skill)) : folk.pick;
    // Whether it was at work: applying the plan starts only those, so an idle Folk never takes a Shift Slot a worker needs.
    return [{ folkId: folk.id, skillId: skill.id, recipeId: recipeIdOf(skill), pick: pick ?? folk.pick ?? null, queue: queue()?.stepsOf(folk) ?? [], working: atWork }];
  });

  const crewView = () => hiring.crew.all.map((folk) => {
    const skill = folk.job === null ? hiring.skillOf(folk) : undefined;
    return {
      id: folk.id,
      name: folk.name,
      skillId: folk.job === null ? folk.skillId : null,
      jobId: folk.job,
      recipeId: skill === undefined ? null : recipeIdOf(skill),
      queue: queue()?.stepsOf(folk) ?? [],
      working: working(folk),
      walking: folk.travel === 'walking',
      available: hiring.folkAvailable(folk),
    };
  });

  /** Why another rule refuses this line for this Folk ('' = nothing does). */
  const refusal = (view, entry) => {
    const folk = hiring.crew.byId(view.id);
    if (entry.jobId !== null) {
      if (jobKind(entry.jobId) === undefined) return getLangString('MOD_WF_PLANS_NO_JOB');
      return hiring.jobs.refusal(folk, entry.jobId);
    }
    const skill = skillById(entry.skillId);
    if (skill === undefined) return getLangString('MOD_WF_PLANS_NO_SKILL');
    const recipe = entry.recipeId === null ? undefined : queue()?.recipeOf(skill, entry.recipeId);
    if (entry.recipeId !== null && (recipe === undefined || !queue().canRun(skill, recipe))) {
      return templateLangString('MOD_WF_PLANS_NO_RECIPE', { recipe: recipe === undefined ? entry.recipeId : queue().nameOf(recipe) });
    }
    return hiring.pickRefusal(folk, skill);
  };
  const preview = (plan) => model.planChanges(plan, crewView(), { refusal, sharedJob: (id) => jobKind(id)?.def?.shared === true });

  // ---- Words ----

  const skillText = (skillId, recipeId) => {
    const skill = skillById(skillId);
    const name = skill === undefined ? skillId : hiring.skillName(skill);
    const recipe = skill === undefined || recipeId === null ? undefined : queue()?.recipeOf(skill, recipeId);
    return recipe === undefined ? name : templateLangString('MOD_WF_PLANS_SKILL_RECIPE', { skill: name, recipe: queue().nameOf(recipe) });
  };
  const entryText = (e) => (e.jobId !== null ? jobKind(e.jobId)?.name ?? e.jobId : skillText(e.skillId, e.queue[0]?.recipeId ?? e.recipeId));
  const nowText = (folk) => {
    if (folk.job !== null) return jobKind(folk.job)?.name ?? folk.job;
    return folk.skillId === null ? getLangString('MOD_WF_PLANS_NO_WORK') : hiring.skillName(folk.skillId);
  };
  const folksText = (n) => (n === 1 ? getLangString('MOD_WF_PLANS_FOLKS_ONE') : templateLangString('MOD_WF_PLANS_FOLKS', { count: numberWithCommas(n) }));
  const line = (text, cls = '') => el('div', `wf-bulk-line ${cls}`.trim(), text);

  // ---- The Plans popup ----

  const open = (after = () => {}) => {
    const body = el('div', 'text-center wf-help-body wf-plans');
    const draw = (keep) => {
      body.replaceChildren();
      const list = plans();
      if (list.length === 0) body.append(line(getLangString('MOD_WF_PLANS_EMPTY'), 'wf-subtle'));
      list.forEach((plan) => {
        const band = el('div', 'wf-band wf-plan-row');
        const text = el('div', 'wf-plan-text');
        text.append(el('div', 'font-w600', plan.name), el('div', 'wf-subtle', folksText(plan.entries.length)));
        const btns = el('div', 'wf-plan-btns');
        const apply = el('button', 'btn btn-sm btn-outline-success', getLangString('MOD_WF_PLANS_APPLY'));
        apply.type = 'button';
        apply.setAttribute('aria-label', templateLangString('MOD_WF_PLANS_APPLY_LABEL', { name: plan.name }));
        apply.addEventListener('click', () => { Swal.close(); setTimeout(() => confirmApply(plan, after), 0); });
        const del = el('button', 'btn btn-sm btn-outline-danger', getLangString('MOD_WF_PLANS_DELETE'));
        del.type = 'button';
        del.setAttribute('aria-label', templateLangString('MOD_WF_PLANS_DELETE_LABEL', { name: plan.name }));
        del.addEventListener('click', () => { Swal.close(); setTimeout(() => confirmDelete(plan, after), 0); });
        btns.append(apply, del);
        band.append(text, btns);
        body.append(band);
      });
      body.append(saveBand(keep, draw, after));
    };
    draw('');
    SwalLocale.fire({
      didRender: popupDidRender,
      title: getLangString('MOD_WF_PLANS_TITLE'),
      width: '32rem',
      html: body,
      // A tool window like the queue's: its own green Save plan, closed with ×.
      showConfirmButton: false,
      showCloseButton: true,
      customClass: swalClass({ popup: 'wf-ui wf-tool' }),
      didOpen: () => body.querySelector('input')?.focus(),
    });
  };

  /** The save band: a name field and Save plan, with one amber line while it can't be saved. */
  const saveBand = (typed, redraw, after) => {
    const band = el('div', 'wf-band wf-plan-save');
    const inputId = 'wf-plan-name';
    const label = el('label', 'font-w600 wf-band-head mb-2', getLangString('MOD_WF_PLANS_SAVE_HEAD'));
    label.htmlFor = inputId;
    const row = el('div', 'wf-reserve-controls wf-plan-save-row');
    const input = el('input', 'form-control wf-plan-input');
    input.id = inputId;
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = getLangString('MOD_WF_PLANS_NAME');
    // The field stops at the limit in characters; the browser's own limit counts UTF-16 units, so it only stands behind.
    input.maxLength = 2 * model.PLAN_NAME_MAX;
    input.value = typed;
    const save = el('button', 'btn btn-success wf-plan-save-btn', getLangString('MOD_WF_PLANS_SAVE'));
    save.type = 'button';
    row.append(input, save);
    const note = el('div', 'wf-plan-note');
    band.append(label, row, note);
    const entries = capture();
    const check = () => {
      const chars = [...input.value];
      if (chars.length > model.PLAN_NAME_MAX) input.value = chars.slice(0, model.PLAN_NAME_MAX).join('');
      const list = plans();
      const name = input.value;
      const full = list.length >= model.PLANS_MAX;
      // A full list says so before anything is typed: only a used name can be saved now.
      const problem = entries.length === 0 ? 'nothing'
        : full && model.cleanPlanName(name) === '' ? 'full'
          : model.planNameProblem(name) ?? (model.planNamed(list, name) === undefined && full ? 'full' : null);
      const old = problem === null ? model.planNamed(list, name) : undefined;
      // An empty field before anything is typed asks nothing: the placeholder says what goes there.
      const quiet = problem === 'empty' && name === '';
      note.className = `wf-plan-note ${problem === null || quiet ? 'wf-subtle' : 'text-warning'}`;
      note.textContent = problem === null
        ? (old === undefined ? '' : templateLangString('MOD_WF_PLANS_REPLACES', { name: old.name }))
        : quiet ? '' : templateLangString(`MOD_WF_PLANS_WHY_${problem}`, { max: `${problem === 'long' ? model.PLAN_NAME_MAX : model.PLANS_MAX}` });
      save.disabled = problem !== null;
    };
    const commit = () => {
      check();
      if (save.disabled) return;
      const r = model.savePlan(plans(), input.value, capture(), `p${Date.now().toString(36)}`);
      if (r.error !== undefined) { check(); return; }
      hiring.crew.plans = r.plans;
      const name = model.cleanPlanName(input.value);
      notify('success', templateLangString(r.replaced ? 'MOD_WF_PLANS_SAVED_OVER' : 'MOD_WF_PLANS_SAVED', { name, folks: folksText(model.planNamed(r.plans, name).entries.length) }));
      log(`plans: saved "${name}" (${r.replaced ? 'replaced' : 'new'})`);
      changed();
      redraw('');
    };
    input.addEventListener('input', (e) => { if (!e.isComposing) check(); });
    input.addEventListener('compositionend', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    save.addEventListener('click', commit);
    check();
    return band;
  };

  const confirmDelete = (plan, after) => {
    SwalLocale.fire({
      didRender: popupDidRender,
      title: templateLangString('MOD_WF_PLANS_DELETE_TITLE', { name: plan.name }),
      html: el('div', 'text-center wf-help-body', getLangString('MOD_WF_PLANS_DELETE_BODY')),
      showCancelButton: true,
      focusCancel: true,
      confirmButtonText: getLangString('MOD_WF_PLANS_DELETE'),
      cancelButtonText: getLangString('MOD_WF_BUTTON_CANCEL'),
      customClass: swalClass({ confirmButton: 'btn btn-danger m-1' }),
    }).then((result) => {
      if (result.isConfirmed) {
        hiring.crew.plans = model.deletePlan(plans(), plan.id);
        notify('info', templateLangString('MOD_WF_PLANS_DELETED', { name: plan.name }));
        changed();
      }
      open(after);
    });
  };

  // ---- Apply: the changes first ----

  const previewBody = (plan, rows) => {
    const body = el('div', 'text-center wf-help-body wf-bulk');
    const byFolk = new Map(plan.entries.map((e) => [e.folkId, e]));
    const changing = rows.filter((r) => r.kind !== 'same' && r.kind !== 'skip');
    if (changing.length === 0) body.append(line(getLangString('MOD_WF_PLANS_NOTHING'), 'wf-subtle'));
    else body.append(line(getLangString('MOD_WF_PLANS_HEAD_CHANGE'), 'font-w600'));
    for (const r of changing) {
      const folk = hiring.crew.byId(r.folkId);
      const to = entryText(byFolk.get(r.folkId));
      const key = r.kind === 'stop' ? 'MOD_WF_PLANS_LINE_STOP' : r.kind === 'start' ? 'MOD_WF_PLANS_LINE_START'
        // An idle Folk on its skill starts (with the plan's recipe and queue); one at work switches or takes the queue.
        : r.kind === 'recipe' ? (!working(folk) ? 'MOD_WF_PLANS_LINE_START' : r.queueOnly ? 'MOD_WF_PLANS_LINE_QUEUE' : 'MOD_WF_PLANS_LINE_RECIPE')
          : r.idle ? 'MOD_WF_PLANS_LINE_IDLE' : 'MOD_WF_PLANS_LINE_MOVE';
      body.append(line(templateLangString(key, { name: r.name, from: nowText(folk), to })));
    }
    const same = rows.filter((r) => r.kind === 'same');
    if (same.length > 0) body.append(line(templateLangString('MOD_WF_PLANS_SAME', { names: same.map((r) => r.name).join(sep()) }), 'wf-subtle wf-bulk-head'));
    const skips = rows.filter((r) => r.kind === 'skip');
    if (skips.length > 0) {
      body.append(line(getLangString('MOD_WF_PLANS_HEAD_SKIP'), 'font-w600 wf-bulk-head'));
      const gone = skips.filter((r) => r.why === 'gone').length;
      const grouped = (why) => skips.filter((r) => r.why === why).map((r) => r.name).join(sep());
      for (const why of ['walking', 'unavailable']) {
        const names = grouped(why);
        if (names !== '') body.append(line(templateLangString(`MOD_WF_PLANS_SKIP_${why}`, { names }), 'text-warning'));
      }
      for (const r of skips) {
        if (r.why === 'held') body.append(line(templateLangString(r.holderInPlan ? 'MOD_WF_PLANS_SKIP_held_PLAN' : 'MOD_WF_PLANS_SKIP_held', { name: r.name, holder: r.holder, what: entryText(byFolk.get(r.folkId)) }), 'text-warning'));
        if (r.why === 'refused') body.append(line(templateLangString('MOD_WF_PLANS_SKIP_refused', { name: r.name, reason: r.reason }), 'text-warning'));
      }
      if (gone > 0) body.append(line(gone === 1 ? getLangString('MOD_WF_PLANS_SKIP_gone_ONE') : templateLangString('MOD_WF_PLANS_SKIP_gone', { count: numberWithCommas(gone) }), 'wf-subtle'));
    }
    return body;
  };

  const confirmApply = (plan, after) => {
    const rows = preview(plan);
    const ok = model.planDoesSomething(rows);
    SwalLocale.fire({
      didRender: popupDidRender,
      title: templateLangString('MOD_WF_PLANS_APPLY_TITLE', { name: plan.name }),
      width: '32rem',
      html: previewBody(plan, rows),
      showCancelButton: true,
      focusCancel: !ok,
      confirmButtonText: getLangString('MOD_WF_PLANS_APPLY'),
      cancelButtonText: getLangString('MOD_WF_BUTTON_BACK'),
      customClass: swalClass(),
      didOpen: () => { if (!ok) { const b = Swal.getConfirmButton(); if (b) b.disabled = true; } },
    }).then((result) => {
      if (result.isConfirmed) {
        try { apply(plan); } catch (err) { log('plans: apply failed', err); }
        hiring.renderQueue.folks = true;
        after();
      } else if (result.dismiss === Swal.DismissReason.cancel) open(after);
    });
  };

  /**
   * Moves each Folk the preview lets move, in passes so a swap of two skills or jobs never needs a third Shift Slot or
   * finds its new place still taken: every Folk that changes stops first, then each takes its new skill, then its new
   * job, and last each is put on its recipe and queue and started. A Folk the plan saved idle takes its skill and queue
   * and stays idle.
   */
  const apply = (plan) => {
    const rows = preview(plan);
    const byFolk = new Map(plan.entries.map((e) => [e.folkId, e]));
    const moving = rows.filter((r) => r.kind === 'recipe' || r.kind === 'move' || r.kind === 'job' || r.kind === 'stop');
    const misses = [];
    const jobs = [];
    for (const r of moving) {
      const folk = hiring.crew.byId(r.folkId);
      if (working(folk)) hiring.stopFolk(folk);
    }
    for (const r of moving) if (r.kind === 'move') hiring.crew.assign(r.folkId, byFolk.get(r.folkId).skillId);
    for (const r of moving) {
      if (r.kind !== 'job') continue;
      const folk = hiring.crew.byId(r.folkId);
      if (hiring.jobs.set(folk, byFolk.get(r.folkId).jobId)) jobs.push(folk);
      else misses.push({ why: 'refused', name: folk.name });
    }
    const started = [];
    const placed = [];
    for (const r of rows) {
      if (r.kind !== 'start' && r.kind !== 'recipe' && r.kind !== 'move') continue;
      const folk = hiring.crew.byId(r.folkId);
      const e = byFolk.get(r.folkId);
      const skill = hiring.skillOf(folk);
      if (skill === undefined || skill.id !== e.skillId) { misses.push({ why: 'noSkill', name: folk.name }); continue; }
      if (r.idle) {
        // Saved idle: its queue as saved, the skill's recipe (the player's own selection) left as it is, not started.
        if (queue()?.queueable(skill)) queue().setSteps(folk, e.queue);
        placed.push(folk);
        continue;
      }
      if (r.kind !== 'start') {
        const recipe = e.recipeId === null ? undefined : queue()?.recipeOf(skill, e.recipeId);
        if (recipe !== undefined) queue().select(skill, recipe);
        // The queue as saved, from nothing made; its first step is the recipe the Folk starts on.
        if (queue()?.queueable(skill)) {
          queue().setSteps(folk, e.queue);
          const head = e.queue[0] === undefined ? undefined : queue().recipeOf(skill, e.queue[0].recipeId);
          if (head !== undefined && queue().canRun(skill, head)) queue().select(skill, head);
        }
      }
      const why = hiring.room?.startFolk(folk, resume.fromSaved(skill, e.pick, hiring.game) ?? hiring.lastPick?.(skill) ?? null) ?? 'notStarted';
      if (why === '') started.push(folk);
      else misses.push({ why, name: folk.name });
    }
    const stopped = rows.filter((r) => r.kind === 'stop').length;
    log(`plans: applied "${plan.name}": ${started.length} started, ${jobs.length} on jobs, ${placed.length} placed idle, ${stopped} stopped, ${misses.length} not`);
    // The toast counts the Folks it put to work; one stopped or placed idle is as the plan saved it, not at work.
    report(plan, started.length + jobs.length, misses);
  };

  /** All went: a toast. Some stayed idle: who and why in a popup, one line per reason, as Restart all says it. */
  const report = (plan, done, misses) => {
    const head = templateLangString('MOD_WF_PLANS_APPLIED', { name: plan.name, folks: folksText(done) });
    if (misses.length === 0) { notify('success', head); return; }
    const byWhy = new Map();
    misses.forEach(({ why, name }) => byWhy.set(why, [...(byWhy.get(why) ?? []), name]));
    const body = el('div', 'text-center wf-help-body wf-bulk');
    if (done > 0) body.append(line(head, 'font-w600 text-success'));
    [...byWhy].forEach(([why, names], i) => body.append(line(templateLangString(`MOD_WF_BULK_WHY_${why}`, { names: names.join(sep()) }), i > 0 || done > 0 ? 'wf-bulk-head' : '')));
    SwalLocale.fire({
      didRender: popupDidRender,
      title: plan.name,
      width: '32rem',
      html: body,
      confirmButtonText: getLangString('MOD_WF_BUTTON_CLOSE'),
      customClass: swalClass(),
    });
  };

  /** What the Plans button shows: how many plans are saved. */
  const count = () => (hiring === undefined ? 0 : plans().length);
  api = { open, count, max: model.PLANS_MAX, capture, preview, onChange: (f) => watchers.push(f) };
  return api;
}
