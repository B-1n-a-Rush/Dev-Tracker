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
return Object.freeze({create});});
