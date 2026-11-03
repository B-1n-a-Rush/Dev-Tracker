/* Address/place lookup only: no project records or spatial screening are changed. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksidePlaceSearchCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BBOX=[-85.05,33.2,-83.65,34.4],DEFAULT_ENDPOINT='https://photon.komoot.io/api/';
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,300):'';
function query(value){const q=clean(value);if(q.length<3)throw Error('Enter at least 3 characters, including a city for street addresses.');if(q.length>160)throw Error('Keep your search under 160 characters.');return q;}
function inRegion(lon,lat){return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=BBOX[0]&&lon<=BBOX[2]&&lat>=BBOX[1]&&lat<=BBOX[3];}
function normalize(data){
 if(!data||data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('The place service returned an unreadable response. Please try again.');
 const rows=[],seen=new Set();
 for(const f of data.features){if(f?.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates))continue;const[lon,lat]=f.geometry.coordinates;if(!inRegion(lon,lat))continue;
 const p=f.properties||{},street=[clean(p.housenumber),clean(p.street)].filter(Boolean).join(' '),title=clean(p.name)||street||clean(p.city)||clean(p.locality)||'Mapped location',parts=[street,clean(p.city)||clean(p.locality)||clean(p.district),clean(p.state),clean(p.postcode)].filter(v=>v&&v!==title),detail=[...new Set(parts)].join(', '),key=[title,lon.toFixed(6),lat.toFixed(6)].join('|');
 if(seen.has(key))continue;seen.add(key);rows.push(Object.freeze({id:key,title,detail,lat,lon}));if(rows.length===6)break;}
 return Object.freeze(rows);
}
function requestUrl(value,endpoint=DEFAULT_ENDPOINT){const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password)throw Error('Place search requires a secure HTTPS service.');url.searchParams.set('q',query(value));url.searchParams.set('bbox',BBOX.join(','));url.searchParams.set('limit','6');url.searchParams.set('lang','en');return url.href;}
function abortError(){const e=Error('Search canceled.');e.name='AbortError';return e;}
function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(abortError());return;}let timer;const onAbort=()=>{clearTimeout(timer);signal.removeEventListener('abort',onAbort);reject(abortError());};timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);signal?.addEventListener('abort',onAbort,{once:true});});}
function createClient({fetch:fetcher=globalThis.fetch,endpoint=DEFAULT_ENDPOINT,now=Date.now,wait=delay,interval=1200,timeout=12000,ttl=1800000,maxEntries=32}={}){
 const cache=new Map();let queue=Promise.resolve(),nextAllowed=0;
 async function reserve(signal){const job=queue.then(async()=>{if(signal?.aborted)throw abortError();await wait(Math.max(0,nextAllowed-now()),signal);if(signal?.aborted)throw abortError();nextAllowed=now()+interval;});queue=job.catch(()=>{});return job;}
 async function search(value,{signal}={}){
 const q=query(value),key=q.toLowerCase(),saved=cache.get(key);if(signal?.aborted)throw abortError();if(saved&&now()-saved.at<ttl)return saved.rows;if(saved)cache.delete(key);
 await reserve(signal);if(signal?.aborted)throw abortError();
 const controller=new AbortController();let expired=false;const cancel=()=>controller.abort(),timer=setTimeout(()=>{expired=true;controller.abort();},timeout);signal?.addEventListener('abort',cancel,{once:true});
 try{const response=await fetcher(requestUrl(q,endpoint),{signal:controller.signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error(response.status===429?'The place service is busy. Wait a moment and try again.':'Address search is temporarily unavailable. Try again shortly.');
 const result=normalize(await response.json());if(signal?.aborted)throw abortError();if(expired)throw Error('Address search timed out. Please try again.');
 cache.set(key,{at:now(),rows:result});while(cache.size>maxEntries)cache.delete(cache.keys().next().value);return result;
 }catch(e){if(expired)throw Error('Address search timed out. Please try again.');if(signal?.aborted||e?.name==='AbortError')throw abortError();if(e?.name==='SyntaxError')throw Error('The place service returned an unreadable response. Please try again.');if(e?.name==='TypeError')throw Error('Could not reach the place service. Check your connection and try again.');throw e;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 return Object.freeze({search,clearCache:()=>cache.clear()});
}
return Object.freeze({BBOX:Object.freeze(BBOX),DEFAULT_ENDPOINT,query,normalize,requestUrl,createClient});
});
