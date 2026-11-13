const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const local = path.join(__dirname, '../outputs');
const runtime = fs.existsSync(path.join(local, 'index.html')) ? local : path.join(__dirname, '..');
const dates = require(path.join(runtime, 'trackside-infrastructure-dates.js'));
const coordination = require(path.join(runtime, 'trackside-coordination-core.js'));
const bus = require(path.join(runtime, 'trackside-bus-core.js'));
const shapes = require(path.join(runtime, 'trackside-shape-data.js'));
const agency = Object.freeze({id:'atl-capital:1',sourceId:'1',name:'Test roadwork',source:{kind:'atlanta'},start:'2028-02',finish:null,scheduleType:'Anticipated construction'});
const source_url = 'https://example.gov/schedule';

test('A sourced finish combines with an agency construction start and preserves the feed values', () => {
  const record = dates.validate({construction_finish:'2028-08',finish_certainty:'estimated',source_url}, agency);
  const project = dates.apply(agency, record);
  assert.equal(project.start,'2028-02');
  assert.equal(project.finish,'2028-08');
  assert.equal(project.agencySchedule.finish,null);
  assert.equal(agency.finish,null);
  assert.match(dates.endpointLabel(project,'finish'),/Aug 2028 \(manual, estimated\)/);
  assert.equal(coordination.comparison('2028-06','2028-10',project.start,project.finish),'overlap');
});

test('A generic agency project start is not converted to a construction start', () => {
  const fulton = {...agency,source:{kind:'fulton'},scheduleType:'Estimated project start / construction finish'};
  const record = dates.validate({construction_finish:'2028-08',finish_certainty:'confirmed',source_url}, fulton);
  const project = dates.apply(fulton, record);
  assert.equal(project.start,null);
  assert.equal(project.agencySchedule.start,'2028-02');
  assert.equal(coordination.timingLabel({state:'unknown',row:project}),'Timing incomplete');
  assert.equal(coordination.comparison('2028-06','2028-10',project.start,project.finish),'unknown');
  assert.equal(dates.apply(fulton,null),fulton);
});

test('Validation rejects impossible dates, missing sources, and inverted effective windows', () => {
  const validate = (finish,url=source_url) => dates.validate({construction_finish:finish,finish_certainty:'estimated',source_url:url}, agency);
  assert.throws(()=>validate('2028-02-30'),/valid finish/);
  assert.throws(()=>validate('1899-02'),/valid finish/);
  assert.throws(()=>validate('2027-12'),/on or after/);
  assert.throws(()=>validate('2028-08','javascript:alert(1)'),/source link/);
});

test('Later agency changes remain visible beside the saved manual date', () => {
  const record = dates.validate({construction_finish:'2028-08',finish_certainty:'confirmed',source_url}, agency);
  const updated = dates.apply({...agency,finish:'2028-10'},record);
  assert.equal(updated.finish,'2028-08');
  assert.equal(updated.agencySchedule.finish,'2028-10');
  assert.equal(dates.agencyChanged(updated),true);
  assert.equal(dates.agencyChanged(dates.apply(agency,record)),false);
});

test('Date filters distinguish missing dates, invalid dates, and saved dates', () => {
  assert.equal(dates.matchesFilter(agency,'finish'),true);
  assert.equal(dates.matchesFilter(agency,'both'),false);
  assert.equal(dates.matchesFilter({...agency,start:'TBD'},'both'),true);
  assert.equal(dates.matchesFilter({...agency,finish:'2028-02-30'},'invalid'),true);
  assert.equal(dates.matchesFilter({...agency,finish:'2028-02-30'},'finish'),false);
  const manual = dates.apply(agency,dates.validate({construction_finish:'2028-08',finish_certainty:'estimated',source_url},agency));
  assert.equal(dates.matchesFilter(manual,'manual'),true);
  assert.equal(dates.matchesFilter(manual,'finish'),false);
});

test('Bus screening and GIS exports use the manual schedule with its provenance', () => {
  const manual = dates.apply(agency,dates.validate({construction_finish:'2028-08',finish_certainty:'estimated',source_url},agency));
  const [window] = bus.phases(manual);
  assert.equal(window.timing_scope,'construction');
  assert.equal(window.kind,'complete');
  assert.equal(window.certainty,'estimated');
  const [feature] = shapes.infrastructure([manual],[],null).features;
  assert.equal(feature.properties.construction_finish,'2028-08');
  assert.equal(feature.properties.agency_finish,null);
  assert.equal(feature.properties.manual_finish_certainty,'estimated');
  assert.equal(feature.properties.construction_date_source,source_url);
});

test('Infrastructure checkpoints flag changed dates and certainty while preserving legacy reviews', () => {
  const manual = dates.apply(agency,dates.validate({construction_finish:'2028-08',finish_certainty:'estimated',source_url},agency));
  assert.equal(dates.reviewNeeded({},agency),false);
  assert.equal(dates.reviewNeeded({},manual),true);
  const review = {notes:'Keep this follow-up',reviewed_infrastructure_schedule:dates.reviewSnapshot(manual)};
  assert.equal(dates.reviewNeeded(review,manual),false);
  assert.equal(dates.reviewNeeded(review,{...manual,finish:'2028-09'}),true);
  assert.equal(dates.reviewNeeded(review,{...manual,manualSchedule:{...manual.manualSchedule,finish_certainty:'confirmed'}}),true);
  assert.equal(dates.reviewNeeded(review,agency),true);
  assert.equal(review.notes,'Keep this follow-up');
});

test('Infrastructure search matches street and linked source IDs without relying on punctuation or case', () => {
  const row = {...agency,name:'Briarcliff Avenue sidewalk',arcReferences:[{sourceId:'DK-104',limits:'North Druid Hills Road'}]};
  assert.equal(dates.matchesSearch(row,'SIDEWALK dk-104'),true);
  assert.equal(dates.matchesSearch(row,'druid briarcliff'),true);
  assert.equal(dates.matchesSearch(row,'unrelated'),false);
});
