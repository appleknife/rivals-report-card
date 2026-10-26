// Loads the real app page (src/index.html + src/roasts.js) into a simulated browser
// so tests can type players in, press Grade Team, and read the results.
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', '..', 'src');
const FIELDS = ['name', 'hero', 'role', 'kills', 'deaths', 'assists', 'damage', 'blocked', 'healing'];

function openApp({ storage = {} } = {}) {
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window, d = w.document;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, JSON.stringify(v));
  w.eval(fs.readFileSync(path.join(SRC, 'roasts.js'), 'utf8'));
  w.eval([...d.querySelectorAll('script')].find(s => !s.src).textContent);

  const rows = () => [...d.querySelectorAll('.player-row')];

  return {
    window: w,
    document: d,
    fill(players, minutes = 10) {
      rows().forEach((row, i) => {
        const p = players[i] || {};
        for (const f of FIELDS) row.querySelector(`[data-f="${f}"]`).value = p[f] ?? '';
      });
      d.getElementById('minutes').value = minutes;
    },
    grade() {
      d.getElementById('gradeBtn').click();
      const text = sel => d.querySelector(sel)?.textContent ?? null;
      const awardName = sel => d.querySelector(`${sel} .award-name-real`)?.textContent ?? text(`${sel} .name`);
      return {
        error: text('#error'),
        cards: [...d.querySelectorAll('.card')].map(c => ({
          name: c.querySelector('.pname-real').textContent,
          grade: c.querySelector('.grade-cell .stamp-grade').textContent,
          score: parseInt(c.querySelector('.score-num').textContent, 10),
          roast: c.querySelector('.roast').textContent,
          why: c.querySelector('.why')?.textContent ?? ''
        })),
        mvp: awardName('.award.mvp'),
        mvpLine: text('.award.mvp .why'),
        walker: awardName('.award.walk'),
        walkerLine: text('.award.walk .why'),
        team: text('#teamGrade')
      };
    }
  };
}

// Builds a player whose per-10-minute stats are the role average times `skill`,
// with deaths at the role average times `deathMult`.
const ROLE_AVG = {
  tank:    { kills: 16.6, deaths: 6.5, assists: 5.0,  damage: 12900, blocked: 25500, healing: 0 },
  dps:     { kills: 18.4, deaths: 7.5, assists: 2.8,  damage: 13600, blocked: 0,     healing: 0 },
  support: { kills: 13.0, deaths: 5.9, assists: 20.2, damage: 6500,  blocked: 0,     healing: 18500 }
};
function player(role, skill = 1, deathMult = 1, minutes = 10, name = `${role}-${skill}`) {
  const a = ROLE_AVG[role], m = minutes / 10;
  return {
    name, hero: 'Test Hero', role,
    kills: a.kills * skill * m, deaths: a.deaths * deathMult * m, assists: a.assists * skill * m,
    damage: Math.round(a.damage * skill * m), blocked: Math.round(a.blocked * skill * m), healing: Math.round(a.healing * skill * m)
  };
}

module.exports = { openApp, player, ROLE_AVG };
