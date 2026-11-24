/* Project profile read state. Map/editor/auth services remain outside the renderer. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.TracksideProjectProfileState=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function create(services){const empty=()=>({status:'idle',items:[],error:'',checked:''}),listeners=new Set();let state=Object.freeze({project:null,canHistory:false,tab:'overview',news:empty(),history:empty()}),newsRun=0,historyRun=0,signature='';
 function emit(patch){state=Object.freeze({...state,...patch});for(const fn of listeners)fn();}
 async function news(){const project=state.project;if(!project)return;const id=project.id,run=++newsRun;emit({news:{...empty(),status:'loading'}});try{const[items,checked]=await Promise.all([services.news(id),Promise.resolve().then(()=>services.newsStatus(id)).catch(()=>null)]);if(run!==newsRun||state.project?.id!==id)return;emit({news:{status:'ready',items:items||[],error:'',checked:checked?.last_checked_at||''}})}catch(error){if(run===newsRun&&state.project?.id===id)emit({news:{...empty(),status:'error',error:error.message||'Approved news unavailable'}})}}
 async function history(force=false){if(!state.project||!state.canHistory)return;if(!force&&['loading','ready'].includes(state.history.status))return;const id=state.project.id,run=++historyRun;emit({history:{...empty(),status:'loading'}});try{const entries=await services.history(id);if(run!==historyRun||state.project?.id!==id||!state.canHistory||!services.canHistory())return;emit({history:{status:'ready',items:services.describeHistory(entries),error:'',checked:''}})}catch(error){if(run===historyRun&&state.project?.id===id&&state.canHistory)emit({history:{...empty(),status:'error',error:error.message||'History unavailable'}})}}
 function refresh(){const project=services.getProject(),canHistory=!!services.canHistory();if(!project){if(state.project){newsRun++;historyRun++;signature='';emit({project:null,tab:'overview',canHistory,news:empty(),history:empty()})}return;}
  const view=services.describe(project),nextSignature=JSON.stringify(view),different=state.project?.id!==view.id,changed=signature!==nextSignature,roleChanged=canHistory!==state.canHistory;
  if(!different&&!changed&&!roleChanged)return;signature=nextSignature;const invalidHistory=different||changed||roleChanged;if(invalidHistory)historyRun++;
  emit({project:view,canHistory,tab:different||!canHistory?'overview':state.tab,...(invalidHistory?{history:empty()}:{}),...(different?{news:empty()}:{})});if(different)void news();else if(state.tab==='history')void history();
 }
 function tab(value){const next=value==='history'&&state.canHistory?'history':'overview';emit({tab:next});if(next==='history')void history();}
 return Object.freeze({getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},refresh,tab,news,history});
}

const recordLabels = new Set(['project details updated','project added to tracker','imported from regional developments spreadsheet']);
const unknownDate = /^(?:tbd|unknown|not provided|not disclosed|not yet published)$/i;
const expectedLabel = /\b(?:expected|estimated|forecast|projected|target(?:ed)?)\b/i;
const startLabel = /\b(?:groundbreak\w*|construction\s+(?:began|begins?|start(?:ed|s)?|commenced))\b/i;
const finishLabel = /\b(?:completion|delivery|construction\s+(?:complete|finished))\b/i;
const datePeriod = /^(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:[1-9]\d?,?\s+)?|(?:spring|summer|fall|autumn|winter|q[1-4]|early|mid|late)\s+)?\d{4}$/i;
function timeline(events, sourceStatus = '', sourceUrl = '') {
 const milestones = [], history = new Map(), seen = new Set();
 for (const event of Array.isArray(events) ? events : []) {
  if (!Array.isArray(event)) continue;
  const date = String(event[0] ?? '').trim(), label = String(event[1] ?? '').trim();
  if (!label) continue;
  const key = JSON.stringify([date.toLowerCase(),label.toLowerCase()]);
  if (recordLabels.has(label.toLowerCase())) {
   const previous = history.get(key);
   if (previous) previous.count++;
   else history.set(key,{date,label,count:1});
  } else if (!seen.has(key)) {
   seen.add(key);
   milestones.push({date,label,expected:event[2] === 1 || event[2] === '1' || event[2] === true || expectedLabel.test(label),sourceUrl:''});
  }
 }
 // Reuse explicit dates from the linked source status, preserving its stated precision.
 for (const clause of sourceUrl ? String(sourceStatus).split(/[;\n]/) : []) {
  const text = clause.trim().replace(/\.$/,'');
  const start = /^construction (?:began|started|commenced)(?: in| on)? (.+)$/i.exec(text);
  const finish = /^(?:construction )?completion (?:is )?(?:expected|estimated|projected|targeted)(?: in| for| on)? (.+)$/i.exec(text);
  const match = start || finish;
  if (!match || !datePeriod.test(match[1])) continue;
  const date = match[1].replace(/^(spring|summer|fall|autumn|winter)/i, word => word[0].toUpperCase() + word.slice(1));
  const label = start ? 'Construction began' : 'Construction completion', expected = Boolean(finish);
  const matches = milestones.filter(entry => (start ? startLabel : finishLabel).test(entry.label) && entry.expected === expected);
  const existing = matches.find(entry => {
   const normalizeDate = value => value.toLowerCase().replace(/([a-z]{3})[a-z]*(?=\s+\d{4}$)/, '$1');
   return normalizeDate(entry.date) === normalizeDate(date);
  });
  if (existing) existing.sourceUrl = sourceUrl;
  else if (!matches.some(entry => entry.date && !unknownDate.test(entry.date))) {
   const placeholder = matches.find(entry => !entry.date || unknownDate.test(entry.date));
   if (placeholder) Object.assign(placeholder,{date,sourceUrl});
   else milestones.push({date,label,expected,sourceUrl});
  }
 }
 return {milestones:milestones.filter(entry => !entry.expected).concat(milestones.filter(entry => entry.expected)),history:[...history.values()]};
}
function routeAccessDetail({mode,distanceMeters,overridden}, phase, operating) {
 const reportedPhase = String(phase || '').trim();
 const service = operating || /^(?:in service|operational|operating|open for service)\b/i.test(reportedPhase)
  ? 'Operating service'
  : /\b(?:planning|environmental review|design|construction scheduled|under construction|construction underway)\b/i.test(reportedPhase)
   ? 'Planned service' : 'Service status unverified';
 const miles = distanceMeters / 1609.344;
 const distance = Number.isFinite(miles)
  ? (miles < 0.01 ? '<0.01' : miles.toFixed(miles < 0.1 ? 2 : 1)) + ' mi straight-line to alignment'
  : 'Alignment distance unavailable';
 return {service:mode+' · '+service,distance:distance+(overridden?' · Admin selected':'')};
}

const recordFields=Object.freeze({
 status:{label:'Status',key:'status'},
 type:{label:'Project type',key:'projectType'},
 units:{label:'Residential units',key:'residentialUnits',numeric:true},
 hotel:{label:'Hotel rooms',key:'hotelUnits',numeric:true},
 retail:{label:'Retail sq ft',key:'retailSpaceSqFt',numeric:true},
 commercial:{label:'Commercial sq ft',key:'commercialSpaceSqFt',numeric:true},
 medical:{label:'Medical sq ft',key:'medicalSpaceSqFt',numeric:true},
 station_area:{label:'Station area',key:'area'},
 address:{label:'Project address',key:'location'}
});
function recordSource(value){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function recordValue(field,value){
 if(field.numeric)return Number.isSafeInteger(value)&&value>=0?value:null;
 return typeof value==='string'?value.trim().slice(0,250)||null:null;
}
function publishedRecordChanges(entries,labels={}){
 const output=[],seen=new Set();
 for(const entry of Array.isArray(entries)?entries:[]){
  const source=recordSource(entry?.source_url),when=entry?.changed_at;
  if(!source||typeof when!=='string'||!Number.isFinite(Date.parse(when))||!Array.isArray(entry.fields))continue;
  const fields=entry.fields.flatMap(item=>{
   const key=item?.field;
   if(!Object.hasOwn(recordFields,key))return [];
   const def=recordFields[key],before=recordValue(def,item.before),after=recordValue(def,item.after);
   return before===after?[]:[{key,label:labels[key]||def.label,before,after}];
  });
  if(!fields.length)continue;
  const date=new Date(when).toISOString(),signature=JSON.stringify([date,source,fields]);
  if(seen.has(signature))continue;
  seen.add(signature);
  output.push({date,source,fields});
 }
 return output.sort((a,b)=>b.date.localeCompare(a.date));
}
function backedRecordEdit(previous,updated,source,changedAt){
 const link=recordSource(source);
 if(!link)throw new Error('Enter the direct public source that supports this change.');
 if(!previous||previous.id!==updated.id)throw new Error('Open an existing project to record a source-backed change.');
 const previousRows=Array.isArray(previous.metadata?.public_record_history)?previous.metadata.public_record_history:[];
 const fields=[];
 for(const [field,def] of Object.entries(recordFields)){
  const read=project=>{
   const value=project[def.key];
   if(def.numeric&&value===0&&!(field==='units'&&project.metadata?.reported_residential_units===0))return null;
   return recordValue(def,value);
  };
  const before=read(previous),after=read(updated);
  if(before!==after)fields.push({field,before,after});
 }
 if(!fields.length)throw new Error('Change a project fact before adding a source-backed record entry.');
 return [{changed_at:changedAt,source_url:link,fields},...previousRows];
}

return Object.freeze({create,timeline,routeAccessDetail,publishedRecordChanges,backedRecordEdit});});
