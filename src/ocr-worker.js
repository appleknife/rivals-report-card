// Creates the offline text-recognition worker used by the app and the tests.
// The English model ships inside node_modules, so nothing is downloaded at runtime.
'use strict';

const path = require('path');
const { createWorker } = require('tesseract.js');

function createOcrWorker(cacheDir) {
  const langDir = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
  return createWorker('eng', 1, { langPath: langDir, cachePath: cacheDir, gzip: true });
}

module.exports = { createOcrWorker };
