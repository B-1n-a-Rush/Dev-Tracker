/* Area analysis and one-page brief presentation. Geographic selection stays with Explore. */
(function(){
'use strict';
const C=window.TracksideAreaCore;
const $=id=>document.getElementById(id),number=value=>value.toLocaleString('en-US');
function element(tag,text,className){
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(className)node.className=className;
 return node;
}
function button(label,action){
 const node=element('button',label,'area-view-button');
 node.type='button';
 node.addEventListener('click',action);
 return node;
}
function link(label,href){
 const node=element('a',label);
 node.href=href;
 node.target='_blank';
 node.rel='noopener noreferrer';
 return node;
}
function dialog(id){
 const node=element('dialog',undefined,'area-view-dialog');
 node.id=id;
 node.setAttribute('aria-labelledby',id+'Title');
 document.body.append(node);
 return node;
}
const matchesDialog=dialog('areaMatchesDialog'),briefDialog=dialog('areaBriefDialog');
let cancelBriefMap=()=>{};
briefDialog.addEventListener('close',()=>{cancelBriefMap();cancelBriefMap=()=>{};});
function heading(node,title,print){
 const bar=element('header',undefined,'area-view-head');
 const label=element('h2',title);
 label.id=node.id+'Title';
 const buttons=element('div',undefined,'area-view-actions');
 if(print)buttons.append(print);
 buttons.append(button('Close',()=>node.close()));
 bar.append(label,buttons);
 node.replaceChildren(bar);
 return bar;
}
function stageLabel(status){
 return status==='Construction'?'Under construction':status==='Complete'?'Completed':'Planning';
}
function showMatches(label,rows,openProject){
 heading(matchesDialog,label);
 const list=element('ul',undefined,'area-match-list');
 for(const {project,status,kind} of rows){
  const item=element('li');
  const action=button(project.name,()=>{matchesDialog.close();openProject(project.id);});
  item.append(action,element('small',[stageLabel(status),C.projectScale(project),kind==='master-plan'?'Master plan':''].filter(Boolean).join(' · ')));
  list.append(item);
 }
 matchesDialog.append(list);
 matchesDialog.showModal();
}
function coverage(totals){
 let text=totals.known
  ? number(totals.units)+' known homes across '+number(totals.known)+' of '+number(totals.known+totals.unknown)+' tracked housing projects.'
  : 'No housing counts are recorded for the matching housing projects.';
 if(!totals.known&&!totals.unknown)text='No matching housing projects.';
 if(totals.unknown)text+=' '+number(totals.unknown)+' housing project'+(totals.unknown===1?' has':'s have')+' an unknown count.';
 return text;
}
function renderStatus(prefix,totals,openProject){
 for(const status of C.stages){
  const node=$(prefix+status+'Count'),stage=totals.stages[status],parent=node.parentElement;
  node.replaceChildren();
  if(stage.rows.length){
   const action=button(number(stage.rows.length),()=>showMatches(stageLabel(status)+' projects',stage.rows,openProject));
   action.setAttribute('aria-label','View '+number(stage.rows.length)+(stage.rows.length===1?' project':' projects')+(status==='Planning'?' in planning':status==='Construction'?' under construction':' completed'));
   action.setAttribute('aria-haspopup','dialog');
   node.append(action);
  }else node.textContent='0';
  let note=parent.querySelector('.area-stage-units');
  if(!note){note=element('small',undefined,'area-stage-units');parent.append(note);}
  note.textContent=stage.known?number(stage.units)+' known homes':stage.unknown?'Home counts unknown':'';
 }
}
function renderCoverage(summary,totals,openProject){
 summary.replaceChildren(element('span',coverage(totals)));
 if(totals.masterPlans.length){
  const plans=button('View '+number(totals.masterPlans.length)+' master plan'+(totals.masterPlans.length===1?'':'s'),
    ()=>showMatches('District-wide master plans',totals.masterPlans,openProject));
  plans.setAttribute('aria-haspopup','dialog');
  summary.append(element('span','District-wide figures are reported separately.'),plans);
 }
}
function render(prefix,model,openProject,openBrief){
 const {totals,nearby,scope,brief}=model;
 $(prefix+'ProjectCount').textContent=number(nearby);
 $(prefix+'MatchingCount').textContent=number(totals.rows.length);
 $(prefix+'ResidentialUnits').textContent=totals.known?number(totals.units):'—';
 const unitLabel=$(prefix+'ResidentialUnits').nextElementSibling;
 if(unitLabel)unitLabel.textContent='known homes in matches';
 renderStatus(prefix,totals,openProject);
 const summary=$(model.summaryId);
 renderCoverage(summary,totals,openProject);
 let bar=summary.parentElement.querySelector('.area-brief-launch');
 if(!bar){bar=element('div',undefined,'area-brief-launch');summary.after(bar);}
 bar.replaceChildren();
 if(brief){
  const launch=button('Open '+brief.kind+' brief',async()=>{
   launch.disabled=true;
   const label=launch.textContent;
   launch.textContent='Preparing brief…';
   try{await openBrief(model);}catch(error){
    const message=element('p','Could not prepare this brief. Refresh the tracker and try again.','area-brief-context');
    message.setAttribute('role','alert');
    bar.querySelector('[role="alert"]')?.remove();
    bar.append(message);
   }finally{launch.disabled=false;launch.textContent=label;}
  });
  launch.setAttribute('aria-haspopup','dialog');
  bar.append(launch);
 }
 if(scope)summary.append(element('span',scope));
}
function printRows(totals){
 const table=element('table',undefined,'area-brief-table');
 const header=element('tr');
 for(const label of ['Development stage','Projects','Known homes','Missing home counts']){
  const cell=element('th',label);cell.scope='col';header.append(cell);
 }
 const head=element('thead');head.append(header);
 const body=element('tbody');
 for(const name of C.stages){
  const row=element('tr'),stage=totals.stages[name],title=element('th',stageLabel(name));title.scope='row';
  row.append(title,element('td',number(stage.rows.length)),element('td',stage.known?number(stage.units):'—'),element('td',number(stage.unknown)));
  body.append(row);
 }
 table.append(head,body);
 return table;
}
function section(title,children){
 const node=element('section');
 node.append(element('h3',title),...children);
 return node;
}
function showBrief(model,buildMap){
 const {brief,totals,nearby,scope}=model;
 const print=button('Print / save PDF',()=>window.print());
 print.disabled=true;
 const title=brief.name+' · '+brief.kind+' brief';
 heading(briefDialog,title,print);
 const page=element('article',undefined,'area-brief-page');
 page.append(element('p','Metro Atlanta Transit & Development Tracker · As of '+new Date().toLocaleDateString('en-US',{dateStyle:'long'}),'area-brief-kicker'));
 page.append(element('p',number(totals.rows.length)+' of '+number(nearby)+' projects match the current view. '+scope));
 if(brief.filters.length)page.append(element('p','Filters applied · '+brief.filters.join(' · '),'area-brief-context'));
 const map=buildMap(brief,totals.rows.map(row=>row.project));
 if(map){
  cancelBriefMap=map.cancel;
  page.append(map.element);
  void map.ready.then(()=>{print.disabled=false;},()=>{print.disabled=false;});
 }else print.disabled=false;
 page.append(section('Development pipeline',[element('p',coverage(totals)),printRows(totals)]));
 if(totals.masterPlans.length){
  const plans=totals.masterPlans.slice(0,3).map(row=>{
   const text=element('p',row.project.name+' · '+(C.projectScale(row.project)||'Buildout figures unavailable'));
   if(row.source)text.append(document.createTextNode(' · '),link('Source',row.source));
   return text;
  });
  if(totals.masterPlans.length>plans.length)plans.push(element('p','Additional master plans are listed in the area profile.'));
  page.append(section('District-wide figures reported separately',plans));
 }
 if(brief.milestones.length)page.append(section('Recent project milestones',brief.milestones.map(({project,event})=>{
  const text=element('p',project.name+' · '+event.date+' · '+event.label+(event.expected?' (expected)':''));
  if(event.sourceUrl)text.append(document.createTextNode(' · '),link('Source',event.sourceUrl));
  return text;
 })));
 if(brief.routes.length)page.append(section('Relevant transit',brief.routes.map(route=>{
  const text=element('p',route.name+' · '+route.detail);
  if(route.source)text.append(document.createTextNode(' · '),link('Source',route.source));
  return text;
 })));
 for(const entry of brief.context||[])page.append(section(entry.title,entry.lines.map(line=>element('p',line))));
 page.append(element('p',brief.note||'Map distances use project points and mapped transit geometry. The development pipeline covers tracked individual projects and phases with reported figures.','area-brief-context'));
 briefDialog.append(page);
 briefDialog.showModal();
}
window.addEventListener('beforeprint',()=>{if(briefDialog.open)document.body.classList.add('area-brief-printing');});
window.addEventListener('afterprint',()=>document.body.classList.remove('area-brief-printing'));
window.TracksideAreaViews={render,renderStatus,renderCoverage,showBrief};
})();
