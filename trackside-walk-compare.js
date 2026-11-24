/* Project-level walking comparison and reporting for mapped sidewalk gaps. */
(function(){
 'use strict';
 const descriptions={
  outside:'No shared saved sidewalk coverage for this project and stop.',
  'no-sidewalks':'The saved area has no usable mapped sidewalks or crossings.',
  'project-gap':'No mapped sidewalk or crossing within 30 m of the project pin.',
  'stop-gap':'No mapped sidewalk within 20 m of the stop point.',
  disconnected:'The mapped sidewalks and crossings do not connect to this stop within the screening distance.',
  unavailable:'Saved sidewalk data could not load.',
  'unmapped-entrance':'No connected mapped path to a station entrance.',
  'rail-unavailable':'Saved pedestrian coverage was unavailable for this station.'
 };
 function el(tag,text='',className=''){
  const node=document.createElement(tag);
  if(text)node.textContent=text;
  if(className)node.className=className;
  return node;
 }
 function action(label,run){
  const node=el('button',label,'walk-button');
  node.type='button';
  node.addEventListener('click',run);
  return node;
 }
 const miles=meters=>(meters/1609.344).toFixed(2)+' mi';
 const walkTime=minutes=>Math.round(minutes)>0?'About '+Math.round(minutes)+' min':'Under 1 min';
 function reason(result){
  const text=descriptions[result.state]||descriptions.unavailable;
  const context=[];
  if(result.state==='project-gap'&&Number.isFinite(result.projectGapMeters)){
   context.push('Closest mapped path to the pin: '+Math.round(result.projectGapMeters)+' m.');
  }
  if(['project-gap','stop-gap'].includes(result.state)&&result.stopGapMeters>20){
   context.push('Closest mapped sidewalk to the stop: '+Math.round(result.stopGapMeters)+' m.');
  }
  return [text,...context].join(' ');
 }
 function markerLabel(result){
  if(result.state==='disconnected')return 'Mapped walking extent toward this stop';
  if(result.state==='project-gap')return 'Project pin · sidewalk connection needs review';
  return 'Stop point · sidewalk connection needs review';
 }
 function gapActions(context,stop,result,onShow,onReport){
  const actions=el('div','','walk-compare-actions');
  if(result.mapPoint&&result.state!=='unavailable')actions.append(action(
   result.state==='disconnected'?'Show mapped walking extent':'Show review location',
   ()=>onShow(result.mapPoint,markerLabel(result))
  ));
  actions.append(action('Report a missing connection',()=>onReport(context.project,stop,result)));
  return actions;
 }
 const dialog=el('dialog','','walk-compare-dialog');
 dialog.id='projectWalkCompare';
 dialog.setAttribute('aria-labelledby','projectWalkCompareTitle');
 document.body.append(dialog);
 let generation=0;
 dialog.addEventListener('close',()=>{if(!dialog.open)generation++;});

 async function open(context){
  const service=window.TracksideWalkingAccess;
  if(!service)return;
  const run=++generation;
  const title=el('h2','Compare walking access');
  title.id='projectWalkCompareTitle';
  const header=el('header','','walk-compare-header'),heading=el('div');
  heading.append(title,el('p',context.project.name));
  header.append(heading,action('Close',()=>dialog.close()));
  const body=el('div','','walk-compare-body'),status=el('p','Checking nearby rail stations and local bus stops…');
  status.setAttribute('role','status');
  body.append(el('p','Up to two rail stations within 1 mile and five local bus stops within ½ mile of the project pin.'),status);
  dialog.replaceChildren(header,body);
  if(!dialog.open)dialog.showModal();
  const rails=service.nearbyRailStations(context.point).filter(station=>station.meters<=1609.344).slice(0,2);
  const rows=[];
  const inventoryTask=service.nearbyBusStops(context.point).then(inventory=>({inventory}),error=>({error}));
  for(const station of rails){
   if(run!==generation||!dialog.open)return;
   let result;
   try{
    const trace=await service.estimateRailEntrance(context.point,station.point);
    result=trace?{state:'found',trace}:{state:'unmapped-entrance'};
   }catch{result={state:'rail-unavailable'};}
   rows.push({kind:'rail',destination:station,result});
  }
  const {inventory,error}=await inventoryTask;
  for(const stop of inventory?.stops||[]){
   if(run!==generation||!dialog.open)return;
   const result=await service.estimateBusStop(context.point,stop.point);
   rows.push({kind:'bus',destination:stop,result});
  }
  if(run!==generation||!dialog.open)return;
  status.textContent=error?'Local bus stops could not load. Rail results are shown where available.':
   !inventory.stops.length?'No local bus stops were found within ½ mile.':
   !inventory.verified?'Local bus stops come from '+inventory.name+' · service unverified.':'Local bus stops come from '+inventory.name+'.';
  if(!rows.length)return;
  rows.sort((a,b)=>(a.result.trace?.minutes??Infinity)-(b.result.trace?.minutes??Infinity)||a.destination.meters-b.destination.meters);
  const table=el('table','','walk-compare-table');
  table.setAttribute('role','table');
  const thead=table.createTHead(),head=thead.insertRow(),tbody=table.createTBody();
  for(const label of ['Destination','Straight-line','Mapped walk']){
   const th=el('th',label);th.scope='col';head.append(th);
  }
  const closeThen=callback=>(...args)=>{dialog.close();callback(...args);};
  for(const {kind,destination,result} of rows){
   const row=tbody.insertRow(),name=el('th',destination.name);
   row.setAttribute('role','row');
   name.setAttribute('role','rowheader');
   name.scope='row';
   name.append(el('small',kind==='bus'?['Stop '+destination.id,destination.routes.length?'Bus '+destination.routes.join(', '):''].filter(Boolean).join(' · '):[destination.lines,'rail'].filter(Boolean).join(' ')));
   row.append(name);
   const distance=row.insertCell(),walk=row.insertCell();
   for(const [cell,label] of [[distance,'Straight-line'],[walk,'Mapped walk']]){
    cell.setAttribute('role','cell');
    const text=el('span',label,'walk-compare-mobile-label');
    text.setAttribute('aria-hidden','true');
    cell.append(text);
   }
   distance.append(document.createTextNode(miles(destination.meters)));
   if(result.trace){
    walk.append(el('strong',walkTime(result.trace.minutes)),el('small',miles(result.trace.meters)+' along mapped paths'),
     action('Show route on map',closeThen(()=>context.onRoute(result.trace,kind==='bus'?destination:null))));
   }else{
    walk.append(el('strong','Unavailable'),el('small',reason(result)));
    if(kind==='bus')walk.append(gapActions(context,destination,result,closeThen(context.onGap),closeThen(context.onReport)));
   }
  }
  body.append(table,el('p','Estimates use saved mapped paths and exclude unverified endpoint gaps. A missing route may reflect missing map detail.'));
 }
 window.TracksideWalkCompare={open,reason,gapActions,close:()=>{if(dialog.open)dialog.close();}};
})();
