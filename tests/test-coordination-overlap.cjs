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
assert.match(C.matchSummary(byId.intersecting), /Mapped geometry meets the route · Comparison dates incomplete/);
assert.match(C.matchSummary({...shared,distance:54.864},route.name), /180 ft from Buford ART · Potential schedule overlap/);
assert.match(C.matchSummary(complete.rows.find(item => item.row.id === 'unknown')), /Project finish unknown/);
assert.match(C.matchSummary({...byId.invalid,distance:1,row:{...byId.invalid.row,geometryBasis:'Representative project point'}}), /Representative point 3 ft from the route · Dates need review/);
assert.match(C.matchSummary({...shared,row:{...shared.row,source:{kind:'arc'}}}), /Planning area meets the route/);
assert.match(C.matchSummary(service.rows.find(item => item.row.id === 'intersecting')), /Potential impact/);
assert.equal(C.proximityLabel(0.001),'1 ft from the route');
const D = require(path.join(runtime, 'trackside-infrastructure-dates.js'));
const H = require(path.join(runtime, 'trackside-coordination-hotspots-core.js'));
const suppliedRoute = {...route,kind:'rapid',remoteId:26,name:'Updated Clifton'};
const routeSource = 'https://example.gov/corridor';
const snapshot = {route_slug:'clifton-brt',construction_start:'2028-07',start_label:'July 2028 (estimated)',construction_finish:'2029-12',source_url:routeSource};
assert.equal(C.resolveSchedule(suppliedRoute,new Map(),[snapshot],'Clifton BRT'),snapshot);
const live = {...snapshot,construction_finish:null};
assert.equal(C.resolveSchedule(suppliedRoute,new Map([['26',live]]),[snapshot],'Clifton BRT'),live);
assert.equal(D.routeConstructionLabel(snapshot,'start'),'July 2028 (estimated)');
assert.equal(D.routeConstructionLabel(live,'finish'),'Not published');
const source_url = 'https://example.gov/work';
const sidewalk = {...project('Sidewalk','2028-05','2028-10'),sourceId:'123',source:{kind:'atlanta'},scheduleType:'Anticipated construction'};
const edit = value => D.apply(sidewalk,D.validate({construction_finish:value,finish_certainty:'confirmed',source_url},sidewalk));
const initial = H.screenRoute(suppliedRoute,snapshot,[edit('2028-10')]);
assert.equal(C.overlapLabel(initial[0].overlap),'Jul 2028 – Oct 2028');
assert.equal(H.model(initial).overlaps,1);
const updated = H.screenRoute(suppliedRoute,snapshot,[edit('2028-06')]);
assert.equal(updated[0].state,'outside');
assert.equal(H.model(updated).outside,1);
assert.equal(H.model(updated).overlaps,0);
assert.equal(H.model(updated,{timing:'outside'}).projects[0].row.id,sidewalk.id);
assert.equal(H.model(updated,{timing:'overlap'}).projects.length,0);
assert.match(D.endpointLabel(updated[0].row,'finish'),/Jun 2028 \(manual, confirmed\)/);
assert.ok(D.projectDateSources(updated[0].row,'https://example.gov/feed').some(source=>source.url===source_url));
const datedFulton = {...sidewalk,source:{kind:'fulton'},scheduleType:'Estimated project start / construction finish'};
const areaWork = H.screenRoute(suppliedRoute,snapshot,[datedFulton]);
assert.equal(areaWork[0].state,'unknown');
assert.equal(C.projectWindow(datedFulton).kind,'finish-only');
assert.equal(D.endpointLabel(datedFulton,'start'),'Not published');
assert.equal(C.timelineModel({rows:areaWork}).items[0].window.kind,'finish-only');
assert.equal(H.screenRoute(suppliedRoute,live,[sidewalk])[0].state,'reference-needed');
console.log('Coordination overlap evidence checks passed.');

