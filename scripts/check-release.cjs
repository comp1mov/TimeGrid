const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
const version = pkg.version;
assert.match(version, /^\d+\.\d+\.\d+-drawing\.\d+$/);
assert.equal(lock.version, version);assert.equal(lock.packages[''].version, version);
assert.ok(read('src/js/main.js').includes(`const APP_VERSION = '${version}';`));
const html = read('index.html');
for (const label of [`<title>TimeGrid ${version}</title>`,`id="fgLogoText">TimeGrid ${version}</span>`,
  `class="dz-version">${version}</div>`,`class="about-version">${version}</div>`]) assert.ok(html.includes(label),label);
assert.ok(read('README.md').includes('Текущая версия приложения: `TimeGrid '+version+'`'));
assert.ok(read('docs/DEVELOPMENT_HISTORY.md').split('\n').some(line=>line.startsWith('## ')&&line.includes('TimeGrid '+version)));
assert.ok(read('drawing-lab.html').includes(version));
assert.ok(read('src/js/drawing-lab.mjs').includes("APP_VERSION = '"+version+"'"));
console.log('Release metadata consistent: '+version);
