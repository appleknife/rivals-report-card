// Rivals Report Card - screenshot reader core.
// Pure image logic on {width, height, data: RGBA Uint8Array}. The caller supplies
// `encode(img) -> Buffer (PNG)` and a Tesseract worker. Works in Node and Electron's main process.

'use strict';

// Column centers as a fraction of the scoreboard table width (measured from the
// in-game end-of-match scoreboard; the UI scales with resolution).
const COLS = {
  name:    { from: 0.232, to: 0.372 },
  kills:   { c: 0.3875, w: 0.024 },
  deaths:  { c: 0.4219, w: 0.022 },
  assists: { c: 0.4563, w: 0.024 },
  damage:  { c: 0.7190, w: 0.058 },
  blocked: { c: 0.8030, w: 0.058 },
  healing: { c: 0.8810, w: 0.054 }
};
const ROLE_ICON = { from: 0.010, to: 0.035, top: 0.08, bottom: 0.88 };

// 16x16 role-icon silhouettes (1 = icon pixel), captured from a real scoreboard.
const ROLE_TEMPLATES = require('./role-templates.json');

// ---------- pixel helpers ----------
function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const isTeamBlue = ([r, g, b]) => b >= 62 && b - r >= 30 && b - g >= 20;
const isTeamBlueLoose = ([r, g, b]) => b >= 40 && b - r >= 15 && b - g >= 8;

function crop(img, x0, y0, w, h) {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  w = Math.max(0, Math.min(img.width - x0, Math.round(w)));
  h = Math.max(0, Math.min(img.height - y0, Math.round(h)));
  const out = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * img.width + x0) * 4;
    out.data.set(img.data.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

function toGray(img) {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = lum(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
  return g;
}

function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[Math.min(255, Math.max(0, v | 0))]++;
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

// Light text on a dark row -> black text on white, upscaled, with padding (what OCR likes).
function prepForOcr(img, scale = 3, pad = 12) {
  const gray = toGray(img);
  const thr = Math.max(otsu(gray), 95);
  const ow = Math.round(img.width * scale), oh = Math.round(img.height * scale);
  const W = ow + pad * 2, H = oh + pad * 2;
  const out = { width: W, height: H, data: new Uint8Array(W * H * 4).fill(255) };
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      // bilinear sample
      const fx = (x + 0.5) / scale - 0.5, fy = (y + 0.5) / scale - 0.5;
      const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy));
      const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
      const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0));
      const v = gray[y0 * img.width + x0] * (1 - ax) * (1 - ay) + gray[y0 * img.width + x1] * ax * (1 - ay) +
                gray[y1 * img.width + x0] * (1 - ax) * ay + gray[y1 * img.width + x1] * ax * ay;
      const ink = v > thr ? 0 : 255;
      const i = ((y + pad) * W + (x + pad)) * 4;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = ink;
    }
  }
  return out;
}

// ---------- layout detection ----------
function findTeamRows(img) {
  const { width: W, height: H } = img;
  const xs = [];
  for (let x = Math.floor(W * 0.30); x < W * 0.75; x += 3) xs.push(x);
  const blueLine = new Array(H).fill(false);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (const x of xs) if (isTeamBlue(px(img, x, y))) n++;
    blueLine[y] = n / xs.length > 0.5;
  }
  const bands = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && blueLine[y];
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (y - start >= H * 0.025) bands.push({ y0: start, y1: y - 1 }); start = -1; }
  }
  // If two rows merged (no visible gap), split bands that are ~2x the typical height.
  if (bands.length) {
    const hs = bands.map(b => b.y1 - b.y0).sort((a, b) => a - b);
    const typical = hs[Math.floor(hs.length / 2)];
    const out = [];
    for (const b of bands) {
      const n = Math.max(1, Math.round((b.y1 - b.y0) / typical));
      const step = (b.y1 - b.y0 + 1) / n;
      for (let k = 0; k < n; k++) out.push({ y0: Math.round(b.y0 + k * step), y1: Math.round(b.y0 + (k + 1) * step) - 1 });
    }
    return out.slice(0, 6);
  }
  return bands;
}

function findTableEdges(img, rows) {
  const lefts = [], rights = [];
  for (const r of rows) {
    const y = Math.round((r.y0 + r.y1) / 2);
    let left = -1;
    for (let x = 0, run = 0; x < img.width * 0.5; x++) {
      run = isTeamBlue(px(img, x, y)) ? run + 1 : 0;
      if (run >= 8) { left = x - 7; break; }
    }
    let right = -1;
    for (let x = img.width - 1, run = 0; x > img.width * 0.5; x--) {
      run = isTeamBlueLoose(px(img, x, y)) ? run + 1 : 0;
      if (run >= 8) { right = x + 7; break; }
    }
    if (left >= 0) lefts.push(left);
    if (right >= 0) rights.push(right);
  }
  const med = a => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return { left: lefts.length ? med(lefts) : 0, right: rights.length ? med(rights) : 0 };
}

// ---------- role icon ----------
// Icon pixels are light lavender-blue; portraits and the dark wedge are not.
function iconSignature(img) {
  const gray = new Float32Array(img.width * img.height);
  for (let i = 0; i < gray.length; i++) {
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    gray[i] = (b >= 170 && b - r >= 50 && b - g >= 25) ? 255 : 0;
  }
  const thr = 128;
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (gray[y * img.width + x] > thr) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1, side = Math.max(bw, bh);
  const ox = minX - (side - bw) / 2, oy = minY - (side - bh) / 2;
  let bits = '';
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    // average the source block
    const sx0 = ox + (i * side) / 16, sx1 = ox + ((i + 1) * side) / 16;
    const sy0 = oy + (j * side) / 16, sy1 = oy + ((j + 1) * side) / 16;
    let on = 0, n = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) { n++; continue; }
      n++; if (gray[y * img.width + x] > thr) on++;
    }
    bits += on / Math.max(1, n) > 0.4 ? '1' : '0';
  }
  return bits;
}

function classifyRole(sig) {
  if (!sig) return { role: '', distance: 999 };
  let best = { role: '', distance: 999 };
  for (const [role, list] of Object.entries(ROLE_TEMPLATES)) {
    for (const t of list) {
      let d = 0;
      for (let i = 0; i < 256; i++) if (t[i] !== sig[i]) d++;
      if (d < best.distance) best = { role, distance: d };
    }
  }
  return best;
}

// Returns the lowest N lines of light text in an image, cropped with a little margin.
// The timer is normally the lowest line, but trying a few lines makes the reader
// tolerate a footer or menu hint underneath it.
function textLines(img, maxLines = 4) {
  const gray = toGray(img);
  const thr = Math.max(otsu(gray), 120);
  const rowInk = [];
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (gray[y * img.width + x] > thr) n++;
    rowInk.push(n);
  }
  const lines = [];
  let s = -1;
  for (let y = 0; y <= img.height; y++) {
    const on = y < img.height && rowInk[y] > 0;
    if (on && s < 0) s = y;
    if (!on && s >= 0) { if (y - s >= 4) lines.push([s, y - 1]); s = -1; }
  }
  if (!lines.length) return [];
  return lines.slice(-maxLines).reverse().map(([a, b]) => {
    let x0 = img.width, x1 = 0;
    for (let y = a; y <= b; y++) for (let x = 0; x < img.width; x++)
      if (gray[y * img.width + x] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const m = Math.max(2, Math.round((b - a) * 0.3));
    return crop(img, x0 - m, a - m, x1 - x0 + 1 + 2 * m, b - a + 1 + 2 * m);
  });
}
function lastTextLine(img) { return textLines(img, 1)[0] || null; }

// ---------- parsing ----------
function parseNumber(text) {
  const t = (text || '').replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/[^0-9]/g, '');
  return t === '' ? null : parseInt(t, 10);
}
function parseDuration(text) {
  const t = (text || '').replace(/[Oo]/g, '0');
  let m = t.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*[:.]\s*(\d{2})/);
  if (m) {
    const mins = (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60;
    return mins > 0 && mins < 120 ? Math.round(mins * 10) / 10 : null;
  }
  // Some screens/modes show a shorter MM:SS timer.
  m = t.match(/(\d{1,3})\s*[:.]\s*(\d{2})/);
  if (!m) return null;
  const mins = (+m[1]) + (+m[2]) / 60;
  return mins > 0 && mins < 120 ? Math.round(mins * 10) / 10 : null;
}

// ---------- main entry ----------
// worker: a Tesseract.js worker (createWorker('eng', 1, ...)); encode: img -> PNG Buffer
async function readScoreboard(img, worker, encode, onProgress = () => {}) {
  const rows = findTeamRows(img);
  if (rows.length < 1) throw new Error("Couldn't find the scoreboard in that image. Make sure it's a full screenshot of the end-of-match scoreboard.");
  const { left, right } = findTableEdges(img, rows);
  if (!(right > left)) throw new Error("Couldn't find the edges of the scoreboard table.");
  const TW = right - left;

  // Upscale so text ends up a similar size no matter the screenshot resolution.
  const rowH = rows.reduce((a, r) => a + (r.y1 - r.y0 + 1), 0) / rows.length;
  const scale = Math.max(3, Math.min(8, 150 / rowH));
  const ocr = async (cell, opts, sc = scale) => {
    await worker.setParameters(opts);
    const { data } = await worker.recognize(encode(prepForOcr(cell, sc)));
    return { text: data.text.trim(), conf: data.confidence };
  };
  const NUM = { tessedit_char_whitelist: '0123456789,', tessedit_pageseg_mode: '7' };
  const TXT = { tessedit_char_whitelist: '', tessedit_pageseg_mode: '7' };
  const COMMA_OK = /^\d{1,3}(,\d{3})*$/;

  // Read one number cell. Tries two zoom levels (and word/char modes for lone digits);
  // returns the best reading plus whether the readings agreed.
  async function readNumber(cellImg) {
    const tries = [];
    for (const sc of [scale, scale * 1.6]) {
      let r = await ocr(cellImg, NUM, sc);
      let v = parseNumber(r.text);
      for (const psm of ['8', '10', '13']) {
        if (v !== null && r.conf >= 70) break;
        const alt = await ocr(cellImg, { ...NUM, tessedit_pageseg_mode: psm }, sc);
        const av = parseNumber(alt.text);
        if (av !== null && (v === null || alt.conf > r.conf)) { r = alt; v = av; }
      }
      const clean = r.text.replace(/\s/g, '');
      tries.push({ v, conf: r.conf + (COMMA_OK.test(clean) ? 10 : -15) });
    }
    const valid = tries.filter(t => t.v !== null);
    if (!valid.length) return { value: null, sure: false };
    valid.sort((x, y) => y.conf - x.conf);
    const agree = valid.length === 2 && valid[0].v === valid[1].v;
    return { value: valid[0].v, sure: agree && valid[0].conf >= 60 };
  }

  const players = [];
  for (const r of rows) {
    onProgress(players.length + 1, rows.length);
    const h = r.y1 - r.y0 + 1;
    const y0 = r.y0 + h * 0.18, ch = h * 0.64;
    const cell = (c) => c.from !== undefined
      ? crop(img, left + c.from * TW, y0, (c.to - c.from) * TW, ch)
      : crop(img, left + (c.c - c.w / 2) * TW, y0, c.w * TW, ch);

    const p = { warnings: [] };
    // Names: majority vote across several zoom levels (stylized fonts make single reads flaky).
    const nameCell = cell(COLS.name);
    const votes = new Map();
    for (const sc of [scale * 0.9, scale, scale * 1.2, scale * 1.5, scale * 1.8]) {
      const r = await ocr(nameCell, TXT, sc);
      const t = r.text.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const v = votes.get(t) || { n: 0, conf: 0 };
      v.n++; v.conf += r.conf; votes.set(t, v);
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1].n - a[1].n || b[1].conf - a[1].conf);
    p.name = ranked.length ? ranked[0][0] : '';
    if (!ranked.length || ranked[0][1].n < 3) p.warnings.push('name');
    for (const key of ['kills', 'deaths', 'assists', 'damage', 'blocked', 'healing']) {
      const res = await readNumber(cell(COLS[key]));
      p[key] = res.value;
      if (!res.sure) p.warnings.push(key);
    }
    const iconImg = crop(img, left + ROLE_ICON.from * TW, r.y0 + h * ROLE_ICON.top, (ROLE_ICON.to - ROLE_ICON.from) * TW, h * (ROLE_ICON.bottom - ROLE_ICON.top));
    const sig = iconSignature(iconImg);
    const cls = classifyRole(sig);
    p.role = cls.distance <= 60 ? cls.role : '';
    // Sanity fallback: a big healer is a support no matter what the icon says.
    if (!p.role) {
      p.role = p.healing >= 5000 ? 'support' : (p.blocked >= 15000 ? 'tank' : 'dps');
      p.warnings.push('role');
    }
    p._sig = sig; p._roleDistance = cls.distance;
    players.push(p);
  }

  // Match timer: the bottom line of the text block in the top-right corner (e.g. 00:09:30)
  let minutes = null;
  try {
    const corner = crop(img, img.width * 0.70, 0, img.width * 0.30, img.height * 0.12);
    for (const line of textLines(corner, 4)) {
      const tScale = Math.max(3, Math.min(8, 120 / line.height));
      for (const psm of ['7', '8']) {
        await worker.setParameters({ tessedit_char_whitelist: '0123456789:', tessedit_pageseg_mode: psm });
        const { data } = await worker.recognize(encode(prepForOcr(line, tScale)));
        minutes = parseDuration(data.text);
        if (minutes) break;
      }
      if (minutes) break;
    }
  } catch (e) { /* optional */ }

  return { players, minutes, small: rowH < 38, debug: { rows, left, right } };
}

module.exports = { readScoreboard, findTeamRows, findTableEdges, crop, iconSignature, prepForOcr, textLines, parseNumber, parseDuration, COLS, ROLE_ICON };
