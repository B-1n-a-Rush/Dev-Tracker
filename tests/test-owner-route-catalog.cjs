const runtimeFile = require('./helpers/runtime-file.cjs');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const catalog = require(runtimeFile('trackside-transit-catalog.js'));

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
