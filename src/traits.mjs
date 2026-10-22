// Earned traits, game side: counts what each Folk does and what happens to it, learns and fades its traits through the
// pure model (src/traits-model.mjs), and shows them: the card's trait icons, the Traits popup with Forget, a notice
// when a trait is learned, waits for a slot, takes one or fades. Game-facing.

const THIEVING_ID = 'melvorD:Thieving';
const GP_ID = 'melvorD:GP';
/** Time-based counts move once a second of game time, not every tick (offline catch-up runs millions of ticks). */
const FLUSH_TICKS = 20;
/** A hit that leaves a Folk at or under this share of its max HP teaches Sickly. */
const LOW_HP_SHARE = 0.25;

export function install(ctx, { getHiring, model, popupDidRender, titleName = (s) => s, log }) {
  let hiring;
  let ticks = 0;

  const fighting = () => game.activeAction !== undefined && game.activeAction === game.combat;
  const usesMaterials = (skill) => (typeof CraftingSkill !== 'undefined' && skill instanceof CraftingSkill)
    || (typeof AltMagic !== 'undefined' && skill instanceof AltMagic);
  const stateOf = (folk) => {
    if (folk.traitState === undefined) folk.traitState = model.emptyTraitState();
    return folk.traitState;
  };
  const where = (folk) => ({ level: hiring.masteryLevelOf(folk), tier: folk.tier });
  const skillNameOf = (skillId) => {
    const skill = skillId === undefined ? undefined : game.skills.getObjectByID(skillId);
    return skill === undefined ? (skillId ?? '') : hiring.skillName(skill);
  };

  // ---- Names and texts ------------------------------------------------------

  /**
   * Another mod's traits (API v5, Voyage's travel traits), by id: { kind, media, name, effect, effectAfter, lasts }, the
   * texts strings or functions. One that isn't registered (its mod not loaded) still shows, by its id.
   */
  const outside = (trait) => hiring?.outsideTraits?.get(trait.id);
  /** A registered trait's Worker Folks effects for this Folk: an object, or a function of { id, skillId, place }. */
  const outsideEffects = (trait, folk, skillId) => {
    const e = outside(trait)?.effects;
    if (typeof e !== 'function') return e;
    try {
      const place = folk.place === null || folk.place === undefined ? null : Object.freeze({ q: folk.place.q, r: folk.place.r });
      return e(Object.freeze({ id: folk.id, skillId, place }));
    } catch (err) { log('trait effects failed', err); return undefined; }
  };
  const outsideText = (value) => {
    try { return String((typeof value === 'function' ? value() : value) ?? ''); } catch (e) { log('trait text failed', e); return ''; }
  };

  const nameOf = (trait) => {
    if (model.traitDef(trait.id) !== undefined) return templateLangString(`MOD_WF_TRAIT_${trait.id}`, { skill: skillNameOf(trait.skillId) });
    const o = outside(trait);
    return o === undefined ? trait.id : outsideText(o.name) || trait.id;
  };
  const effectOf = (trait) => {
    if (model.traitDef(trait.id) !== undefined) return templateLangString(`MOD_WF_TRAIT_${trait.id}_DESC`, { skill: skillNameOf(trait.skillId) });
    const o = outside(trait);
    return o === undefined ? '' : outsideText(o.effect);
  };
  /**
   * The effect after a notice's colon ("learned Loyal: never strikes…"): lower case where it starts with a plain word
   * (build .367, the colon rule); the tooltip's own line keeps the capital.
   */
  const AFTER = ['Loyal', 'Resentful', 'Workaholic'];
  const effectAfter = (trait) => {
    if (AFTER.includes(trait.id)) return getLangString(`MOD_WF_TRAIT_${trait.id}_AFTER`);
    const o = outside(trait);
    return o?.effectAfter === undefined ? effectOf(trait) : outsideText(o.effectAfter);
  };
  const lastsOf = (trait) => {
    const def = model.traitDef(trait.id);
    if (def === undefined) {
      const o = outside(trait);
      return o === undefined ? '' : outsideText(o.lasts);
    }
    return def.fade === undefined ? getLangString('MOD_WF_TRAIT_FOR_GOOD') : getLangString(`MOD_WF_TRAIT_${trait.id}_FADES`);
  };
  const kindOf = (trait) => model.traitDef(trait.id)?.kind ?? outside(trait)?.kind ?? 'mixed';
  const mediaOf = (trait) => {
    const def = model.traitDef(trait.id);
    if (def !== undefined) return hiring.getMediaURL(`assets/${def.icon}.webp`);
    return outside(trait)?.media ?? hiring.media;
  };
  /** The tooltip of a trait's icon: its name, what it does, how long it lasts. */
  const tipOf = (trait) => [{ text: nameOf(trait), cls: 'font-w600' }, effectOf(trait), { text: lastsOf(trait), cls: 'wf-subtle' }].filter((l) => l !== '');

  // ---- Learning, fading, notices ------------------------------------------------

  const notify = (folk, change) => {
    const vars = { name: folk.name, trait: nameOf(change.trait), effect: effectAfter(change.trait) };
    const kind = kindOf(change.trait);
    const n = game.notifications;
    const media = mediaOf(change.trait);
    switch (change.type) {
      case 'learned':
      case 'slotted': {
        const text = templateLangString(change.type === 'learned' ? 'MOD_WF_TRAIT_LEARNED' : 'MOD_WF_TRAIT_SLOTTED', vars);
        // Good green, mixed blue, bad red: a bad trait stays until it fades or is forgotten.
        if (kind === 'good') n.createSuccessNotification('worker_folks:trait', text, media);
        else if (kind === 'bad') n.createErrorNotification('worker_folks:trait', text, media);
        else n.createInfoNotification('worker_folks:trait', text, media);
        break;
      }
      case 'waiting':
        n.createInfoNotification('worker_folks:trait', templateLangString('MOD_WF_TRAIT_WAITING', vars), media);
        break;
      case 'faded':
        n.createSuccessNotification('worker_folks:trait', templateLangString('MOD_WF_TRAIT_FADED', vars), media);
        break;
      default:
    }
  };

  const apply = (folk, changes) => {
    if (changes.length === 0) return;
    const offline = !game._isInOnlineLoop;
    changes.forEach((change) => {
      log(`${folk.name}: trait ${change.trait.id}${change.trait.skillId ? ` (${change.trait.skillId})` : ''} ${change.type}`);
      hiring.events.emit('folkTrait', { folk, type: change.type, trait: change.trait, offline });
      if (!offline) notify(folk, change);
    });
    // Interval, XP, preservation and doubling live in the acting Folk's modifier table.
    hiring.invalidateFolkTables?.();
    hiring.renderQueue.folks = true;
  };

  const settle = (folk) => apply(folk, model.settle(stateOf(folk), where(folk)));

  const onAction = ({ skill, folk, outcome, intervalMs, offline }) => {
    if (folk === undefined || skill === undefined || !(intervalMs > 0)) return;
    const s = stateOf(folk);
    // Lazy counts idle time in a row: any work restarts it.
    model.resetProgress(s, 'work');
    model.addProgress(s, 'work', intervalMs, { skillId: skill.id });
    if (offline) model.addProgress(s, 'workAway', intervalMs);
    if (fighting()) model.addProgress(s, 'workFighting', intervalMs);
    // Frugal: wages paid on time, in a row. Wages off (No sweat) count for nothing either way.
    if (hiring.payroll?.enabled !== false) {
      if (hiring.owing(folk) || hiring.struck(folk)) model.resetProgress(s, 'debt');
      else model.addProgress(s, 'workPaid', intervalMs);
    }
    if (hiring.masteryLevelOf(folk) >= 99) model.addProgress(s, 'workMastered', intervalMs);
    if (hiring.perksOf(folk).overtimeActive) model.addProgress(s, 'workOvertime', intervalMs);
    const materials = usesMaterials(skill);
    if (materials) model.addProgress(s, 'materialAction', 1);
    if (outcome === 'bonus') model.addProgress(s, 'bonus', 1);
    // A caught pickpocket is the NPC's doing, not clumsiness: only the Produce Rate's failures count.
    if (outcome === 'fail' && skill.id !== THIEVING_ID) {
      model.addProgress(s, 'fail', 1);
      if (materials) model.addProgress(s, 'materialFail', 1);
    }
    settle(folk);
  };

  // Hired time, idle time, an open strike and full health run on game ticks, online and offline alike.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring?.crew === undefined) return;
    ticks += 1;
    if (ticks < FLUSH_TICKS) return;
    ticks = 0;
    const ms = FLUSH_TICKS * TICK_INTERVAL;
    hiring.crew.all.forEach((folk) => {
      const s = stateOf(folk);
      model.addProgress(s, 'hired', ms);
      if (hiring.struck(folk)) model.addProgress(s, 'strikeOpen', ms);
      else model.resetProgress(s, 'settled');
      const skill = hiring.skillOf(folk);
      const working = skill !== undefined && hiring.delegated.has(skill);
      // Idle by the player's choice only: not while striking, resting after one, or on the road (Voyage).
      if (!working && !hiring.struck(folk) && folk.cooldownTicks === 0 && folk.travel === 'idle') model.addProgress(s, 'idle', ms);
      const health = hiring.health;
      if (health === undefined || health.hpOf(folk) >= health.maxHpOf(folk)) model.addProgress(s, 'fullHp', ms);
      else model.resetProgress(s, 'hurt');
      settle(folk);
    });
  });

  // ---- The Traits popup and Forget ---------------------------------------------------

  const forgetPrice = (folk) => model.forgetCost(hiring.payroll?.nextHirePrice(folk.tier) ?? 0);
  const forgetUnlocked = () => hiring.levels === undefined || hiring.levels.forgetUnlocked();
  const gp = () => game.currencies.getObjectByID(GP_ID);

  const confirmForget = (folk, index) => {
    const trait = stateOf(folk).traits[index];
    if (trait === undefined) return;
    const cost = forgetPrice(folk);
    const swalClass = (c) => (typeof createSwalCustomClass === 'function' ? createSwalCustomClass(c) : c);
    SwalLocale.fire({
      didRender: popupDidRender,
      title: templateLangString('MOD_WF_FORGET_TITLE', { trait: nameOf(trait) }),
      html: `<div class="text-center">${templateLangString('MOD_WF_FORGET_TEXT', { name: folk.name, amount: numberWithCommas(cost) })}</div>`,
      imageUrl: mediaOf(trait),
      imageWidth: 64,
      imageHeight: 64,
      imageAlt: nameOf(trait),
      // The trait goes for good: red confirm, blue-outline cancel, like Fire.
      customClass: swalClass({ popup: 'wf-ui wf-pic', confirmButton: 'btn btn-danger m-1', cancelButton: 'btn btn-outline-info m-1' }),
      showCancelButton: true,
      confirmButtonText: getLangString('MOD_WF_BUTTON_FORGET'),
    }).then((result) => {
      if (result.isConfirmed) api.forget(folk, index);
      api.openTraits(folk);
    });
  };

  const api = {
    fighting,
    /** What the Folk's held traits add up to while it works `skillId` (its own skill by default). */
    effectsOf(folk, skillId = folk.skillId) {
      return model.effectsOf(folk.traitState?.traits, { skillId, fighting: fighting(), outside: (t) => outsideEffects(t, folk, skillId) });
    },
    neverStrikes(folk) {
      return api.effectsOf(folk).neverStrikes;
    },
    /** True when the Folk's table depends on whether the player fights (Night Owl). */
    followsCombat(folk) {
      return model.followsCombat(folk.traitState?.traits);
    },
    /** A hit: Sickly when it left the Folk at a quarter of its HP or less; full-health time restarts either way. */
    onHurt(folk, hp, max) {
      const s = stateOf(folk);
      model.resetProgress(s, 'hurt');
      if (hp > 0 && hp <= max * LOW_HP_SHARE) model.addProgress(s, 'lowHp', 1);
      settle(folk);
    },
    forgetUnlocked,
    forgetPrice,
    /** Pays and forgets the held trait at `index`. Returns true when it was forgotten. */
    forget(folk, index) {
      const s = stateOf(folk);
      const cost = forgetPrice(folk);
      const cur = gp();
      if (!forgetUnlocked() || s.traits[index] === undefined || cur === undefined || !cur.canAfford(cost)) return false;
      cur.remove(cost);
      const { trait, changes } = model.forget(s, index, where(folk));
      log(`${folk.name} forgot ${trait.id} for ${cost} GP`);
      // A mod that counts its own traits (API v5) starts that count again.
      hiring.events.emit('folkTrait', { folk, type: 'forgotten', trait, offline: !game._isInOnlineLoop });
      apply(folk, changes);
      hiring.invalidateFolkTables?.();
      hiring.renderQueue.folks = true;
      return true;
    },
    /** Another mod's trait comes to the Folk (API v5): a slot or the queue, with the usual notice. False if not registered. */
    earn(folk, id) {
      if (hiring.outsideTraits?.has(id) !== true) return false;
      const changes = model.earn(stateOf(folk), id, where(folk));
      apply(folk, changes);
      return changes.length > 0;
    },
    /** Another mod's trait fades by that mod's own rule (API v5). False when the Folk doesn't have it. */
    drop(folk, id) {
      const changes = model.drop(stateOf(folk), id, where(folk));
      apply(folk, changes);
      return changes.length > 0;
    },
    /** The ids a Folk holds and waits on: { held, waiting }. */
    idsOf(folk) {
      const s = stateOf(folk);
      return { held: s.traits.map((t) => t.id), waiting: s.waiting.map((t) => t.id) };
    },
    /** The card's row: one icon per held trait with its tooltip, and the Traits button's text. */
    cardView(folk) {
      const s = stateOf(folk);
      const open = model.openSlots(hiring.masteryLevelOf(folk));
      return {
        icons: s.traits.map((t) => ({ media: mediaOf(t), name: nameOf(t), kind: kindOf(t), tip: tipOf(t) })),
        buttonText: templateLangString('MOD_WF_BUTTON_TRAITS', { held: `${s.traits.length}`, open: `${open}` }),
      };
    },
    openTraits(folk) {
      const s = stateOf(folk);
      const level = hiring.masteryLevelOf(folk);
      const open = model.openSlots(level);
      const root = document.createElement('div');
      root.className = 'wf-traits';
      const row = (className) => {
        const div = document.createElement('div');
        div.className = `wf-trait-row ${className}`.trim();
        root.append(div);
        return div;
      };
      const text = (tag, className, value) => {
        const el = document.createElement(tag);
        el.className = className;
        el.textContent = value;
        return el;
      };
      const cost = forgetPrice(folk);
      const canPay = gp()?.canAfford(cost) === true;
      s.traits.forEach((trait, index) => {
        const r = row(`wf-trait-${kindOf(trait)}`);
        const img = document.createElement('img');
        img.className = 'wf-trait-icon';
        img.src = mediaOf(trait);
        img.alt = '';
        const body = document.createElement('div');
        body.className = 'wf-trait-body';
        body.append(text('div', 'font-w600', nameOf(trait)), text('small', 'd-block', effectOf(trait)), text('small', 'd-block wf-subtle', lastsOf(trait)));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-danger';
        const label = templateLangString('MOD_WF_BUTTON_FORGET_COST', { amount: numberWithCommas(cost) });
        button.textContent = forgetUnlocked() ? label : `${label} (${hiring.levels.lockText(hiring.levels.forgetLevel)})`;
        button.disabled = !forgetUnlocked() || !canPay;
        button.onclick = () => confirmForget(folk, index);
        r.append(img, body, button);
      });
      for (let slot = s.traits.length; slot < model.MAX_SLOTS; slot += 1) {
        const opensAt = model.SLOT_LEVELS[slot];
        const r = row(slot < open ? 'wf-trait-empty' : 'wf-trait-locked');
        r.append(text('span', '', slot < open
          ? templateLangString('MOD_WF_TRAITS_SLOT_EMPTY', { slot: `${slot + 1}` })
          : templateLangString('MOD_WF_TRAITS_SLOT_LOCKED', { slot: `${slot + 1}`, level: `${opensAt}` })));
      }
      if (s.waiting.length > 0) {
        root.append(text('div', 'wf-trait-waiting', templateLangString('MOD_WF_TRAITS_WAITING', { traits: s.waiting.map(nameOf).join(', ') })));
      }
      if (forgetUnlocked() && s.traits.length > 0 && !canPay) {
        root.append(text('div', 'wf-trait-waiting text-warning', templateLangString('MOD_WF_FORGET_NEED', { amount: numberWithCommas(cost) })));
      }
      // The rules as help bands (build .136; a 300-character paragraph before), one idea a band.
      const note = document.createElement('div');
      note.className = 'wf-trait-note wf-help-body text-left';
      for (const part of ['LEARN', 'SLOTS', 'FORGET']) {
        const band = document.createElement('div');
        band.className = 'wf-band';
        band.append(text('div', 'wf-help-head', getLangString(`MOD_WF_TRAITS_NOTE_${part}_HEAD`)), text('p', 'wf-help-p', getLangString(`MOD_WF_TRAITS_NOTE_${part}`)));
        note.append(band);
      }
      root.append(note);
      SwalLocale.fire({
        didRender: popupDidRender,
        title: templateLangString('MOD_WF_TRAITS_TITLE', { name: titleName(folk.name) }),
        html: root,
        imageUrl: hiring.portrait(folk.tier),
        imageWidth: 64,
        imageHeight: 64,
        imageAlt: folk.name,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: (typeof createSwalCustomClass === 'function' ? createSwalCustomClass({ popup: 'wf-ui wf-tool wf-pic' }) : { popup: 'wf-ui wf-tool wf-pic' }),
      });
    },
    nameOf,
    effectOf,
    effectAfter,
    mediaOf,
    kindOf,
    /** The dev console: learns `id` now (Specialist in the Folk's skill). */
    devTeach(folk, id) {
      if (!model.completeLearning(stateOf(folk), id, { skillId: folk.skillId })) return false;
      settle(folk);
      return true;
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.traits = api;
  });
  ctx.onCharacterLoaded(() => {
    // After payroll's listener: Frugal reads whether this action's wage was paid.
    hiring.events.on('folkActionDone', onAction);
    hiring.events.on('folkPromoted', ({ folk }) => {
      model.addProgress(stateOf(folk), 'promotion', 1);
      settle(folk);
    });
    hiring.events.on('folkStruck', ({ folk }) => {
      const s = stateOf(folk);
      model.addProgress(s, 'strike', 1);
      model.resetProgress(s, 'strike');
      settle(folk);
    });
    log('earned traits ready');
  });
  return api;
}
