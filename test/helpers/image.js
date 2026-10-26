const { PNG } = require('pngjs'); const fs = require('fs');
exports.load = f => { const p = PNG.sync.read(fs.readFileSync(f)); return { width: p.width, height: p.height, data: p.data }; };
exports.encode = img => { const p = new PNG({ width: img.width, height: img.height }); p.data = Buffer.from(img.data); return PNG.sync.write(p); };
