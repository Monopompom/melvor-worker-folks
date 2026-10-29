// The Folk's own success rate on each Thieving NPC button, under the game's "Success Rate" (which is the player's:
// the player's gear, no tier roll). Shown while a Folk is assigned to Thieving. Game-facing.

const THIEVING_ID = 'melvorD:Thieving';

export function install(ctx, { getHiring, rate, tips, log }) {
  let hiring;
  /** nav element → the line's <span> (with the <br> before it) */
  const lines = new WeakMap();

  ctx.onModsLoaded(() => {
    hiring = getHiring();
  });

  if (typeof ThievingNPCNavElement === 'undefined') return;

  const lineFor = (nav) => {
    let line = lines.get(nav);
    if (line !== undefined) return line;
    const br = document.createElement('br');
    const span = document.createElement('span');
    span.className = 'wf-thieving-rate';
    nav.success.after(br, span);
    line = { br, span };
    lines.set(nav, line);
    return line;
  };

  ctx.patch(ThievingNPCNavElement, 'updateNPC').after(function (_result, npc, game) {
    if (hiring === undefined || !(this.success instanceof HTMLElement)) return;
    const thieving = game.thieving;
    const folk = hiring.crew.bySkill(THIEVING_ID);
    const known = lines.get(this);
    if (folk === undefined || thieving === undefined || typeof hiring.asFolk !== 'function') {
      if (known !== undefined) {
        known.br.hidden = true;
        known.span.hidden = true;
      }
      return;
    }
    let value;
    try {
      value = rate.folkSuccessRate(folk.tier, hiring.asFolk(folk, thieving, () => thieving.getNPCSuccessRate(npc)));
    } catch (err) {
      log('thieving rate failed', err);
      return;
    }
    const { br, span } = lineFor(this);
    br.hidden = false;
    span.hidden = false;
    span.innerHTML = templateLangString('MOD_WF_THIEVING_FOLK_RATE', {
      portrait: `<img class="wf-thieving-rate-icon" src="${hiring.portrait(folk.tier)}" alt="">`,
      name: folk.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
      value: formatPercent(value, 2),
    });
    tips.set(span, templateLangString('MOD_WF_THIEVING_FOLK_RATE_TIP', { name: folk.name }));
  });

  // The buttons redraw when the player's modifiers change; the Folk's line also follows the crew and its gear.
  ctx.onCharacterLoaded(() => {
    if (hiring === undefined) return;
    const redraw = () => {
      if (game.thieving !== undefined) game.thieving.renderQueue.menu = true;
    };
    ['folkAssigned', 'folkFired', 'folkPromoted', 'crewChanged', 'loadoutChanged', 'folkTrait'].forEach((name) => hiring.events.on(name, redraw));
  });
}
