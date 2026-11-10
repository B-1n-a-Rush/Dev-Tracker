const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const local = path.join(__dirname, '../outputs');
const runtime = fs.existsSync(path.join(local, 'index.html')) ? local : path.join(__dirname, '..');
const C = require(path.join(runtime, 'trackside-coordination-core.js'));
const route = { name: 'Buford ART', geometry: { type: 'LineString', coordinates: [[-84.369925, 33.822938], [-84.370093, 33.823094]] } };
const project = (id, start, finish) => ({
  id, name: id, start, finish, geometry: { type: 'Point', coordinates: [-84.369925, 33.822938] }
});
const rows = [
  project('intersecting', '2028-08-15', '2029-02'),
  project('early', '2027-01', '2027-12'),
  project('unknown', '2028-09', 'TBD'),
  project('invalid', '2028-02-30', '2028-03'),
];
const result = C.screen({ route, rows, start: '2028', finish: null });
const byId = Object.fromEntries(result.rows.map(item => [item.row.id, item]));
assert.equal(byId.intersecting.state, 'reference-needed');
assert.equal(byId.intersecting.overlap, undefined);
assert.match(byId.intersecting.reason, /comparison finish/);
assert.equal(byId.early.state, 'outside');
assert.match(byId.early.reason, /before the earliest comparison start/);
assert.match(byId.unknown.reason, /comparison finish and the project finish/);
assert.equal(byId.invalid.state, 'invalid');
assert.equal(result.overlaps, 0);
assert.equal(result.rows.length, 4);

const complete = C.screen({ route, rows, start: '2028-07', finish: '2028-12' });
const shared = complete.rows.find(item => item.row.id === 'intersecting');
assert.equal(shared.state, 'overlap');
assert.equal(C.overlapLabel(shared.overlap), 'Aug 15, 2028 – Dec 2028');
assert.equal(shared.overlap.approximate, true);
assert.equal(complete.rows.find(item => item.row.id === 'unknown').state, 'unknown');
assert.equal(C.overlapLabel(C.screen({
  route, rows: [project('one day', '2028-07-01', '2028-07-01')], start: '2028-07-01', finish: '2028-07-01'
}).rows[0].overlap), 'Jul 1, 2028');

const service = C.screen({ route, rows, existingService: true });
assert.equal(service.rows.find(item => item.row.id === 'intersecting').state, 'service-work');
assert.match(service.rows[0].reason, /service hours/);
assert.ok(service.rows.every(item => !item.overlap));
console.log('Coordination overlap evidence checks passed.');

