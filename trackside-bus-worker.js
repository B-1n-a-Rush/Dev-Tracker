importScripts('./trackside-land-core.js?v=20261124-infrastructure-dates','./trackside-coordination-core.js','./trackside-bus-core.js?v=20261124-infrastructure-dates');
let index=null;
self.onmessage=e=>{const {id,type,...v}=e.data;try{if(type==='index'){index=TracksideBusCore.buildIndex(v.data,v.reference,v.overrides);self.postMessage({id,result:{ready:true}});}else if(type==='screen'){if(!index)throw Error('Network index is not ready.');self.postMessage({id,result:TracksideBusCore.screen(index,v.rows,v.options)});}}catch(error){self.postMessage({id,error:error.message});}};
