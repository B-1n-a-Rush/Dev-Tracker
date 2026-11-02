/* View state only. Full geometry, screening, auth and review records stay in their existing services. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideBusViewState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function create(){const listeners=new Set(),handles=new Map();let state=Object.freeze({controls:{},message:'Choose a route to review construction.',busy:false,staff:false,route:null,rows:[],selected:null,page:0,windows:[],stats:[],timeline:null,completed:false,error:''});
 function set(patch){if(patch.staff===false&&state.staff)patch={...patch,rows:(patch.rows||state.rows).map(row=>({...row,owner:'',workflow:''}))};state=Object.freeze({...state,...patch});for(const fn of listeners)fn();}
 function update(id,patch){const c=state.controls[id];set({controls:{...state.controls,[id]:{...c,...patch}}});}
 function control(label,id,choices){const handlers=new Map(),dataset={};const options=(choices||[]).map(([value,text])=>({value,textContent:text}));set({controls:{...state.controls,[id]:{id,label,select:!!choices,options,value:options[0]?.value||'',hidden:false,type:'text',placeholder:''}}});
  // These small handles retain the controller's field contract without a duplicate DOM tree.
  const h={id,dataset,addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);},async fire(name){for(const fn of handlers.get(name)||[])await fn({target:h,preventDefault(){}});},add(option){const c=state.controls[id],options=[...c.options,{value:String(option.value),textContent:option.textContent}];update(id,{options,value:c.options.length?c.value:options[0].value});},replaceChildren(...values){const options=values.map(o=>({value:String(o.value),textContent:o.textContent}));update(id,{options,value:options[0]?.value||''});}};
  for(const key of ['value','type','placeholder'])Object.defineProperty(h,key,{get:()=>state.controls[id][key],set:value=>update(id,{[key]:String(value)})});
  Object.defineProperty(h,'options',{get:()=>state.controls[id].options});Object.defineProperty(h,'selectedOptions',{get:()=>h.options.filter(o=>o.value===h.value)});h.parentElement={};Object.defineProperty(h.parentElement,'hidden',{get:()=>state.controls[id].hidden,set:hidden=>update(id,{hidden:!!hidden})});handles.set(id,h);return h;
 }
 async function input(id,value,event='change'){const h=handles.get(id);if(!h||state.busy)return;h.dataset.previous=h.value;h.value=value;await h.fire(event);}
 function select(id,page=state.page){set({selected:id,page});}
 return Object.freeze({getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},set,control,input,select,focus:id=>{const h=handles.get(id);if(h){h.dataset.previous=h.value;return h.fire('focus');}},getControl:id=>handles.get(id)});
}
return Object.freeze({create});});
