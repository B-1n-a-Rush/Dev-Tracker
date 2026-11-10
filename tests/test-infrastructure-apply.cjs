const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { reviewStore } = require('../scripts/check-infrastructure-source.cjs');

const feature = (id, project, start, x = -84.4) => ({
  type: 'Feature',
  properties: { OBJECTID: id, PROJECT_NUMBER: project, FUNDING_PROJECT_NAME: 'Project ' + project, CONSTRUCTION_START_DATE: start },
  geometry: { type: 'LineString', coordinates: [[x, 33.8], [x + .01, 33.81]] },
});
const fields = ['FUNDING_PROJECT_NAME', 'PROJECT_NAME_1', 'CONSTRUCTION_START_DATE', 'CONSTRUCTION_COMPLETION_DATE',
  'RATL_STATUS', 'PROJECT_STATUS', 'PROJECT_CATEGORY', 'PROGRAM', 'ON_STREET', 'FROM_STREET',
  'TO_STREET', 'LENGTH_MI', 'PROJECT_NUMBER'].map(name => ({ name }));

function fixture(root) {
  const snapshot = path.join(root, 'outputs', 'trackside-atlanta-reviewed.js');
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  const index = path.join(root, 'outputs', 'index.html');
  if (!fs.existsSync(index)) fs.writeFileSync(index, '');
  fs.writeFileSync(snapshot, 'window.TracksideAtlantaReviewed = ' + JSON.stringify({
    checkedAt: '2026-11-01T14:00:00Z',
    features: [feature(1, '10', 1800000000000), feature(2, '20', null), feature(3, '30', null), feature(4, '30', null)],
  }) + ';\n');
  const incoming = [feature(1, '10', 1900000000000, -84.38), feature(3, '30', null), feature(5, '40', null)];
  const get = async (url, params) => {
    if (!url.endsWith('/query')) return { fields, editingInfo: { lastEditDate: 1793720300000 } };
    if (params.returnIdsOnly) return { objectIds: incoming.map(f => f.properties.OBJECTID), objectIdFieldName: 'OBJECTID' };
    return { features: incoming };
  };
  return { snapshot, incoming, get };
}

if (require.main === module) (async () => {
  const temp = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'trackside-review-test-'));
  try {
    const { snapshot, incoming, get } = fixture(root);
    const initial = fs.readFileSync(snapshot, 'utf8');
    const store = reviewStore(root);
    assert.deepEqual(store.latest(), { report: null, attempt: null });
    await store.check(get);
    const { report, attempt } = store.latest();
    assert.equal(attempt.status, 'success');
    assert.equal(report.changes.length, 4);
    assert.equal(report.snapshot, undefined);
    const selection = { version: 1, reportId: report.reportId, selected: ['10'] };
    const preview = store.preview(selection);
    assert.notDeepEqual(preview.projects[0].before[0].geometry, preview.projects[0].after[0].geometry);
    assert.equal(fs.readFileSync(snapshot, 'utf8'), initial);
    assert.throws(() => store.preview({ ...selection, selected: ['20'] }), /no longer eligible/);
    assert.throws(() => store.preview({ ...selection, selected: ['30'] }), /no longer eligible/);
    await assert.rejects(store.apply({ ...selection, previewId: 'wrong' }), /preview changed/i);

    // A refresh can retain its report ID when only raw fields change. The preview still expires.
    incoming[0].properties.PROJECT_NOTES = 'Revised raw field';
    await store.check(get);
    assert.equal(store.latest().report.reportId, report.reportId);
    await assert.rejects(store.apply({ ...selection, previewId: preview.previewId }), /preview changed/i);

    const good = store.latest().report;
    await assert.rejects(store.check(async () => { throw new Error('Atlanta DOT returned HTTP 503'); }));
    assert.equal(store.latest().attempt.status, 'failed');
    assert.equal(store.latest().report.checkedAt, good.checkedAt);
    assert.equal(fs.readFileSync(snapshot, 'utf8'), initial);
    assert.throws(() => store.preview(selection), /successful source check/);
    await store.check(get);

    const currentPreview = store.preview(selection);
    const [first, second] = await Promise.allSettled([
      store.apply({ ...selection, previewId: currentPreview.previewId }),
      store.apply({ ...selection, previewId: currentPreview.previewId }),
    ]);
    assert.equal(first.value.appliedLocally, 1);
    assert.equal(second.status, 'rejected');
    await assert.rejects(store.apply({ ...selection, previewId: currentPreview.previewId }), /report or map snapshot changed/i);
    const remaining = store.latest().report.changes;
    assert.deepEqual(remaining.map(r => [r.id, r.canApply]), [['20',false], ['30',false], ['40',true]]);
    assert.match(fs.readFileSync(snapshot, 'utf8'), /"PROJECT_NUMBER":"20"/);
    console.log('Infrastructure apply checks passed: exact preview, failed checks, stale reports, concurrent apply, and retained segments.');
  } finally {
    assert.equal(path.dirname(root), temp);
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { fixture };

