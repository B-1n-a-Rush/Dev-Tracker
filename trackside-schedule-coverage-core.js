(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./trackside-land-core.js'):root.TracksideLandCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideScheduleCoverageCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(L){
'use strict';
const names={construction_start:'Construction start',start_label:'Published start wording',construction_finish:'Construction finish',finish_label:'Published finish wording',phase:'Published phase',source_url:'Source URL',source_title:'Source title',source_published_at:'Source publication date',checked_at:'Last verified',evidence:'Evidence',notes:'Schedule caveats',additional_sources:'Additional sources'};
function day(value){const r=/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&L.dateRange(value);return r?r.first:null;}
function today(){const n=new Date();return [n.getFullYear(),String(n.getMonth()+1).padStart(2,'0'),String(n.getDate()).padStart(2,'0')].join('-');}
function needsRecheck(review,schedule){return !!review&&(!schedule?.schedule_version||review.reviewed_schedule_version==null||String(review.reviewed_schedule_version)!==String(schedule.schedule_version));}
function assess(route,schedule,options={}){
 const s=schedule||{},issues=[],start=L.dateRange(s.construction_start),finish=L.dateRange(s.construction_finish),now=day(options.today||today()),checked=day(s.checked_at),staleDays=[30,90,180].includes(Number(options.staleDays))?Number(options.staleDays):90;
 const invalid=!!((s.construction_start&&!start)||(s.construction_finish&&!finish)||(start&&finish&&start.first>finish.last));
 const coverage=invalid?'invalid':start&&finish?'complete':start?'start-only':finish?'finish-only':'missing';
 if(!schedule)issues.push('No saved schedule record');
 if(invalid)issues.push('Construction dates need correction');else{if(!start)issues.push('Construction start not published');if(!finish)issues.push('Construction finish not published');}
 if(!L.http(s.source_url)||!String(s.source_title||'').trim())issues.push('Schedule source missing');
 const age=checked!==null&&now!==null?Math.floor((now-checked)/86400000):null;
 if(age===null)issues.push('Verification date missing or invalid');else if(age<0)issues.push('Verification date is in the future');else if(age>=staleDays)issues.push('Not verified in '+staleDays+' days');
 return {route,schedule:s,coverage,issues,needsVerification:!!issues.length,age,staleDays,priority:invalid?0:!schedule?1:coverage==='missing'?2:coverage!=='complete'?3:issues.length?4:5};
}
function build(routes,schedules,options={}){const byId=new Map(schedules.map(s=>[String(s.route_id),s]));return routes.filter(r=>r.isPublished!==false&&r.is_published!==false).map(route=>assess(route,byId.get(String(route.remoteId??route.id)),options)).sort((a,b)=>a.priority-b.priority||a.route.name.localeCompare(b.route.name));}
function differences(entry){return (entry.changed_fields||[]).filter(k=>Object.hasOwn(names,k)).map(key=>({key,label:names[key],before:entry.before_record?.[key]??null,after:entry.after_record?.[key]??null}));}
return {assess,build,needsRecheck,differences,names,today};
});
