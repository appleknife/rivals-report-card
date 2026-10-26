const { app, BrowserWindow, Menu, shell, ipcMain, clipboard, ClipboardItem, dialog, screen, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { readScoreboard } = require('./ocr-core');
const { createOcrWorker } = require('./ocr-worker');

// ---------- Offline text recognition (runs in the background, no internet needed) ----------
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createOcrWorker(path.join(app.getPath('userData'), 'ocr-cache'))
      .catch(err => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

const encodePng = img => {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
};

let busy = false;
ipcMain.handle('import-screenshot', async (event, payload) => {
  if (busy) return { error: 'Already reading a screenshot, hang on a sec.' };
  busy = true;
  try {
    const { width, height, data } = payload || {};
    if (!width || !height || !data) return { error: "That didn't look like an image." };
    if (width * height > 40_000_000) return { error: 'That screenshot is too large. Try a normal 1080p or 4K screenshot.' };
    const img = { width, height, data: new Uint8Array(data) };
    const worker = await getWorker();
    const result = await readScoreboard(img, worker, encodePng, (i, n) => {
      if (!event.sender.isDestroyed()) event.sender.send('import-progress', { i, n });
    });
    return { players: result.players.map(({ _sig, _roleDistance, ...p }) => p), minutes: result.minutes, small: result.small };
  } catch (err) {
    return { error: err.message || String(err) };
  } finally {
    busy = false;
  }
});

// Read an image from the clipboard so the UI can offer a "Paste image" button.
ipcMain.handle('read-clipboard-image', async () => {
  const items = await clipboard.read();
  for (const item of items) {
    const type = item.types.find(t => t.startsWith('image/'));
    if (type) {
      const blob = await item.getType(type);
      return { data: Buffer.from(await blob.arrayBuffer()), type };
    }
  }
  return { error: 'The clipboard does not contain an image.' };
});

ipcMain.handle('app-version', () => app.getVersion());

// ---------- Share the results panel as a PNG ----------
ipcMain.handle('capture-image', async (event, rect, mode) => {
  const wc = event.sender;
  const win = BrowserWindow.fromWebContents(wc);
  if (!win) return { error: "Couldn't find the app window." };
  const pad = 16;
  const display = screen.getDisplayMatching(win.getBounds());
  const zoom = typeof wc.getZoomFactor === 'function' ? wc.getZoomFactor() : 1;
  // Capture at the display's pixel density (capped at 2x) so images are sharp on scaled displays.
  const scale = Math.min(2, Math.max(1, (display.scaleFactor || 1) * zoom));
  const clip = {
    x: Math.max(0, Math.round(rect.x - pad)), y: Math.max(0, Math.round(rect.y - pad)),
    width: Math.max(1, Math.min(10000, Math.round(rect.width + pad * 2))),
    height: Math.max(1, Math.min(10000, Math.round(rect.height + pad * 2))),
    scale
  };
  let buf;
  try {
    await wc.executeJavaScript('document.fonts.ready.then(() => true)');
    const dbg = wc.debugger;
    const attachedHere = !dbg.isAttached();
    if (attachedHere) dbg.attach('1.3');
    try {
      // captureBeyondViewport grabs the whole panel even if it's scrolled partly off screen
      const { data } = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
      buf = Buffer.from(data, 'base64');
    } finally {
      if (attachedHere) dbg.detach();
    }
  } catch (err) {
    return { error: "Couldn't capture the results: " + (err.message || err) };
  }
  if (mode === 'copy') {
    try {
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(buf)], { type: 'image/png' }) })]);
      const items = await clipboard.read();
      const copied = items.some(item => item.types.some(type => type.startsWith('image/')));
      if (!copied) return { error: "Couldn't copy the image to the clipboard." };
    } catch (err) {
      return { error: "Couldn't copy the image to the clipboard: " + (err.message || err) };
    }
    return { ok: true };
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save results image',
    defaultPath: path.join(app.getPath('pictures'), `Rivals Report Card ${stamp}.png`),
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  try { await fs.promises.writeFile(filePath, buf); } catch (err) { return { error: "Couldn't save the image there." }; }
  return { ok: true, filePath };
});

let mainWindow = null;

function createWindow() {
  const { width: workW, height: workH } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1240, Math.max(420, workW - 60)),
    height: Math.min(900, Math.max(500, workH - 60)),
    minWidth: 420,
    minHeight: 500,
    title: 'Rivals Report Card',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#07080d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  mainWindow = win;

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Dropping a file on the window must not navigate away from the app
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

app.setAppUserModelId('com.appleknife.rivalsreportcard');
nativeTheme.themeSource = 'dark';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    getWorker().catch(() => {}); // warm up text recognition so the first import is quick
  });
}

app.on('window-all-closed', async () => {
  try { if (workerPromise) await (await workerPromise).terminate(); } catch (e) {}
  app.quit();
});
