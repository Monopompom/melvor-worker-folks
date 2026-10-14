// Inserts the Hiring page container into the game interface.
// Must run on interfaceAvailable: the game calls skill.initMenus() for every
// skill right after that hook, and SkillHeaderElement looks for
// <skill-header data-skill-id="..."> in the DOM at that moment.

export const CONTAINER_ID = 'worker-folks-container';

export function install(ctx, { log }) {
  ctx.onInterfaceAvailable(() => {
    if (document.getElementById(CONTAINER_ID) !== null) return; // already present
    const template = document.getElementById('wf-page-template');
    if (template === null) {
      console.error('[Worker Folks] page template missing');
      return;
    }
    // There are two elements with id="main-container" in the interface, so anchor
    // on a known page container instead of the main element.
    const anchor = document.getElementById('thieving-container');
    const fragment = document.importNode(template.content, true);
    if (anchor !== null) anchor.after(fragment);
    else document.querySelector('main')?.append(fragment);
    log('page container inserted');
  });
}
