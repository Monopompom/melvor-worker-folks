import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOLK_GAIN_TYPES, dropPopup } from '../src/popup-model.mjs';

test('gain popups from a Folk turn are dropped only with the setting on', () => {
  for (const type of FOLK_GAIN_TYPES) {
    assert.equal(dropPopup({ enabled: true, folkTurn: true, type }), true, type);
    assert.equal(dropPopup({ enabled: false, folkTurn: true, type }), false, `${type} with the setting off`);
    assert.equal(dropPopup({ enabled: true, folkTurn: false, type }), false, `${type} from the player`);
  }
});

test('level-ups, warnings and the rest always show', () => {
  for (const type of ['LevelUp', 'AbyssalLevelUp', 'Mastery99', 'BankFull', 'Player', 'Stun', 'ItemCharges', 'TutorialTask', undefined]) {
    assert.equal(dropPopup({ enabled: true, folkTurn: true, type }), false, `${type}`);
  }
});

test('the setting names its lang keys literally and they exist', () => {
  const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
  const src = readFileSync(new URL('../src/quiet-popups.mjs', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/'(MOD_WF_[A-Z0-9_]+)'/g)].map((m) => m[1]);
  assert.equal(keys.length, 2);
  keys.forEach((k) => assert.ok(typeof lang[k] === 'string' && lang[k].length > 0, `missing lang ${k}`));
});
