/* Read-only location analysis. Distances are screening distances, not walking routes. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./trackside-land-core.js'):root.TracksideLandCore);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideHereCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function point(value){
    if(!value||!C.text(value.lat)||!C.text(value.lng))return null;
    const lat=Number(value.lat),lng=Number(value.lng);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
  }
  function geometry(value){const p=point(value);return p?{type:'Point',coordinates:[p.lng,p.lat]}:null;}
  function status(value){
    if(/complete|completed|open|built/i.test(value))return 'Complete';
    if(/construct|in progress/i.test(value))return 'Construction';
    if(/plan|propos|design|approved|program/i.test(value))return 'Planning';
    return 'Unknown';
  }
  function quantity(value){const n=C.numeric(value);return n!==null&&n>=0?n:null;}
  function unique(rows,key){const seen=new Set();return rows.filter(r=>{const id=key(r);if(seen.has(id))return false;seen.add(id);return true;});}
  function analyze({center,radiusMeters=804.672,projects=[],infrastructure=[],routes=[],stations=[],includeCompleted=false,includeLongRange=false}={}){
    const origin=geometry(center),radius=Number(radiusMeters);
    if(!origin||!Number.isFinite(radius)||radius<=0||radius>1609.344)throw new Error('Choose a valid location and a radius up to one mile.');
    const published=unique(projects.filter(p=>p.published!==false&&p.isPublished!==false),(p)=>p.id||JSON.stringify([p.name,p.lat,p.lng]));
    const nearbyProjects=published.filter(p=>point(p)).map(record=>({record,distance:C.geometryDistance(origin,geometry(record))})).filter(r=>r.distance<=radius).sort((a,b)=>a.distance-b.distance||C.text(a.record.name).localeCompare(C.text(b.record.name)));
    const eligible=infrastructure.filter(r=>!C.isImportedRapidTransit(r)&&!r.possibleMatches?.length&&(includeCompleted||!r.complete)&&(includeLongRange||!r.longRange));
    const nearbyInfrastructure=unique(eligible.filter(r=>r.geometry),r=>r.id).map(record=>({record,distance:C.geometryDistance(origin,record.geometry)})).filter(r=>r.distance<=radius).sort((a,b)=>a.distance-b.distance||C.text(a.record.name).localeCompare(C.text(b.record.name)));
    const nearbyRoutes=unique(routes.filter(r=>r.geometry&&r.published!==false),r=>r.id||r.kind+':'+r.name).map(record=>({record,distance:C.geometryDistance(origin,record.geometry)})).filter(r=>r.distance<=radius).sort((a,b)=>a.distance-b.distance);
    const nearbyStations=unique(stations.filter(s=>point(s)),s=>s.name).map(record=>({record,distance:C.geometryDistance(origin,geometry(record))})).filter(r=>r.distance<=radius).sort((a,b)=>a.distance-b.distance);
    const totals={residential:0,hotel:0,retail:0,commercial:0,medical:0,reportedResidential:0,statuses:{Planning:0,Construction:0,Complete:0,Unknown:0}};
    const fields={residential:'residentialUnits',hotel:'hotelUnits',retail:'retailSpaceSqFt',commercial:'commercialSpaceSqFt',medical:'medicalSpaceSqFt'},types=new Map();
    for(const {record}of nearbyProjects){
      for(const [key,field]of Object.entries(fields)){const q=quantity(record[field]);if(q!==null)totals[key]+=q;if(key==='residential'&&q>0)totals.reportedResidential++;}
      totals.statuses[status(record.status)]++;
      const type=C.text(record.projectType)||'Type not recorded';types.set(type,(types.get(type)||0)+1);
    }
    return {center:point(center),radiusMeters:radius,projects:nearbyProjects,infrastructure:nearbyInfrastructure,routes:nearbyRoutes,stations:nearbyStations,totals,types:[...types].sort((a,b)=>b[1]-a[1]),unlocatedProjects:published.filter(p=>!point(p)).length,unlocatedInfrastructure:eligible.filter(r=>!r.geometry).length};
  }
  return {point,geometry,status,quantity,analyze};
});
