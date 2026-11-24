/* Map display and geographic lookup for the same Census snapshot. */
(function(){
'use strict';
const unverified='Jurisdiction unverified';

function ringPosition([x,y],ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [ax,ay]=ring[j],[bx,by]=ring[i];
  const dx=bx-ax,dy=by-ay,scale=Math.max(Math.abs(dx),Math.abs(dy));
  if(scale&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by)
    &&Math.abs((x-ax)*dy-(y-ay)*dx)<=1e-10*scale)return 2;
  if((ay>y)!==(by>y)&&x<ax+dx*(y-ay)/dy)inside=!inside;
 }
 return Number(inside);
}
function polygonPosition(point,[outside,...holes]){
 const position=ringPosition(point,outside);
 if(position!==1)return position;
 for(const hole of holes){
  const inner=ringPosition(point,hole);
  if(inner)return inner===2?2:0;
 }
 return 1;
}
function matches(point,areas){
 return areas.flatMap(area=>{
  const [x,y]=point,[west,south,east,north]=area.bounds;
  if(x<west||x>east||y<south||y>north)return [];
  const {type,coordinates}=area.geometry;
  const polygons=type==='Polygon'?[coordinates]:coordinates;
  const position=Math.max(...polygons.map(polygon=>polygonPosition(point,polygon)));
  return position?[{name:area.name,position}]:[];
 });
}
function classify(point,catalog){
 if(!catalog||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))return unverified;
 const counties=matches(point,catalog.counties);
 if(counties.length!==1||counties[0].position!==1)return unverified;
 const county=counties[0].name,cities=matches(point,catalog.cities);
 if(!cities.length)return 'Unincorporated '+county;
 if(cities.length!==1||cities[0].position!==1)return county+' · City limits unverified';
 return cities[0].name+' · '+county;
}
function siteLocations(site,mappedStops,catalog){
 const stopKey=stop=>JSON.stringify([stop.number,stop.stop_id,stop.network_fingerprint]);
 const matches=new Map(mappedStops.map(stop=>[stopKey(stop),stop.coordinates]));
 const stops=site.profile.stops.map(stop=>classify(matches.get(stopKey(stop)),catalog));
 const labels=[...new Set(stops)];
 return {summary:labels.join(' / ')||unverified,stops};
}

if(typeof module==='object'&&module.exports){
 module.exports={classify,siteLocations};
 return;
}
const checkbox=document.getElementById('layerCityLimits');
const status=document.getElementById('cityLimitsStatus');
const cityLayer=L.layerGroup();
const labels=L.layerGroup().addTo(cityLayer);
const baseStatus='Incorporated municipalities';
let catalog=null,request=null,outlinesReady=false;
function load(){
 if(catalog)return Promise.resolve(catalog);
 if(request)return request;
 request=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  let settled=false;
  const finish=(data)=>{
   if(settled)return;
   settled=true;
   clearTimeout(timeout);
   script.remove();
   if(data?.version!==1||data.counties?.length!==3||!data.cities?.length||data.display?.features?.length!==data.cities.length){
    reject(Error('City limits data could not load.'));
    return;
   }
   catalog=data;
   resolve(data);
  };
  const timeout=setTimeout(()=>finish(null),12000);
  script.src=new URL('trackside-city-limits-data.js?v=20261124',document.baseURI).href;
  script.onload=()=>finish(window.TracksideCityLimitsData);
  script.onerror=()=>finish(null);
  document.head.append(script);
 }).finally(()=>{request=null;});
 return request;
}
function drawLabels(){
 labels.clearLayers();
 if(!catalog||!map.hasLayer(cityLayer)||map.getZoom()<13)return;
 const extent=map.getBounds();
 for(const feature of catalog.display.features){
  const [lng,lat]=feature.properties.labelPoint,position=[lat,lng];
  if(!extent.contains(position))continue;
  const name=document.createElement('span');
  name.textContent=feature.properties.name;
  L.tooltip({permanent:true,direction:'center',className:'city-limit-name',interactive:false})
    .setLatLng(position).setContent(name).addTo(labels);
 }
}
function refreshControls(){
 updateMapLayersCount();
 window.TracksideMapLegend?.refresh();
}
async function setVisible(enabled){
 checkbox.checked=enabled;
 if(!enabled){
  map.removeLayer(cityLayer);
  labels.clearLayers();
  status.textContent=baseStatus;
  refreshControls();
  return;
 }
 status.textContent='Loading city limits…';
 refreshControls();
 try{
  const data=await load();
  if(!checkbox.checked)return;
  if(!outlinesReady){
   L.geoJSON(data.display,{
    pane:'serviceAreaPane',interactive:false,attribution:'City limits © U.S. Census Bureau',
    style:{color:'#66517d',weight:1.5,opacity:.86,fill:false,dashArray:'2 5'}
   }).addTo(cityLayer);
   outlinesReady=true;
  }
  cityLayer.addTo(map);
  status.textContent=data.cities.length+' cities · U.S. Census Bureau';
  drawLabels();
 }catch(error){
  if(checkbox.checked){
   checkbox.checked=false;
   status.textContent='City limits unavailable. Select to retry.';
   refreshControls();
  }
  throw error;
 }
 refreshControls();
}
function saveVisibility(){
 try{saveMapLayerPreferences();}catch{refreshControls();}
}
checkbox.addEventListener('change',()=>{
 void setVisible(checkbox.checked).catch(()=>{}).finally(saveVisibility);
});
map.on('moveend zoomend',drawLabels);
window.TracksideCityLimits=Object.freeze({load,siteLocations,setVisible,get visible(){return map.hasLayer(cityLayer);}});
if(readMapLayerPreferences().cities)void setVisible(true).catch(saveVisibility);
})();
