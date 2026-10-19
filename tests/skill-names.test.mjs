import test from 'node:test';
import assert from 'node:assert/strict';
import { namePattern, splitNames } from '../src/skill-names.mjs';

const pattern = namePattern(['Magic', 'Alt. Magic', 'Woodcutting', 'Fishing']);

test('skill names: every whole-word name is split out, after a test() call too (build .62 bug)', () => {
  const text = 'Nothing to show: nothing in the bank helps Woodcutting in this slot.';
  assert.equal(pattern.test(text), true); // leaves lastIndex past the match, as the DOM pass does
  assert.deepEqual(splitNames(text, pattern), ['Nothing to show: nothing in the bank helps ', { name: 'Woodcutting' }, ' in this slot.']);
});

test('skill names: several names, longest first, not inside other words', () => {
  assert.deepEqual(splitNames('Fishing and Alt. Magic, not Magical or Woodcuttings.', pattern),
    [{ name: 'Fishing' }, ' and ', { name: 'Alt. Magic' }, ', not Magical or Woodcuttings.']);
});

test('skill names: no names, no pattern', () => {
  assert.deepEqual(splitNames('Plain text.', pattern), ['Plain text.']);
  assert.equal(namePattern([]), null);
  assert.deepEqual(splitNames('Anything', null), ['Anything']);
});

const N = ' ';

test('title ties: coordinates, articles, the last two words', async () => {
  const { tieTitle, tieCoords, tieArticles, tieLast } = await import('../src/skill-names.mjs');
  assert.equal(tieCoords('Water (2, 8) and (-3, 12)'), `Water (2,${N}8) and (-3,${N}12)`);
  assert.equal(tieArticles('Fire Ada the Punctual?'), `Fire Ada the${N}Punctual?`);
  assert.equal(tieArticles('A Folk and an Expert'), `A${N}Folk and an${N}Expert`);
  assert.equal(tieArticles('Theatre and Anvil'), 'Theatre and Anvil');
  assert.equal(tieLast(' to Journeyman?'), ` to${N}Journeyman?`);
  assert.equal(tieLast('Tips'), 'Tips');
  assert.equal(tieLast(' gear'), ' gear');
  assert.equal(tieTitle('Promote Ysolde the Second Breakfast to Journeyman?'), `Promote Ysolde the${N}Second Breakfast to${N}Journeyman?`);
  assert.equal(tieTitle('Worker Folks: Hiring is switched off'), `Worker Folks: Hiring is switched${N}off`);
});

test('title name: escaped and marked for the title pass', async () => {
  const { titleName, TITLE_NAME } = await import('../src/skill-names.mjs');
  assert.equal(titleName('Ada <the> "Punctual" & co'), `<span class="${TITLE_NAME}">Ada &lt;the&gt; &quot;Punctual&quot; &amp; co</span>`);
});
