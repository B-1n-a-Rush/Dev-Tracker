/* On-screen proof before native printing. Normal image tiles print without background graphics. */
(function(){
'use strict';
const N=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
let active=null;
function close(){if(!active)return;const old=active;active=null;old.map.cancel();old.dialog.close();old.dialog.remove();document.body.classList.remove('coord-printing');old.focus?.focus?.();}
function open(report,map){
 close();const focus=document.activeElement,dialog=N('dialog','coord-briefing-preview');dialog.id='coordBriefingPreview';dialog.setAttribute('aria-labelledby','coordBriefingTitle');
 const head=N('div','coord-briefing-head'),title=N('h2','','Briefing preview');title.id='coordBriefingTitle';const actions=N('div','coord-view-actions'),print=N('button','land-button','Preparing map…'),retry=N('button','land-button','Retry basemap'),dismiss=N('button','land-button','Close preview');print.id='coordPrintPreparedBriefing';print.type=retry.type=dismiss.type='button';print.disabled=retry.disabled=true;retry.id='coordRetryBriefingMap';dismiss.id='coordCloseBriefing';actions.append(print,retry,dismiss);head.append(title,actions);dialog.append(head,report);document.body.append(dialog);
 const state={dialog,map,focus};active=state;dialog.showModal();
 async function ready(promise){print.disabled=retry.disabled=true;try{const result=await promise;if(active!==state)return;print.textContent=result.failed?'Print with map warning / save PDF':'Print / save PDF';print.disabled=false;retry.disabled=false;retry.hidden=!result.failed;}catch{if(active!==state)return;print.textContent='Map unavailable — retry';retry.disabled=false;retry.hidden=false;}}
 print.addEventListener('click',()=>{if(print.disabled||active!==state)return;document.body.classList.add('coord-printing');try{window.print();}finally{document.body.classList.remove('coord-printing');}});
 retry.addEventListener('click',()=>ready(map.retry()));dismiss.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});ready(map.ready);
}
window.TracksideCoordinationBriefing={open,close};
})();
