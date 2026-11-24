const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const runtime=fs.existsSync(path.join(__dirname,'../outputs/index.html'))?'../outputs':'..';
const C=require(runtime+'/trackside-walk-core.js');
const node=(id,lon,lat,tags={})=>({id,lon,lat,tags,type:'node'});
const pathWay=(id,nodes,tags={})=>({id,nodes,tags:{highway:'footway',...tags},type:'way'});
const rail={railway:'subway_entrance'};
const here=[0,0], station=[.002,0];
test('Trace follows connected coordinates in the permitted walking direction',()=>{
 const nodes=[node(1,0,0),node(2,.001,0),node(3,.002,0,rail)];
 const eastbound=C.build({elements:[...nodes,pathWay(1,[1,2,3],{'oneway:foot':'yes'})]});
 const westbound=C.build({elements:[...nodes,pathWay(1,[1,2,3],{'oneway:foot':'-1'})]});
 const route=C.railEntranceAccess(eastbound,here,station);
 assert.equal(route.entranceId,3);
 assert.deepEqual(route.coordinates,[[0,0],[.001,0],[.002,0]]);
 assert.equal(C.railEntranceAccess(westbound,here,station),null);
});
test('A disconnected close path does not prevent using a connected nearby path with an unverified gap',()=>{
 const graph=C.build({elements:[
  node(1,0,.0002),node(2,.001,.0002),node(3,.002,.0002,rail),pathWay(1,[1,2,3]),
  node(4,0,0),node(5,.001,0),pathWay(2,[4,5]),
 ]});
 const result=C.railEntranceAccess(graph,here,station);
 assert.ok(result.gapMeters>20&&result.gapMeters<25);
 assert.ok(result.meters>220&&result.meters<225);
 assert.deepEqual(result.coordinates[0],[0,.0002]);
 assert.equal(C.railEntranceAccess(graph,[0,-.001],station),null);
});
test('Exit-only nodes are not used as station entrances',()=>{
 const graph=C.build({elements:[node(1,0,0),node(2,.002,0,{...rail,entrance:'exit'}),pathWay(1,[1,2])]});
 assert.equal(C.railEntranceAccess(graph,here,station),null);
});
test('Bus traces follow only mapped connected sidewalks and crossings and exclude both endpoint gaps',()=>{
 const graph=C.build({elements:[
  node(1,0,0),node(2,.001,0),node(3,.001,.0001),node(4,.002,.0001),
  pathWay(1,[1,2],{footway:'sidewalk'}),pathWay(2,[2,3],{footway:'crossing'}),pathWay(3,[3,4],{footway:'sidewalk'}),
  pathWay(4,[1,4])
 ]},{sidewalksOnly:true});
 const result=C.busStopAccess(graph,[0,-.0001],[.0019,.0002]);
 assert.equal(graph.edges.length,3);
 assert.deepEqual(result.coordinates.slice(0,-1),[[0,0],[.001,0],[.001,.0001]]);
 assert.ok(C.distance(result.coordinates.at(-1),[.0019,.0001])<.01);
 assert.ok(result.meters>221&&result.meters<223);
 assert.ok(result.gapMeters>11&&result.stopGapMeters>11);
 assert.equal(C.busStopAccess(graph,[0,-.0001],[.0019,.0004]),null);
});
test('Bus traces support a stop on a single sidewalk edge and honor direction',()=>{
 const graph=C.build({elements:[
  node(1,0,0),node(2,.002,0),pathWay(1,[1,2],{footway:'sidewalk','oneway:foot':'yes'})
 ]},{sidewalksOnly:true});
 const result=C.busStopAccess(graph,[.0002,0],[.0016,0]);
 assert.ok(result.meters>155&&result.meters<157);
 assert.equal(C.busStopAccess(graph,[.0016,0],[.0002,0]),null);
});
test('A road, prohibited crossing or untagged footway cannot bridge two sidewalk components',()=>{
 for(const connector of [{highway:'residential',sidewalk:'both'},{footway:'crossing',foot:'no'},{}]){
  const graph=C.build({elements:[
   node(1,0,0),node(2,.001,0),node(3,.001,.0001),node(4,.002,.0001),
   pathWay(1,[1,2],{footway:'sidewalk'}),pathWay(2,[2,3],connector),pathWay(3,[3,4],{footway:'sidewalk'})
  ]},{sidewalksOnly:true});
  assert.equal(C.busStopAccess(graph,[0,0],[.002,.0001]),null);
 }
});
test('Sidewalk lines touching on screen stay disconnected without a shared source node',()=>{
 const graph=C.build({elements:[
  node(1,0,0),node(2,.001,0),node(3,.001,0),node(4,.002,0),
  pathWay(1,[1,2],{footway:'sidewalk'}),pathWay(2,[3,4],{footway:'sidewalk'})
 ]},{sidewalksOnly:true});
 assert.equal(C.busStopAccess(graph,[0,0],[.002,0]),null);
});
test('Stop choices are classified through local bus direction relationships',()=>{
 const stop=(id)=>({stop_id:id,stop_name:'Stop '+id,geometry:{type:'Point',coordinates:[0,0]}});
 const data={stops:['0001','0102','003','04'].map(stop),
  directions:[{dir_id:'a',line_id:'10'},{dir_id:'b',line_id:'2'},{dir_id:'r',line_id:'red'},{dir_id:'c',line_id:'street'}],
  relationships:[{dir_id:'a',stop_id:'0001'},{dir_id:'b',stop_id:'0001'},{dir_id:'r',stop_id:'0001'},
   {dir_id:'r',stop_id:'0102'},{dir_id:'c',stop_id:'003'}]};
 const routes=[{line_id:'10',number:'10',mode:'local_bus'},{line_id:'2',number:'2',mode:'local_bus'},
  {line_id:'red',number:'Red',mode:'rail'},{line_id:'street',number:'Streetcar',mode:'streetcar'}];
 assert.deepEqual(C.localBusStops(data,routes),[{id:'0001',name:'Stop 0001',point:[0,0],routes:['2','10']}]);
});
test('Bus diagnostics distinguish project, stop, missing sidewalk data and a reachable mapped extent',()=>{
 const sidewalk=pathWay(1,[1,2],{footway:'sidewalk'}),nodes=[node(1,0,0),node(2,.001,0),node(3,.0012,.0003),node(4,.002,.0003)];
 const graph=C.build({elements:[...nodes,sidewalk,pathWay(3,[3,4],{footway:'sidewalk'})]},{sidewalksOnly:true});
 const start=[0,0],stop=[.002,.0003];
 const projectGap=C.busStopAssessment(graph,[0,-.0005],stop);
 assert.equal(projectGap.state,'project-gap');
 assert.deepEqual(projectGap.mapPoint,[0,-.0005]);
 assert.ok(projectGap.projectGapMeters>55&&projectGap.projectGapMeters<56);
 const stopGap=C.busStopAssessment(graph,start,[.002,.0007]);
 assert.equal(stopGap.state,'stop-gap');
 assert.deepEqual(stopGap.mapPoint,[.002,.0007]);
 assert.ok(stopGap.stopGapMeters>44&&stopGap.stopGapMeters<45);
 assert.deepEqual(C.busStopAssessment(graph,start,stop),{state:'disconnected',mapPoint:[.001,0],stopPoint:stop});
 const untagged=C.build({elements:[...nodes,pathWay(1,[1,2])]},{sidewalksOnly:true});
 assert.equal(C.busStopAssessment(untagged,start,stop).state,'no-sidewalks');
});
