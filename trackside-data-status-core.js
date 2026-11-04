/* Public retrieval history only. No records, coordinates, auth, notes or errors. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideDataStatusCore=api;})(globalThis,()=>{
'use strict';
const key='trackside-public-data-status-v1',validId=id=>/^[a-z][a-z0-9:-]{0,79}$/.test(id),date=v=>{if(v===null||v===undefined||v==='')return '';const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():'';};
function metadata(raw={}){const m={};for(const k of ['sourceUpdated','geometryUpdated','importedAt','effectiveDate'])if(date(raw[k]))m[k]=date(raw[k]);for(const k of ['version','name','verification'])if(typeof raw[k]==='string')m[k]=raw[k].replace(/[\u0000-\u001f]/g,'').slice(0,160);if(Number.isSafeInteger(raw.count)&&raw.count>=0)m.count=raw.count;m.partial=raw.partial===true;return m;}
function create({storage,now=()=>Date.now()}={}){
 const records=new Map(),listeners=new Set();let serial=0;
 try{const raw=storage?.getItem(key);if(raw&&raw.length<60000){const parsed=JSON.parse(raw);if(parsed.version===1&&Array.isArray(parsed.rows))for(const r of parsed.rows.slice(0,100))if(validId(r.id))records.set(r.id,{id:r.id,lastSuccess:date(r.lastSuccess),meta:metadata(r.meta),state:'idle',available:false,loadedThisSession:false});}}catch{}
 const emit=()=>{for(const fn of listeners)fn();};
 function save(){try{storage?.setItem(key,JSON.stringify({version:1,rows:[...records.values()].map(r=>({id:r.id,lastSuccess:r.lastSuccess||'',meta:metadata(r.meta)}))}));}catch{}}
 function begin(id){if(!validId(id))throw Error('Invalid source ID');const prior=records.get(id)||{id,available:false,loadedThisSession:false};const token=++serial;records.set(id,{...prior,token,lastAttempt:date(now()),state:'loading'});emit();return{id,token};}
 function success(ticket,meta={}){const old=records.get(ticket.id);if(!old||old.token!==ticket.token)return false;records.set(ticket.id,{...old,state:'ready',lastSuccess:date(now()),meta:metadata(meta),available:true,loadedThisSession:true,retained:false});save();emit();return true;}
 function failure(ticket,{retained=false}={}){const old=records.get(ticket.id);if(!old||old.token!==ticket.token)return false;records.set(ticket.id,{...old,state:'error',available:retained===true&&old.loadedThisSession,retained:retained===true&&old.loadedThisSession});emit();return true;}
 async function observe(id,load,summarize=()=>({})){const token=begin(id);try{const result=await load();success(token,summarize(result));return result;}catch(e){failure(token,{retained:records.get(id)?.available});throw e;}}
 function get(id){return structuredClone(records.get(id)||{id,state:'idle',available:false,loadedThisSession:false,meta:{}});}
 return{begin,success,failure,observe,get,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
}
function latest(values){return values.map(date).filter(Boolean).sort().at(-1)||'';}
function status(row){if(row.state==='loading')return row.available?'Refreshing · previous data available':'Checking source…';if(row.state==='error')return row.retained?'Refresh unsuccessful · showing previous data':'Source unavailable on latest attempt';if(row.state==='ready')return row.meta?.partial?'Loaded · coverage limited':'Loaded successfully';return row.lastSuccess?'Not checked in this session':'Not loaded yet';}
// Failed refreshes can reuse only a successful payload actually held in this session.
function retainSources(sources,settled,cache,at){return sources.map((source,i)=>{const r=settled[i];if(r.status==='fulfilled'){const saved={value:r.value,at};cache.set(source.id,saved);return{source,ok:true,value:r.value,lastSuccess:at,cached:false};}const prior=cache.get(source.id);return{source,ok:false,value:prior?.value,lastSuccess:prior?.at||'',cached:!!prior,error:r.reason?.message||'Source unavailable'};});}
return{key,date,metadata,create,latest,status,retainSources};
});
