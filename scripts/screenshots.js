// Regenerates the README screenshots from the real app.
// Usage: npm run screenshots   (on Linux without a display: xvfb-run -a npm run screenshots)
'use strict';

const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs');
const wait = ms => new Promise(r => setTimeout(r, ms));

require('../src/main.js');

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = code => win.webContents.executeJavaScript(code);
    try {
      win.setSize(1280, 900);
      await wait(500);
      await js(`document.fonts.ready.then(() => true)`);
      await js(`document.getElementById('sampleBtn').click()`);
      await wait(200);
      fs.writeFileSync(path.join(OUT, 'input.png'), (await win.webContents.capturePage()).toPNG());

      await js(`document.getElementById('gradeBtn').click()`);
      await wait(3500); // let the grade stamps finish
      await clipboard.clear();
      await js(`document.getElementById('copyImgBtn').click()`);
      let png = null;
      for (let i = 0; i < 50 && !png; i++) {
        const items = await clipboard.read();
        const item = items.find(it => it.types.includes('image/png'));
        if (item) png = Buffer.from(await (await item.getType('image/png')).arrayBuffer());
        else await wait(200);
      }
      if (!png) throw new Error('Copy image produced nothing');
      fs.writeFileSync(path.join(OUT, 'results.png'), png);
      console.log('Saved docs/input.png and docs/results.png');
    } catch (err) {
      console.error('Screenshot failed:', err);
      process.exitCode = 1;
    }
    app.exit();
  });
});
