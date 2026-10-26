const fs = require('node:fs'),
  assert = require('node:assert/strict');
const read = (p) => fs.readFileSync(p, 'utf8'),
  meta = JSON.parse(read('drawing-lab.release.json'));
assert.match(meta.version, /^\d+\.\d+\.\d+-drawing\.\d+$/);
assert.ok(
  read('drawing-lab.html').includes(
    '<title>TimeGrid Drawing Lab ' + meta.version + '</title>',
  ),
);
assert.ok(
  read('src/js/drawing-lab.mjs').includes(
    "APP_VERSION = '" + meta.version + "'",
  ),
);
assert.equal(JSON.parse(read('package.json')).version, meta.appVersion);
assert.ok(
  read('README.md').includes(
    'Версия стенда: `Drawing Lab ' + meta.version + '`',
  ),
);
assert.ok(
  read('docs/DEVELOPMENT_HISTORY.md')
    .split('\n')
    .some(
      (line) =>
        line.startsWith('## ') && line.includes('Drawing Lab ' + meta.version),
    ),
);
console.log(
  'Independent lab release: ' +
    meta.version +
    '; ordinary app remains ' +
    meta.appVersion,
);
