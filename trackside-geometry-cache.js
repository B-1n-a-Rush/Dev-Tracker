/* Disposable cache of public, immutable local-service geometry. No sessions or reviews. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideGeometryCache=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const valid=data=>data&&['routes','directions','stops','relationships'].every(k=>Array.isArray(data[k]));
function browserStorage(indexedDB){let opening;function db(){if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open('trackside-public-geometry-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('networks',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Cache unavailable'));});return opening;}
 async function action(mode,fn){const database=await db();return new Promise((resolve,reject)=>{const transaction=database.transaction('networks',mode),request=fn(transaction.objectStore('networks'));let value;request.onsuccess=()=>value=request.result;transaction.oncomplete=()=>resolve(value);transaction.onabort=transaction.onerror=()=>reject(transaction.error||Error('Cache unavailable'));});}
 return{get:key=>action('readonly',s=>s.get(key)),put:value=>action('readwrite',s=>s.put(value)),entries:()=>action('readonly',s=>s.getAll()),remove:key=>action('readwrite',s=>s.delete(key))};}
function create({storage,now=()=>Date.now(),maxEntries=2,maxAge=30*86400000,timeout=800}={}){
 const memory=new Map(),pending=new Map(),metrics={memoryHits:0,diskHits:0,downloads:0,storageFailures:0};
 async function attempt(fn){if(!storage)return;let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cache timeout')),timeout)})]);}catch{metrics.storageFailures++;}finally{clearTimeout(timer)}}
 function putMemory(key,data){memory.delete(key);memory.set(key,data);while(memory.size>maxEntries)memory.delete(memory.keys().next().value)}
 async function save(value){await attempt(()=>storage.put(value));const rows=await attempt(()=>storage.entries());if(Array.isArray(rows))for(const row of rows.sort((a,b)=>b.savedAt-a.savedAt).filter((r,i)=>i>=maxEntries||now()-r.savedAt>maxAge))await attempt(()=>storage.remove(row.key));}
 async function get(namespace,fingerprint,fetchData){if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('Invalid network fingerprint');const key=namespace+'|'+fingerprint;
  if(memory.has(key)){metrics.memoryHits++;const data=memory.get(key);putMemory(key,data);return data;}if(pending.has(key))return pending.get(key);
  const job=(async()=>{const saved=await attempt(()=>storage.get(key));if(saved&&saved.schema===1&&saved.fingerprint===fingerprint&&saved.key===key&&Number.isFinite(saved.savedAt)&&now()-saved.savedAt>=0&&now()-saved.savedAt<maxAge&&valid(saved.data)){metrics.diskHits++;putMemory(key,saved.data);return saved.data;}
   metrics.downloads++;const data=await fetchData();if(!valid(data))throw Error('Network geometry is invalid');putMemory(key,data);void save({schema:1,key,fingerprint,savedAt:now(),data});return data;
  })();pending.set(key,job);try{return await job;}finally{pending.delete(key)}
 }
 return Object.freeze({get,get metrics(){return{...metrics}},clearMemory(){memory.clear()}});
}
let shared;
return Object.freeze({create,browserStorage,get shared(){if(!shared){let storage;try{if(typeof indexedDB!=='undefined')storage=browserStorage(indexedDB)}catch{}shared=create({storage})}return shared}});
});
