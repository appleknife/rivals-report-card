// Renders assets/icon-source.html to src/icon.png (window icon).
// Usage: npm run icon   (on Linux without a display: xvfb-run -a npm run icon)
// build/icon.ico (the .exe icon) is made from src/icon.png; see the README.
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, '..', 'assets', 'icon-source.html'));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise(r => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const out = path.join(__dirname, '..', 'src', 'icon.png');
  fs.writeFileSync(out, img.resize({ width: 256, height: 256 }).toPNG());
  console.log('Saved', path.relative(process.cwd(), out));
  app.exit();
});
