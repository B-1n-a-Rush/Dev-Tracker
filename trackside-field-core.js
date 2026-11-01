/* Staff field observations. No automatic status or accessibility certification. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideFieldCore=api;})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
const checks=Object.freeze({sidewalk:'Sidewalk connection',crossing:'Crossing',curb_ramp:'Curb ramp',stop_access:'Stop boarding / access'}),states=Object.freeze({'Not checked':'Not checked','Observed':'Observed — no issue noted','Needs attention':'Needs attention','Not applicable':'Not applicable'}),kinds=['Condition','Before','After'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,siteId=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/,photoPath=/^[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function text(value,max,label){if(value!=null&&typeof value!=='string')throw Error(label+' must be text.');const s=(value||'').trim();if(s.length>max)throw Error(label+' is too long.');return s;}
function normalize(input,site,visitId,day=today()){
 if(!siteId.test(site)||!uuid.test(visitId)||!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid field visit.');
 const date=text(input.visited_on,10,'Visit date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<'1900-01-01'||date>day)throw Error('Choose a valid visit date, today or earlier.');
 const stop=text(input.stop_number,40,'Stop number');if(stop&&!/^[A-Za-z0-9_-]{1,40}$/.test(stop))throw Error('Invalid stop number.');
 const observations={};for(const key of Object.keys(checks)){const item=input.checklist?.[key]||{},state=item.state||'Not checked',note=text(item.note,1000,checks[key]+' note');if(!Object.hasOwn(states,state))throw Error('Invalid observation state.');if(state==='Needs attention'&&!note)throw Error('Add a note explaining '+checks[key].toLowerCase()+' concerns.');observations[key]={state,note};}
 const photos=input.photos||[];if(!Array.isArray(photos)||photos.length>6)throw Error('Use up to six photos per visit.');const paths=new Set();const cleanPhotos=photos.map(p=>{if(!p||!photoPath.test(p.storage_path)||p.storage_path.split('/')[1]!==site||p.storage_path.split('/')[2]!==visitId.toLowerCase()||paths.has(p.storage_path)||p.content_type!=='image/jpeg'||!Number.isInteger(p.size)||p.size<1||p.size>5242880||!kinds.includes(p.kind))throw Error('Invalid field photo or duplicate reference.');paths.add(p.storage_path);const caption=text(p.caption,500,'Photo caption');if(!caption)throw Error('Add a short caption to each photo.');return {storage_path:p.storage_path,content_type:'image/jpeg',size:p.size,kind:p.kind,caption};});
 return {visited_on:date,stop_number:stop,checklist:observations,notes:text(input.notes,5000,'Visit notes'),next_action:text(input.next_action,2000,'Next action'),photos:cleanPhotos};
}
async function validatePhoto(file){if(!file||file.type!=='image/jpeg'||file.size<3||file.size>5242880)throw Error('Prepared photo must be a JPEG up to 5 MB.');const b=new Uint8Array(await file.slice(0,3).arrayBuffer());if(b[0]!==255||b[1]!==216||b[2]!==255)throw Error('Photo is not a valid JPEG.');}
return Object.freeze({checks,states,kinds,uuid,siteId,photoPath,today,normalize,validatePhoto});
});
