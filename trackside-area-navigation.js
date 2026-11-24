/* Keeps the Explore map position and filters when drilling into an area's development. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const sidebar=document.querySelector('aside.detail'),backButton=$('workspaceBack');
if(!sidebar||!backButton)return;
const filterIds=['search','status','station','corridorFilter','stationRadiusFilter','projectTypeFilter',
 'residentialUnitsFilter','verifiedDateFilter','countyFilter','recentNewsFilter','studyBufferMiles'];
const readControls=()=>Object.fromEntries(filterIds.map(id=>[id,$(id)?.value??'']));
let stationProfile,corridorProfile,trail=null;
const isOpen=()=>sidebar.closest('.shell').classList.contains('detail-open');
const visible=id=>isOpen()&&Boolean($(id)?.getClientRects().length);

const openStation=showStationOverview,openCorridor=showCorridorOverview,openProject=show;
showStationOverview=function(station,...args){
 stationProfile=station;
 return openStation.call(this,station,...args);
};
showCorridorOverview=function(corridor,...args){
 corridorProfile=corridor;
 return openCorridor.call(this,corridor,...args);
};

function currentArea(){
 if(visible('stationDetail')&&stationProfile){
  const station=stationProfile;
  return {panel:'stationDetail',label:$('stationDetailName').textContent,open:()=>showStationOverview(station)};
 }
 if(visible('corridorDetail')&&corridorProfile){
  const corridor=corridorProfile;
  return {panel:'corridorDetail',label:corridor.name,open:()=>showCorridorOverview(corridor)};
 }
 const reach=window.TracksideReach,zone=reach?.get(reach.selected);
 if(visible('reachDetail')&&zone){
  const nearby=reach.legendState.nearby;
  return {panel:'reachDetail',label:zone.properties.name+' Reach zone',
   open:()=>reach.open(zone.id,{fit:false,showNearby:nearby})};
 }
 return null;
}
function capture(area){
 const {lat,lng}=map.getCenter();
 return {...area,center:[lat,lng],zoom:map.getZoom(),scroll:sidebar.scrollTop,
  sections:[...$(area.panel).querySelectorAll('details[data-reach-relation][open]')].map(item=>item.dataset.reachRelation),
  controls:readControls(),recent:recentlyUpdatedOnly,dri:driOnlyFilter.checked,study:structuredClone(studyAreaGeometry)};
}
function paintBack(){
 backButton.textContent=trail?'← Back to '+trail.label:'Back to results';
 backButton.title=trail?'Return to '+trail.label:'';
}
show=function(id,...args){
 if(!projects.some(project=>project.id===id))return;
 const area=projectUrlSyncPaused?null:currentArea();
 if(area)trail=capture(area);
 else if(projectUrlSyncPaused||!visible('detail'))trail=null;
 const result=openProject.call(this,id,...args);
 paintBack();
 return result;
};
function restoreFilters(state){
 const before=readControls();
 for(const [id,value] of Object.entries(state.controls)){
  const control=$(id);
  if(control&&(control.tagName!=='SELECT'||[...control.options].some(option=>option.value===value)))control.value=value;
 }
 recentlyUpdatedOnly=state.recent;
 driOnlyFilter.checked=state.dri;
 if(JSON.stringify(studyAreaGeometry)!==JSON.stringify(state.study)){
  studyAreaGeometry=state.study;
  drawStudyAreaGeometry();
  updateStudyAreaControls();
 }
 if(before.station!==stationSelect.value||before.corridorFilter!==corridorSelect.value||before.stationRadiusFilter!==stationRadiusFilter.value){
  updateStationBufferRadius();
  if(selectedStation())handleStationSelection({fit:false});
  else handleCorridorSelection({fit:false});
 }
 if(before.recentNewsFilter!==$('recentNewsFilter')?.value)$('recentNewsFilter')?.dispatchEvent(new Event('change',{bubbles:true}));
}
function back(){
 if(!trail||!visible('detail'))return false;
 const state=trail;
 trail=null;
 paintBack();
 restoreFilters(state);
 state.open();
 render();
 const panel=$(state.panel);
 if(!visible(state.panel))return true;
 for(const item of panel.querySelectorAll('details[data-reach-relation]'))item.open=state.sections.includes(item.dataset.reachRelation);
 const focus=panel.querySelector('h2');
 if(focus){focus.tabIndex=-1;focus.focus({preventScroll:true});}
 sidebar.scrollTop=state.scroll;
 const restorePosition=()=>{
  if(!visible(state.panel)||selected)return;
  map.stop();
  map.invalidateSize({pan:false});
  map.setView(state.center,state.zoom,{animate:false});
 };
 restorePosition();
 requestAnimationFrame(restorePosition);
 return true;
}
window.TracksideAreaNavigation={back};
})();
