// Grading tests: the curve, match-length scaling, awards and input handling.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, player, ROLE_AVG } = require('./helpers/app');

const ROLES = ['tank', 'dps', 'support'];
const gradeOf = (res, name) => res.cards.find(c => c.name === name);

test('the app grades with the same role averages the tests use', () => {
  const app = openApp();
  // ROLE_AVG lives inside the page script; check the source matches this test's copy
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'index.html'), 'utf8');
  for (const [role, a] of Object.entries(ROLE_AVG)) {
    for (const [stat, v] of Object.entries(a)) {
      if (!v) continue;
      const shown = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '');
      assert.ok(new RegExp(`${role}:[^\\n]*${stat}: ${shown}`).test(src), `${role} ${stat} should be ${v} in src/index.html`);
    }
  }
  app.window.close();
});

test('an exactly average player gets a B- in every role', () => {
  const app = openApp();
  app.fill(ROLES.map(r => player(r, 1, 1)));
  const res = app.grade();
  for (const r of ROLES) {
    const c = gradeOf(res, `${r}-1`);
    assert.equal(c.grade, 'B-', `${r}: got ${c.grade} (${c.score})`);
  }
});

test('the curve runs from A+ for elite play to F for awful play, the same in every role', () => {
  const levels = [
    [1.4, 0.5, 'A+'],  // 40% better than average, half the deaths
    [1.2, 0.8, 'A-'],
    [0.8, 1.2, 'C'],
    [0.6, 1.5, 'D'],
    [0.4, 2.0, 'F']    // 60% worse, double the deaths
  ];
  for (const [skill, deaths, expected] of levels) {
    const app = openApp();
    app.fill(ROLES.map(r => player(r, skill, deaths)));
    const res = app.grade();
    for (const r of ROLES) {
      const c = gradeOf(res, `${r}-${skill}`);
      assert.equal(c.grade[0], expected[0], `${r} at ${skill}x: expected ${expected}, got ${c.grade} (${c.score})`);
    }
  }
});

test('grades scale with match length, so long matches do not inflate scores', () => {
  // Whole-number stats for a 10-minute match, scaled exactly to 5 and 20 minutes
  const per10 = {
    tank:    { kills: 18, deaths: 6, assists: 6,  damage: 14000, blocked: 28000, healing: 0 },
    dps:     { kills: 20, deaths: 6, assists: 2,  damage: 15000, blocked: 0,     healing: 0 },
    support: { kills: 14, deaths: 4, assists: 22, damage: 7000,  blocked: 0,     healing: 20000 }
  };
  for (const r of ROLES) {
    const scores = [5, 10, 20].map(min => {
      const m = min / 10, s = per10[r];
      const app = openApp();
      app.fill([{ name: 'P', hero: 'Test Hero', role: r, kills: s.kills * m, deaths: s.deaths * m, assists: s.assists * m, damage: s.damage * m, blocked: s.blocked * m, healing: s.healing * m }], min);
      return app.grade().cards[0].score;
    });
    assert.equal(new Set(scores).size, 1, `${r} scores across 5/10/20 minute matches: ${scores}`);
  }
});

test('a support with almost no healing fails even with good kills', () => {
  const app = openApp();
  app.fill([{ name: 'NoHeals', hero: 'Mantis', role: 'support', kills: 18, deaths: 4, assists: 6, damage: 9000, blocked: 0, healing: 1500 }]);
  const c = app.grade().cards[0];
  assert.ok(['D', 'F'].includes(c.grade[0]), `got ${c.grade} (${c.score})`);
});

test('crowns the best player MVP and gives the walk-in award to the most deaths', () => {
  const app = openApp();
  app.fill([
    player('tank', 1, 1, 10, 'Steady'),
    player('dps', 1.4, 0.5, 10, 'Ace'),
    player('dps', 0.7, 2.0, 10, 'Feeder'),
    player('support', 1.1, 1, 10, 'Medic')
  ]);
  const res = app.grade();
  assert.equal(res.mvp, 'Ace');
  assert.equal(res.walker, 'Feeder');
  assert.deepEqual(res.cards.map(c => c.name), [...res.cards].sort((a, b) => b.score - a.score).map(c => c.name), 'cards sorted best first');
  assert.match(res.walkerLine, /^15 deaths on Test Hero\./);
});

test('nobody gets the walk-in award when nobody died', () => {
  const app = openApp();
  app.fill([player('tank', 1, 0, 10, 'A'), player('support', 1, 0, 10, 'B')]);
  assert.equal(app.grade().walker, 'Nobody?!');
});

test('understands shorthand like 11.2k and 31,639', () => {
  const app = openApp();
  app.fill([
    { name: 'Short', hero: 'Luna Snow', role: 'support', kills: 10, deaths: 4, assists: 20, damage: '6.5k', blocked: 0, healing: '18.5k' },
    { name: 'Long',  hero: 'Luna Snow', role: 'support', kills: 10, deaths: 4, assists: 20, damage: '6,500', blocked: 0, healing: '18,500' }
  ]);
  const res = app.grade();
  assert.equal(gradeOf(res, 'Short').score, gradeOf(res, 'Long').score);
});

test('accepts spaces as thousands separators', () => {
  const app = openApp();
  app.fill([
    { name: 'Spaced', hero: 'Luna Snow', role: 'support', kills: 10, deaths: 4, assists: 20, damage: '6 500', blocked: 0, healing: '18 500' },
    { name: 'Comma',  hero: 'Luna Snow', role: 'support', kills: 10, deaths: 4, assists: 20, damage: '6,500', blocked: 0, healing: '18,500' }
  ]);
  const res = app.grade();
  assert.equal(gradeOf(res, 'Spaced').score, gradeOf(res, 'Comma').score);
});

test('does not silently treat a blank stat as zero', () => {
  const app = openApp();
  app.fill([{ name: 'BlankHeals', hero: 'Mantis', role: 'support', kills: 3, deaths: 4, assists: 10, damage: 3000, blocked: 0, healing: '' }]);
  const res = app.grade();
  assert.match(res.error, /Enter a number for BlankHeals's Healing/);
  assert.equal(res.cards.length, 0);
});

test('shows the weighted breakdown behind each grade', () => {
  const app = openApp();
  app.fill([{ name: 'Detail', hero: 'Hela', role: 'dps', kills: 24, deaths: 5, assists: 2, damage: 18000, blocked: 0, healing: 0 }]);
  const why = app.grade().cards[0].why;
  assert.match(why, /Kills/);
  assert.match(why, /Damage/);
  assert.match(why, /Deaths/);
  assert.match(why, /35%/);
});

test('shows the selected rank as context', () => {
  const app = openApp();
  const rank = app.window.document.getElementById('rank');
  rank.value = 'gold';
  rank.dispatchEvent(new app.window.Event('change'));
  app.fill([{ name: 'Ranked', hero: 'Hela', role: 'dps', kills: 20, deaths: 5, assists: 2, damage: 15000, blocked: 0, healing: 0 }]);
  const res = app.grade();
  assert.match(res.team, /Gold/);
  assert.match(app.document.getElementById('rankNote').textContent, /Gold/);
});

test('explains what is missing instead of grading bad input', () => {
  let app = openApp();
  app.fill([]);
  assert.match(app.grade().error, /Enter at least one player/);
  app = openApp();
  app.fill([{ name: 'NoRole', kills: 5 }]);
  assert.match(app.grade().error, /Pick a role for NoRole/);
});

test('escapes player names so they cannot inject HTML', () => {
  const app = openApp();
  app.fill([{ name: '<img src=x onerror=alert(1)>', hero: 'Hela', role: 'dps', kills: 10, deaths: 5, assists: 1, damage: 9000, blocked: 0, healing: 0 }]);
  app.grade();
  assert.equal(app.document.querySelector('#cards img'), null);
  assert.equal(app.document.querySelector('.award img'), null);
});
