/* Map review for published project changes in a followed station or corridor. */
(function(){
'use strict';
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(text,fn)=>{const el=make('button','land-button',text);el.type='button';el.addEventListener('click',fn);return el;};
const pointName={current:'Current published location',previous:'Previously reviewed location'};
const colors={area:'#1d60a3',previous:'#a04713'};
let session=null,layers=null;
function locate(coords){
 if(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite))return null;
 const [lng,lat]=coords;
 return Math.abs(lat)<=90&&Math.abs(lng)<=180?L.latLng(lat,lng):null;
}
function locations(change,previous){
 const current=locate(change.record.values.location);
 const before=change.kind==='left-area'||change.fields.some(field=>field.key==='location')?locate(previous?.values.location):null;
 return {current,previous:before&&!before.equals(current)?before:null};
}
function newLayers(){
 map.createPane('digestReviewArea').style.zIndex=420;
 map.createPane('digestReviewPins').style.zIndex=645;
 map.getPane('digestReviewArea').style.pointerEvents='none';
 const area=L.featureGroup(),points=L.featureGroup();
 layers={area,points,bands:[],bounds:null};
 map.on('zoomend',sizeRouteBand);
}
function sizeRouteBand(){
 if(!session)return;
 for(const {line,latlng,radius} of layers.bands){
  const a=map.project(latlng),b=a.add([100,0]);
  const meters=map.distance(latlng,map.unproject(b));
  if(meters>0)line.setStyle({weight:200*radius/meters});
 }
}
function drawArea(watch,current){
 const {area}=layers,{scope}=watch,geometry=current.reviewGeometry||scope.geometry;
 layers.bands=[];layers.bounds=null;area.clearLayers();
 const style={pane:'digestReviewArea',interactive:false,color:colors.area,weight:2};
 if(geometry?.type==='Point'){
  const center=locate(geometry.coordinates);
  if(!center)return;
  const circle=L.circle(center,{...style,radius:scope.radius,fillOpacity:.12}).addTo(area);
  layers.bounds=circle.getBounds();
  return;
 }
 const parts=geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[];
 const bounds=L.latLngBounds([]);
 for(const part of parts){
  const points=part.map(locate).filter(Boolean);
  if(points.length<2)continue;
  const routeBounds=L.latLngBounds(points);
  bounds.extend(routeBounds.getSouthWest().toBounds(2*scope.radius));
  bounds.extend(routeBounds.getNorthEast().toBounds(2*scope.radius));
  if(scope.radius>0){
   const line=L.polyline(points,{...style,weight:0,opacity:.17,lineCap:'round',lineJoin:'round'}).addTo(area);
   layers.bands.push({line,latlng:routeBounds.getCenter(),radius:scope.radius});
  }
  L.polyline(points,{...style,dashArray:'7 5',opacity:.75}).addTo(area);
 }
 if(bounds.isValid())layers.bounds=bounds;
 sizeRouteBand();
}
function fitArea(){
 if(!session||!layers.bounds?.isValid())return;
 map.invalidateSize({pan:false});
 map.fitBounds(layers.bounds,{padding:[34,34],maxZoom:16,animate:false});
}
function fitChange(entry){
 const {current,previous}=entry.locations;
 if(current&&previous)map.fitBounds(L.latLngBounds([current,previous]),{padding:[48,48],maxZoom:17,animate:false});
 else if(current||previous){
  const p=current||previous;
  if(map.getZoom()<14)map.setView(p,14,{animate:false});
  else map.panTo(p,{animate:false});
 }
}
function pin(entry,kind,latlng,active){
 const label=entry.change.record.title+' — '+pointName[kind];
 const text=make('span','digest-review-pin-number',String(entry.number));
 text.setAttribute('aria-hidden','true');
 const icon=L.divIcon({html:text,className:'digest-review-pin '+kind+(active?' is-selected':''),iconSize:[30,30],iconAnchor:[15,15]});
 const marker=L.marker(latlng,{pane:'digestReviewPins',icon,title:label,alt:label,bubblingMouseEvents:false,zIndexOffset:active?2000:0});
 marker.addTo(layers.points).on('click',()=>select(entry.change.key,true));
 marker.getElement()?.setAttribute('aria-label',label);
}
function drawChanges(entries,selected){
 layers.points.clearLayers();
 const active=entries.find(entry=>entry.change.key===selected);
 if(active?.locations.current&&active.locations.previous){
  L.polyline([active.locations.previous,active.locations.current],{
   pane:'digestReviewArea',color:colors.previous,dashArray:'5 6',weight:2,interactive:false
  }).addTo(layers.points);
 }
 for(const entry of entries){
  if(entry.locations.previous)pin(entry,'previous',entry.locations.previous,entry===active);
  if(entry.locations.current)pin(entry,'current',entry.locations.current,entry===active);
 }
}
function locationKey(entry){
 const key=make('p','digest-review-location');
 if(entry.locations.previous&&entry.locations.current){
  key.append(make('span','digest-review-key previous','Previous location'),make('span','digest-review-key current','Current location'));
 }else{
  key.textContent=entry.locations.current?'Current published location':entry.locations.previous?'Previous location only. Current location unavailable.':'Published location unavailable for this change.';
 }
 return key;
}
function showEntry(focusRow=false){
 const {entries,selected,list,detail,options,rows,busy}=session;
 const entry=entries.find(r=>r.change.key===selected);
 for(const [key,row] of rows)row.setAttribute('aria-pressed',String(key===selected));
 detail.replaceChildren();
 if(entry){
  detail.append(locationKey(entry),options.card(entry.change,busy));
  detail.scrollTop=0;
  if(focusRow)rows.get(selected)?.focus({preventScroll:true});
  const row=rows.get(selected),box=list.getBoundingClientRect(),bounds=row.getBoundingClientRect();
  if(bounds.top<box.top)list.scrollTop+=bounds.top-box.top;
  else if(bounds.bottom>box.bottom)list.scrollTop+=bounds.bottom-box.bottom;
 }
 drawChanges(entries,selected);
}
function select(key,fromMap=false){
 if(!session)return;
 const entry=session.entries.find(r=>r.change.key===key);
 if(!entry)return;
 session.selected=key;
 showEntry(fromMap);
 fitChange(entry);
}
function refresh(){
 if(!session)return;
 const {watch,current,changes,busy}=session.options.read();
 const sameArea=watch&&current&&!current.error&&current.groups.projects?.ok&&changes&&!changes.coverageChanged;
 const active=document.activeElement;
 const restoreFocus=session.list.contains(active)||session.detail.contains(active);
 if(session.watch===watch&&session.current===current&&session.busy===busy)return;
 const oldIndex=session.entries.findIndex(r=>r.change.key===session.selected);
 if(sameArea&&session.current!==current)drawArea(watch,current);
 session.watch=watch;
 session.current=current;
 session.busy=busy;
 session.entries=[];
 session.rows.clear();
 session.list.replaceChildren();
 session.detail.replaceChildren();
 if(!sameArea){
  layers.area.clearLayers();
  layers.bands=[];
  layers.bounds=null;
  session.list.hidden=true;
  layers.points.clearLayers();
  session.count.textContent='Review paused';
  session.detail.append(make('p','digest-warning','Return to Following and check for updates to review this area.'));
  if(restoreFocus)session.back.focus({preventScroll:true});
  return;
 }
 const baseline=new Map((watch.baseline?.projects?.items||[]).map(r=>[r.key,r]));
 session.entries=changes.items.filter(change=>change.record.type==='project').map(change=>{
  if(!session.numbers.has(change.key))session.numbers.set(change.key,session.numbers.size+1);
  return {change,number:session.numbers.get(change.key),locations:locations(change,baseline.get(change.record.key))};
 });
 const count=session.entries.length;
 session.count.textContent=count+' project update'+(count===1?'':'s')+' to review';
 session.list.hidden=!count;
 if(!session.entries.some(r=>r.change.key===session.selected))session.selected=session.entries[Math.min(Math.max(oldIndex,0),count-1)]?.change.key;
 for(const entry of session.entries){
  const row=button('',()=>select(entry.change.key));
  row.className='digest-review-row';
  const title=make('strong','',entry.change.record.title);
  row.append(make('span','digest-review-index',String(entry.number)),title);
  session.rows.set(entry.change.key,row);
  session.list.append(row);
 }
 if(!count){
  layers.points.clearLayers();
  session.detail.append(make('p','digest-review-empty','All available project updates for this area are reviewed.'));
  if(restoreFocus)session.back.focus({preventScroll:true});
  return;
 }
 showEntry(restoreFocus);
}
function open(options){
 close();
 if(!layers)newLayers();
 const {watch}=options.read();
 const panel=make('section','digest-review');
 panel.id='digestMapReview';
 panel.dataset.wsPanel='review';
 panel.setAttribute('aria-labelledby','digestMapReviewTitle');
 const tools=make('div','digest-review-actions'),back=button('Back to Following',options.back);
 tools.append(back,button('Fit followed area',fitArea));
 const title=make('h2','',watch.name);title.id='digestMapReviewTitle';title.tabIndex=-1;
 const count=make('p','digest-review-count');count.setAttribute('aria-live','polite');
 const header=make('div','digest-review-header');
 header.append(tools,title,make('p','digest-review-scope',options.label),count);
 const list=make('div','digest-review-list');list.setAttribute('role','group');list.setAttribute('aria-label','Projects to review');
 const detail=make('div','digest-review-detail');
 const status=make('p','digest-review-status');status.setAttribute('role','status');status.hidden=true;
 panel.append(header,status,list,detail);
 document.getElementById('workspacePanel').append(panel);
 session={options,panel,title,count,list,detail,status,back,entries:[],numbers:new Map(),rows:new Map()};
 layers.area.addTo(map);
 layers.points.addTo(map);
 refresh();
 const active=session;
 requestAnimationFrame(()=>{if(session===active){fitArea();title.focus({preventScroll:true});}});
}
function message(text,error){
 if(!session)return;
 session.status.textContent=text;
 session.status.hidden=!text;
 session.status.dataset.error=String(Boolean(error));
}
function close(){
 if(!session)return;
 session.panel.remove();
 session=null;
 layers.area.clearLayers().remove();
 layers.points.clearLayers().remove();
 layers.bands=[];
 layers.bounds=null;
}
window.TracksideDigestMapReview={open,refresh,close,message};
})();
