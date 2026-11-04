/* Shared, on-demand approved coverage cache. Never writes to Supabase. */
(function(){
'use strict';
const C=window.TracksideNewsCore,api=window.tracksideSupabase,select=document.getElementById('recentNewsFilter'),status=document.getElementById('recentNewsStatus'),retry=document.getElementById('retryRecentNews');
let rows=[],loaded=0,pending=null,ids=new Set(),state='idle';
function paint(){status.textContent=select.value==='all'?'':state==='loading'?'Loading approved coverage…':state==='error'?'News could not load. Retry or clear this filter.':'Articles published in the past '+select.value+' days; unknown dates excluded.';retry.hidden=select.value==='all'||state!=='error';}
function update(){ids=C.recentIds(rows,Number(select.value));paint();if(select.value!=='all')render();}
async function load(force=false){if(pending)return pending;if(!force&&loaded&&Date.now()-loaded<300000){state='ready';return rows;}state='loading';paint();pending=(async()=>{try{rows=C.sorted(await api.listApprovedNewsHistory());loaded=Date.now();state='ready';update();return rows;}catch(e){state='error';paint();throw e;}finally{pending=null;}})();return pending;}
select.addEventListener('change',()=>{if(select.value==='all'){paint();render();return;}ids=new Set();state='loading';paint();render();load().then(update).catch(()=>{render();});});
retry.addEventListener('click',()=>load(true).then(update).catch(()=>render()));
window.TracksideNews=Object.freeze({load,matches:id=>select.value==='all'||state==='ready'&&ids.has(String(id)),clear(){select.value='all';paint();}});
})();
