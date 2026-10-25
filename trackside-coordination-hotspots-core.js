/* Reuses the watchlist's spatial/date rules. Display anchors never determine counts. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./trackside-coordination-core.js'):root.TracksideCoordinationCore,typeof module==='object'&&module.exports?require('./trackside-land-core.js'):root.TracksideLandCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideHotspotsCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C,L){
'use strict';
const rank={overlap:0,unknown:1,'reference-needed':1,invalid:1,outside:2},anchorCache=new WeakMap();
function screenRoute(route,schedule,rows,distanceMeters=76.2){const result=C.screen({route,rows,start:schedule?.construction_start||'',finish:schedule?.construction_finish||'',distanceMeters});return result.rows.map(item=>({...item,route,schedule:schedule||{},key:C.routeKey(route)+'|'+item.row.id}));}
function yearMatches(pair,year){if(!year)return true;if(!/^\d{4}$/.test(String(year))||Number(year)<1900||Number(year)>2200)throw Error('Choose a supported calendar year.');const first=Date.UTC(Number(year),0,1),last=Date.UTC(Number(year)+1,0,1)-1;
 for(const [start,finish]of [[pair.schedule.construction_start,pair.schedule.construction_finish],[pair.row.start,pair.row.finish]]){const w=C.constructionWindow(start,finish);if(w.kind==='invalid')continue;if(w.start&&w.start.first>last)return false;if(w.finish&&w.finish.last<first)return false;}return true;
}
function qualify(row,opts){return (!opts.jurisdiction||(row.jurisdictions||[row.jurisdiction]).includes(opts.jurisdiction))&&(!opts.category||row.category===opts.category);}
function model(pairs,opts={}){
 const near=pairs.filter(p=>(!opts.route||C.routeKey(p.route)===opts.route)&&qualify(p.row,opts)),groups=new Map(),seenPairs=new Set();
 for(const pair of near){if(seenPairs.has(pair.key))continue;seenPairs.add(pair.key);if(!yearMatches(pair,opts.year)||pair.state==='outside')continue;const state=pair.state==='overlap'?'overlap':'unknown';if(opts.timing==='overlap'&&state!=='overlap'||opts.timing==='unknown'&&state!=='unknown')continue;
  if(!groups.has(pair.row.id))groups.set(pair.row.id,{row:pair.row,matches:[],state:'unknown'});const group=groups.get(pair.row.id);group.matches.push(pair);if(state==='overlap')group.state='overlap';
 }
 const projects=[...groups.values()];for(const g of projects)g.matches.sort((a,b)=>rank[a.state]-rank[b.state]||a.distance-b.distance||a.route.name.localeCompare(b.route.name));projects.sort((a,b)=>rank[a.state]-rank[b.state]||a.row.name.localeCompare(b.row.name));
 return {projects,matches:projects.flatMap(g=>g.matches),overlaps:projects.filter(g=>g.state==='overlap').length,unknown:projects.filter(g=>g.state==='unknown').length,nearbyProjects:new Set(near.map(p=>p.row.id)).size};
}
function unlocated(rows,opts={}){const seen=new Set();return rows.filter(row=>{if(seen.has(row.id)||row.complete||row.longRange||L.isImportedRapidTransit(row)||!qualify(row,opts))return false;seen.add(row.id);return !row.geometry;}).length;}
function years(pairs,now=Date.now()){const current=new Date(now).getUTCFullYear(),values=[current,current+10];for(const p of pairs)for(const v of [p.schedule.construction_start,p.schedule.construction_finish,p.row.start,p.row.finish]){const date=L.dateRange(v);if(date)values.push(new Date(date.first).getUTCFullYear());}const lo=Math.max(1900,Math.min(...values)),hi=Math.min(2200,Math.max(...values));return Array.from({length:hi-lo+1},(_,i)=>String(lo+i));}
function reasons(pair,year){const reasons=['Published geometry is '+Math.round(pair.distance/.3048).toLocaleString()+' ft from '+pair.route.name+'.'];
 if(pair.state==='overlap')reasons.push(year?'The route and infrastructure windows can both include '+year+'.':'The published route and infrastructure schedule windows intersect.');
 else for(const [label,start,finish]of [['Route',pair.schedule.construction_start,pair.schedule.construction_finish],['Infrastructure',pair.row.start,pair.row.finish]]){const w=C.constructionWindow(start,finish);if(w.kind==='invalid')reasons.push(label+' dates need review.');else{if(!w.start)reasons.push(label+' construction start is not published.');if(!w.finish)reasons.push(label+' construction finish is not published.');}}
 if([pair.schedule.construction_start,pair.schedule.construction_finish,pair.row.start,pair.row.finish].some(v=>L.dateRange(v)?.precision!=='day'&&L.dateRange(v)))reasons.push('Month/year ranges preserve uncertainty; this is a potential overlap, not a confirmed construction conflict.');
 return [...reasons,...pair.warnings];
}
function parts(g){if(!g)return [];if(g.type==='GeometryCollection')return(g.geometries||[]).flatMap(parts);if(g.type==='Point')return[[g.coordinates]];if(g.type==='MultiPoint')return g.coordinates.map(p=>[p]);if(g.type==='LineString')return[g.coordinates];if(['MultiLineString','Polygon'].includes(g.type))return g.coordinates;if(g.type==='MultiPolygon')return g.coordinates.flat();return [];}
const valid=p=>Array.isArray(p)&&p.slice(0,2).length===2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function ringContains(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function contains(g,p){if(g?.type==='GeometryCollection')return(g.geometries||[]).some(part=>contains(part,p));const polys=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];return polys.some(poly=>poly[0]?.length&&ringContains(p,poly[0])&&!poly.slice(1).some(r=>ringContains(p,r)));}
function anchor(geometry,routeGeometry){if(!geometry||!routeGeometry)return null;let cache=anchorCache.get(routeGeometry);if(!cache){cache=new WeakMap();anchorCache.set(routeGeometry,cache);}if(cache.has(geometry))return cache.get(geometry);
 const a=parts(geometry).map(p=>p.filter(valid)).filter(p=>p.length),b=parts(routeGeometry).map(p=>p.filter(valid)).filter(p=>p.length);if(!a.length||!b.length)return null;
 // If a route starts outside a polygon and later enters, the segment crossing below
 // supplies the anchor. Avoid testing every route vertex against every polygon ring.
 for(const line of b){const p=line[0];if(contains(geometry,p)){cache.set(geometry,p.slice(0,2));return p.slice(0,2);}}
 const cos=Math.max(.05,Math.cos((a[0][0][1]+b[0][0][1])/2*Math.PI/180)),project=p=>[p[0]*cos,p[1]],restore=p=>[p[0]/cos,p[1]],sq=(p,q)=>(p[0]-q[0])**2+(p[1]-q[1])**2;
 const segments=lines=>lines.flatMap(line=>line.length===1?[[project(line[0]),project(line[0])]]:line.slice(1).map((p,i)=>[project(line[i]),project(p)]));
 const nearest=(p,u,v)=>{const dx=v[0]-u[0],dy=v[1]-u[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dy)/d)):0;return[u[0]+t*dx,u[1]+t*dy];};
 let best=null,distance=Infinity;const consider=(p,q)=>{const d=sq(p,q);if(d<distance){distance=d;best=p;}};
 for(const [u,v]of segments(a))for(const [w,x]of segments(b)){const dx=v[0]-u[0],dy=v[1]-u[1],ex=x[0]-w[0],ey=x[1]-w[1],den=dx*ey-dy*ex;
  if(Math.abs(den)>1e-18){const t=((w[0]-u[0])*ey-(w[1]-u[1])*ex)/den,s=((w[0]-u[0])*dy-(w[1]-u[1])*dx)/den;if(t>=0&&t<=1&&s>=0&&s<=1){best=[u[0]+t*dx,u[1]+t*dy];const result=restore(best);cache.set(geometry,result);return result;}}
  consider(u,nearest(u,w,x));consider(v,nearest(v,w,x));consider(nearest(w,u,v),w);consider(nearest(x,u,v),x);
 }
 const result=best?restore(best):null;cache.set(geometry,result);return result;
}
return {screenRoute,model,unlocated,years,yearMatches,reasons,anchor,parts};
});
