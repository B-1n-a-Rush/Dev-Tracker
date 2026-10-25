/* Geometry/schedule screening only: potential coordination, never a confirmed conflict. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./trackside-land-core.js'));else root.TracksideCoordinationCore=factory(root.TracksideLandCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const labels={overlap:'Potential schedule overlap',unknown:'Infrastructure schedule incomplete','reference-needed':'Route schedule incomplete',invalid:'Dates need review',outside:'Outside comparison window'};
const statuses={unreviewed:'Not reviewed','needs-contact':'Needs contact','in-discussion':'In discussion',coordinated:'Coordinated','no-action':'No action needed'};
const boundsCache=new WeakMap(),distanceCache=new WeakMap();
function bounds(g){if(boundsCache.has(g))return boundsCache.get(g);let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;function walk(c){if(!Array.isArray(c))return;if(typeof c[0]==='number'){if(c.slice(0,2).every(Number.isFinite)){x0=Math.min(x0,c[0]);x1=Math.max(x1,c[0]);y0=Math.min(y0,c[1]);y1=Math.max(y1,c[1]);}}else c.forEach(walk);}if(g.type==='GeometryCollection')for(const part of g.geometries||[]){const b=bounds(part);x0=Math.min(x0,b[0]);y0=Math.min(y0,b[1]);x1=Math.max(x1,b[2]);y1=Math.max(y1,b[3]);}else walk(g.coordinates);const b=[x0,y0,x1,y1];boundsCache.set(g,b);return b;}
function nearDistance(g,reference,threshold){const a=bounds(g),b=bounds(reference),lat=Math.max(Math.abs(a[1]),Math.abs(a[3]),Math.abs(b[1]),Math.abs(b[3])),dy=threshold/110000,dx=dy/Math.max(.05,Math.cos(lat*Math.PI/180));if(a[0]-dx>b[2]||a[2]+dx<b[0]||a[1]-dy>b[3]||a[3]+dy<b[1])return Infinity;let cache=distanceCache.get(reference);if(!cache){cache=new WeakMap();distanceCache.set(reference,cache);}if(!cache.has(g))cache.set(g,C.geometryDistance(g,reference));return cache.get(g);}
function slug(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function routeKey(route){return route.kind==='rail'?'rail:'+slug(route.name.replace(/\s+Lines?$/i,'')):route.remoteId?'rapid:'+String(route.remoteId):'rapid:'+slug(route.slug||route.name);}
function routeGeometry(route){if(route.geometry)return route.geometry;const parts=route.lines||[route.points||[]];return {type:'MultiLineString',coordinates:parts.filter(p=>p.length>1).map(p=>p.map(c=>[c[1],c[0]]))};}
function validateDate(value){return !String(value||'').trim()||!!C.dateRange(value);}
function comparison(start,finish,a,b){
 const s=C.dateRange(start),f=C.dateRange(finish),x=C.dateRange(a),y=C.dateRange(b);
 if((start&&!s)||(finish&&!f)||(a&&!x)||(b&&!y)||(s&&f&&s.first>f.last)||(x&&y&&x.first>y.last))return 'invalid';
 // A known endpoint may rule out overlap even when another endpoint is missing.
 if((s&&y&&y.last<s.first)||(f&&x&&x.first>f.last))return 'outside';
 if(!s||!f)return 'reference-needed';if(!x||!y)return 'unknown';
 return x.first<=f.last&&y.last>=s.first?'overlap':'outside';
}
function screen(opts){
 const {route,rows=[],start='',finish='',jurisdiction='',category='',includeCompleted=false,includeLongRange=false,includePossible=false}=opts;
 const threshold=Number(opts.distanceMeters??76.2);if(!Number.isFinite(threshold)||threshold<0||threshold>1609.344)throw Error('Choose a screening distance up to one mile.');
 const geometry=routeGeometry(route);let unmapped=0,duplicates=0;const seen=new Set(),result=[];
 for(const row of rows){
  if(seen.has(row.id)||C.isImportedRapidTransit(row))continue;seen.add(row.id);
  if((row.complete&&!includeCompleted)||(row.longRange&&!includeLongRange))continue;
  if(jurisdiction&&!(row.jurisdictions||[row.jurisdiction]).includes(jurisdiction))continue;
  if(category&&row.category!==category)continue;
  if(!row.geometry){unmapped++;continue;}
  const distance=nearDistance(row.geometry,geometry,threshold);if(!Number.isFinite(distance)||distance>threshold)continue;
  if(row.possibleMatches?.length&&!includePossible){duplicates++;continue;}
  const state=comparison(start,finish,row.start,row.finish),warnings=[];
  if(/Representative/i.test(row.geometryBasis||''))warnings.push('Distance uses a representative point, not the construction alignment.');
  if(row.source?.kind==='arc'||/ARC/i.test(row.geometryBasis||''))warnings.push('ARC geometry is a planning area; construction dates are not supplied by ARC.');
  if(row.possibleMatches?.length)warnings.push('Possible duplicate included; related scopes may overlap.');
  if(row.arcReferences?.some(a=>a.complete!==row.complete))warnings.push('Local and ARC status disagree.');
  const end=C.dateRange(row.finish);if(!row.complete&&end&&end.last<Date.now())warnings.push('Published finish has passed; confirm the current schedule.');
  result.push({row,distance,state,warnings});
 }
 const rank={overlap:0,unknown:1,'reference-needed':1,invalid:2,outside:3};result.sort((a,b)=>rank[a.state]-rank[b.state]||a.distance-b.distance||a.row.name.localeCompare(b.row.name));
 return {rows:result,unmapped,duplicates,overlaps:result.filter(r=>r.state==='overlap').length,unknown:result.filter(r=>r.state==='unknown'||r.state==='reference-needed'||r.state==='invalid').length};
}
function csv(rows){const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]|^[\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}
// Timeline geometry is display-only. A missing endpoint never becomes a duration.
function constructionWindow(start,finish){
 const a=C.dateRange(start),b=C.dateRange(finish);
 const invalid=(start&&!a)||(finish&&!b)||(a&&b&&a.first>b.last);
 return {start:a,finish:b,kind:invalid?'invalid':a&&b?'complete':a?'start-only':b?'finish-only':'unknown',approximate:!!((a&&a.precision!=='day')||(b&&b.precision!=='day'))};
}
function timelineModel({start='',finish='',rows=[],fit='route',now=Date.now()}={}){
 const route=constructionWindow(start,finish),items=rows.map(item=>({item,window:constructionWindow(item.row.start,item.row.finish)}));
 const endpoints=w=>w.kind==='invalid'?[]:[w.start?.first,w.start?.last,w.finish?.first,w.finish?.last].filter(Number.isFinite);
 let values=fit==='route'?endpoints(route):[],basis=values.length?'route':'all';
 if(!values.length)values=[...endpoints(route),...items.flatMap(i=>endpoints(i.window))];
 let firstYear,lastYear;
 if(values.length){firstYear=new Date(Math.min(...values)).getUTCFullYear();lastYear=new Date(Math.max(...values)).getUTCFullYear()+1;if(lastYear-firstYear<3){firstYear--;lastYear=Math.max(lastYear,firstYear+3);}}
 else{firstYear=new Date(now).getUTCFullYear();lastYear=firstYear+5;basis='fallback';}
 return {first:Date.UTC(firstYear,0,1),end:Date.UTC(lastYear,0,1),firstYear,lastYear,route,items,basis};
}
function timelineMark(window,domain){
 if(window.kind==='invalid'||window.kind==='unknown')return {kind:window.kind};
 const first=window.start?.first??window.finish.first,last=window.finish?.last??window.start.last;
 if(last<domain.first)return {kind:'before'};if(first>=domain.end)return {kind:'after'};
 const span=domain.end-domain.first,left=100*(Math.max(first,domain.first)-domain.first)/span,right=100*(Math.min(last+1,domain.end)-domain.first)/span;
 const mark={kind:window.kind,left,width:Math.max(0,right-left),clippedStart:first<domain.first,clippedFinish:last>=domain.end,approximate:window.approximate,caps:[]};
 if(window.kind==='complete')for(const endpoint of [window.start,window.finish])if(endpoint.precision!=='day'){
  const capFirst=Math.max(endpoint.first,first,domain.first),capEnd=Math.min(endpoint.last+1,last+1,domain.end);
  if(capEnd>capFirst)mark.caps.push({left:100*(capFirst-domain.first)/span,width:100*(capEnd-capFirst)/span});
 }
 return mark;
}
function timelineTicks(domain,scale='quarters'){
 const months=(domain.lastYear-domain.firstYear)*12,requested=scale==='months'?1:scale==='years'?12:3;
 // Bound the number of cells for very long published schedules.
 const step=months/requested>120?Math.ceil(months/12/40)*12:requested,ticks=[];
 for(let m=0;m<months;m+=step){const year=domain.firstYear+Math.floor(m/12),month=m%12,first=Date.UTC(year,month,1),end=Math.min(Date.UTC(year,month+step,1),domain.end);
  const label=step>=12?(step>12?year+'–'+(year+step/12-1):String(year)):step===3?'Q'+(Math.floor(month/3)+1)+' '+year:new Date(first).toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});
  ticks.push({first,end,label,left:100*(first-domain.first)/(domain.end-domain.first),width:100*(end-first)/(domain.end-domain.first)});
 }
 return {ticks,step,requested,cellWidth:step>=12?150:scale==='months'?68:76};
}
return {labels,statuses,slug,routeKey,routeGeometry,validateDate,comparison,screen,csv,constructionWindow,timelineModel,timelineMark,timelineTicks};
});
