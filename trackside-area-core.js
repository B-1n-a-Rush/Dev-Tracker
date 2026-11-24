/* Shared development figures for the Explore list, area profiles and briefs. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TracksideAreaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const stages=['Planning','Construction','Complete'];
const scopes={
 'centennial-yards':{kind:'master-plan',program:'Centennial Yards'},
 'regional-19':{kind:'master-plan',program:'Centennial Yards'},
 'regional-16':{kind:'phase',program:'Centennial Yards'},
 'regional-29':{kind:'phase',program:'Centennial Yards'}
};
// Reviewed against the Centennial Yards developer's district and building descriptions.
const centennialSource='https://centennialyards.com/about/';
const garsonSource='https://www.pennrose.com/news-views/news/2026/atlanta-beltline-pennrose-and-radiant-development-partners-break-ground-on-overlook-at-garson/';
const number=value=>Number(value).toLocaleString('en-US');
function count(value){
 if(value===undefined||value===null||String(value).trim()===''||typeof value==='boolean')return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
function http(value){
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
function scope(project){
 const meta=project.metadata||{},known=Object.hasOwn(scopes,project.id)?scopes[project.id]:null;
 const kind=['master-plan','phase','standalone'].includes(meta.program_scope)?meta.program_scope:known?.kind||'';
 const program=String(meta.parent_program||known?.program||'').trim();
 return {kind,program,source:known?centennialSource:''};
}
function housing(project){
 const n=count(project.residentialUnits);
 if(n>0)return n;
 return count(project.metadata?.reported_residential_units)===0?0:null;
}
function affordability(project){
 const value=project.metadata?.affordability;
 if(!Object.hasOwn(project.metadata||{},'affordability')&&project.id==='overlook-garson'&&housing(project)===130){
  return {units:130,levels:'50%, 60% and 80% of area median income (AMI)',source:garsonSource};
 }
 const source=http(value?.source_url),units=count(value?.units),total=housing(project);
 const levels=typeof value?.levels==='string'?value.levels.trim():'';
 if(!source||(units===null&&!levels))return null;
 return {units:total===null||units<=total?units:null,levels,source};
}
function housingRelevant(project){
 return housing(project)!==null||String(project.projectType||'').toLowerCase()==='residential'||
  [project.projectType,...(project.subtypes||[])].some(type=>/^(residential|mixed[ -]use)$/i.test(type||''))||
  /\b(?:housing|homes|apartments|townhomes|condos|residences)\b/i.test(project.program||'');
}
function summarize(input,getStatus=project=>project.status){
 const unique=new Map();
 for(const project of input)if(project?.id&&!unique.has(project.id))unique.set(project.id,project);
 const rows=[...unique.values()].map(project=>{
  const {kind,program,source}=scope(project);
  return {project,status:getStatus(project),units:housing(project),relevant:housingRelevant(project),kind,program,source};
 });
 const totals={units:0,known:0,unknown:0,nonHousing:0,hotel:0,retail:0,commercial:0,medical:0,masterPlans:[],rows,stages:{}};
 for(const status of stages)totals.stages[status]={rows:[],units:0,known:0,unknown:0};
 for(const row of rows){
  if(row.kind==='master-plan'){totals.masterPlans.push(row);continue;}
  const stage=totals.stages[row.status];
  if(stage)stage.rows.push(row);
  if(row.units!==null){
   totals.units+=row.units;totals.known++;
   if(stage){stage.units+=row.units;stage.known++;}
  }else if(row.relevant){
   totals.unknown++;
   if(stage)stage.unknown++;
  }else totals.nonHousing++;
  const p=row.project;
  totals.hotel+=count(p.hotelUnits)||0;
  totals.retail+=count(p.retailSpaceSqFt)||0;
  totals.commercial+=count(p.commercialSpaceSqFt)||0;
  totals.medical+=count(p.medicalSpaceSqFt)||0;
 }
 return totals;
}
function projectScale(project){
 const units=housing(project),aff=affordability(project),{kind}=scope(project);
 if(units!==null)return [number(units),aff?.units===units&&units>0?'affordable homes':'homes',kind==='master-plan'?'· district-wide':''].filter(Boolean).join(' ');
 for(const [key,suffix] of [['hotelUnits','hotel rooms'],['retailSpaceSqFt','sq ft retail'],['commercialSpaceSqFt','sq ft commercial'],['medicalSpaceSqFt','sq ft medical']]){
  const value=count(project[key]);
  if(value>0)return number(value)+' '+suffix+(kind==='master-plan'?' · district-wide':'');
 }
 return '';
}
function orderedProjects(projects,order,{updated=()=>0,distance=()=>Infinity}={}){
 if(!['updated','distance','homes'].includes(order))return projects;
 const compare=order==='updated'?(a,b)=>(updated(b)||0)-(updated(a)||0):
  order==='distance'?(a,b)=>distance(a)-distance(b):(a,b)=>(housing(b)??-1)-(housing(a)??-1);
 return projects.slice().sort((a,b)=>compare(a,b)||String(a.name).localeCompare(String(b.name)));
}
return {stages,count,http,housing,affordability,scope,summarize,projectScale,orderedProjects};
});
