/* Public schedule coverage with an administrator-only audit and recheck queue. */
(function(){
'use strict';
const C=window.TracksideScheduleCoverageCore,L=window.TracksideLandCore,api=window.tracksideSupabase;if(!C||!L||!api)return;
const $=id=>document.getElementById(id),N=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;},P=text=>N('p','land-note',text);
const B=(text,fn)=>{const b=N('button','land-button',text);b.type='button';b.addEventListener('click',fn);return b;};
const admin=()=>typeof supabaseAdmin!=='undefined'&&supabaseAdmin&&!(typeof pendingInviteActivation!=='undefined'&&pendingInviteActivation);
const dialog=N('dialog','coord-dialog schedule-coverage-dialog');dialog.id='scheduleCoverageDialog';dialog.setAttribute('aria-labelledby','scheduleCoverageTitle');
const head=N('div','coord-head'),heading=N('div');heading.append(N('div','eyebrow','Route schedule intelligence'));const title=N('h2','','Schedule coverage');title.id='scheduleCoverageTitle';heading.append(title,P('See which construction dates are usable, what needs verification, and what changed.'));
const dismiss=B('×',close);dismiss.id='closeScheduleCoverage';dismiss.setAttribute('aria-label','Close schedule coverage');head.append(heading,dismiss);
const body=N('div','coord-scroll'),controls=N('div','schedule-coverage-controls'),filterLabel=N('label','land-field','Show routes'),filter=N('select');filter.id='scheduleCoverageFilter';for(const [v,t]of [['all','All published routes'],['needs','Needs verification'],['complete','Complete construction windows'],['recheck','Coordination items to recheck']])filter.add(new Option(t,v));filterLabel.append(filter);
const ageLabel=N('label','land-field','Verification age threshold'),age=N('select');age.id='scheduleCoverageAge';for(const days of [30,90,180])age.add(new Option(days+' days',String(days)));age.value='90';ageLabel.append(age);
const refresh=B('Refresh records',()=>load());refresh.id='refreshScheduleCoverage';controls.append(filterLabel,ageLabel,refresh);
const message=P('');message.id='scheduleCoverageMessage';message.setAttribute('role','status');const stats=N('div','land-stats');stats.id='scheduleCoverageStats';const queue=P('');queue.id='scheduleVerificationQueue';
const cards=N('div','schedule-coverage-cards');cards.id='scheduleCoverageCards';const history=N('section','schedule-history');history.id='scheduleCoverageHistory';history.hidden=true;history.setAttribute('aria-label','Route schedule history');
body.append(controls,P('Dates keep their published wording and precision. Missing endpoints stay unknown. Verification age is based on the recorded check date, not when you open this dashboard.'),message,stats,queue,cards,history);dialog.append(head,body);document.body.append(dialog);
let items=[],reviews=[],live=true,loading=false,token=0,historyToken=0,lastFocus=null,historyFocus=null,historyOffset=0,privateError='';
function sourceLink(label,url){const safe=L.http(url);if(!safe)return P('Source link not available');const a=N('a','land-link',label);a.href=safe;a.target='_blank';a.rel='noopener noreferrer';return a;}
function close(){token++;historyToken++;dialog.close();lastFocus?.focus?.();}
dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
function routes(){return brtArtRoutes.filter(r=>r.isPublished!==false).map(r=>({...r,kind:'rapid'}));}
function countRechecks(item){return live?reviews.filter(r=>String(r.route_id)===String(item.route.remoteId)&&C.needsRecheck(r,item.schedule)).length:0;}
function render(){
 const privileged=admin();if(!privileged&&filter.value==='recheck')filter.value='all';for(const o of filter.options)if(o.value==='recheck')o.disabled=!privileged||!live||!!privateError;
 const current=items.map(i=>C.assess(i.route,Object.keys(i.schedule).length?i.schedule:null,{staleDays:age.value}));items=current;
 const complete=current.filter(i=>i.coverage==='complete').length,needs=current.filter(i=>i.needsVerification).length,recheck=current.reduce((n,i)=>n+countRechecks(i),0);
 stats.replaceChildren();for(const [n,label]of [[current.length,'published routes'],[complete,'complete windows'],[needs,'need verification']]){const cell=N('div');cell.append(N('strong','',String(n)),N('span','',label));stats.append(cell);}
 queue.hidden=!privileged;queue.textContent=privileged?'Administrator verification queue: '+needs+' routes · '+(live&&!privateError?recheck+' saved coordination items need another look.':'coordination recheck totals are unavailable.')+(privateError?' '+privateError:''):'';
 const visible=current.filter(i=>filter.value==='needs'?i.needsVerification:filter.value==='complete'?i.coverage==='complete':filter.value==='recheck'?countRechecks(i)>0:true);cards.replaceChildren();
 for(const item of visible){const r=item.route,s=item.schedule,card=N('article','schedule-route-card');card.setAttribute('data-route-id',String(r.remoteId||''));const name=N('h3','',r.name),badge=N('span','schedule-coverage-badge '+item.coverage,({complete:'Complete window','start-only':'Finish missing','finish-only':'Start missing',missing:'Dates not published',invalid:'Dates need correction'})[item.coverage]);card.append(name,N('span','land-badge',r.mode||'High-capacity route'),badge);
  const facts=N('dl','schedule-route-facts');for(const [label,value]of [['Construction start',s.start_label||L.dateLabel(s.construction_start)],['Construction finish',s.finish_label||L.dateLabel(s.construction_finish)],['Published phase',s.phase||'No construction phase recorded'],['Last verified',s.checked_at?L.dateLabel(s.checked_at):'Not recorded'],['Source published',s.source_published_at?L.dateLabel(s.source_published_at):'Date not supplied']])facts.append(N('dt','',label),N('dd','',value));card.append(facts);
  card.append(sourceLink(s.source_title||'Schedule source ↗',s.source_url));for(const extra of s.additional_sources||[])if(L.http(extra.url))card.append(sourceLink(extra.title||'Additional source ↗',extra.url));
  if(item.issues.length){const list=N('ul','schedule-issues');for(const issue of item.issues)list.append(N('li','',issue));card.append(list);}else card.append(P('Construction endpoints and a recent source check are recorded. Dates may still be estimates.'));
  const actions=N('div','land-actions'),open=B(privileged?'Review / edit schedule':'Open route watchlist',()=>inspect(item,privileged));open.id='scheduleOpenRoute-'+r.remoteId;actions.append(open);
  if(privileged){actions.append(B('Schedule history',()=>showHistory(item)));const n=countRechecks(item);if(n)actions.append(B('Recheck '+n+' coordination item'+(n===1?'':'s'),()=>inspect(item,false,true)));}
  card.append(actions);cards.append(card);
 }
 if(!visible.length)cards.append(P(filter.value==='recheck'&&(!live||privateError)?'Coordination rechecks could not be loaded. Refresh records to retry.':loading?'Loading schedule records…':'No routes match this view.'));
}
async function load(){
 const request=++token;loading=true;refresh.disabled=true;message.textContent='Loading schedule coverage…';privateError='';cards.replaceChildren(P('Loading saved schedules…'));stats.replaceChildren();queue.textContent='';historyToken++;history.hidden=true;history.replaceChildren();
 try{await window.tracksideAppReady;const routeRows=routes();let schedules;
  try{schedules=await api.listRouteSchedules();live=true;}catch(error){live=false;schedules=routeRows.map(r=>{const s=(window.TRACKSIDE_ROUTE_SCHEDULE_SNAPSHOT||[]).find(s=>s.route_slug===window.TracksideCoordinationCore.slug(r.slug||r.name));return s?{...s,route_id:r.remoteId}:null;}).filter(Boolean);}
  let checkpoints=[];if(admin()&&live){try{checkpoints=await api.listCoordinationScheduleCheckpoints();}catch(error){privateError='Coordination queue unavailable: '+error.message;}}
  if(request!==token||!dialog.open)return;loading=false;reviews=admin()?checkpoints:[];items=C.build(routeRows,schedules,{staleDays:age.value});message.textContent=live?'Current saved schedule records. Refreshing does not verify agency dates.':'Live schedules unavailable. Showing the bundled research snapshot; changes and coordination rechecks cannot be verified.';render();
 }catch(error){if(request!==token)return;items=[];reviews=[];cards.replaceChildren();stats.replaceChildren();message.textContent='Schedule coverage unavailable: '+error.message;}
 finally{if(request===token){loading=false;refresh.disabled=false;}}
}
async function inspect(item,edit=false,recheck=false){try{const opened=await window.TracksideCoordination.openSchedule(item.route,{edit,recheck});if(opened!==false)close();}catch(error){message.textContent='Could not open route: '+error.message;}}
function valueText(value){return value==null||value===''?'Not recorded':typeof value==='object'?JSON.stringify(value):String(value);}
async function showHistory(item,append=false){
 if(!admin())return;const request=++historyToken;if(!append){historyFocus=document.activeElement;historyOffset=0;history.replaceChildren(N('h3','',item.route.name+' · Schedule history'),B('Close history',()=>{historyToken++;history.hidden=true;history.replaceChildren();historyFocus?.focus?.();}),P('History starts with the recorded baseline. Earlier agency changes have not been reconstructed.'));}history.hidden=false;const state=P('Loading saved history…');state.setAttribute('role','status');history.append(state);if(!append)history.scrollIntoView({block:'start',behavior:'smooth'});
 try{const entries=await api.listRouteScheduleHistory(item.route.remoteId,historyOffset);if(request!==historyToken||!admin()||!dialog.open)return;state.remove();
  if(!entries.length&&!append)history.append(P('No recorded history is available for this route yet.'));
  for(const entry of entries){const section=N('article','schedule-history-entry');section.append(N('h4','',entry.event_type==='baseline'?'Recorded baseline':entry.event_type==='created'?'Schedule created':entry.dates_changed?'Construction dates changed':'Source / verification update'),P(new Date(entry.recorded_at).toLocaleString()+' · '+(entry.changed_by?'Administrator edit':'System record')));
   if(entry.event_type==='baseline'||entry.event_type==='created'){const s=entry.after_record;section.append(P('Start: '+(s.start_label||L.dateLabel(s.construction_start))+' → Finish: '+(s.finish_label||L.dateLabel(s.construction_finish))),sourceLink(s.source_title||'Recorded source',s.source_url));}
   else for(const change of C.differences(entry)){const row=N('div','schedule-history-diff');row.append(N('strong','',change.label),change.key==='source_url'&&L.http(change.before)?sourceLink('Previous source ↗',change.before):N('span','',valueText(change.before)),N('span','schedule-history-arrow','→'),change.key==='source_url'&&L.http(change.after)?sourceLink('Updated source ↗',change.after):N('span','',valueText(change.after)));section.append(row);}
   history.append(section);
  }
  if(entries.length===30){const more=B('Load earlier changes',()=>{more.remove();historyOffset+=30;showHistory(item,true);});history.append(more);}
 }catch(error){if(request===historyToken&&admin())state.textContent='Could not load schedule history: '+error.message;}
}
async function open(options={}){if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();}filter.value=options.queue?'needs':'all';await load();}
filter.addEventListener('change',render);age.addEventListener('change',render);
const layers=B('Schedule coverage',()=>open());layers.id='openScheduleCoverage';layers.classList.add('land-wide');$('openCoordinationWatchlist').after(layers);
const inline=B('Schedule coverage',()=>open());inline.id='coordScheduleCoverageButton';$('coordClose').before(inline);
const adminEntry=B('Route schedule verification queue',()=>{$('closeAuthModal').click();open({queue:true});});adminEntry.id='adminScheduleCoverageEntry';adminEntry.hidden=!admin();$('adminCoordinationEntry').before(adminEntry);
const priorAdmin=updateAdminUi;updateAdminUi=function(...args){const result=priorAdmin(...args);adminEntry.hidden=!admin();token++;historyToken++;reviews=[];history.replaceChildren();history.hidden=true;if(dialog.open){render();load();}return result;};
window.TracksideScheduleCoverage={open,close,refreshIfOpen(){if(dialog.open)load();}};
})();
