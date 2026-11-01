/* Display/analysis classification. Saved source modes, IDs and geometry stay unchanged. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TracksideTransitCatalog=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Route 18 is the existing Atlanta Streetcar in this tracker. Route 19 is its
// separately uploaded east extension and remains a planned LRT alignment.
function existing(route){return String(route?.remoteId??route?.id??'')==='18'||String(route?.slug||'').toLowerCase()==='atlanta-streetcar'||String(route?.name||'').trim().toLowerCase()==='atlanta streetcar';}
function mode(route){return existing(route)?'Streetcar':String(route?.mode||(/\bLRT\b/i.test(route?.name||'')?'LRT':/\bART\b/i.test(route?.name||'')?'ART':'BRT'));}
function project(route){return !existing(route)&&route?.isPublished!==false&&route?.is_published!==false;}
function category(route){return existing(route)?'Existing transit service':'Planned high-capacity transit';}
// Cache exact geometry screening by route object and project location. Replacing
// a route object on refresh/replacement naturally invalidates its WeakMap entry.
function distanceMemo(calculate){const cache=new WeakMap();return function(point,route){if(!point||!route)return Infinity;const lat=Number(point.lat),lng=Number(point.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng))return Infinity;let entry=cache.get(route);const geometry=route.geometry||route.lines||route.points;if(!entry||entry.geometry!==geometry){entry={geometry,points:new Map()};cache.set(route,entry);}const key=lat+','+lng;if(entry.points.has(key))return entry.points.get(key);const value=calculate(point,route);if(entry.points.size>=2048)entry.points.clear();entry.points.set(key,value);return value;};}
return Object.freeze({existing,mode,project,category,distanceMemo});
});
