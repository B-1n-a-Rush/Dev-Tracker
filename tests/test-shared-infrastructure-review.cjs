const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { harness } = require('./helpers/bus-dom.cjs');
const { monitoringFindings } = require('../scripts/infrastructure-review-import.cjs');

const checkedAt = '2026-11-24T18:00:00.000Z';
const changes = [{
  id: 'd7', name: 'Example Road', kind: 'changed',
  changes: [{ field: 'Construction start', before: ['2026-11-09'], after: ['2027-07-19'] }]
}];

test('Shared monitoring findings retain their comparison and ignore failed feeds', () => {
  const report = {
    checkedAt, atlantaGIS: { status: 'failed' },
    sources: [
      { id: 'dk-splost-lines', name: 'DeKalb', url: 'https://example.com/roads', checkedAt, status: 'checked', changes },
      { id: 'clayton-gdot', name: 'Clayton', status: 'failed', changes }
    ]
  };
  const findings = monitoringFindings(report, null);
  assert.equal(findings.length, 1);
  assert.deepEqual(monitoringFindings(report, null), findings);
  assert.equal(findings[0].infrastructure_id, 'dk-splost:d7');
  assert.equal(findings[0].priority, 2);
  assert.equal(findings[0].comparisons[0].after[0], '2027-07-19');
  assert.equal(findings[0].decision, undefined);
});

test('Repeat Atlanta GIS findings keep the same ID and stale GIS reports are ignored', () => {
  const report = { checkedAt, sources: [], atlantaGIS: { status: 'checked', checkedAt, reverted: [] } };
  const gis = {
    checkedAt, source: 'https://example.com/gis',
    changes: [{
      id: '42', name: 'Example Bridge', kind: 'changed',
      differences: [{ field: 'CONSTRUCTION_START_DATE', before: [Date.UTC(2025, 8, 11)], after: [Date.UTC(2027, 6, 19)] }]
    }]
  };
  const [finding] = monitoringFindings(report, gis);
  assert.equal(finding.comparisons[0].after[0], '2027-07-19');
  assert.equal(finding.infrastructure_id, 'atl-capital:42');
  const later = '2026-12-08T18:00:00.000Z';
  const nextReport = { ...report, checkedAt: later, atlantaGIS: { ...report.atlantaGIS, checkedAt: later } };
  assert.deepEqual(monitoringFindings(nextReport, gis), []);
  assert.equal(monitoringFindings(nextReport, { ...gis, checkedAt: later })[0].id, finding.id);
});

test('The review card renders evidence and can focus the matching existing map geometry', async () => {
  const { context } = harness();
  const original = { id:'dk-splost:d7', geometry:{type:'Point',coordinates:[-84.3,33.8]} };
  let focused, modalClosed;
  context.document.createTextNode = text => ({textContent:text});
  context.closeAuthModal = () => { modalClosed = true; };
  context.TracksideLand = {
    async loadInfrastructure() {}, infrastructureRows:[original], focusInfrastructure(row) { focused = row; }
  };
  let received;
  context.tracksideSupabase = {
    async listInfrastructureSourceFindings() { return [{
      id:'finding-1', infrastructure_id:original.id, checked_at:checkedAt, source_name:'Agency',
      source_url:'https://example.com/roads', project_name:'Example Road', kind:'changed', priority:2,
      reason:'Schedule changed.', decision:'pending', review_version:0, previous_label:'Reviewed GIS snapshot',
      incoming_label:'Published source', comparisons:[{label:'Construction start',before:['2026-11-09'],after:['2027-07-19']}]
    }]; },
    async saveInfrastructureSourceReview(...args) {
      received = args;
      return { decision:'agency_confirmation',review_version:1 };
    }
  };
  const localOutput = path.join(__dirname,'../outputs/trackside-infrastructure-queue.js');
  const script = fs.existsSync(localOutput) ? localOutput : path.join(__dirname,'../trackside-infrastructure-queue.js');
  vm.runInContext(fs.readFileSync(script,'utf8'),context);
  const host = context.document.createElement('div');
  const queue = context.TracksideInfrastructureQueue.mount(host);
  await new Promise(setImmediate);
  assert.match(host.textContent,/Reviewed GIS snapshot.*2026-11-09.*Published source.*2027-07-19/);
  const card = host.children[3].children[0];
  const form = card.children.find(child=>child.tagName === 'FORM');
  form.children[0].children[0].value = 'agency_confirmation';
  form.children[1].children[0].value = 'Ask the project manager.';
  await form.handlers.submit[0]({preventDefault() {}});
  assert.deepEqual(received,['finding-1',0,'agency_confirmation','Ask the project manager.']);
  assert.match(card.textContent,/Review decision saved/);
  const buttons = card.querySelector('.data-health-actions');
  await buttons.children.find(child=>child.tagName === 'BUTTON').click();
  await new Promise(setImmediate);
  assert.equal(modalClosed,true);
  assert.equal(focused,original);
  queue.destroy();
  assert.equal(host.children.length,0);
});
