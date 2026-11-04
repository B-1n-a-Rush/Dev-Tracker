/* Approved article presentation only; no inference of project-field changes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideNewsCore=api;})(globalThis,()=>{
'use strict';
const time=x=>x?Date.parse(x):NaN;
function http(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function sorted(rows){const seen=new Set();return rows.filter(a=>{const url=http(a.url),key=String(a.project_id)+'|'+url;if(!url||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(time(b.published_at)||0)-(time(a.published_at)||0)||String(b.id).localeCompare(String(a.id)));}
function recentIds(rows,days,now=Date.now()){const earliest=now-Number(days)*86400000;return new Set(rows.filter(a=>{const date=time(a.published_at);return http(a.url)&&Number.isFinite(date)&&date>=earliest&&date<=now;}).map(a=>String(a.project_id)));}
return{sorted,recentIds};
});
