const runtimeFile = require('./helpers/runtime-file.cjs');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const C=require(runtimeFile('trackside-reach-core.js'));
const D=require(runtimeFile('trackside-digest-core.js'));

const box=(west,south,east,north)=>[[west,south],[east,south],[east,north],[west,north],[west,south]];
const point=(lng,lat)=>({type:'Point',coordinates:[lng,lat]});
const polygon=(...rings)=>({type:'Polygon',coordinates:rings});
const zone=polygon(box(-84.45,33.75,-84.40,33.80),box(-84.43,33.77,-84.42,33.78));

test('classifies points, actual footprints, holes, and the exterior review area separately',()=>{
  assert.equal(C.classify(point(-84.44,33.76),zone).relation,'inside');
  assert.equal(C.classify(point(-84.45,33.76),zone).relation,'boundary');
  assert.equal(C.classify(point(-84.425,33.775),zone),null);
  const near=C.classify(point(-84.454,33.76),zone);
  assert.equal(near.relation,'near');
  assert.ok(near.distance>365&&near.distance<375);
  assert.equal(C.classify(point(-84.455,33.76),zone),null);
  assert.equal(C.classify(polygon(box(-84.451,33.76,-84.449,33.761)),zone).relation,'boundary');
  assert.equal(C.classify(polygon(box(-84.44,33.76,-84.41,33.79)),zone).relation,'boundary');
  assert.equal(C.classify({
    type:'MultiPolygon',coordinates:[[box(-84.448,33.762,-84.447,33.763)],[box(-84.46,33.76,-84.455,33.763)]]
  },zone).relation,'boundary');
  assert.equal(C.classify(polygon(box(-84.449,33.752,-84.448,33.753)),zone).relation,'inside');
  assert.equal(C.projectLocation({lng:-84.46,lat:33.76,parcels:[{geometry:polygon(box(-84.449,33.752,-84.448,33.753))}]}).basis,
    'Linked parcel geometry');
});

test('the converted import contains the original 12 IDs and projected Atlanta geometry',()=>{
  const window={};
  runInNewContext(readFileSync(require.resolve(runtimeFile('trackside-reach-data.js')),'utf8'),{window});
  const {source,features}=window.TRACKSIDE_REACH_DATA;
  assert.match(source.crs,/Georgia West/);
  assert.equal(source.effective_on,null);
  assert.equal(features.length,12);
  assert.equal(new Set(features.map(r=>r.id)).size,12);
  for(const feature of features){
    const [west,south,east,north]=C.bounds(feature.geometry);
    assert.ok(west<east&&south<north&&west>=-85&&east<=-83.5&&south>=33&&north<=35);
    assert.ok(feature.properties.name);
    assert.equal(Object.hasOwn(feature.properties,'source_properties'),false);
    assert.match(feature.properties.boundary_revision,/^[a-f0-9]{16}$/);
  }
});

test('a Reach watch keeps its baseline across boundary changes and reports the new revision',async()=>{
  const scope=D.scope({type:'reach',key:'301',includeBoundary:true});
  assert.equal(scope.radius,402.336);
  assert.equal(D.scope({type:'reach',key:'301'}).radius,0);
  assert.throws(()=>D.scope({type:'reach',key:'313'}));
  const timestamp='2026-11-23T12:00:00Z',w={id:'watch',name:'West Atlanta',createdAt:timestamp,scope,baseline:{}};
  const reach={id:'301',properties:{name:'West Atlanta',boundary_revision:'first'}};
  const r=D.project({id:'p1',name:'Project near the edge',longitude:-84.454,latitude:33.76});
  const items=[D.reach(reach,['Connection A'],'https://itsmarta.com/reach.aspx'),
    D.reach({...reach,id:'302'},['Connection B'],'https://itsmarta.com/reach.aspx')];
  const make=(records,matches,at=timestamp,geometry=zone)=>({at,geometry,projectMatchIds:matches,groups:{
    reach:{ok:true,items:records},projects:{ok:true,items:[r]},news:{ok:true,items:[]}
  }});
  const first=await D.snapshot(w,make(items,['p1']));
  assert.deepEqual(Object.keys(first.groups).sort(),['projects','reach']);
  assert.deepEqual(first.groups.reach.items.map(item=>item.id),['301']);
  const saved=D.reviewed(w,first);
  assert.equal(D.parse(JSON.stringify({version:1,watches:[saved]}))[0].scope.includeBoundary,true);
  const updated=D.reach({...reach,properties:{...reach.properties,boundary_revision:'second'}},
    ['Connection A updated'],'https://itsmarta.com/reach.aspx');
  const latest=await D.snapshot(saved,make([updated,items[1]],[],'2026-11-24T12:00:00Z',
    polygon(box(-84.445,33.75,-84.40,33.80))));
  const digest=D.changes(saved,latest);
  assert.equal(digest.coverageChanged,false);
  assert.deepEqual(digest.items.find(item=>item.record.type==='reach').fields.map(f=>f.key),['reach_boundary','reach_connections']);
  assert.equal(digest.items.find(item=>item.record.id==='p1').kind,'left-area');
});
