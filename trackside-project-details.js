/* React owns profile content; the native action/footer and record services keep their contracts. */
(function(){'use strict';const detail=document.getElementById('detail'),E=window.TracksideEditorReact,S=window.TracksideProjectProfileState;if(!detail||!E||!S)return;
const nativeActions=detail.querySelector('.detail-actions'),save=document.getElementById('saveProjectToggle'),footer=document.createElement('div'),root=document.createElement('div');root.id='projectReactRoot';footer.className='detail-body project-native-actions';footer.append(nativeActions,save);detail.replaceChildren(root,footer);

const walkSection=document.createElement('section');
walkSection.className='project-walk-summary';
walkSection.hidden=true;
const reachSection=document.createElement('section');
reachSection.hidden=true;
footer.prepend(walkSection,reachSection);
const walkPane=map.createPane('projectWalkingPath');
walkPane.style.zIndex='475';
const walkLayer=L.layerGroup().addTo(map);
let walkKey=null,walkTimer=null,walkRun=0,walkMode='rail';
const clearWalkPreview=document.createElement('button');
clearWalkPreview.type='button';
clearWalkPreview.className='walk-button';
clearWalkPreview.textContent='Clear walking preview';
clearWalkPreview.hidden=true;
clearWalkPreview.addEventListener('click',resetWalkingPreview);
function resetWalkingPreview(){
 walkLayer.clearLayers();
 clearWalkPreview.hidden=true;
}
function openWalkingPreview(draw){
 const checkbox=walkSection.querySelector('.project-walk-toggle input');
 if(checkbox?.checked){checkbox.checked=false;checkbox.dispatchEvent(new Event('change'));}
 resetWalkingPreview();
 clearWalkPreview.hidden=false;
 if(matchMedia('(max-width: 720px)').matches)setDetailDrawerOpen(false);
 draw();
}
function showWalkingGap(point,label){
 openWalkingPreview(()=>{
  const position=[point[1],point[0]];
  L.circleMarker(position,{pane:'projectWalkingPath',radius:9,color:'#a4510f',weight:3,fillColor:'#fff',fillOpacity:.9,
   className:'project-walk-diagnostic'}).bindTooltip(label,{permanent:true,direction:'top'}).addTo(walkLayer);
  map.setView(position,Math.max(16,map.getZoom()));
 });
}
function drawWalkingPath(projectPoint,result,stop){
 walkLayer.clearLayers();
 const path=result.coordinates.map(([lng,lat])=>[lat,lng]);
 const options={pane:'projectWalkingPath',interactive:false,lineCap:'round',lineJoin:'round'};
 if(path.length>1){
  L.polyline(path,{...options,color:'#fff',weight:9,opacity:.95,className:'project-walk-casing'}).addTo(walkLayer);
  L.polyline(path,{...options,color:'#4632a8',weight:5,className:'project-walk-path'}).addTo(walkLayer);
 }
 const projectLatLng=[projectPoint[1],projectPoint[0]];
 if(!stop&&result.gapMeters>1)L.polyline([projectLatLng,path[0]],{...options,color:'#384760',weight:3,dashArray:'3 7',className:'project-walk-gap'}).addTo(walkLayer);
 const bounds=L.latLngBounds([projectLatLng,...path]);
 if(stop){
  const stopLatLng=[stop.point[1],stop.point[0]];
  L.circleMarker(stopLatLng,{...options,radius:9,fill:false,color:'#a4510f',weight:3,className:'project-walk-bus-stop'}).addTo(walkLayer);
  bounds.extend(stopLatLng);
 }
 L.circleMarker(path.at(-1),{...options,radius:6,fillColor:'#4632a8',color:'#fff',fillOpacity:1,weight:2,className:'project-walk-entrance'}).addTo(walkLayer);
 map.fitBounds(bounds,{padding:[40,40],maxZoom:17});
}
function walkField(text,control){
 const label=document.createElement('label');
 label.className='project-walk-field';
 label.append(document.createTextNode(text),control);
 return label;
}
function presentWalkingResult(host,status,point,result,run,{stop,sourceDate}={}){
 const minutes=Math.round(result.minutes),summary=document.createElement('strong'),source=document.createElement('a');
 summary.textContent=(minutes>0?'About '+minutes+' min':'Under 1 min')+' · '+(result.meters/1609.344).toFixed(2)+' mi'+
  (stop?' on mapped sidewalks and crossings':' on mapped paths');
 source.href=stop?'https://www.openstreetmap.org/copyright':'https://www.openstreetmap.org/node/'+result.entranceId;
 source.target='_blank';
 source.rel='noopener noreferrer';
 source.textContent=stop?'OpenStreetMap sidewalk data'+(/^\d{4}-\d{2}-\d{2}/.test(sourceDate||'')?' · '+sourceDate.slice(0,10):'')+' ↗':'Mapped entrance (OpenStreetMap) ↗';
 let gap;
 if(stop){
  const gaps=[];
  if(result.gapMeters>1)gaps.push(Math.round(result.gapMeters*3.28084)+' ft from the project pin');
  if(result.stopGapMeters>1)gaps.push(Math.round(result.stopGapMeters*3.28084)+' ft to the stop point');
  gap=gaps.length?'Unverified gaps excluded from the estimate: '+gaps.join(' and ')+'.':'The estimate covers the mapped route to the stop.';
 }else{
  gap=result.gapMeters>1?Math.round(result.gapMeters*3.28084)+' ft unmapped or unverified between the project pin and path start. This distance is excluded from the time.':'The estimate begins at the mapped path near the project pin.';
 }
 status.replaceChildren(summary,document.createElement('br'),document.createTextNode(gap),document.createElement('br'),source);
 const label=document.createElement('label'),control=document.createElement('input'),key=document.createElement('p');
 label.className='project-walk-toggle';
 control.type='checkbox';
 key.textContent=stop?'Purple line: mapped sidewalk route. Orange ring: bus stop location.':'Solid line: mapped walk. Dotted line: unverified gap.';
 key.hidden=true;
 label.append(control,document.createTextNode('Show walking route on map'));
 control.addEventListener('change',()=>{
  if(walkRun!==run)return;
  key.hidden=!control.checked;
  if(control.checked){
   clearWalkPreview.hidden=true;
   if(matchMedia('(max-width: 720px)').matches)setDetailDrawerOpen(false);
   drawWalkingPath(point,result,stop);
  }else walkLayer.clearLayers();
 });
 host.append(label,key);
}
async function showBusWalking(host,heading,status,point,run,service,context){
 heading.textContent='Walking to a local bus stop';
 status.textContent='Loading nearby local bus stops…';
 try{
  const inventory=await service.nearbyBusStops(point);
  if(walkRun!==run)return;
  if(!inventory.stops.length){
   status.textContent='No mapped local bus stops were found within ½ mile of this project pin.';
   return;
  }
  const choice=document.createElement('select'),details=document.createElement('p'),network=document.createElement('p');
  const paths=document.createElement('div'),estimate=document.createElement('p');
  estimate.setAttribute('role','status');
  for(const stop of inventory.stops)choice.add(new Option(stop.name+' · '+stop.id,stop.id));
  network.textContent=inventory.verified?'Stops from '+inventory.name+'.':'Stops from '+inventory.name+' · service unverified.';
  status.remove();
  host.append(walkField('Nearby local bus stop',choice),details,network,paths);
  async function route(){
   const attempt=++walkRun;
   const stop=inventory.stops[choice.selectedIndex];
   resetWalkingPreview();
   paths.replaceChildren(estimate);
   details.textContent=(stop.meters/1609.344).toFixed(2)+' mi straight-line'+(stop.routes.length?' · Bus '+stop.routes.join(', '):'');
   estimate.textContent='Checking saved sidewalks and crossings…';
   try{
    const result=await service.estimateBusStop(point,stop.point);
    if(walkRun!==attempt)return;
    if(result.state==='found')presentWalkingResult(paths,estimate,point,result.trace,attempt,{stop,sourceDate:result.sourceDate});
    else{
     const comparison=window.TracksideWalkCompare;
     estimate.textContent='Walking time unavailable. '+comparison.reason(result);
     paths.append(comparison.gapActions(context,stop,result,context.onGap,context.onReport));
    }
   }catch{
    if(walkRun===attempt)estimate.textContent='Walking time unavailable. Saved sidewalk data could not load.';
   }
  }
  choice.addEventListener('change',route);
  await route();
 }catch(error){
  if(walkRun===run)status.textContent=error.message||'Local bus stop inventory could not load.';
 }
}
function refreshWalking(project){
 const point=project?[project.lng,project.lat]:null;
 const locationKey=project?JSON.stringify([project.id,point,walkMode]):'';
 if(locationKey===walkKey)return;
 walkKey=locationKey;
 const run=++walkRun,C=window.TracksideWalkCore,service=window.TracksideWalkingAccess;
 clearTimeout(walkTimer);
 resetWalkingPreview();
 window.TracksideWalkCompare?.close();
 walkSection.replaceChildren();
 walkSection.hidden=!project;
 if(!project)return;
 const heading=document.createElement('h3'),status=document.createElement('p'),destination=document.createElement('select');
 heading.textContent='Walking to rail';
 destination.add(new Option('Rail station','rail'));
 destination.add(new Option('Local bus stop','bus'));
 destination.value=walkMode;
 destination.addEventListener('change',()=>{walkMode=destination.value;refreshWalking(project);});
 status.setAttribute('role','status');
 const content=document.createElement('div');
 content.append(status);
 walkSection.append(heading,walkField('Walking destination',destination),content);
 if(!C?.valid(point)){
  status.textContent='Walking time unavailable. This project needs a mapped location.';
  return;
 }
 const matchesCurrent=()=>current()?.id===project.id&&current()?.lng===point[0]&&current()?.lat===point[1];
 const context={project,point,
  onRoute:(trace,stop)=>{if(matchesCurrent())openWalkingPreview(()=>drawWalkingPath(point,trace,stop));},
  onGap:(gap,label)=>{if(matchesCurrent())showWalkingGap(gap,label);},
  onReport:(selectedProject,stop,result)=>{if(matchesCurrent())openWalkingGapReport(selectedProject.id,stop,result);}
 };
 const launch=document.createElement('div'),compare=document.createElement('button');
 launch.className='project-walk-launch';
 compare.type='button';
 compare.className='walk-button';
 compare.textContent='Compare walking access';
 compare.setAttribute('aria-haspopup','dialog');
 compare.addEventListener('click',()=>window.TracksideWalkCompare.open(context));
 launch.append(compare,clearWalkPreview);
 content.before(launch);
 if(walkMode==='bus'){
  if(service?.nearbyBusStops)void showBusWalking(content,heading,status,point,run,service,context);
  else status.textContent='Local bus walking access is unavailable.';
  return;
 }
 const distance=document.createElement('p');
 status.before(distance);
 const stations=service?.nearbyRailStations?.(point)||[];
 const describeDistance=station=>{distance.textContent=(station.meters/1609.344).toFixed(2)+' mi straight-line to '+station.name+' reference point';};
 if(stations.length)describeDistance(stations[0]);
 const candidates=stations.filter(station=>station.meters<=1609.344).slice(0,2);
 if(!service?.estimateRailEntrance||!candidates.length){
  status.textContent='Walking time unavailable. This project is outside the saved rail walking coverage.';
  return;
 }
 status.textContent='Checking saved walking paths…';
 walkTimer=setTimeout(async()=>{
  let checked=false;
  for(const station of candidates){
   let result;
   try{result=await service.estimateRailEntrance(point,station.point);checked=true;}
   catch{if(walkRun!==run)return;continue;}
   if(walkRun!==run)return;
   if(!result)continue;
   heading.textContent='Walking to '+station.name;
   describeDistance(station);
   presentWalkingResult(content,status,point,result,run);
   return;
  }
  status.textContent=checked?'Walking time unavailable. No connected mapped path was found from near this pin to a rail entrance.':'Walking time unavailable. Saved pedestrian data could not be loaded for nearby rail stations.';
 },200);
}
const current=()=>typeof selected!=='undefined'?projects.find(p=>p.id===selected)||null:null,staff=()=>typeof supabaseAdmin!=='undefined'&&supabaseAdmin&&!pendingInviteActivation&&!!supabaseApi?.listProjectHistory;
function routeAccess(result){
 const published=result.route;
 const schedule=window.TracksideCoordination?.scheduleFor(published);
 const phase=schedule?.source_url?schedule.phase:'';
 return {name:result.name,...S.routeAccessDetail(result,phase,isExistingTransitRoute(published))};
}
function describe(p){const facts=[{label:'Project type',value:projectType(p)==='Mixed-use'&&p.subtypes?.length?'Mixed-use · '+p.subtypes.join(', '):projectType(p),valueId:'detailType'}],units=residentialUnitsFor(p);if(units>0||TracksideAreaCore.housing(p)===0)facts.push({label:'Residential units',value:units.toLocaleString('en-US'),id:'detailResidentialFact',valueId:'detailResidentialUnits'});
const evidence=TracksideAreaCore.affordability(p),scope=TracksideAreaCore.scope(p);
if(evidence?.units!=null)facts.push({label:'Income-restricted homes',value:evidence.units.toLocaleString('en-US')});
if(evidence?.levels)facts.push({label:'Affordability levels',value:evidence.levels});
if(scope.kind==='master-plan')facts.push({label:'Development scope',value:'District-wide master plan'});
else if(scope.kind==='phase')facts.push({label:'Development scope',value:scope.program?'Part of '+scope.program:'Individual phase'});
for(const field of projectDevelopmentMetricFields){const value=Math.max(0,Number(p[field.name])||0);if(value>0)facts.push({label:field.label.replace(' (sq ft)',''),value:value.toLocaleString('en-US')+field.suffix,id:field.detailFactId,valueId:field.detailValueId})}if(projectHasDri(p))facts.push({label:'DRI #',value:String(p.dri),id:'detailDriFact',valueId:'detailDri'});
return{id:p.id,name:p.name,area:projectStationContext(p)||'Development project',location:p.location||'',status:displayStatus(p),color:p.color,sourceStatus:projectSourceStatusDetail(p),dri:projectHasDri(p)?String(p.dri):'',facts,affordabilitySource:evidence?.source||'',routes:projectHighCapacityRoutes(p).map(routeAccess),verified:projectVerificationInfo(p).value,verifiedLabel:projectVerificationInfo(p).label,sourceUrl:safeHttpUrl(p.sourceUrl),copy:String(p.copy||'').trim(),timeline:S.timeline(p.events,p.sourceStatus,safeHttpUrl(p.sourceUrl)),recordChanges:S.publishedRecordChanges(p.metadata?.public_record_history,window.TracksideDigestCore?.labels),searchUrl:newsSearchLink(p),revision:p.updatedAt||''};}
function describeHistory(entries){return entries.map(entry=>({id:String(entry.id||''),action:entry.action,when:historyTimestamp(entry.changed_at),summary:historyChangeSummary(entry),actor:projectHistoryActor(entry),reason:entry.change_reason||'',changes:projectHistoryFields(entry).map(field=>({label:historyFieldLabels[field]||field.replaceAll('_',' '),before:formatProjectHistoryValue(field,entry.before_data?.[field]),after:formatProjectHistoryValue(field,entry.after_data?.[field]),beforeUrl:field==='source_url'?safeHttpUrl(entry.before_data?.[field]):'',afterUrl:field==='source_url'?safeHttpUrl(entry.after_data?.[field]):''}))}));}
const model=S.create({getProject:current,describe,canHistory:staff,news:id=>{if(!supabaseApi?.listProjectNews)throw Error('News service unavailable');return supabaseApi.listProjectNewsHistory(id).then(window.TracksideNewsCore.sorted)},newsStatus:id=>supabaseApi?.getProjectNewsStatus?.(id),history:id=>supabaseApi.listProjectHistory(id,100),describeHistory});
const bridge={getSnapshot:model.getSnapshot,subscribe:model.subscribe,tab:model.tab,news:model.news,history:model.history,http:safeHttpUrl,date:projectNewsDate};let mounted=false,loading=null,lastId='';
async function ensureRenderer(){if(mounted||loading)return;root.textContent='Loading project details…';root.setAttribute('role','status');loading=E.load().then(()=>{root.removeAttribute('role');root.replaceChildren();E.project(root,bridge);mounted=true;}).catch(error=>{root.replaceChildren();const text=document.createElement('p'),retry=document.createElement('button');text.textContent='Project details could not load: '+error.message;retry.type='button';retry.className='land-button';retry.textContent='Retry project details';retry.onclick=()=>ensureRenderer();root.append(text,retry);}).finally(()=>loading=null);return loading;}
function refresh(){const p=current(),panel=detail.closest('aside'),same=p?.id===lastId,scroll=panel?.scrollTop||0;lastId=p?.id||'';refreshWalking(p);window.TracksideReach?.renderProject(reachSection,p);model.refresh();if(p)ensureRenderer();if(panel&&same)panel.scrollTop=scroll;else if(panel&&p)panel.scrollTop=0;}
window.TracksideProjectDetails=Object.freeze({refresh,news:()=>model.news(),history:()=>model.history(true),tab:value=>model.tab(value)});
// Services call updateProjectDetailActions after role changes and successful edits.
window.addEventListener('trackside:session-expired',refresh);model.subscribe(()=>{if(model.getSnapshot().project&&!mounted)ensureRenderer()});refresh();Promise.resolve(window.tracksideAppReady).then(refresh);
})();
