const runtimeFile = require('./helpers/runtime-file.cjs');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const dates = require(runtimeFile('trackside-infrastructure-dates.js'));
const coord = require(runtimeFile('trackside-coordination-core.js'));
const here = require(runtimeFile('trackside-here-core.js'));
const view = require(runtimeFile('trackside-map-view-core.js'));

test('outlook uses Atlanta day, appropriate date evidence, and a bounded 90-day window', () => {
  const today = dates.atlantaDay(new Date('2026-11-22T02:00:00Z'));
  assert.equal(today, Date.UTC(2026,10,21));
  const planned = {source:{kind:'atlanta'}, sourceStatus:'Design', start:'2027-01-15'};
  assert.equal(dates.matchesFilter(planned,'starts-next-90',today),true);
  assert.equal(dates.matchesFilter({...planned,start:'2027-02-20'},'starts-next-90',today),false);
  assert.equal(dates.matchesFilter({...planned,start:'2027-02-19'},'starts-next-90',today),true);
  assert.equal(dates.matchesFilter({...planned,start:'2027'},'starts-next-90',today),false);
  assert.equal(dates.matchesFilter({...planned,source:{kind:'arc'}},'starts-next-90',today),false);
  assert.equal(dates.matchesFilter({...planned,source:{kind:'fulton'}},'starts-next-90',today),false);
  assert.equal(dates.matchesFilter({...planned,sourceStatus:'Preconstruction'},'under-construction',today),false);
  assert.equal(dates.matchesFilter({...planned,sourceStatus:'Under construction'},'under-construction',today),true);
  assert.equal(dates.matchesFilter({...planned,sourceStatus:'On hold'},'starts-next-90',today),false);
  const active = dates.apply({...planned,id:'work',name:'Work',sourceId:'source'}, {
    construction_start:'2026-11-21',start_certainty:'confirmed',construction_finish:'2027-01-15',finish_certainty:'estimated'
  });
  assert.equal(dates.matchesFilter(active,'under-construction',today),true);
  assert.equal(dates.matchesFilter({...active,complete:true},'under-construction',today),false);
});

test('route replacement flags only changed proximity at the saved screening distance', () => {
  const line = offset => ({type:'LineString',coordinates:[[-84.41+offset,33.75],[-84.41+offset,33.76]]});
  const row = {geometry:{type:'Point',coordinates:[-84.41,33.755]}};
  assert.deepEqual(coord.alignmentChange(row,line(0),line(.004),76.2),{entered:false,threshold:76.2});
  assert.deepEqual(coord.alignmentChange(row,line(.004),line(0),76.2),{entered:true,threshold:76.2});
  assert.equal(coord.alignmentChange(row,line(0),line(.0001),76.2),null);
  assert.equal(coord.alignmentChange(row,line(0),line(.004),804.672),null);
  assert.equal(coord.alignmentChange({},line(0),line(.004),76.2),null);
});

test('nearby SR2T results use the nearest public stop and omit drafts and removed sites', () => {
  const sr2t = [
    {site_id:'public',is_published:true,positions:[{lat:33.8,lng:-84.4},{lat:33.7501,lng:-84.4}]},
    {site_id:'draft',is_published:false,positions:[{lat:33.75,lng:-84.4}]},
    {site_id:'removed',is_published:true,removed_at:'2026-11-20',positions:[{lat:33.75,lng:-84.4}]},
    {site_id:'unmapped',is_published:true,positions:[]}
  ];
  const result = here.analyze({center:{lat:33.75,lng:-84.4},sr2t});
  assert.deepEqual(result.sr2t.map(item=>item.record.site_id),['public']);
  assert.ok(result.sr2t[0].distance<15);
});

test('share links round-trip the construction outlook and corridor identity', () => {
  const route={kind:'rapid',route:{id:'26',name:'Clifton BRT'}};
  const state={v:1,map:[33.75,-84.39,12],layers:{infrastructure:true,routes:[route.route]},
    filters:{corridor:route},infrastructure:{dates:'starts-next-90'},selection:{type:'route',...route}};
  const restored=view.readUrl(view.buildUrl('https://example.test/trackside/',state));
  assert.equal(restored.infrastructure.dates,'starts-next-90');
  assert.deepEqual(restored.selection,state.selection);
});
