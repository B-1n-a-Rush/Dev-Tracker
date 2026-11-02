const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const root=path.resolve(__dirname,'../..'),runtime=fs.existsSync(path.join(root,'outputs/index.html'))?path.join(root,'outputs'):root,C=require(path.join(runtime,'trackside-land-core.js'));
function harness(options={}){
  const registry=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.handlers={};this._text='';this._value='';this.style={};this.hidden=false;this.checked=false;this.disabled=false;this.className='';this.classList={add(){},remove(){}};}
    set id(v){this._id=v;registry.set(v,this);}get id(){return this._id;}
    set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent||'').join(' ');}
    set innerHTML(html){this.children=[];const re=/<([a-z]+)\b([^>]*)>/gi;let m;while((m=re.exec(html))){const id=m[2].match(/\bid="([^"]+)"/);if(id){const e=new Element(m[1]);e.id=id[1];this.append(e);if(e.tagName==='SELECT'){const end=html.indexOf('</select>',re.lastIndex);const opts=html.slice(re.lastIndex,end);for(const option of opts.matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)/g))e.add(new Option(option[2],option[1]??option[2]));const chosen=opts.match(/<option value="([^"]*)" selected/);if(chosen)e.value=chosen[1];}}}}
    append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}after(item){this.parentElement?.append(item);}before(item){this.parentElement?.append(item);}
    replaceChildren(...items){this._text='';this.children=[];this.append(...items);}replaceWith(item){const p=this.parentElement;if(p){const i=p.children.indexOf(this);if(i>=0){p.children[i]=item;item.parentElement=p;}}}
    addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}async fire(name){for(const f of this.handlers[name]||[])await f({target:this});}click(){return this.fire('click');}
    setAttribute(){}scrollIntoView(){}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);if(this.id)registry.delete(this.id);}
    get options(){return this.children.filter(c=>c.tagName==='OPTION');}add(o){this.append(o);}set value(v){this._value=String(v);}get value(){return this._value||this.options?.[0]?._optionValue||'';}
    querySelector(sel){if(sel.startsWith('#'))return registry.get(sel.slice(1));const cls=sel.slice(1);const walk=x=>x.children.find(c=>c.className.split(' ').includes(cls))||x.children.map(walk).find(Boolean);return walk(this);}
  }
  function Option(label,value){const e=new Element('option');e._text=String(label);e._optionValue=String(value);return e;}
  const aside=new Element('aside');const panel=new Element();panel.id='mapLayersPanel';const head=new Element();head.className='map-layers-head';panel.append(head);
  for(const id of ['mapLayersCount','mapLayersButton','placeholder','detail','stationDetail','corridorDetail','studyAreaDetail','scenarioDetail']){const e=new Element();e.id=id;}
  class Layer{
    constructor(data){this.data=data;this.items=[];this.events={};}addTo(parent){parent.addLayer(this);return this;}addLayer(item){this.items.push(item);return this;}clearLayers(){this.items=[];return this;}addData(data){this.data=data;return this;}bindTooltip(){return this;}on(name,fn){this.events[name]=fn;return this;}setStyle(){return this;}getBounds(){return {isValid:()=>true};}
  }
  const fixture={type:'Feature',geometry:{type:'LineString',coordinates:[[-84.4,33.7],[-84.2,33.9]]},properties:{OBJECTID:1,PROJECT_NUMBER:12,FUNDING_PROJECT_NAME:'Test sidewalk',PROJECT_CATEGORY:'Sidewalks',RATL_STATUS:'Construction',CONSTRUCTION_START_DATE:Date.UTC(2026,0,1),CONSTRUCTION_COMPLETION_DATE:Date.UTC(2027,0,1)}};
  const fetchMock=async url=>{
    if(options.fetch)return options.fetch(url);
    const u=String(url);if(options.failAll)throw Error('Test source unavailable');
    if(options.locationFailure&&u.includes('/resource/bcjt-asar'))throw Error('Test location outage');
    if(u.includes('/resource/wab3-52sv'))return {ok:true,json:async()=>options.fultonRecords||[{project_id:'CSF- 02',project_name_title:'Station access sidewalk',city:'City of South Fulton',current_stage_of_project:'Design',project_type:'Pedestrian improvements',estimated_start_date_for:'May, 2026',estimated_construction:'December, 2027'},{project_id:'CSF- 3',project_name_title:'Citywide improvements',city:'City of South Fulton',current_stage_of_project:'Design'}]};
    if(u.includes('/resource/bcjt-asar'))return {ok:true,json:async()=>[{project_id:'CSF-2',project_na:'Station access sidewalk',the_geom:{type:'Point',coordinates:[-84.3,33.8]}}]};
    if(u.includes('/api/views/'))return {ok:true,json:async()=>({rowsUpdatedAt:Date.UTC(2022,0,1)/1000})};
    if(u.includes('/ARC_MTP/')){if(options.arcFailure)throw Error('Test ARC outage');return {ok:true,json:async()=>u.includes('/query')?{type:'FeatureCollection',features:options.arcFeatures||[]}:{fields:[]}};}
    return {ok:true,json:async()=>u.includes('GeopoliticalArea')?{features:[]}:u.includes('/query')?{type:'FeatureCollection',features:[fixture]}:{fields:[]}};
  };
  const exportBlobs=[];
  class ExportURL extends URL{static createObjectURL(blob){exportBlobs.push(blob);return 'blob:test-'+exportBlobs.length;}static revokeObjectURL(){}}
  const context={console,setTimeout,clearTimeout,URL:options.captureExports?ExportURL:URL,URLSearchParams,Blob,AbortSignal,Option,fetch:fetchMock,document:{createElement:t=>new Element(t),getElementById:id=>registry.get(id)||null,querySelector:()=>aside},L:{geoJSON:d=>new Layer(d),layerGroup:()=>new Layer(),circleMarker:()=>new Layer(),DomEvent:{stopPropagation(){}}},map:{addLayer(){},removeLayer(){},fitBounds(){},getZoom:()=>17,getBounds:()=>({getWest:()=>-84.4,getEast:()=>-84.2,getSouth:()=>33.7,getNorth:()=>33.9})},parcelSources:[],parcelLayer:new Layer(),parcelsEnabled:options.enableParcels!==false,parcelMinimumZoom:16,parcelSelectionMode:false,draftParcels:[],selected:null,parcelStyle:()=>({}),parcelKey:p=>p.county+':'+p.id,updateParcelState(){},setParcelLayerHelp(){},setDetailDrawerOpen(){},syncSelectedProjectUrl(){},setPage(){},updateMapLayersCount(){},selectedCorridor:()=>null,railLines:[{name:'Test rail',points:[[33.7,-84.4],[33.9,-84.2]]}],brtArtRoutes:[],routePointParts:r=>[r.points],TracksideLandCore:C};
  for(const name of ['show','showStationOverview','showCorridorOverview','showStudyAreaOverview','showScenarioComparison','clearDetailPanel'])context[name]=()=>{};
  context.window=context;vm.createContext(context);
  return {context,registry,fixture,exportBlobs};
}

module.exports={harness};
