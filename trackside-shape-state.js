/* Immutable UI state shared by the legacy export service and React view. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideShapeState=api;})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function create(descriptions,available,isAdmin){
 const listeners=new Set(),defaults=['development_projects','high_capacity_routes','sr2t_stops'];let selected=new Set(),initialized=false,busy=false,includeDrafts=false,text='Choose one or more layers.',error=false,snapshot;
 function emit(){const staff=isAdmin();if(!staff)includeDrafts=false;const layers=descriptions.map(([id,title,help])=>{const enabled=!!available(id);if(!enabled)selected.delete(id);return Object.freeze({id,title,help,available:enabled,checked:enabled&&selected.has(id)});});snapshot=Object.freeze({layers:Object.freeze(layers),busy,isAdmin:staff,includeDrafts,message:text,error});for(const notify of listeners)notify();}
 function refresh(){if(busy)return;emit();}
 function open(only){if(only){selected=new Set(descriptions.filter(([id])=>id===only&&available(id)).map(([id])=>id));initialized=true;}else if(!initialized){selected=new Set(defaults.filter(available));initialized=true;}text='Choose layers. The original tracker records will not be changed.';error=false;emit();}
 function toggleLayer(id,checked){if(busy||!descriptions.some(([key])=>key===id)||!available(id))return;checked?selected.add(id):selected.delete(id);emit();}
 function selectAll(){if(busy)return;selected=new Set(descriptions.filter(([id])=>available(id)).map(([id])=>id));emit();}
 function clearSelection(){if(busy)return;selected.clear();initialized=true;emit();}
 function setIncludeDrafts(value){if(busy)return;includeDrafts=isAdmin()&&!!value;emit();}
 function setBusy(value){busy=!!value;emit();}
 function message(value,failed=false){text=String(value);error=!!failed;emit();}
 function authChanged(){if(!isAdmin())includeDrafts=false;emit();}
 emit();return Object.freeze({getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},open,refresh,toggleLayer,selectAll,clearSelection,setIncludeDrafts,setBusy,message,authChanged,selected:()=>snapshot.layers.filter(l=>l.checked&&l.available).map(l=>l.id)});
}
return Object.freeze({create});
});
