import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PATH_IDS, PATHS } from '../src/paths-model.mjs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const LANGS = ['en', 'de', 'fr', 'zh-CN', 'zh-TW'];
const lang = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(read(`languages/${l}.json`))]));
const vars = (s) => [...String(s).matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).sort();

// Every text the paths popups, the card chip and the promotion row show: the literal keys in the code, and the ones
// built from a path's id.
const keys = () => {
  const literal = [read('src/paths.mjs'), read('src/hiring-skill.mjs')]
    .flatMap((src) => [...src.matchAll(/'(MOD_WF_(?:PATH|CTRL_NET_PATH|PROMO_PATH|PROMO_TIP_PATH|EFFECT_RATE|EFFECT_MASTERY_XP|EFFECT_WAGE|BUTTON_PICK_PATH|BUTTON_CHANGE_PATH)\w*)'/g)].map((m) => m[1]));
  const built = PATH_IDS.flatMap((id) => [`MOD_WF_PATH_${id}`, `MOD_WF_PATH_${id}_SUITS`]);
  return [...new Set([...literal, ...built, 'MOD_WF_TIP_13_HEAD', 'MOD_WF_TIP_13'])];
};

test('every path text is in all five languages, with the same placeholders as English', () => {
  const all = keys();
  assert.ok(all.length > 30, `found ${all.length} keys`);
  for (const key of all) {
    for (const l of LANGS) {
      assert.equal(typeof lang[l][key], 'string', `${l} ${key}`);
      assert.ok(lang[l][key].length > 0, `${l} ${key} empty`);
      assert.deepEqual(vars(lang[l][key]), vars(lang.en[key]), `${l} ${key} placeholders`);
    }
  }
});

test('path names are translated and distinct in each language', () => {
  for (const l of LANGS) {
    const names = PATH_IDS.map((id) => lang[l][`MOD_WF_PATH_${id}`]);
    assert.equal(new Set(names).size, PATH_IDS.length, l);
  }
});

test('French puts a no-break space before its colons and the like', () => {
  for (const key of keys()) {
    const s = lang.fr[key];
    assert.ok(!/ [:;!?]/.test(s), `fr ${key}: "${s}"`);
  }
});

test('each path has its shipped icon', () => {
  for (const id of PATH_IDS) {
    assert.ok(existsSync(new URL(`../assets/${PATHS[id].icon}.webp`, import.meta.url)), PATHS[id].icon);
  }
});
