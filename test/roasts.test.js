// Roast library tests: size, no duplicates, placeholders, and no-repeat rotation.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, player } = require('./helpers/app');

const CATEGORIES = {
  tank: ['great', 'mid', 'bad', 'coward', 'immortal'],
  dps: ['great', 'mid', 'bad', 'feeder', 'glass', 'pacifist'],
  support: ['great', 'mid', 'bad', 'noheal', 'battlemedic', 'immortal']
};
const PLACEHOLDERS = ['name', 'hero', 'k', 'd', 'a', 'dmg', 'blk', 'heal', 'd_s', 'grade', 'score'];

test('every role has every category, with no duplicate lines', () => {
  const { window: w } = openApp();
  const all = [];
  for (const [role, cats] of Object.entries(CATEGORIES)) {
    for (const cat of cats) {
      const pool = w.ROASTS[role][cat];
      assert.ok(Array.isArray(pool) && pool.length >= 8, `${role}.${cat} should have at least 8 lines`);
      all.push(...pool);
    }
    for (const tier of ['great', 'mid', 'bad']) assert.ok(w.ROASTS[role][tier].length >= 20, `${role}.${tier} should have at least 20 lines`);
  }
  const awards = [...w.AWARD_LINES.mvp, ...w.AWARD_LINES.walker];
  assert.ok(w.AWARD_LINES.mvp.length >= 30 && w.AWARD_LINES.walker.length >= 30, 'at least 30 lines per award');
  assert.equal(all.length, new Set(all).size, 'duplicate roast lines');
  assert.equal(awards.length, new Set(awards).size, 'duplicate award lines');
  assert.ok(all.length >= 300, `expected 300+ roast lines, found ${all.length}`);
});

test('lines only use placeholders the app knows how to fill', () => {
  const { window: w } = openApp();
  const lines = [...Object.values(w.ROASTS).flatMap(r => Object.values(r).flat()), ...w.AWARD_LINES.mvp, ...w.AWARD_LINES.walker];
  for (const line of lines) {
    for (const [, key] of line.matchAll(/\{(\w+)\}/g)) assert.ok(PLACEHOLDERS.includes(key), `unknown placeholder {${key}} in: ${line}`);
  }
});

test('400 graded matches never leave a placeholder unfilled or give two players the same line', () => {
  const app = openApp();
  const seen = new Set();
  for (let m = 0; m < 400; m++) {
    const s = 0.5 + ((m * 37) % 100) / 100;      // skill sweeps 0.5x to 1.5x
    const dm = 0.3 + ((m * 53) % 180) / 100;     // deaths sweep 0.3x to 2.1x
    app.fill([
      player('tank', s, dm, 10, 'T1'), player('tank', 1.6 - s, 2.2 - dm, 10, 'T2'),
      player('dps', s, dm, 10, 'D1'), player('dps', 1.6 - s, 2.2 - dm, 10, 'D2'),
      player('support', s, dm, 10, 'S1'), player('support', 1.6 - s, 2.2 - dm, 10, 'S2')
    ]);
    const res = app.grade();
    const lines = res.cards.map(c => c.roast);
    assert.equal(new Set(lines).size, lines.length, `match ${m}: two players got the same line`);
    for (const t of [...lines, res.mvpLine, res.walkerLine]) assert.doesNotMatch(t, /\{\w+\}/, `unfilled placeholder: ${t}`);
    lines.forEach(l => seen.add(l));
  }
  assert.ok(seen.size >= 200, `only ${seen.size} different lines showed up in 400 matches`);
});

test('the same player gets 20 different lines in 20 matches, and never the same line twice in a row', () => {
  const app = openApp();
  app.fill([{ name: 'Ace', hero: 'Hela', role: 'dps', kills: 30, deaths: 4, assists: 2, damage: 24000, blocked: 0, healing: 0 }]);
  const got = Array.from({ length: 60 }, () => app.grade().cards[0].roast);
  assert.equal(new Set(got.slice(0, 20)).size, 20);
  got.forEach((g, i) => { if (i) assert.notEqual(g, got[i - 1], `repeated back to back at match ${i}`); });
});

test('rotation is remembered between app launches', () => {
  const first = openApp();
  first.fill([{ name: 'Ace', hero: 'Hela', role: 'dps', kills: 30, deaths: 4, assists: 2, damage: 24000, blocked: 0, healing: 0 }]);
  const before = Array.from({ length: 10 }, () => first.grade().cards[0].roast);
  const saved = JSON.parse(first.window.localStorage.getItem('rrc-bags'));
  const second = openApp({ storage: { 'rrc-bags': saved } });
  second.fill([{ name: 'Ace', hero: 'Hela', role: 'dps', kills: 30, deaths: 4, assists: 2, damage: 24000, blocked: 0, healing: 0 }]);
  const after = Array.from({ length: 10 }, () => second.grade().cards[0].roast);
  // The shuffle bag guarantees the most recent 6-8 lines stay out, not all 10.
  const guaranteed = before.slice(-6);
  for (const line of after) assert.ok(!guaranteed.includes(line), `"${line}" repeated right after relaunch`);
});
