const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = fs.existsSync(path.join(__dirname,'../outputs/index.html')) ? '../outputs' : '..';
const asset = name => path.join(__dirname,runtime,name);
const { classify, siteLocations } = require(asset('trackside-city-limits.js'));
const view = require(asset('trackside-map-view-core.js'));
const sr2t = require(asset('trackside-sr2t-state.js'));
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(asset('trackside-city-limits-data.js'),'utf8'),context);
const catalog = context.window.TracksideCityLimitsData;
const decatur = [-84.2969,33.7748];
const jonesboro = [-84.354,33.5215];

function square(west,south,east,north){
 return [[west,south],[east,south],[east,north],[west,north],[west,south]];
}
function area(name,bounds,holes=[]){
 return {name,bounds,geometry:{type:'Polygon',coordinates:[square(...bounds),...holes]}};
}

test('Census snapshot includes all three counties and identifies city and county separately',()=>{
 assert.equal(catalog.cities.length,catalog.display.features.length);
 assert.equal(new Set(catalog.cities.map(city=>city.id)).size,catalog.cities.length);
 assert.deepEqual(Array.from(catalog.counties.map(c=>c.name)).sort(),['Clayton County','DeKalb County','Fulton County']);
 assert.equal(classify(decatur,catalog),'Decatur · DeKalb County');
 assert.equal(classify(jonesboro,catalog),'Jonesboro · Clayton County');
 assert.equal(classify([-84.39,33.75],catalog),'Atlanta · Fulton County');
 assert.equal(classify([-84.34,33.745],catalog),'Atlanta · DeKalb County');
});

test('Municipal holes remain unincorporated and a boundary hit is unverified',()=>{
 const local={counties:[area('Example County',[0,0,10,10])],cities:[area('Example City',[1,1,9,9],[square(3,3,4,4)])]};
 assert.equal(classify([2,2],local),'Example City · Example County');
 assert.equal(classify([3.5,3.5],local),'Unincorporated Example County');
 assert.equal(classify([3,3.5],local),'Example County · City limits unverified');
 assert.equal(classify([0,4],local),'Jurisdiction unverified');
 assert.equal(classify([11,5],local),'Jurisdiction unverified');
 assert.equal(classify([2,2],null),'Jurisdiction unverified');
});

test('SR2T lists the geography of each linked stop and searches city and county',()=>{
 const stops=[{number:'101',stop_id:'a'},{number:'102',stop_id:'b'},{number:'103',stop_id:'c',network_fingerprint:'old'}];
 const site={site_id:'sample',is_published:true,profile:{name:'Sample',stops}};
 const location=siteLocations(site,[{...stops[0],coordinates:decatur},{...stops[1],coordinates:jonesboro}],catalog);
 assert.deepEqual(location.stops,['Decatur · DeKalb County','Jonesboro · Clayton County','Jurisdiction unverified']);
 assert.equal(location.summary,location.stops.join(' / '));
 for(const search of ['decatur','clayton county','103']) assert.deepEqual(sr2t.filter([site],{search},false,false,()=>location.summary),[site]);
 assert.deepEqual(sr2t.filter([{...site,is_published:false}],{search:'decatur'},false,false,()=>location.summary),[]);
});

test('Map sharing remembers City limits independently from the service-area outlines',()=>{
 const state={v:1,map:[33.75,-84.39,12],layers:{boundaries:false,cities:true}};
 const restored=view.readUrl(view.buildUrl('https://example.test/tracker/',state));
 assert.equal(restored.layers.cities,true);
 assert.equal(restored.layers.boundaries,false);
 assert.equal(view.normalize({...state,layers:{}}).layers.cities,false);
});
