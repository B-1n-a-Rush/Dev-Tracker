/* Conservative pedestrian graph: only shared OSM node IDs connect paths. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideWalkCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const R=6371008.8,rad=Math.PI/180;
const valid=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function distance(a,b){if(!valid(a)||!valid(b))return Infinity;const dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad,h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function project(p,a,b){const scale=Math.cos((a[1]+b[1])*rad/2),x=(b[0]-a[0])*scale,y=b[1]-a[1],px=(p[0]-a[0])*scale,py=p[1]-a[1],t=Math.max(0,Math.min(1,(px*x+py*y)/(x*x+y*y||1))),point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];return{point,t,distance:distance(p,point)};}
function restriction(tags={}){if(/^(no|private|customers|destination|permit)$/.test(tags.foot||''))return true;if(/^(yes|designated|permissive)$/.test(tags.foot||''))return Boolean(tags['foot:conditional']);return Boolean(tags['foot:conditional']||tags['access:conditional']||/^(no|private|customers|destination|permit)$/.test(tags.access||''));}
function permittedWay(tags={},avoidSteps=false){if(restriction(tags)||tags.construction||tags.proposed||tags.highway==='construction'||tags.highway==='proposed'||(avoidSteps&&tags.highway==='steps'))return false;if(/^(footway|pedestrian|path|steps)$/.test(tags.highway||''))return true;return /^(cycleway|bridleway)$/.test(tags.highway||'')&&/^(yes|designated|permissive)$/.test(tags.foot||'');}
function blockedNode(tags={}){return restriction(tags)||(/^(wall|fence|hedge|retaining_wall|gate|lift_gate|turnstile)$/.test(tags.barrier||'')&&!/^(yes|designated|permissive)$/.test(tags.foot||''));}
function build(data,{avoidSteps=false}={}){
 if(data?.remark||!Array.isArray(data?.elements)||!data.elements.length)throw Error('Incomplete pedestrian source response.');
 const nodes=new Map(),adj=new Map(),edges=[],seen=new Set(),ways=data.elements.filter(e=>e.type==='way');let excludedWays=0;
 for(const n of data.elements.filter(e=>e.type==='node')){const p=[n.lon,n.lat];if(!valid(p)||!Number.isSafeInteger(n.id))throw Error('Invalid source node.');if(nodes.has(n.id))throw Error('Repeated source node ID.');nodes.set(n.id,{id:n.id,point:p,tags:n.tags||{}});adj.set(n.id,[]);}
 for(const w of ways){if(!permittedWay(w.tags,avoidSteps)){excludedWays++;continue;}if(!Array.isArray(w.nodes)||w.nodes.length<2)throw Error('Invalid source path.');if(w.nodes.some(id=>!nodes.has(id)))throw Error('Source path has missing nodes; the download is incomplete.');
  for(let i=1;i<w.nodes.length;i++){const a=nodes.get(w.nodes[i-1]),b=nodes.get(w.nodes[i]);if(blockedNode(a.tags)||blockedNode(b.tags)||a.id===b.id)continue;const meters=distance(a.point,b.point);if(meters===0||!Number.isFinite(meters))continue;const dir=w.tags?.['oneway:foot'],forward=dir!=='-1',backward=!/^(yes|1|true)$/.test(dir||''),key=w.id+':'+i;if(seen.has(key))throw Error('Repeated source path ID.');seen.add(key);const edge={id:key,way_id:w.id,a:a.id,b:b.id,meters,forward,backward,tags:w.tags||{}};edges.push(edge);if(forward)adj.get(a.id).push({to:b.id,meters,edge});if(backward)adj.get(b.id).push({to:a.id,meters,edge});}
 }
 return{nodes,adj,edges,excludedWays,avoidSteps};
}
class Heap{constructor(){this.a=[];}push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=v[0])break;a[i]=a[p];i=p;}a[i]=v;}pop(){const a=this.a,r=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=v[0])break;a[i]=a[j];i=j;}a[i]=v;}return r;}get length(){return this.a.length;}}
function nearest(graph,p,max=Infinity){if(!valid(p))return null;let best=null;for(const e of graph.edges){const hit=project(p,graph.nodes.get(e.a).point,graph.nodes.get(e.b).point);if(hit.distance<=max&&(!best||hit.distance<best.distance))best={...hit,edge:e};}return best;}
function entranceCandidates(graph,center,radius=250){return[...graph.nodes.values()].filter(n=>n.tags.railway==='subway_entrance'&&!blockedNode(n.tags)&&graph.adj.get(n.id)?.length&&distance(center,n.point)<=radius).sort((a,b)=>distance(a.point,center)-distance(b.point,center));}
function reach(graph,start,budget){
 if(!start||!Number.isFinite(budget)||budget<=0)throw Error('Choose a walking start and valid travel budget.');const dist=new Map(),heap=new Heap(),seed=(id,d)=>{if(d<=budget&&d<(dist.get(id)??Infinity)){dist.set(id,d);heap.push([d,id]);}};
 let startPoint,rootHit=null;if(start.node_id!==undefined){const n=graph.nodes.get(Number(start.node_id));if(!n||!graph.adj.get(n.id)?.length||blockedNode(n.tags))throw Error('Walking start is not connected to a permitted path.');startPoint=n.point;seed(n.id,0);}else{if(start.edge_id){const e=graph.edges.find(e=>e.id===start.edge_id);if(!e)throw Error('The selected start path is excluded by the current settings; choose another start.');rootHit={...project(start.point,graph.nodes.get(e.a).point,graph.nodes.get(e.b).point),edge:e};}else rootHit=nearest(graph,start.point,25);if(!rootHit||rootHit.distance>25)throw Error('Select a point within 25 meters of a mapped pedestrian path.');startPoint=rootHit.point;const e=rootHit.edge;if(rootHit.t<1e-9)seed(e.a,0);if(rootHit.t>1-1e-9)seed(e.b,0);if(e.forward)seed(e.b,(1-rootHit.t)*e.meters);if(e.backward)seed(e.a,rootHit.t*e.meters);}
 while(heap.length){const[d,id]=heap.pop();if(d!==dist.get(id))continue;for(const next of graph.adj.get(id)||[])seed(next.to,d+next.meters);}
 const segments=[];for(const e of graph.edges){const ranges=[],da=dist.get(e.a)??Infinity,db=dist.get(e.b)??Infinity;if(e.forward&&da<budget)ranges.push([0,Math.min(1,(budget-da)/e.meters)]);if(e.backward&&db<budget)ranges.push([Math.max(0,1-(budget-db)/e.meters),1]);if(rootHit?.edge===e)ranges.push([e.backward?Math.max(0,rootHit.t-budget/e.meters):rootHit.t,e.forward?Math.min(1,rootHit.t+budget/e.meters):rootHit.t]);ranges.sort((a,b)=>a[0]-b[0]);const merged=[];for(const r of ranges){if(r[1]-r[0]<=1e-10)continue;const last=merged.at(-1);if(last&&r[0]<=last[1]+1e-10)last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}const a=graph.nodes.get(e.a).point,b=graph.nodes.get(e.b).point;for(const[t0,t1]of merged)segments.push({edge:e,t0,t1,coordinates:[mix(a,b,t0),mix(a,b,t1)]});}
 return{graph,dist,segments,startPoint,rootHit,budget};
}
const mix=(a,b,t)=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
function costAt(result,e,t){let value=Infinity;if(e.forward)value=Math.min(value,(result.dist.get(e.a)??Infinity)+t*e.meters);if(e.backward)value=Math.min(value,(result.dist.get(e.b)??Infinity)+(1-t)*e.meters);if(result.rootHit?.edge===e){const d=t-result.rootHit.t;if((d>=0&&e.forward)||(d<=0&&e.backward))value=Math.min(value,Math.abs(d)*e.meters);}return value;}
const timeBands=Object.freeze([
 Object.freeze({min_minutes:0,max_minutes:5,label:'0–5 min',color:'#124c37'}),
 Object.freeze({min_minutes:5,max_minutes:10,label:'5–10 min',color:'#318963'}),
 Object.freeze({min_minutes:10,max_minutes:15,label:'10–15 min',color:'#79a954'})
]);
function bandedFeatureCollection(result,{speed=1.2}={}){
 if(!Number.isFinite(speed)||speed<=0)throw Error('Invalid walking speed.');
 if(result.budget/speed/60>15+1e-7)throw Error('Walking-time bands support budgets up to 15 minutes.');
 const features=[],perMinute=speed*60;
 for(const segment of result.segments){
  const e=segment.edge,m=e.meters,root=result.rootHit?.edge===e?result.rootHit.t:null;
  const bounds=[segment.t0,segment.t1];if(root!==null&&root>segment.t0&&root<segment.t1)bounds.splice(1,0,root);
  let previous=null;
  for(let b=1;b<bounds.length;b++){
   const lo=bounds[b-1],hi=bounds[b],mid=(lo+hi)/2,affine=[];
   if(e.forward&&result.dist.has(e.a))affine.push([m,result.dist.get(e.a)]);
   if(e.backward&&result.dist.has(e.b))affine.push([-m,result.dist.get(e.b)+m]);
   if(root!==null){if(mid>=root&&e.forward)affine.push([m,-root*m]);if(mid<=root&&e.backward)affine.push([-m,root*m]);}
   const cuts=[lo,hi],add=t=>{if(t>lo+1e-10&&t<hi-1e-10)cuts.push(t);};
   // Shortest arrival is the lower envelope of endpoint and interior-start costs.
   // Split at every threshold and cost crossover before assigning one color.
   for(const[a,c]of affine)for(const band of timeBands)add((band.max_minutes*perMinute-c)/a);
   for(let i=0;i<affine.length;i++)for(let j=i+1;j<affine.length;j++)if(affine[i][0]!==affine[j][0])add((affine[j][1]-affine[i][1])/(affine[i][0]-affine[j][0]));
   const sorted=cuts.sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-10);
   for(let i=1;i<sorted.length;i++){
    const t0=sorted[i-1],t1=sorted[i],cost=costAt(result,e,(t0+t1)/2),minutes=cost/perMinute;
    if(!Number.isFinite(cost)||cost>result.budget+1e-6)continue;
    const band=timeBands.find(b=>minutes<=b.max_minutes+1e-9);if(!band)continue;
    const costs=[costAt(result,e,t0),costAt(result,e,t1)],min=Math.min(...costs),max=Math.max(...costs),a=result.graph.nodes.get(e.a).point,z=result.graph.nodes.get(e.b).point;
    if(previous&&previous.band===band&&Math.abs(previous.t1-t0)<1e-9){
     previous.t1=t1;previous.feature.geometry.coordinates[1]=mix(a,z,t1);
     const p=previous.feature.properties;p.walking_distance_m_min=Math.min(p.walking_distance_m_min,min);p.walking_distance_m_max=Math.max(p.walking_distance_m_max,max);p.walking_minutes_min=p.walking_distance_m_min/perMinute;p.walking_minutes_max=p.walking_distance_m_max/perMinute;
    }else{
     const feature={type:'Feature',properties:{osm_way_id:e.way_id,osm_segment_id:e.id,name:e.tags.name||null,classification:e.tags.highway,footway:e.tags.footway||null,walking_band:band.label,band_color:band.color,walking_minutes_min:min/perMinute,walking_minutes_max:max/perMinute,walking_distance_m_min:min,walking_distance_m_max:max,speed_m_s:speed,basis:'Shortest mapped-path walking estimate from the selected start; field verification required'},geometry:{type:'LineString',coordinates:[mix(a,z,t0),mix(a,z,t1)]}};
     features.push(feature);previous={feature,band,t1};
    }
   }
  }
 }
 return{type:'FeatureCollection',features};
}
function projectAccess(result,projects,{connectorMeters=30,speed=1.2}={}){if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(connectorMeters)||connectorMeters<0||connectorMeters>100)throw Error('Invalid access settings.');return projects.map(p=>{const point=[p.lng,p.lat];if(!valid(point))return{project:p,kind:'location_unknown'};let best=null;for(const s of result.segments){const hit=project(point,...s.coordinates);if(hit.distance>connectorMeters)continue;const t=s.t0+(s.t1-s.t0)*hit.t,cost=costAt(result,s.edge,t)+hit.distance;if(cost<=result.budget&&(!best||cost<best.meters))best={meters:cost,connector_m:hit.distance,way_id:s.edge.way_id,point:hit.point};}return{project:p,kind:best?'near_reachable_path':'access_unresolved',...(best||{}),minutes:best?best.meters/speed/60:null};});}
function origins(stations,routes,legacy=[]){const out=stations.map(s=>({id:'rail:'+s[0],label:s[0]+' Station',kind:'Rail station reference · selected mapped entrance requires review',point:[s[2],s[1]]})).filter(o=>valid(o.point));for(const r of routes){if(r.published===false||r.isPublished===false||!['ART','BRT'].includes(r.mode||(/\bART\b/i.test(r.name)?'ART':'BRT')))continue;const original=legacy.find(l=>l.name===r.name),isLegacy=!Array.isArray(r.stops)&&Array.isArray(original?.stops),stops=Array.isArray(r.stops)?r.stops:isLegacy?original.stops:[];for(let i=0;i<stops.length;i++){const s=stops[i],point=Array.isArray(s)?[s[2],s[1]]:[s.lng,s.lat];if(!valid(point))continue;const parts=r.lines||(r.points?[r.points]:null);if(isLegacy&&(!parts||!parts.some(line=>line.slice(1).some((b,k)=>project(point,[line[k][1],line[k][0]],[b[1],b[0]]).distance<=100))))continue;out.push({id:'rapid:'+r.name+':'+i,label:r.name+' · '+(Array.isArray(s)?s[0]:s.name||'Mapped stop')+(isLegacy?' · planning reference':''),kind:isLegacy?'Legacy tracker planning stop · verify against the current stop plan and boarding location':'Mapped ART/BRT stop · boarding point and operating status unverified',route:r.name,point,legacy:isLegacy});}}return out;}
function featureCollection(result){return{type:'FeatureCollection',features:result.segments.map(s=>({type:'Feature',properties:{osm_way_id:s.edge.way_id,classification:s.edge.tags.highway,footway:s.edge.tags.footway||null,basis:'Mapped connected pedestrian path; field verification required'},geometry:{type:'LineString',coordinates:s.coordinates}}))};}
return{valid,distance,project,permittedWay,blockedNode,build,nearest,entranceCandidates,reach,projectAccess,featureCollection,bandedFeatureCollection,timeBands,origins};
});
