// Screenshot reader tests: runs the real offline OCR on scoreboard screenshots
// and compares against the values actually shown on screen.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readScoreboard, parseNumber, parseDuration } = require('../src/ocr-core');
const { createOcrWorker } = require('../src/ocr-worker');
const { load, encode } = require('./helpers/image');

const fixture = name => path.join(__dirname, 'fixtures', name);
const STATS = ['kills', 'deaths', 'assists', 'damage', 'blocked', 'healing'];

// Ground truth: the winning team's six rows and the 00:09:30 match timer.
const TRUTH = {
  minutes: 9.5,
  players: [
    { name: 'Feral4Magneto',  role: 'tank',    kills: 12, deaths: 6, assists: 4,  damage: 8122,  blocked: 17396, healing: 190 },
    { name: 'KankaHecate',    role: 'tank',    kills: 18, deaths: 5, assists: 6,  damage: 19904, blocked: 35379, healing: 0 },
    { name: 'AntileneHecate', role: 'dps',     kills: 25, deaths: 8, assists: 1,  damage: 16161, blocked: 10871, healing: 0 },
    { name: 'Lord_Seph',      role: 'dps',     kills: 26, deaths: 6, assists: 9,  damage: 22512, blocked: 6592,  healing: 0 },
    { name: 'hi dr stwange',  role: 'support', kills: 13, deaths: 1, assists: 30, damage: 7340,  blocked: 9216,  healing: 31639 },
    { name: 'Shofoo',         role: 'support', kills: 23, deaths: 3, assists: 21, damage: 11065, blocked: 10590, healing: 21772 }
  ]
};

let worker;
before(async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'rrc-ocr-'));
  worker = await createOcrWorker(cache);
});
after(async () => { if (worker) await worker.terminate(); });

async function read(file) {
  return readScoreboard(load(fixture(file)), worker, encode);
}

// Full-quality screenshots must be read perfectly.
for (const [file, label] of [
  ['scoreboard-1879w.png', 'original screenshot'],
  ['scoreboard-2560w.png', 'larger (2560px wide) screenshot'],
  ['scoreboard-jpeg80.png', 'JPEG-compressed screenshot']
]) {
  test(`reads every value correctly from the ${label}`, async () => {
    const res = await read(file);
    assert.equal(res.players.length, 6, 'should find six rows for your team');
    assert.equal(res.minutes, TRUTH.minutes, 'match length from the timer');
    res.players.forEach((p, i) => {
      const t = TRUTH.players[i];
      assert.equal(p.name, t.name, `row ${i + 1} name`);
      assert.equal(p.role, t.role, `row ${i + 1} role`);
      for (const s of STATS) assert.equal(p[s], t[s], `row ${i + 1} (${t.name}) ${s}`);
    });
  });
}

// Small screenshots may misread a few numbers, but a wrong number must never be
// passed off as certain: every mistake has to be flagged for the user to check.
test('flags every misread number on a small (1280px wide) screenshot', async () => {
  const res = await read('scoreboard-1280w.png');
  assert.equal(res.players.length, 6);
  assert.equal(res.minutes, TRUTH.minutes);
  assert.equal(res.small, true, 'should warn that the screenshot is small');
  res.players.forEach((p, i) => {
    const t = TRUTH.players[i];
    assert.equal(p.role, t.role, `row ${i + 1} role`);
    for (const s of STATS) {
      if (p[s] !== t[s]) assert.ok(p.warnings.includes(s), `row ${i + 1} ${s}: read ${p[s]} instead of ${t[s]} without flagging it`);
    }
  });
});

test('understands both scoreboard number and timer formats', () => {
  assert.equal(parseNumber('11,200'), 11200);
  assert.equal(parseNumber('1O,2OO'), 10200);
  assert.equal(parseNumber(''), null);
  assert.equal(parseDuration('00:09:30'), 9.5);
  assert.equal(parseDuration('09:30'), 9.5);
  assert.equal(parseDuration('1:02:03'), 62.1);
  assert.equal(parseDuration('not a timer'), null);
});

test('gives a clear error for an image that is not a scoreboard', async () => {
  const blank = { width: 800, height: 450, data: new Uint8Array(800 * 450 * 4).fill(20) };
  await assert.rejects(readScoreboard(blank, worker, encode), /Couldn't find the scoreboard/);
});
