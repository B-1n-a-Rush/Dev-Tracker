/* Display-only construction timeline; all dates retain their published precision. */
(function(){
'use strict';
const C=window.TracksideCoordinationCore,L=window.TracksideLandCore;
if(!C||!L)return;
const N=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(text,fn)=>{const el=N('button','land-button',text);el.type='button';el.addEventListener('click',fn);return el;};
const pct=n=>Math.max(0,Math.min(100,n))+'%';
function render(root,opts){
 const scrollId=opts.print?'coordPrintTimelineScroll':'coordTimelineScroll',old=document.getElementById(scrollId),position={left:old?.scrollLeft||0,top:old?.scrollTop||0};
 root.replaceChildren();
 const head=N('div','coord-timeline-head'),heading=N('div');heading.append(N('h3','','Construction timeline'),N('p','land-note',opts.print?'Published route and nearby project schedule windows.':'Select a project row for its source, schedule and map link below.'));head.append(heading);
 const controls=N('div','coord-timeline-controls');
 function select(label,id,options,value,change){const wrap=N('label','land-field',label),el=N('select');el.id=id;for(const [v,t]of options)el.add(new Option(t,v));el.value=value;el.addEventListener('change',()=>change(el.value));wrap.append(el);controls.append(wrap);}
 if(!opts.print){select('Time scale','coordTimelineScale',[['years','Years'],['quarters','Quarters'],['months','Months']],opts.scale,opts.onScale);select('Visible period','coordTimelineFit',[['route','Fit route dates'],['all','Fit all dates']],opts.fit,opts.onFit);head.append(controls);}root.append(head);
 if(opts.loading||opts.unavailable){root.append(N('p','land-message',opts.loading?'Loading the construction timeline…':'Infrastructure sources are unavailable. A project timeline cannot be drawn until sources load.'));return;}
 const model=C.timelineModel({start:opts.start,finish:opts.finish,rows:opts.items,fit:opts.fit}),axis=C.timelineTicks(model,opts.scale);
 const explanation=model.basis==='fallback'?'No usable dates are published. The calendar is shown for orientation only.':opts.fit==='route'&&model.basis==='all'?'Route dates are unavailable or invalid; the visible period fits the available project dates.':'Visible period: '+model.firstYear+'–'+(model.lastYear-1)+'.';
 root.append(N('p','land-note',explanation+' '+(opts.study?'The route row uses your temporary study dates.':'The route row uses the published construction schedule.')));
 if(axis.step!==axis.requested)root.append(N('p','land-note','The scale is grouped into '+axis.step/12+'-year intervals to keep this long schedule readable.'));
 const pager=N('div','coord-timeline-pager'),count=opts.items.length,first=opts.print?0:opts.page*20,last=opts.print?count:Math.min(first+20,count);
 if(!opts.print){const previous=button('← Previous',()=>opts.onPage(opts.page-1)),next=button('Next →',()=>opts.onPage(opts.page+1));previous.disabled=opts.page===0;next.disabled=last>=count;pager.append(previous,N('p','land-note',count?'Showing '+(first+1)+'–'+last+' of '+count+' matching projects':'No matching projects'),next);root.append(pager);}
 const scroll=N('div','coord-timeline-scroll');scroll.id=scrollId;scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Construction timeline. Scroll horizontally to explore dates and vertically for projects.');
 const canvas=N('div','coord-time-canvas');canvas.style.minWidth=(220+Math.max(540,axis.ticks.length*axis.cellWidth))+'px';
 const axisRow=N('div','coord-time-axis'),axisLabel=N('div','coord-time-label','Project / published dates'),axisTrack=N('div','coord-time-axis-track');
 const labelStep=opts.print?Math.max(1,Math.ceil(axis.ticks.length/8)):1;
 for(const [index,tick]of axis.ticks.entries()){const cell=N('span','coord-time-tick',index%labelStep?'':tick.label);cell.style.left=pct(tick.left);cell.style.width=pct(tick.width);axisTrack.append(cell);}axisRow.append(axisLabel,axisTrack);canvas.append(axisRow);
 const reference=C.timelineMark(model.route,model),today=Date.now(),todayPosition=100*(today-model.first)/(model.end-model.first),hasToday=today>=model.first&&today<model.end;
 function row({name,start,finish,window,state,id,route=false,subtitle=''}){
  const labelText='Start: '+(start||'Not published')+' · Finish: '+(finish||'Not published');
  const rowLabel=name+'. '+labelText+'. '+(route?(opts.study?'Temporary study window.':'Published route construction window.'):(C.labels[state]||''));
  const rowId=(opts.print?'coordPrintTimelineProject-':'coordTimelineProject-')+id;
  const el=route?N('div','coord-time-row coord-time-route'):opts.print?N('div'):button('',()=>{opts.onSelect(id);document.getElementById(rowId)?.focus({preventScroll:true});});
  if(!route)el.id=rowId;
  if(!route){el.className='coord-time-row coord-time-project'+(id===opts.selected?' selected':'');el.setAttribute('aria-pressed',String(id===opts.selected));el.setAttribute('aria-label',rowLabel);el.setAttribute('data-project-id',id);}else{el.setAttribute('aria-label',rowLabel);}
  el.title=rowLabel;
  const label=N('span','coord-time-label');label.append(N('strong','',name),N('small','',subtitle),N('small','',labelText));
  if(!route)label.append(N('span','coord-time-state '+state,C.labels[state]));
  const track=N('span','coord-time-track');track.setAttribute('aria-hidden','true');
  for(const tick of axis.ticks){const line=N('i','coord-time-gridline');line.style.left=pct(tick.left);track.append(line);}
  if(!route&&reference.kind==='complete'){const band=N('i','coord-time-reference');band.style.left=pct(reference.left);band.style.width=pct(reference.width);track.append(band);}
  if(hasToday){const line=N('i','coord-time-today');line.style.left=pct(todayPosition);line.title='Today';track.append(line);}
  const mark=C.timelineMark(window,model);
  if(['complete','start-only','finish-only'].includes(mark.kind)){
   const color=route&&/^#[0-9a-f]{6}$/i.test(opts.route.color)?opts.route.color:route?'#136647':state==='overlap'?'#b85d35':window.kind!=='complete'?'#8066a8':'#78937b';
   const bar=N('span','coord-time-bar'+(route?' route':'')+(mark.kind!=='complete'?' endpoint':'')+(mark.approximate?' approximate':''));bar.style.left=pct(mark.left);bar.style.width=pct(mark.width);bar.style.backgroundColor=color;track.append(bar);
   if(mark.kind==='complete')for(const cap of mark.caps){const hatch=N('span','coord-time-uncertainty');hatch.style.left=pct(cap.left);hatch.style.width=pct(cap.width);track.append(hatch);}
   if(mark.clippedStart)track.append(N('span','coord-time-clipped before','‹'));if(mark.clippedFinish)track.append(N('span','coord-time-clipped after','›'));
   if(mark.kind!=='complete')track.append(N('small','coord-time-incomplete',mark.kind==='start-only'?'Start window only · finish not published':'Finish window only · start not published'));
  }else{const text={unknown:'Dates not published',invalid:'Dates need review',before:'Before visible period — choose “Fit all dates”',after:'After visible period — choose “Fit all dates”'};track.append(N('span','coord-time-empty',text[mark.kind]));}
  el.append(label,track);return el;
 }
 const startLabel=opts.study?L.dateLabel(opts.start):opts.routeStartLabel||L.dateLabel(opts.start),finishLabel=opts.study?L.dateLabel(opts.finish):opts.routeFinishLabel||L.dateLabel(opts.finish);
 canvas.append(row({name:opts.route.name,start:startLabel,finish:finishLabel,window:model.route,route:true,subtitle:opts.study?'Temporary study window':'MARTA construction schedule'}));
 for(const entry of model.items.slice(first,last)){const item=entry.item,r=item.row;canvas.append(row({name:r.name,start:L.dateLabel(r.start),finish:L.dateLabel(r.finish),window:entry.window,state:item.state,id:r.id,subtitle:r.scheduleType||'Published project schedule'}));}
 if(!count)canvas.append(N('p','land-note coord-time-no-results','No loaded, mapped projects match these filters. This is not evidence that no nearby work exists.'));
 scroll.append(canvas);root.append(scroll);
 const legend=N('div','coord-time-legend');for(const [cls,text]of [['route','MARTA route'],['overlap','Potential overlap'],['other','Other published window'],['endpoint','Known endpoint only'],['hatch','Month/year uncertainty'],['today','Today']]){const item=N('span'),swatch=N('i',cls);if(cls==='route'&&/^#[0-9a-f]{6}$/i.test(opts.route.color))swatch.style.backgroundColor=opts.route.color;item.append(swatch,N('span','',text));legend.append(item);}root.append(legend);
 root.append(N('p','land-note','Bars span the earliest published start to the latest published finish. Hatched ends preserve month/year uncertainty; endpoint-only marks are not durations. Target dates remain estimates. Project schedules may cover more than construction; check each row’s schedule label.'));
 scroll.scrollLeft=position.left;scroll.scrollTop=position.top;
}
window.TracksideCoordinationTimeline={render};
})();
