/* Live coordination workspace. Uses published route geometry and official infrastructure feeds. */
(function(){
'use strict';
const C=window.TracksideCoordinationCore,A=window.TracksideLand,LCore=window.TracksideLandCore,api=window.tracksideSupabase;
if(!C||!A||typeof map==='undefined')return;
const $=id=>document.getElementById(id),N=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const B=(label,fn,cls='land-button')=>{const el=N('button',cls,label);el.type='button';el.addEventListener('click',fn);return el;};
const P=text=>N('p','land-note',text),link=(title,url)=>{const a=N('a','land-link',title);a.href=LCore.http(url);a.target='_blank';a.rel='noopener noreferrer';return a;};
const snapshot=window.TRACKSIDE_ROUTE_SCHEDULE_SNAPSHOT||[],liveSchedules=new Map();
const dialog=N('dialog','coord-dialog');dialog.id='coordinationWorkspace';dialog.setAttribute('aria-labelledby','coordTitle');
dialog.innerHTML='<div class="coord-head"><div><div class="eyebrow">Infrastructure coordination</div><h2 id="coordTitle">Coordination watchlist</h2><p>Screen nearby work, check its timing, and record the next step.</p></div><button type="button" id="coordClose" class="land-button" aria-label="Close coordination watchlist">×</button></div><div class="coord-scroll"><div class="coord-controls"><label class="land-field">MARTA route / alignment<select id="coordRoute"></select></label><label class="land-field">Screening distance<select id="coordDistance"><option value="30.48">100 feet</option><option value="76.2" selected>250 feet</option><option value="152.4">500 feet</option><option value="402.336">¼ mile</option><option value="804.672">½ mile</option><option value="1609.344">1 mile</option></select></label><label class="land-field">Jurisdiction<select id="coordJurisdiction"><option value="">All four</option><option>Atlanta</option><option>Fulton</option><option>DeKalb</option><option>Clayton</option></select></label><label class="land-field">Infrastructure type<select id="coordCategory"><option value="">All types</option></select></label></div><section id="coordSchedule" class="coord-schedule" aria-label="Published route construction schedule"></section><details class="coord-manual"><summary>Use a temporary comparison window</summary><p class="land-note">These study dates apply only to this session. They do not update the published route schedule. Use YYYY, YYYY-MM, or YYYY-MM-DD.</p><div class="coord-controls"><label class="land-check"><input id="coordManual" type="checkbox"> Use study dates</label><label class="land-field">Study start<input id="coordStart" placeholder="e.g. 2027-01" autocomplete="off"></label><label class="land-field">Study finish<input id="coordFinish" placeholder="e.g. 2029" autocomplete="off"></label><button type="button" id="coordApplyWindow" class="land-button">Apply window</button></div></details><div class="coord-options"><label class="land-check"><input id="coordCompleted" type="checkbox"> Include completed work</label><label class="land-check"><input id="coordLongRange" type="checkbox"> Include long-range plans</label><label class="land-check"><input id="coordDuplicates" type="checkbox"> Include possible duplicates</label></div><p id="coordMessage" class="land-message" role="status"></p><div id="coordStats" class="land-stats"></div><div class="coord-results-head"><label class="land-field">Schedule screening<select id="coordFilter"><option value="">All nearby work</option><option value="overlap">Potential overlaps</option><option value="unknown">Incomplete / uncertain schedules</option><option value="outside">Outside comparison window</option></select></label><label id="coordReviewFilterLabel" class="land-field" hidden>Coordination status<select id="coordReviewFilter"><option value="">All statuses</option></select></label><button id="coordRefresh" type="button" class="land-button">Refresh sources</button><button id="coordCsv" type="button" class="land-button">Export CSV</button><button id="coordPrint" type="button" class="land-button">Print / save briefing</button><label id="coordPrivateExportLabel" class="land-check" hidden><input id="coordPrivateExport" type="checkbox"> Include admin notes in exports</label></div><div class="coord-grid"><div><div id="coordList" class="coord-list"></div><div id="coordPagination" class="land-actions"></div><details id="coordSavedExtras" hidden><summary>Saved items outside these results</summary><div id="coordSavedList"></div></details></div><section id="coordDetail" class="coord-detail" aria-label="Selected coordination item"></section></div><details class="coord-coverage"><summary>Sources, coverage and screening limits</summary><div id="coordCoverage"></div><p class="land-note">These are potential coordination opportunities, not confirmed construction conflicts. Distances use published geometry; planning areas and representative points are labeled. Unmapped inventory cannot be screened by proximity. Unknown schedules remain unknown. Passenger opening and procurement dates are not construction dates.</p></details></div>';
document.body.append(dialog);
const launch=B('Coordination watchlist',()=>open());launch.id='openCoordinationWatchlist';launch.classList.add('land-wide');$('browseInfrastructure').after(launch);
const corridorEntry=B('Open coordination watchlist',()=>open(selectedCorridor()));corridorEntry.id='corridorCoordinationButton';$('corridorDetail').append(corridorEntry);
const adminEntry=B('Open infrastructure coordination watchlist',()=>{$('closeAuthModal').click();open();});adminEntry.id='adminCoordinationEntry';adminEntry.hidden=true;$('adminRouteManager').before(adminEntry);
for(const [value,label]of Object.entries(C.statuses))$('coordReviewFilter').add(new Option(label,value));
$('coordReviewFilter').add(new Option('Schedule changed / review checkpoint missing','needs-recheck'));
function needsScheduleRecheck(review){return !!currentRoute?.remoteId&&!!window.TracksideScheduleCoverageCore?.needsRecheck(review,scheduleFor());}
let routes=[],currentRoute=null,result={rows:[],unmapped:0,duplicates:0,overlaps:0,unknown:0},filtered=[],selection=null,page=0,generation=0,busy=false,liveError='',reviews=new Map(),reviewsReady=false,reviewsError='',lastFocus=null;
let studyWindows=new Map(),notesDirty=false,scheduleDirty=false;
let resultsView='timeline',timelineScale='years',timelineFit='route',viewsPanel=null;
const viewControls=N('div','coord-view-controls');viewControls.setAttribute('aria-label','Watchlist result view');
const timelineView=B('Timeline',()=>setResultsView('timeline')),listView=B('List & details',()=>setResultsView('list'));timelineView.id='coordTimelineView';listView.id='coordListView';viewControls.append(timelineView,listView);
const timelinePanel=N('section','coord-timeline');timelinePanel.id='coordTimeline';timelinePanel.setAttribute('aria-label','Construction timeline');
const resultsGrid=$('coordDetail').parentElement;resultsGrid.before(viewControls);resultsGrid.before(timelinePanel);$('coordDetail').after($('coordSavedExtras'));
function setResultsView(value){viewsPanel?.invalidate();resultsView=value;dialog.setAttribute('data-results-view',value);timelinePanel.hidden=value!=='timeline';$('coordList').hidden=$('coordPagination').hidden=value==='timeline';timelineView.setAttribute('aria-pressed',String(value==='timeline'));listView.setAttribute('aria-pressed',String(value==='list'));if(value==='timeline')renderTimeline();}
function timelineOptions(){const [start,finish]=dates(),s=scheduleFor();return {route:currentRoute,start,finish,items:filtered,selected:selection,page,scale:timelineScale,fit:timelineFit,study:studyActive(),routeStartLabel:s.start_label,routeFinishLabel:s.finish_label,loading:busy,unavailable:!A.sourceResults.some(s=>s.ok),onSelect:selectCoordinationItem,onPage:value=>{page=value;renderList();renderTimeline();},onScale:value=>{viewsPanel?.invalidate();timelineScale=value;renderTimeline();$('coordTimelineScale')?.focus({preventScroll:true});},onFit:value=>{viewsPanel?.invalidate();timelineFit=value;renderTimeline();$('coordTimelineFit')?.focus({preventScroll:true});}};}
function renderTimeline(){if(!currentRoute||!window.TracksideCoordinationTimeline)return;window.TracksideCoordinationTimeline.render(timelinePanel,timelineOptions());}
function selectCoordinationItem(id){if(selection===id)return;if(!allowNavigation())return;viewsPanel?.invalidate();notesDirty=false;scheduleDirty=false;renderSchedule();selection=id;const index=filtered.findIndex(item=>item.row.id===id);if(index>=0)page=Math.floor(index/20);renderList();renderTimeline();renderDetail();}
setResultsView('timeline');
const admin=()=>typeof supabaseAdmin!=='undefined'&&supabaseAdmin&&!(typeof pendingInviteActivation!=='undefined'&&pendingInviteActivation);
function refreshRoutes(preferred){
 const prior=preferred?.name||currentRoute?.name,previousKey=currentRoute?C.routeKey(currentRoute):'';
 routes=[...brtArtRoutes.filter(r=>r.isPublished!==false).map(r=>({...r,kind:'rapid',geometry:{type:'MultiLineString',coordinates:routePointParts(r).map(line=>line.map(p=>[p[1],p[0]]))}})),...railLines.map(r=>({...r,kind:'rail',geometry:{type:'MultiLineString',coordinates:routePointParts(r).map(line=>line.map(p=>[p[1],p[0]]))}}))];
 const select=$('coordRoute');select.replaceChildren();for(const r of routes)select.add(new Option(r.name+' · '+(r.mode||'MARTA rail'),C.routeKey(r)));
 currentRoute=routes.find(r=>r.name===prior)||routes.find(r=>C.routeKey(r)===previousKey)||routes.find(r=>/Cleveland/i.test(r.name))||routes[0];if(currentRoute)select.value=C.routeKey(currentRoute);
}
function scheduleFor(route=currentRoute){if(!route)return {};return liveSchedules.get(String(route.remoteId))||snapshot.find(s=>s.route_slug===C.slug(route.slug||route.name))||{phase:route.kind==='rail'?'Existing rail service; construction phase not specified':'No schedule researched for this alignment',start_label:'Not currently published',finish_label:'Not currently published',notes:'An administrator can add an evidence-backed construction phase for this route.'};}
function studyActive(){return !!(currentRoute&&studyWindows.get(C.routeKey(currentRoute))?.enabled);}
function dates(){const s=scheduleFor(),study=currentRoute&&studyWindows.get(C.routeKey(currentRoute));return study?.enabled?[study.start||'',study.finish||'']:[s.construction_start||'',s.construction_finish||''];}
function status(message){$('coordMessage').textContent=message;}
function allowNavigation(){return (!notesDirty&&!scheduleDirty)||window.confirm('Discard the unsaved coordination changes?');}
function close(){if(!allowNavigation())return;notesDirty=false;scheduleDirty=false;dialog.close();lastFocus?.focus?.();}
$('coordClose').addEventListener('click',close);
dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
async function loadSchedules(){
 liveError='';liveSchedules.clear();if(!api?.listRouteSchedules){liveError='Live schedule service unavailable; showing the researched snapshot.';return;}
 try{const rows=await api.listRouteSchedules();liveSchedules.clear();for(const row of rows)liveSchedules.set(String(row.route_id),row);}
 catch(error){liveError='Live schedule service unavailable; showing the researched snapshot. '+error.message;}
}
async function loadReviews(token){
 reviews=new Map();reviewsReady=false;reviewsError='';if(!admin())return;
 if(!api?.listCoordinationReviews){reviewsError='Coordination service has not loaded. Refresh the tracker.';return;}
 const key=C.routeKey(currentRoute);
 try{const rows=await api.listCoordinationReviews(key);if(token!==generation||!admin())return;reviews=new Map(rows.map(r=>[r.infrastructure_id,r]));reviewsReady=true;}
 catch(error){if(token===generation)reviewsError='Could not load saved coordination notes: '+error.message;}
}
async function open(preferred){
 if(dialog.open){if(!allowNavigation())return false;}else{lastFocus=document.activeElement;dialog.showModal();}
 notesDirty=false;scheduleDirty=false;refreshRoutes(preferred||((typeof selectedCorridor==='function')?selectedCorridor():null));setMapLayersMenuOpen(false);restoreStudy();
 await refresh(false);return true;
}
async function openSchedule(route,options={}){
 if(!await open(route))return false;
 if(options.recheck&&admin()){$('coordReviewFilter').value='needs-recheck';screen();remember();}
 if(options.edit&&admin()){const editor=$('coordSchedule').querySelector('.coord-editor');if(editor){editor.open=true;editor.scrollIntoView({block:'start',behavior:'smooth'});}}
 return true;
}
function restoreStudy(){const value=studyWindows.get(C.routeKey(currentRoute));$('coordManual').checked=!!value?.enabled;$('coordStart').value=value?.start||'';$('coordFinish').value=value?.finish||'';}
async function openItem(route,infrastructureId,options={}){
 const actual=brtArtRoutes.find(r=>r.isPublished!==false&&C.routeKey({...r,kind:'rapid'})===C.routeKey({...route,kind:'rapid'}));
 if(!actual)throw Error('This published route is no longer available. Refresh the hotspot map.');
 const distance=String(options.distanceMeters??76.2);if(![30.48,76.2,152.4,402.336,804.672,1609.344].includes(Number(distance)))throw Error('Unsupported screening distance.');
 if(!await open(actual))return false;
 studyWindows.delete(C.routeKey(currentRoute));restoreStudy();$('coordDistance').value=distance;$('coordJurisdiction').value=options.jurisdiction||'';$('coordCategory').value=options.category||'';$('coordFilter').value='';$('coordReviewFilter').value='';$('coordPrivateExport').checked=false;
 $('coordCompleted').checked=$('coordLongRange').checked=$('coordDuplicates').checked=false;screen();
 if(!filtered.some(item=>item.row.id===infrastructureId))throw Error('This infrastructure record no longer matches the loaded route screening. Refresh the hotspot map.');
 selectCoordinationItem(infrastructureId);setResultsView('list');remember();$('coordDetail').scrollIntoView({block:'nearest'});return true;
}
async function refresh(force){
 const token=++generation;busy=true;viewsPanel?.setBusy(true);$('coordDetail').replaceChildren(P('Loading coordination details…'));$('coordList').replaceChildren();notesDirty=false;scheduleDirty=false;reviewsReady=false;status('Loading connected infrastructure and route schedules…');$('coordRefresh').disabled=true;$('coordCsv').disabled=$('coordPrint').disabled=true;renderSchedule();renderTimeline();
 await Promise.allSettled([A.loadInfrastructure(force),loadSchedules(),loadReviews(token)]);
 if(token!==generation||!dialog.open)return false;busy=false;viewsPanel?.setBusy(false);$('coordRefresh').disabled=false;
 const category=$('coordCategory'),value=category.value;category.replaceChildren(new Option('All types',''));for(const name of [...new Set(A.infrastructureRows.map(r=>r.category))].sort())category.add(new Option(name,name));if(value&&!Array.from(category.options).some(o=>o.value===value))category.add(new Option(value+' (not currently available)',value));category.value=value;
 renderSchedule();screen();return true;
}
function renderSchedule(){
 const root=$('coordSchedule'),s=scheduleFor();root.replaceChildren();
 const title=N('div','coord-schedule-head');title.append(N('h3','',currentRoute?.name||'Choose a route'),N('span','land-badge',s.phase||'Not published'));root.append(title);
 const facts=N('div','coord-schedule-facts');for(const [label,value]of [['Construction start',s.start_label||LCore.dateLabel(s.construction_start)],['Construction finish',s.finish_label||LCore.dateLabel(s.construction_finish)],['Source checked',s.checked_at?LCore.dateLabel(s.checked_at):'Not researched']]){const cell=N('div');cell.append(N('small','',label),N('strong','',value));facts.append(cell);}root.append(facts);
 if(s.evidence)root.append(P(s.evidence));if(s.notes)root.append(P(s.notes));if(s.source_url)root.append(link(s.source_title||'Published schedule source',s.source_url));
 if(s.source_published_at)root.append(P('Source published '+LCore.dateLabel(s.source_published_at)+'.'));
 for(const extra of s.additional_sources||[])if(LCore.http(extra.url))root.append(link((extra.purpose?extra.purpose+' · ':'')+extra.title,extra.url));
 if(liveError)root.append(N('p','land-banner',liveError));
 if([s.construction_start,s.construction_finish].some(v=>v&&String(v).length<10))root.append(P('Month/year values are screened using their full calendar range. This preserves uncertainty; it does not set an exact construction day.'));
 if(admin()&&currentRoute?.remoteId){const editor=N('details','coord-editor');editor.append(N('summary','','Edit sourced route schedule'));root.append(editor);renderScheduleEditor(editor,s);}
}
function screen(){
 if(!currentRoute)return;
 viewsPanel?.invalidate();
 const [start,finish]=dates();
 try{result=C.screen({route:currentRoute,rows:A.infrastructureRows,start,finish,distanceMeters:$('coordDistance').value,jurisdiction:$('coordJurisdiction').value,category:$('coordCategory').value,includeCompleted:$('coordCompleted').checked,includeLongRange:$('coordLongRange').checked,includePossible:$('coordDuplicates').checked});}
 catch(error){status(error.message);return;}
 const privateAccess=admin();$('coordReviewFilterLabel').hidden=$('coordPrivateExportLabel').hidden=!privateAccess;if(!privateAccess){reviews.clear();$('coordPrivateExport').checked=false;$('coordReviewFilter').value='';}
 filtered=result.rows.filter(r=>(!$('coordFilter').value||($('coordFilter').value==='unknown'?['unknown','reference-needed','invalid'].includes(r.state):r.state===$('coordFilter').value))&&(!$('coordReviewFilter').value||($('coordReviewFilter').value==='needs-recheck'?needsScheduleRecheck(reviews.get(r.row.id)):(reviews.get(r.row.id)?.status||'unreviewed')===$('coordReviewFilter').value)));
 const failed=A.sourceResults.filter(s=>!s.ok).length,successful=A.sourceResults.filter(s=>s.ok).length,capped=A.sourceResults.some(s=>s.truncated);
 let message=busy?'Loading sources…':!successful?'Infrastructure unavailable — no proximity conclusion can be drawn.':result.rows.length+' nearby infrastructure projects · '+filtered.length+' match the watchlist filters.';
 if(failed)message+=' '+failed+' source(s) unavailable; coverage incomplete.';if(capped)message+=' Source retrieval capped; coverage incomplete.';
 message+=' '+result.unmapped+' unmapped records not proximity-screened. '+result.duplicates+' possible duplicates excluded.';
 if(studyActive())message+=' Using your temporary study window.';
 if((start&&!C.validateDate(start))||(finish&&!C.validateDate(finish))||(LCore.dateRange(start)&&LCore.dateRange(finish)&&LCore.dateRange(start).first>LCore.dateRange(finish).last))message+=' Comparison dates are invalid; overlap results are unavailable.';
 if(reviewsError)message+=' '+reviewsError;status(message);
 const stats=$('coordStats');stats.replaceChildren();for(const [n,label]of [[result.rows.length,'nearby projects'],[result.overlaps,'potential overlaps'],[result.unknown,'incomplete / uncertain']]){const el=N('div');el.append(N('strong','',successful?String(n):'—'),N('span','',label));stats.append(el);}
 page=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));if(!filtered.some(r=>r.row.id===selection))selection=filtered[0]?.row.id||null;renderList();renderDetail();renderCoverage();renderTimeline();
 $('coordCsv').disabled=$('coordPrint').disabled=busy||!successful;
}
function renderList(){
 const root=$('coordList');root.replaceChildren();const slice=filtered.slice(page*20,(page+1)*20);
 for(const item of slice){const r=item.row,card=B('',()=>selectCoordinationItem(r.id),'coord-row'+(selection===r.id?' selected':''));card.append(N('strong','',r.name),N('small','',[r.jurisdiction,r.category,r.agency].filter(Boolean).join(' · ')),N('span','land-badge '+item.state,C.labels[item.state]),N('small','',Math.round(item.distance/.3048).toLocaleString()+' ft · '+LCore.dateLabel(r.start)+' → '+LCore.dateLabel(r.finish)));if(admin()){card.append(N('span','coord-review-state',C.statuses[reviews.get(r.id)?.status||'unreviewed']));if(needsScheduleRecheck(reviews.get(r.id)))card.append(N('small','coord-recheck-warning','Schedule changed / review checkpoint missing'));}root.append(card);}
 if(!slice.length)root.append(P('No loaded, mapped projects match these selections. Check the source coverage and unmapped inventory before concluding there is no nearby work.'));
 const pager=$('coordPagination');pager.replaceChildren();const previous=B('← Previous',()=>{page--;renderList();renderTimeline();}),next=B('Next →',()=>{page++;renderList();renderTimeline();});previous.disabled=page===0;next.disabled=(page+1)*20>=filtered.length;pager.append(previous,P(filtered.length?'Showing '+(page*20+1)+'–'+Math.min((page+1)*20,filtered.length)+' of '+filtered.length:'0 matching results'),next);
 const extras=[...reviews.values()].filter(r=>!result.rows.some(item=>item.row.id===r.infrastructure_id));$('coordSavedExtras').hidden=!admin()||!extras.length;$('coordSavedList').replaceChildren();
 for(const r of extras)$('coordSavedList').append(B(r.project_name+' · '+C.statuses[r.status],()=>{if(!allowNavigation())return;notesDirty=false;scheduleDirty=false;renderSchedule();selection=r.infrastructure_id;renderTimeline();renderDetail(r);}));
}
function sourceRecord(r){if(r.source?.kind==='fulton'){const u=new URL(r.source.url);u.search=new URLSearchParams({'$where':"project_id='"+String(r.raw?.project_id||'').replaceAll("'","''")+"'"});return u.href;}if(r.source?.url)return r.source.url+'/query?'+new URLSearchParams({f:'pjson',objectIds:String(LCore.pick(r.raw||{},['OBJECTID','ObjectId'])),outFields:'*',returnGeometry:'false'});return '';}
function renderCoverage(){const root=$('coordCoverage');root.replaceChildren();for(const r of A.sourceResults){root.append(link(r.source.name,r.source.viewer),P(r.ok?r.count+' records retrieved'+(r.truncated?' (capped)':''):'Unavailable: '+r.error));if(r.source.coverage)root.append(P(r.source.coverage));}if(A.loadedAt)root.append(P('Infrastructure retrieved '+A.loadedAt.toLocaleString()+'. Retrieval time does not verify individual project schedules.'));}
function field(form,label,id,value='',type='text',maxLength=240){const wrap=N('label','land-field',label),input=N(type==='textarea'?'textarea':'input');input.id=id;if(type!=='textarea')input.type=type;input.value=value??'';input.maxLength=maxLength;wrap.append(input);form.append(wrap);return input;}
function renderDetail(savedOnly){
 const root=$('coordDetail');root.replaceChildren();const item=result.rows.find(r=>r.row.id===selection),saved=reviews.get(selection)||savedOnly;
 const row=item?.row;if(!row&&!saved){root.append(N('h3','','Select nearby work'),P('Choose a project to inspect its source, schedule and coordination notes.'));return;}
 root.append(N('h3','',row?.name||saved.project_name));
 if(row){root.append(P(row.agency),N('span','land-badge '+item.state,C.labels[item.state]),P('Published phase: '+(row.sourceStatus||'Not published')),P((row.scheduleType||'Published schedule')+': '+LCore.dateLabel(row.start)+' → '+LCore.dateLabel(row.finish)),P('Geometry: '+(row.geometryBasis||'Published GIS location')));
  for(const message of item.warnings)root.append(N('p','land-banner',message));
  if(row.description)root.append(P(row.description));root.append(link('Published source record ↗',sourceRecord(row)),B('View this project on the map',()=>{if(!allowNavigation())return;notesDirty=false;scheduleDirty=false;dialog.close();A.focusInfrastructure(row);}));
 }else{root.append(P('Saved coordination item outside the currently loaded/filtered results. Its absence is not evidence that work is complete.'),link('Saved source record ↗',saved.source_url));}
 if(!admin()){root.append(P('Sign in as an administrator to save contacts, notes and coordination status.'),B('Admin sign in',()=>{dialog.close();openAuthModal();}));return;}
 if(reviewsError||!reviewsReady){root.append(N('p','land-banner',reviewsError||'Loading saved coordination notes…'));return;}
 if(currentRoute.kind!=='rail'&&!currentRoute.remoteId){root.append(P('Wait for the published route library to load before saving notes.'));return;}
 if(needsScheduleRecheck(saved))root.append(N('p','coord-recheck-warning',!scheduleFor().schedule_version?'The live schedule version is unavailable. Refresh the route schedule before recording a review checkpoint.':saved.reviewed_schedule_version==null?'This saved item has no recorded schedule checkpoint. Review the current construction dates, then save the notes to record that review.':'The route construction dates changed after this item was reviewed. Check the current dates and screening before saving the follow-up again.'));
 const reviewedVersion=liveSchedules.get(String(currentRoute.remoteId))?.schedule_version??null;
 const form=N('form','coord-note-form');form.append(N('h4','','Coordination follow-up'),P('Visible to tracker administrators only. Saving does not change the agency source or mark a conflict as confirmed.'));
 const statusWrap=N('label','land-field','Coordination status'),select=N('select');select.id='coordEditStatus';for(const [v,label]of Object.entries(C.statuses))select.add(new Option(label,v));select.value=saved?.status||'unreviewed';statusWrap.append(select);form.append(statusWrap);
 field(form,'Assigned to','coordAssigned',saved?.assigned_to);field(form,'Agency / contact','coordContact',saved?.contact,'text',1000);field(form,'Next action','coordNextAction',saved?.next_action,'textarea',2000);field(form,'Follow-up date','coordDue',saved?.due_date,'date');field(form,'Notes','coordNotes',saved?.notes,'textarea',10000);
 if(saved)form.append(P('Last saved '+new Date(saved.updated_at).toLocaleString()+' by '+(saved.updated_by===currentAdminSession?.user?.id?'you':'an administrator')+'.'));
 const save=B('Save coordination notes',()=>{});save.type='submit';const message=N('p','land-message');message.setAttribute('role','status');form.append(save,message);form.addEventListener('input',()=>notesDirty=true);
 const route=currentRoute,key=C.routeKey(route),infrastructureId=selection,token=generation;let baseline=saved;
 form.addEventListener('submit',async event=>{event.preventDefault();if(!admin())return;save.disabled=true;message.textContent='Saving…';try{
  const record={route_key:key,route_id:route.remoteId?Number(route.remoteId):null,infrastructure_id:infrastructureId,project_name:row?.name||saved.project_name,source_url:row?sourceRecord(row):saved.source_url,status:select.value,assigned_to:$('coordAssigned').value.trim(),contact:$('coordContact').value.trim(),next_action:$('coordNextAction').value.trim(),due_date:$('coordDue').value||null,notes:$('coordNotes').value.trim(),reviewed_schedule_version:reviewedVersion};
  const updated=await api.saveCoordinationReview(record,baseline);if(token!==generation||!admin())return;baseline=updated;reviews.set(infrastructureId,updated);notesDirty=false;message.textContent='Saved to the shared administrator watchlist.';if(!needsScheduleRecheck(updated))root.querySelector('.coord-recheck-warning')?.remove();renderList();window.TracksideScheduleCoverage?.refreshIfOpen();
 }catch(error){message.textContent='Could not save: '+error.message+' Your text is still in this form.';}finally{save.disabled=false;}});
 root.append(form);
}


function renderScheduleEditor(root,s){
 const form=N('form','coord-schedule-form');form.append(P('Keep construction dates separate from opening and procurement. YYYY and YYYY-MM retain their published precision. Leave unknown dates blank.'));
 const start=field(form,'Construction start value','coordScheduleStart',s.construction_start),startLabel=field(form,'Start label as published','coordScheduleStartLabel',s.start_label);
 const finish=field(form,'Construction finish value','coordScheduleFinish',s.construction_finish),finishLabel=field(form,'Finish label as published','coordScheduleFinishLabel',s.finish_label);
 const phase=field(form,'Published phase','coordSchedulePhase',s.phase),source=field(form,'Direct schedule source URL','coordScheduleSource',s.source_url,'url',2400),title=field(form,'Source title','coordScheduleSourceTitle',s.source_title,'text',400);
 const published=field(form,'Publication date (when known)','coordSchedulePublished',s.source_published_at,'date'),checked=field(form,'Date checked','coordScheduleChecked',s.checked_at||new Date().toISOString().slice(0,10),'date');
 const evidence=field(form,'Evidence / explanation','coordScheduleEvidence',s.evidence,'textarea',5000),notes=field(form,'Precision and schedule caveats','coordScheduleNotes',s.notes,'textarea',5000);
 source.required=title.required=checked.required=evidence.required=true;
 const message=N('p','land-message');message.setAttribute('role','status');const save=B('Save sourced schedule',()=>{});save.type='submit';form.append(save,message);
 form.addEventListener('input',()=>scheduleDirty=true);const route=currentRoute,token=generation,baseline=liveSchedules.get(String(route.remoteId));
 form.addEventListener('submit',async e=>{e.preventDefault();if(!admin())return;if(notesDirty){message.textContent='Save or discard the coordination notes below before saving the route schedule.';return;}const sv=start.value.trim(),fv=finish.value.trim();
  if(!C.validateDate(sv)||!C.validateDate(fv)||C.comparison(sv,fv,'','')==='invalid'){message.textContent='Use valid dates and put finish on or after start.';return;}
  if(!LCore.http(source.value)){message.textContent='Use a direct http(s) source URL.';return;}
  save.disabled=true;message.textContent='Saving…';
  try{const updated=await api.saveRouteSchedule({route_id:Number(route.remoteId),construction_start:sv||null,start_label:sv?(startLabel.value.trim()||LCore.dateLabel(sv)):'Not currently published',construction_finish:fv||null,finish_label:fv?(finishLabel.value.trim()||LCore.dateLabel(fv)):'Not currently published',phase:phase.value.trim()||'Not published',source_url:LCore.http(source.value),source_title:title.value.trim(),source_published_at:published.value||null,checked_at:checked.value,evidence:evidence.value.trim(),notes:notes.value.trim(),additional_sources:s.additional_sources||[]},baseline);
   liveSchedules.set(String(route.remoteId),updated);if(token!==generation)return;scheduleDirty=false;renderSchedule();screen();status('Sourced schedule saved. Route geometry and colors are unchanged.');renderCorridorSummary();window.TracksideScheduleCoverage?.refreshIfOpen();
  }catch(error){message.textContent='Could not save: '+error.message+' Your entries are still in the form.';}finally{save.disabled=false;}
 });root.append(form);
}
function exportRows(){
 const [start,finish]=dates(),s=scheduleFor(),privateNotes=admin()&&$('coordPrivateExport').checked;
 const fields=['MARTA route','Infrastructure ID','Project','Agency','Jurisdiction','Type','Published phase','Distance feet','Geometry basis','Schedule result','Construction start as published','Construction finish as published','Comparison basis','Comparison start','Comparison finish','Route start label','Route finish label','Route schedule source','Route source checked','Infrastructure source','Infrastructure retrieved','Screening caveats'];
 if(privateNotes)fields.push('Admin coordination status','Assigned to','Contact','Next action','Follow-up date','Admin notes','Admin notes last saved');
 return [fields,...filtered.map(item=>{const r=item.row,n=reviews.get(r.id);const row=[currentRoute.name,r.id,r.name,r.agency,r.jurisdiction,r.category,r.sourceStatus,Math.round(item.distance/.3048),r.geometryBasis,C.labels[item.state],LCore.dateLabel(r.start),LCore.dateLabel(r.finish),studyActive()?'Temporary session study window':'Published route construction schedule',start,finish,s.start_label,s.finish_label,s.source_url,s.checked_at,sourceRecord(r),A.loadedAt?.toISOString(),item.warnings.join(' | ')];if(privateNotes)row.push(C.statuses[n?.status||'unreviewed'],n?.assigned_to,n?.contact,n?.next_action,n?.due_date,n?.notes,n?.updated_at);return row;})];
}
function downloadCsv(){const url=URL.createObjectURL(new Blob([C.csv(exportRows())],{type:'text/csv;charset=utf-8'})),a=N('a');a.href=url;a.download='trackside-coordination-'+C.slug(currentRoute.name)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function printBriefing(){
 window.TracksideCoordinationBriefing.close();const report=N('section','coord-print-report');report.id='coordPrintReport';
 const briefingMap=window.TracksideBriefingMap.create({route:currentRoute,rows:filtered,tileUrl:cartoBasemapUrl});
 report.append(N('h1','','Trackside ATL · Coordination briefing'),N('h2','',currentRoute.name),P('Generated '+new Date().toLocaleString()+' · '+$('coordDistance').selectedOptions[0].text+' screening distance'),P($('coordMessage').textContent),P('Potential opportunities only. Geometry and schedule matches do not confirm a construction conflict.'),briefingMap.element,P('Map: selected route in its map color; orange infrastructure has a potential schedule overlap. Other infrastructure is muted green. The map is framed around the route; source geometry beyond this view is clipped. Published planning polygons and representative points are not construction footprints.'));
 const s=scheduleFor(),[start,finish]=dates();report.append(P('Route construction: '+(s.start_label||'Unknown')+' → '+(s.finish_label||'Unknown')),P('Comparison: '+(studyActive()?'Temporary study window':'Published route schedule')+' · '+(start||'Unknown')+' → '+(finish||'Unknown')));
 if(s.source_url)report.append(link('Route schedule source · '+(s.source_title||s.source_url),s.source_url));if(s.notes)report.append(P(s.notes));
 const timeline=N('section','coord-timeline coord-timeline-print');window.TracksideCoordinationTimeline?.render(timeline,{...timelineOptions(),print:true,scale:'years'});report.append(timeline);
 const rows=exportRows(),table=N('table'),head=N('thead'),tr=N('tr');for(const title of ['Infrastructure / agency','Schedule & screening','Source / follow-up'])tr.append(N('th','',title));head.append(tr);table.append(head);const body=N('tbody');
 for(const item of filtered){const r=item.row,row=N('tr'),first=N('td'),second=N('td'),third=N('td');first.append(N('strong','',r.name),P(r.agency+' · '+r.jurisdiction),P(r.geometryBasis||'Published GIS geometry'));second.append(P(C.labels[item.state]),P(LCore.dateLabel(r.start)+' → '+LCore.dateLabel(r.finish)),P(Math.round(item.distance/.3048)+' ft from route'));third.append(link('Published project source',sourceRecord(r)));for(const warning of item.warnings)third.append(P(warning));
  if(admin()&&$('coordPrivateExport').checked){const n=reviews.get(r.id);third.append(P('ADMIN NOTES · '+C.statuses[n?.status||'unreviewed']),P([n?.assigned_to,n?.contact,n?.next_action,n?.due_date,n?.notes].filter(Boolean).join(' · ')));}row.append(first,second,third);body.append(row);}
 table.append(body);report.append(table);report.append(N('h3','','Coverage and limitations'),P($('coordCoverage').textContent));window.TracksideCoordinationBriefing.open(report,briefingMap);
}
function renderCorridorSummary(){
 const target=$('corridorConstructionSchedule');if(!target)return;const c=selectedCorridor();target.replaceChildren();if(!c)return;
 const r=brtArtRoutes.find(r=>r.name===c.name)||railLines.find(r=>r.name===c.name);if(!r)return;const s=scheduleFor(r);
 target.append(N('h3','','Construction schedule'),P((s.start_label||'Not currently published')+' → '+(s.finish_label||'Not currently published')));
 if(s.source_url)target.append(link('Schedule source · checked '+(s.checked_at?LCore.dateLabel(s.checked_at):'not researched'),s.source_url));if(s.notes)target.append(P(s.notes));
}
const corridorSummary=N('section','coord-corridor-schedule');corridorSummary.id='corridorConstructionSchedule';corridorEntry.before(corridorSummary);
const originalCorridor=showCorridorOverview;showCorridorOverview=function(...args){const value=originalCorridor(...args);renderCorridorSummary();return value;};
const originalAdmin=updateAdminUi;updateAdminUi=function(...args){const value=originalAdmin(...args);adminEntry.hidden=!admin();if(!admin()){reviews.clear();reviewsReady=false;window.TracksideCoordinationBriefing?.close();$('coordPrintReport')?.remove();document.body.classList.remove('coord-printing');}if(dialog.open){notesDirty=false;scheduleDirty=false;if(admin())loadReviews(generation).then(()=>{if(dialog.open)screen();});else screen();renderSchedule();}return value;};adminEntry.hidden=!admin();
const watched=['coordDistance','coordJurisdiction','coordCategory','coordCompleted','coordLongRange','coordDuplicates','coordFilter','coordReviewFilter'],previous=new Map();
function remember(){for(const id of watched){const el=$(id);previous.set(id,{value:el.value,checked:el.checked});}}
for(const id of watched)$(id).addEventListener('change',()=>{if(!allowNavigation()){const old=previous.get(id);if(old)Object.assign($(id),old);return;}notesDirty=false;scheduleDirty=false;renderSchedule();page=0;screen();remember();});
$('coordRoute').addEventListener('change',async()=>{if(!allowNavigation()){$('coordRoute').value=C.routeKey(currentRoute);return;}notesDirty=false;scheduleDirty=false;currentRoute=routes.find(r=>C.routeKey(r)===$('coordRoute').value);page=0;selection=null;restoreStudy();await refresh(false);remember();});
$('coordApplyWindow').addEventListener('click',()=>{if(!allowNavigation())return;notesDirty=false;scheduleDirty=false;renderSchedule();studyWindows.set(C.routeKey(currentRoute),{enabled:$('coordManual').checked,start:$('coordStart').value.trim(),finish:$('coordFinish').value.trim()});page=0;screen();});
$('coordRefresh').addEventListener('click',()=>{if(allowNavigation()){notesDirty=false;scheduleDirty=false;refresh(true);}});
$('coordCsv').addEventListener('click',downloadCsv);$('coordPrint').addEventListener('click',printBriefing);remember();
function currentPublicView(){
 if(busy||!currentRoute)throw Error('Wait for the route and source data to finish loading.');
 const study=studyWindows.get(C.routeKey(currentRoute));
 return window.TracksideCoordinationViewsCore.normalize({v:1,route:C.routeKey(currentRoute),distance:$('coordDistance').value,jurisdiction:$('coordJurisdiction').value,category:$('coordCategory').value,screen:$('coordFilter').value,completed:$('coordCompleted').checked,longRange:$('coordLongRange').checked,duplicates:$('coordDuplicates').checked,study:!!study?.enabled,start:study?.start||'',finish:study?.finish||'',view:resultsView,scale:timelineScale,fit:timelineFit,project:filtered.some(i=>i.row.id===selection)?selection:''});
}
async function applyPublicView(input){
 const view=window.TracksideCoordinationViewsCore.normalize(input);await window.tracksideAppReady;if(!allowNavigation())return false;
 refreshRoutes();const match=routes.find(r=>C.routeKey(r)===view.route)||(/^rapid:(?!\d+$)/.test(view.route)?routes.find(r=>r.kind==='rapid'&&C.slug(r.slug||r.name)===view.route.slice(6)):null);
 if(!match)throw Error('The route in this view is no longer published or could not be loaded. No substitute route was used.');
 if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();}setMapLayersMenuOpen(false);notesDirty=false;scheduleDirty=false;
 currentRoute=match;$('coordRoute').value=C.routeKey(match);$('coordDistance').value=view.distance;$('coordJurisdiction').value=view.jurisdiction;
 const category=$('coordCategory');if(view.category&&!Array.from(category.options).some(o=>o.value===view.category))category.add(new Option(view.category,view.category));category.value=view.category;
 $('coordFilter').value=view.screen;$('coordCompleted').checked=view.completed;$('coordLongRange').checked=view.longRange;$('coordDuplicates').checked=view.duplicates;$('coordReviewFilter').value='';$('coordPrivateExport').checked=false;
 studyWindows.set(C.routeKey(match),{enabled:view.study,start:view.start,finish:view.finish});restoreStudy();timelineScale=view.scale;timelineFit=view.fit;page=0;selection=view.project||null;setResultsView(view.view);
 if(!await refresh(false))return false;
 const warnings=[];if(view.category&&!A.infrastructureRows.some(r=>r.category===view.category))warnings.push('The saved infrastructure type is not currently available; results were not broadened.');
 if(view.project){const index=filtered.findIndex(i=>i.row.id===view.project);if(index>=0){selection=view.project;page=Math.floor(index/20);renderList();renderDetail();renderTimeline();}else warnings.push('The selected project is unavailable or no longer matches these filters.');}
 remember();return {warning:warnings.join(' ')};
}
if(window.TracksideCoordinationViews&&window.TracksideCoordinationViewsCore)viewsPanel=window.TracksideCoordinationViews.mount({dialog,anchor:$('coordSchedule'),ready:window.tracksideAppReady,publicUrl:typeof publicTrackerUrl!=='undefined'?publicTrackerUrl:'https://b-1n-a-rush.github.io/Dev-Tracker/',getView:currentPublicView,applyView:applyPublicView,openDefault:()=>open(),copy:value=>typeof copyText==='function'?copyText(value):window.navigator.clipboard.writeText(value)});
window.TracksideCoordination={open,openSchedule,openItem,sourceRecord,close,refresh,get result(){return result;},get route(){return currentRoute;},get schedules(){return [...liveSchedules.values()];}};
})();
