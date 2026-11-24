const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const relative=fs.existsSync(path.resolve(__dirname,'../outputs/index.html'))?'../outputs':'..';
const C=require(relative+'/trackside-area-core.js');
test('Master plans remain visible and do not add their buildout a second time',()=>{
 const master={id:'regional-19',status:'Construction',residentialUnits:2000,retailSpaceSqFt:900000};
 const mitchell={id:'regional-29',status:'Complete',residentialUnits:304,retailSpaceSqFt:16500};
 const phoenix={id:'regional-16',status:'Complete',projectType:'Commercial',residentialUnits:0,hotelUnits:292,retailSpaceSqFt:11000};
 const summary=C.summarize([master,mitchell,phoenix,mitchell]);
 assert.equal(summary.rows.length,3);
 assert.equal(summary.masterPlans[0].units,2000);
 assert.equal(summary.units,304);
 assert.equal(summary.hotel,292);
 assert.equal(summary.retail,27500);
 assert.equal(summary.stages.Construction.rows.length,0);
 assert.deepEqual(summary.stages.Complete.rows.map(row=>row.project.id),['regional-29','regional-16']);
 assert.equal(C.summarize([master]).known,0);
});
test('The housing denominator distinguishes unknown, non-housing and reported zero',()=>{
 const input=[{id:'a',projectType:'Mixed-use',status:'Planning',residentialUnits:0},
 {id:'b',projectType:'Commercial',status:'Complete',residentialUnits:0},
 {id:'c',projectType:'Residential',status:'Planning',residentialUnits:0,metadata:{reported_residential_units:0}},
 {id:'d',projectType:'Residential',status:'Construction',residentialUnits:130}];
 const s=C.summarize(input);
 assert.deepEqual([s.known,s.unknown,s.nonHousing,s.units],[2,1,1,130]);
 assert.deepEqual([s.stages.Planning.known,s.stages.Planning.unknown],[1,1]);
 assert.equal(C.housing(input[0]),null);
});
test('Affordability requires its own source and keeps explicit zero separate from missing',()=>{
 assert.equal(C.affordability({residentialUnits:130,metadata:{affordability:{units:100}}}),null);
 const garson={id:'overlook-garson',residentialUnits:130};
 assert.equal(C.affordability(garson).units,130);
 assert.match(C.affordability(garson).levels,/50%, 60% and 80%/);
 assert.equal(C.projectScale(garson),'130 affordable homes');
 assert.equal(C.affordability({...garson,residentialUnits:131}),null);
 assert.equal(C.affordability({metadata:{affordability:{units:0,source_url:'https://example.org'}}}).units,0);
 assert.equal(C.affordability({residentialUnits:10,metadata:{affordability:{units:11,source_url:'https://example.org'}}}).units,null);
});
test('Explore sorting is stable, retains all matches and leaves canonical ordering intact',()=>{
 const list=[{name:'B',residentialUnits:0},{name:'A',residentialUnits:32},{name:'C',residentialUnits:80}];
 assert.deepEqual(C.orderedProjects(list,'homes').map(p=>p.name),['C','A','B']);
 assert.deepEqual(C.orderedProjects(list,'distance',{distance:p=>p.name==='B'?42:Infinity}).map(p=>p.name),['B','A','C']);
 assert.deepEqual(list.map(p=>p.name),['B','A','C']);
});
