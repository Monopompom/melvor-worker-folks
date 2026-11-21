// A Folk's own portrait, game side: one drawing per look, the counts behind its earned marks and the Edit window. The
// rules are in src/look-model.mjs, the drawing in src/look-art-model.mjs. Game-facing.

const NS = 'worker_folks';

export function install(ctx, { getHiring, model, art, popupDidRender, titleName, tips, log }) {
  let hiring;
  /** Look key → the drawing's URL. Pictures shown anywhere keep theirs, so one is never taken back. */
  const drawn = new Map();
  /** Folk id → the lasting face that id gives it. */
  const faces = new Map();

  const faceFromId = (id) => {
    let face = faces.get(id);
    if (face === undefined) {
      face = art.lookFrom(id);
      faces.set(id, face);
    }
    return face;
  };
  const faceOf = (folk) => folk.look ?? faceFromId(folk.id);
  const hasVoyage = () => { try { return game.registeredNamespaces.hasNamespace('voyage'); } catch { return false; } };
  const statesOf = (folk) => model.markStates({ mastery: hiring.masteryLevelOf(folk), strikes: folk.strikes, counts: folk.marks, voyage: hasVoyage() });
  const picture = (folk, tier, look) => ({
    tier,
    look,
    gear: model.shownGear(model.wornGear(folk.loadout, NS), look.hide),
    marks: model.shownMarks(statesOf(folk), look.hide),
    stripes: model.stripesFor(folk.marks?.ms),
  });

  /** The Folk's portrait as a short URL, the same one while its picture stays the same; `tier` to show another rank. */
  const urlOf = (folk, tier = folk.tier) => {
    try {
      const shown = picture(folk, tier, faceOf(folk));
      const key = model.lookKey(shown);
      let url = drawn.get(key);
      if (url === undefined) {
        url = URL.createObjectURL(new Blob([art.render(model.drawing(shown))], { type: 'image/svg+xml' }));
        drawn.set(key, url);
      }
      return url;
    } catch (err) {
      log('portrait not drawn', err);
      return hiring.portrait(tier);
    }
  };

  // ---- What the marks count ---------------------------------------------------------

  const setCounts = (folk, counts) => {
    if (counts === undefined || Object.keys(counts).length === 0) delete folk.marks;
    else folk.marks = counts;
  };
  const addWork = (folk, ms) => {
    if (folk === undefined || !(ms > 0)) return;
    if (folk.marks === undefined) folk.marks = { ms };
    else folk.marks.ms = (folk.marks.ms ?? 0) + ms;
  };
  /** After a hit it lived through: under 10% HP from above the line is one close call. */
  const onHurt = (folk, before, after, max) => {
    if (!model.isCloseCall(before, after, max)) return;
    setCounts(folk, { ...(folk.marks ?? {}), close: (folk.marks?.close ?? 0) + 1 });
    hiring.renderQueue.folks = true;
  };

  // ---- The Edit window --------------------------------------------------------------

  const node = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const button = (cls, text) => {
    const b = node('button', cls, text);
    b.type = 'button';
    return b;
  };
  const say = (key) => getLangString(`MOD_WF_LOOK_${key}`);
  const swalClass = (c) => (typeof createSwalCustomClass === 'function' ? createSwalCustomClass(c) : c);
  const fullFace = (look) => ({ color: -1, colorAt: 'scarf', ...look, hide: [...(look.hide ?? [])] });

  const openEdit = (folk) => {
    const original = fullFace(faceFromId(folk.id));
    let draft = fullFace(faceOf(folk));
    let tier = folk.tier;
    const redraws = [];
    const redraw = () => redraws.forEach((fn) => fn());
    const setDraft = (patch) => { draft = { ...draft, ...patch }; redraw(); };
    const picUrl = (t) => art.url(model.drawing(picture(folk, t, draft)));

    const root = node('div', 'wf-look');

    // The picture, and the same Folk at each rank.
    const left = node('div', 'wf-look-col');
    const front = node('div', 'wf-band wf-look-front');
    const pic = node('div', 'wf-band wf-look-pic');
    const big = node('img', 'wf-look-big');
    big.alt = folk.name;
    pic.append(big);
    const role = node('div', 'wf-look-role');
    const ranksLabel = node('div', 'wf-look-label', say('RANKS'));
    const ranks = node('div', 'wf-look-ranks');
    art.RANK_IDS.forEach((id, index) => {
      const t = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'][index];
      const b = button('btn btn-sm wf-look-rank');
      const img = node('img');
      img.alt = '';
      b.append(img);
      b.setAttribute('aria-label', hiring.roleName(t));
      tips?.set(b, hiring.roleName(t));
      b.addEventListener('click', () => { tier = t; redraw(); });
      ranks.append(b);
      redraws.push(() => {
        img.src = picUrl(t);
        const on = tier === t;
        b.classList.toggle('btn-info', on);
        b.classList.toggle('btn-outline-info', !on);
        b.setAttribute('aria-pressed', `${on}`);
      });
    });
    redraws.push(() => { big.src = picUrl(tier); role.textContent = hiring.roleName(tier); });
    front.append(role, ranksLabel, ranks);
    left.append(pic, front);

    // The choices.
    const mid = node('div', 'wf-look-col');
    const form = node('div', 'wf-band wf-look-form');
    const addRow = (label, control) => form.append(node('div', 'wf-look-label', label), control);
    const swatch = (name, color, isOn, pick) => {
      const b = button('wf-look-swatch');
      b.style.background = color;
      b.setAttribute('aria-label', name);
      tips?.set(b, name);
      b.addEventListener('click', pick);
      redraws.push(() => {
        const on = isOn();
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', `${on}`);
      });
      return b;
    };
    const swatches = (label, list, key, prefix, colorOf) => {
      const row = node('div', 'wf-look-swatches');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', label);
      list.forEach((x, i) => row.append(swatch(say(`${prefix}_${i}`), colorOf(x), () => draft[key] === i, () => setDraft({ [key]: i }))));
      return row;
    };
    const stepper = (label, names, key, prefix) => {
      const row = node('div', 'wf-look-step');
      const prev = button('btn btn-outline-info wf-look-arrow');
      prev.append(node('i', 'fa fa-chevron-left'));
      prev.setAttribute('aria-label', `${say('PREV')}: ${label}`);
      const value = node('span', 'wf-look-value');
      const place = node('span', 'wf-look-count');
      const next = button('btn btn-outline-info wf-look-arrow');
      next.append(node('i', 'fa fa-chevron-right'));
      next.setAttribute('aria-label', `${say('NEXT')}: ${label}`);
      prev.addEventListener('click', () => setDraft({ [key]: (draft[key] + names.length - 1) % names.length }));
      next.addEventListener('click', () => setDraft({ [key]: (draft[key] + 1) % names.length }));
      redraws.push(() => {
        value.textContent = say(`${prefix}_${draft[key]}`);
        place.textContent = templateLangString('MOD_WF_LOOK_OF', { at: `${draft[key] + 1}`, of: `${names.length}` });
      });
      row.append(prev, value, place, next);
      return row;
    };
    addRow(say('SKIN'), swatches(say('SKIN'), art.SKINS, 'skin', 'SKIN', (x) => x.hi));
    addRow(say('HAIR'), stepper(say('HAIR'), art.HAIR_STYLES, 'hair', 'HAIR'));
    addRow(say('BEARD'), stepper(say('BEARD'), art.BEARDS, 'beard', 'BEARD'));
    addRow(say('EXTRA'), stepper(say('EXTRA'), art.EXTRAS, 'extra', 'EXTRA'));
    addRow(say('HAIR_COLOR'), swatches(say('HAIR_COLOR'), art.HAIR_COLORS, 'hairColor', 'HCOL', (x) => x.hi));
    const colors = swatches(say('COLOR'), art.COLORS, 'color', 'COL', (x) => x.c);
    const none = swatch(say('COLOR_NONE'), 'transparent', () => draft.color < 0, () => setDraft({ color: -1 }));
    none.classList.add('wf-look-none');
    none.append(node('i', 'fa fa-times'));
    colors.prepend(none);
    addRow(say('COLOR'), colors);
    const places = node('div', 'wf-look-places');
    ['scarf', 'band'].forEach((at) => {
      const b = button('btn btn-sm', say(`AT_${at}`));
      // Picking a place with no colour yet gives it the first one, or the choice would show nothing.
      b.addEventListener('click', () => setDraft({ colorAt: at, color: draft.color < 0 ? 0 : draft.color }));
      redraws.push(() => {
        const on = draft.color >= 0 && draft.colorAt === at;
        b.classList.toggle('btn-info', on);
        b.classList.toggle('btn-outline-info', !on);
        b.setAttribute('aria-pressed', `${on}`);
      });
      places.append(b);
    });
    addRow(say('WORN_AS'), places);
    const tools = node('div', 'wf-look-tools');
    const random = button('btn btn-outline-info', say('RANDOM'));
    let rolls = 0;
    random.addEventListener('click', () => { rolls += 1; setDraft(art.lookFrom(`${folk.id}:${rolls}:${Date.now()}`)); });
    const reset = button('btn btn-outline-info', say('ORIGINAL'));
    reset.addEventListener('click', () => { draft = fullFace(original); redraw(); });
    tools.append(random, reset);
    form.append(tools);
    mid.append(form);

    // What it wears and what it earned.
    const right = node('div', 'wf-look-col');
    const worn = node('div', 'wf-band wf-look-list');
    worn.append(node('div', 'wf-look-head', say('GEAR_HEAD')));
    const wornIds = Object.keys(model.HEIRLOOM_GEAR).filter((id) => Object.values(folk.loadout ?? {}).some((e) => e?.id === `${NS}:${id}`));
    worn.append(node('div', 'wf-look-note', say(wornIds.length === 0 ? 'GEAR_NONE' : 'GEAR_NOTE')));
    const toggleHidden = (id, shown) => {
      const others = draft.hide.filter((x) => x !== id);
      setDraft({ hide: shown ? others : [...others, id] });
    };
    wornIds.forEach((id) => {
      const item = game.items.getObjectByID(`${NS}:${id}`);
      if (item === undefined) return;
      const row = node('label', 'wf-look-worn');
      const check = node('input');
      check.type = 'checkbox';
      const gear = model.HEIRLOOM_GEAR[id];
      check.addEventListener('change', () => toggleHidden(gear, check.checked));
      redraws.push(() => { check.checked = !draft.hide.includes(gear); });
      const icon = node('img', 'wf-look-worn-icon');
      icon.src = item.media;
      icon.alt = '';
      row.append(check, icon, node('span', 'font-w600', item.name));
      worn.append(row);
    });
    const earned = node('div', 'wf-band wf-look-list');
    earned.append(node('div', 'wf-look-head', say('MARKS_HEAD')));
    statesOf(folk).forEach((m) => {
      const row = node('label', 'wf-look-mark');
      const check = node('input');
      check.type = 'checkbox';
      check.disabled = !m.earned;
      check.addEventListener('change', () => toggleHidden(m.id, check.checked));
      redraws.push(() => { check.checked = m.earned && !draft.hide.includes(m.id); });
      const words = node('span', 'wf-look-mark-words');
      words.append(node('span', 'font-w600', say(`MARK_${m.id}`)), node('span', 'wf-look-note', say(`MARK_${m.id}_WHEN`)));
      const hours = m.id === 'service' ? 'MOD_WF_LOOK_HOURS' : 'MOD_WF_LOOK_OF';
      const progress = templateLangString(hours, { at: numberWithCommas(Math.min(m.have, m.need)), of: numberWithCommas(m.need) });
      const stateText = !m.earned ? progress
        : m.id === 'service' ? templateLangString('MOD_WF_LOOK_BARS', { at: `${m.bars}`, of: `${model.MAX_STRIPES}` })
          : say('MARK_EARNED');
      const state = node('span', `wf-look-mark-state${m.earned ? ' is-earned' : ''}`, stateText);
      row.append(check, words, state);
      earned.append(row);
    });
    right.append(worn, earned);

    root.append(left, mid, right);
    redraw();

    SwalLocale.fire({
      didRender: popupDidRender,
      title: templateLangString('MOD_WF_LOOK_TITLE', { name: titleName(folk.name) }),
      html: root,
      width: 'min(64rem, calc(100vw - 16px))',
      customClass: swalClass({ popup: 'wf-ui wf-look-popup', confirmButton: 'btn btn-success m-1' }),
      showCancelButton: true,
      confirmButtonText: getLangString('MOD_WF_BUTTON_SAVE'),
      didDestroy: () => tips?.sweep(),
      preConfirm: () => {
        const chosen = { ...draft };
        if (chosen.hide.length === 0) delete chosen.hide;
        hiring.crew.setLook(folk.id, model.sameLook(chosen, original) ? null : chosen);
        return true;
      },
    });
  };

  const api = { urlOf, openEdit, onHurt, statesOf };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.looks = api;
  });

  ctx.onCharacterLoaded(() => {
    hiring.events.on('folkActionDone', ({ folk, intervalMs }) => addWork(folk, intervalMs));
    hiring.events.on('folkJobWorked', ({ folk, ms }) => addWork(folk, ms));
    hiring.events.on('folkMoved', ({ folk, fromTravel }) => {
      setCounts(folk, model.noteTravel(folk.marks, fromTravel, folk.travel, folk.place));
    });
    log('portraits ready');
  });

  return api;
}
