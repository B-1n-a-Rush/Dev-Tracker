const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(__dirname, fs.existsSync(path.resolve(__dirname, '../outputs/index.html')) ? '../outputs' : '..');
const catalog = require(path.join(runtime, 'trackside-transit-catalog.js'));

const bundled = {name: 'Example ART', color: '#3d9bd1'};
const uploaded = {name: 'example ART', isPublished: true, remoteId: '26', color: '#b84f2a'};

test('a published upload takes precedence over a same-name bundled route', () => {
  assert.deepEqual(catalog.publishedRoutes([bundled], [uploaded], new Map()), [uploaded]);
});

test('a hidden upload can fall back to the enabled bundled route', () => {
  assert.deepEqual(catalog.publishedRoutes([bundled], [{...uploaded, isPublished: false}], new Map()), [bundled]);
});

test('a disabled bundled alignment stays out of the public catalog', () => {
  const visibility = new Map([[bundled.name, {is_published: false}]]);
  assert.deepEqual(catalog.publishedRoutes([bundled], [{...uploaded, isPublished: false}], visibility), []);
  assert.deepEqual(catalog.publishedRoutes([bundled], [uploaded], visibility), [uploaded]);
});
