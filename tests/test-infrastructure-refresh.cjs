const assert = require('node:assert/strict');
const { capture, compare } = require('../scripts/check-infrastructure-source.cjs');

const feature = (id, number, start, x = -84.4) => ({
  type: 'Feature',
  properties: {
    OBJECTID: id, PROJECT_NUMBER: number, FUNDING_PROJECT_NAME: 'Project ' + number,
    CONSTRUCTION_START_DATE: start,
  },
  geometry: { type: 'Point', coordinates: [x, 33.8] },
});
const a = feature(1, '01', 123), b = feature(2, '01', 456, -84.41);
const gone = feature(3, '02', null), added = feature(4, '03', null);
assert.deepEqual(compare([a, b, gone], [gone, b, { ...a, properties: { ...a.properties, OBJECTID: 9, LAST_UPDATE: 'metadata only' } }]), []);
const changes = compare([a, b, gone], [feature(1, '01', 789), added]);
assert.deepEqual(changes.map(row => [row.id, row.kind, row.canApply]), [
  ['01', 'changed', false], ['02', 'missing', false], ['03', 'new', true],
]);
assert.deepEqual(changes[0].differences.find(field => field.field === 'CONSTRUCTION_START_DATE').before, [123, 456]);
assert.deepEqual(changes[0].differences.find(field => field.field === 'CONSTRUCTION_START_DATE').after, [789]);
assert.equal(compare([a, b], [feature(1, '01', 456), feature(2, '01', 123, -84.41)])[0].differences[0].field, 'segmentDetails');

const fields = ['FUNDING_PROJECT_NAME', 'PROJECT_NAME_1', 'CONSTRUCTION_START_DATE', 'CONSTRUCTION_COMPLETION_DATE',
  'RATL_STATUS', 'PROJECT_STATUS', 'PROJECT_CATEGORY', 'PROGRAM', 'ON_STREET', 'FROM_STREET',
  'TO_STREET', 'LENGTH_MI', 'PROJECT_NUMBER'].map(name => ({ name }));
function stub({ partial = false, empty = false, concurrentEdit = false } = {}) {
  let metadataReads = 0;
  return async (url, params) => {
    if (!url.endsWith('/query')) return { fields, editingInfo: { lastEditDate: concurrentEdit ? ++metadataReads : 1 } };
    if (params.returnIdsOnly) return { objectIds: empty ? [] : [2, 1], objectIdFieldName: 'OBJECTID' };
    assert.equal(params.objectIds, '1,2');
    return { features: partial ? [a] : [b, a] };
  };
}
(async () => {
  const snapshot = await capture(stub());
  assert.equal(snapshot.features.length, 2);
  await assert.rejects(capture(stub({ partial: true })), /incomplete/);
  await assert.rejects(capture(stub({ empty: true })), /nonempty/);
  await assert.rejects(capture(stub({ concurrentEdit: true })), /changed while/);
  console.log('Infrastructure refresh tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
