/* Public geometry comparison off the UI thread. No network or database writes. */
importScripts('./trackside-land-core.js','./trackside-coordination-core.js','./trackside-bus-core.js','./trackside-digest-core.js?v=20261118-grouped-updates');
self.onmessage=async event=>{const{id,watch,data}=event.data||{};try{const result=await TracksideDigestCore.snapshot(watch,data);self.postMessage({id,result});}catch(error){self.postMessage({id,error:error.message});}};
