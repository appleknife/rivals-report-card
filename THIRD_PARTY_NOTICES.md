# Third-party notices

Rivals Report Card is MIT licensed (see LICENSE). The Windows build also includes the following components, each under its own license.

| Component | Used for | License |
|---|---|---|
| [Anton](https://github.com/googlefonts/AntonFont) font | Headings, names and grades | SIL Open Font License 1.1 (full text in `src/fonts/Anton-OFL.txt`) |
| [Electron](https://www.electronjs.org) | Desktop app shell (includes Chromium; its notices ship as `LICENSES.chromium.html` in the build) | MIT |
| [tesseract.js](https://github.com/naptha/tesseract.js) and tesseract.js-core | Offline text recognition | Apache-2.0 |
| English recognition model ([tessdata](https://github.com/tesseract-ocr/tessdata), via @tesseract.js-data/eng) | Offline text recognition | Apache-2.0 (model), MIT (package) |
| [pngjs](https://github.com/pngjs/pngjs) | Reading and writing PNG images | MIT |
| Supporting packages for tesseract.js: bmp-js, is-url, node-fetch, regenerator-runtime, zlibjs, whatwg-url, tr46 | Image decoding and loading the model | MIT |
| idb-keyval, wasm-feature-detect | Supporting packages for tesseract.js | Apache-2.0 |
| webidl-conversions | Supporting package for tesseract.js | BSD-2-Clause |

Each package's full license text is included in its folder under `resources/app/node_modules` in the Windows build.

Marvel Rivals is a trademark of its owners. This project is an unofficial fan tool and is not affiliated with or endorsed by NetEase Games or Marvel. The app's icon and artwork are original.
