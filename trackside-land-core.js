/* Public GIS normalization and screening. No project-record writes. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TracksideLandCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DAY = 86400000;
  function text(v) {
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    return /^(null|undefined|n\/a|<null>|-)$/i.test(s) ? '' : s;
  }
  function pick(p, names) { for (const n of names) if (text(p[n])) return p[n]; return null; }
  function numeric(v) { if (!text(v)) return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; }
  function http(v) { try { const u = new URL(text(v)); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } }
  function parcel(feature, source) {
    const p = feature.properties || feature.attributes || {};
    const row = {
      id: text(pick(p, ['PARCELID','ParcelID','LOWPARCELID','PARCEL_ID'])),
      address: text(pick(p, ['SITEADDRESS','SITEADDRES','Address'])), jurisdiction: source.name,
      owner: [pick(p,['OWNERNME1','OWNERNME','Owner']),p.OWNERNME2].map(text).filter(Boolean).join(' / '),
      mailing: text(pick(p,['PSTLADDRESS','PSTLADDRES','OwnerAddr1'])),
      acres: numeric(pick(p,['LandAcres','ACERAGE','ACREAGE','GIS_ACRES'])),
      landUse: text(pick(p,['LANDUSED','CLASSDSCRP','LANDUSE','LUCode'])),
      zoning: text(pick(p,['ZONING','ZONE'])),
      assessed: numeric(pick(p,['CNTASSDVAL','ASSESSVAL','TotAssess'])),
      appraised: numeric(pick(p,['APPRVAL','TotAppr'])),
      taxYear: text(p.TaxYear), buildingArea: numeric(pick(p,['SQRFT','BLDGS1SQFT'])),
      yearBuilt: text(p.YEARBUILT), existingUnits: numeric(pick(p,['LivUnits','APARTMENTS'])),
      saleDate: text(p.SALEDATE), salePrice: numeric(p.SALEPRICE),
      propertyCard: http(p.PROPCARD), taxCard: http(p.TAXCARD),
      geometry: feature.geometry, raw: p, source
    };
    if (!row.id) row.id = 'Record ' + (pick(p,['OBJECTID','ObjectId','OBJECTID_1']) || 'unknown');
    return row;
  }
  function geometryKey(g) { return JSON.stringify(g,(_,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v); }
  function groupParcels(features) {
    const groups = new Map();
    for (const f of features) { if (!f.geometry) continue; const k=geometryKey(f.geometry); if (!groups.has(k)) groups.set(k,[]); groups.get(k).push(f); }
    return [...groups.values()];
  }
  // UTC date arithmetic preserves year and month precision. Ambiguous dates stay unknown.
  function dateRange(value) {
    const raw=text(value); if (!raw || /^(tbd|tba|unknown|not set|pending|0)$/i.test(raw)) return null;
    let first,last,precision='day';
    if (/^\d{4}$/.test(raw)) {
      const y=Number(raw); if(y<1900||y>2200)return null;
      first=Date.UTC(y,0,1);last=Date.UTC(y,11,31);precision='year';
    } else if (/^\d{4}-\d{2}$/.test(raw)) {
      const [y,m]=raw.split('-').map(Number);if(m<1||m>12)return null;
      first=Date.UTC(y,m-1,1);last=Date.UTC(y,m,0);precision='month';
    } else if (/^[A-Za-z]+[,.]?\s+\d{4}$/.test(raw)) {
      const d=new Date(raw.replace(/[,.]/,'')+' 1 UTC');if(!Number.isFinite(d.getTime()))return null;
      first=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);last=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0);precision='month';
    } else {
      let time;
      if(typeof value==='number'||/^\d{12,13}$/.test(raw))time=Number(value);
      else if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        time=Date.parse(raw+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==raw)return null;
      } else if(/^\d{1,2}\/\d{2}\/\d{4}$/.test(raw)&&Number(raw.split('/')[1])>12) {
        const [m,d,y]=raw.split('/');return dateRange(y+'-'+m.padStart(2,'0')+'-'+d);
      } else if(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(raw))time=Date.parse(raw+' UTC');
      else if(/^\d{4}-\d{2}-\d{2}T/.test(raw))time=Date.parse(raw);
      else return null;
      if(!Number.isFinite(time))return null;
      const d=new Date(time),y=d.getUTCFullYear();if(y<1900||y>2200)return null;
      first=last=Date.UTC(y,d.getUTCMonth(),d.getUTCDate());
    }
    return {first,last:last+DAY-1,precision,raw};
  }
  function dateLabel(value) {
    const r=dateRange(value);if(!r)return typeof value==='number'||text(value)==='0'?'Not published':text(value)||'Not published';
    const opts={timeZone:'UTC',year:'numeric'};
    if(r.precision!=='year')opts.month='short';if(r.precision==='day')opts.day='numeric';
    return new Date(r.first).toLocaleDateString('en-US',opts);
  }
  function schedule(start,finish,referenceStart,referenceFinish) {
    const a=dateRange(start),b=dateRange(finish),c=dateRange(referenceStart),d=dateRange(referenceFinish);
    if(!c||!d)return 'reference-needed';if(c.first>d.last)return 'invalid-reference';
    if(!a||!b)return 'unknown';if(a.first>b.last)return 'invalid';
    return a.first<=d.last&&b.last>=c.first?'overlap':'outside';
  }
  function category(value) {
    const v=text(value).toLowerCase();
    if(/water|sewer|utility|storm|pump|drain/.test(v))return 'Utilities';
    if(/trail|multi.?use|multipurpose|greenway/.test(v))return 'Trails & paths';
    if(/sidewalk|pedestrian|ada/.test(v))return 'Sidewalks';
    if(/bike|bicycle/.test(v))return 'Bikeways';
    if(/streetscape|safe street|complete street/.test(v))return 'Streetscape';
    if(/signal|traffic|safety|operational/.test(v))return 'Signals & safety';
    if(/road|resurfac|pav|bridge|street repair|intersection/.test(v))return 'Roads & bridges';
    return 'Other';
  }
  function infrastructure(feature,source) {
    if(source.kind==='arc')return arcInfrastructure(feature,source);
    const p=feature.properties||{};
    const fulton=source.kind==='fulton',clayton=source.kind==='clayton',resurfacing=source.kind==='clayton-resurfacing';
    const name=text(pick(p,['FUNDING_PROJECT_NAME','PROJECT_NAME_1','projName','ProjectName','project_name_title','Name','Street']))||'Unnamed project';
    const sourceStatus=text(pick(p,fulton?['current_stage_of_project']:clayton?['Stage','Status']:['RATL_STATUS','status','CurrentStatus','FIRST_CurrentStatus','Status']));
    const id=text(pick(p,['projNumber','PROJECT_NUMBER','project_id','OBJECTID','ObjectId','id']));
    const kind=resurfacing?'Road resurfacing':text(pick(p,['PROJECT_CATEGORY','projType','ProjectType','FIRST_ProjectType','project_type']))||(clayton?'Road improvements':'');
    const complete=/complete|closeout|closed|cancel/i.test(sourceStatus)&&!(/not\s+complete/i.test(sourceStatus));
    const start=fulton?p.estimated_start_date_for:pick(p,['CONSTRUCTION_START_DATE','DateStart','start','AnticipatedStartDate','FIRST_AnticipatedStartDate']);
    const finish=fulton?p.estimated_construction:clayton?pick(p,complete?['ActComplDate','EstComplDate']:['EstComplDate']):pick(p,['CONSTRUCTION_COMPLETION_DATE','DateFinish','finish']);
    return {
      id:source.id+':'+id,sourceId:id,name,sourceStatus,category:category(kind+' '+name),kind,complete,
      phase:/pre.?construct|planning|design|procure|not started|scop/i.test(sourceStatus)?'Planning / design':/construct|in progress|active/i.test(sourceStatus)?'Construction':'Planning / design',
      jurisdiction:source.jurisdiction,agency:source.agency,start:start??null,finish:finish??null,
      duration:text(pick(p,['AnticipatedDuration','FIRST_AnticipatedDuration'])),
      scheduleType:fulton?'Estimated project start / construction finish':clayton?(complete&&text(p.ActComplDate)?'Actual completion; start not published':'Estimated completion; start not published'):resurfacing?'Construction window not published':source.kind==='atlanta'?'Anticipated construction':source.kind==='splost'?'Published project schedule':'Anticipated project schedule',
      description:text(pick(p,['Description','FIRST_Description','PROJECT_NAME_1','project_description'])),
      limits:[p.ON_STREET||p.Street,p.FROM_STREET||p.FromStart,p.TO_STREET||p.ToEnd].map(text).filter(Boolean).join(' · '),
      municipality:text(pick(p,['Municipality','FIRST_Municipality','city'])),contractor:text(pick(p,['Contractor','FIRST_Contractor','ConstFirm','construction_firm_selected'])),
      cost:pick(p,['Cost','ApproximateCost','FIRST_ApproxCost',...(complete?['ActCost','EstCost']:['EstCost']),'EstimCost','budget']),
      updated:pick(p,['LAST_UPDATE','lastupdate','EditDate']),geometry:feature.geometry,raw:p,source,
      geometryBasis:fulton?'Representative project point(s)':source.geometryBasis||'Published GIS alignment / location',
      locationNote:text(p._location_note),geometryUpdated:text(p._location_updated_at),
      program:text(p.initiatve_type||p.Funding||source.programYear),
      activity:resurfacing?[text(p.CurActivit)&&'Current: '+text(p.CurActivit)+(text(p.CurActDate)?' ('+dateLabel(p.CurActDate)+')':''),text(p.SchActivit)&&'Scheduled: '+text(p.SchActivit)+(text(p.SchActDate)?' ('+dateLabel(p.SchActDate)+')':'')].filter(Boolean).join(' · '):'',
      projectUrl:http(p.Link||p.link_to_external_website?.url||p.link_to_external_website)
    };
  }
  function projectKey(value){return text(value).toUpperCase().replace(/\s+/g,'').replace(/-0+(\d+)$/,'-$1');}
  // Join only official IDs; city-wide program pins are not project-specific alignments.
  function joinFulton(records,locations){
    const byId=new Map(),recordCounts=new Map();
    for(const p of locations){const key=projectKey(p.project_id);if(key){if(!byId.has(key))byId.set(key,[]);byId.get(key).push(p);}}
    for(const p of records){const key=projectKey(p.project_id);recordCounts.set(key,(recordCounts.get(key)||0)+1);}
    const generic=v=>/city[ -]?wide|county[ -]?wide|various|to be determined|project management|quick response|program[ -]?wide|^resurfacing$|^operations and safety$|^pedestrian improvements$|^maintenance and safety enhancements$|^pedestrian\/bike\/landscape\/streetscape projects$/i.test(text(v));
    return records.map(p=>{
      const key=projectKey(p.project_id),matches=byId.get(key)||[];let reason='';
      if(!key||recordCounts.get(key)>1)reason='Missing or ambiguous official project ID';
      else if(generic(p.project_name_title)||matches.some(m=>generic(m.project_na)))reason='Area-wide program; no project-specific alignment';
      else if(!matches.length)reason='No matching published project-location ID';
      const points=matches.map(m=>m.the_geom).filter(g=>g?.type==='Point'&&g.coordinates?.length>=2&&g.coordinates.slice(0,2).every(Number.isFinite)&&Math.abs(g.coordinates[0])<=180&&Math.abs(g.coordinates[1])<=90);
      const unique=[...new Map(points.map(g=>[JSON.stringify(g.coordinates),g])).values()];
      if(!reason&&!unique.length)reason='Published location is missing or invalid';
      return {type:'Feature',geometry:reason?null:unique.length===1?unique[0]:{type:'MultiPoint',coordinates:unique.map(g=>g.coordinates)},properties:{...p,_location_note:reason||'Representative points, not a full construction alignment; nearby work may be missed.',_location_updated_at:matches.map(m=>text(m.editdate)).filter(Boolean).sort().at(-1)||''}};
    });
  }
  // Uploaded route shapefiles are the map's authority for ART/BRT/LRT alignments.
  // Inspect the project name/type, not incidental references in descriptions or limits.
  function isImportedRapidTransit(row){
    const name=text(row.name),kind=text(row.kind),p=row.raw||{};
    const mode=text(pick(p,['TRANSIT_MODE','Transit_Mode','transit_mode','Mode','mode']));
    if(/\bfacilit(?:y|ies)\b|\bsidewalks?\b|\bpedestrian\b|\bbikeways?\b|\butilities\b|\bsewer\b|\bwater\b/i.test(kind)&&!/\b(?:BRT|ART|LRT)\b|\brapid transit\b|\blight rail\b/i.test(kind))return false;
    if(/\b(?:BRT|ART|LRT)\b|\bbus[\s-]+rapid[\s-]+transit\b|\barterial[\s-]+rapid[\s-]+transit\b|\blight[\s-]+rail(?:[\s-]+transit)?\b|\bstreetcar\b|\btramway\b/i.test(kind+' '+mode))return true;
    if(/\b(?:BRT|LRT)\b|\bbus[\s-]+rapid[\s-]+transit\b|\barterial[\s-]+rapid[\s-]+transit\b|\blight[\s-]+rail(?:[\s-]+transit)?\b|\bstreetcar\b|\btramway\b/i.test(name))return true;
    const transitProject=/^transit$/i.test(text(p.PRJ_GROUP))||/\btransit\b/i.test(kind);
    return transitProject&&/\bART\b/i.test(name);
  }
  function arcJurisdictions(p){
    const counties=text(p.COUNTY).split(/[,;/|]+/).map(v=>v.trim().replace(/\s+county$/i,'').toLowerCase());
    const cities=text(p.CITY).split(/[,;/|]+/).map(v=>v.trim().replace(/^city of\s+/i,'').toLowerCase());
    const result=[];if(cities.includes('atlanta'))result.push('Atlanta');
    for(const [key,label]of [['fulton','Fulton'],['dekalb','DeKalb'],['clayton','Clayton']])if(counties.includes(key))result.push(label);
    return result;
  }
  function arcInfrastructure(feature,source){
    const p=feature.properties||{},jurisdictions=arcJurisdictions(p),status=text(p.STATUS),id=text(p.ARCID)||text(p.OBJECTID);
    return {id:source.id+':'+id,sourceId:id,name:text(p.PRJ_DESC)||'ARC project '+id,sourceStatus:status,kind:text(p.PRJ_TYPE),category:p.PRJ_GROUP==='Transit'?'Transit':category(text(p.PRJ_TYPE)+' '+text(p.PRJ_DESC)),
      complete:/^completed$/i.test(status),longRange:/^long range$/i.test(status),phase:/^completed$/i.test(status)?'Complete':'Planning / design',
      jurisdiction:jurisdictions.join(' / '),jurisdictions,agency:text(p.SPONSOR)||'Atlanta Regional Commission',municipality:text(p.CITY),
      start:null,finish:null,duration:'',scheduleType:'ARC programming status; construction dates not provided',description:text(p.PRJ_DESC),limits:text(p.EXTENTS),contractor:'',cost:null,
      updated:pick(p,['EditDate','last_edited_date']),geometry:feature.geometry,raw:p,source,geometryBasis:'ARC planning/project area — not a construction footprint',
      locationNote:'ARC publishes project-area polygons, not surveyed construction footprints. Full extents are retained for cross-county projects.',
      geometryUpdated:pick(p,['EditDate','last_edited_date']),program:'ARC MTP / TIP',activity:'',projectUrl:http(p.Fact_Sheet_Link)};
  }
  function arcId(v){const s=text(v).toUpperCase().replace(/\s+/g,'');const m=s.match(/^([A-Z]{1,5})-?(\d+)([A-Z0-9-]*)$/);return m?m[1]+'-'+m[2].replace(/^0+(?=\d)/,'')+m[3]:'';}
  function piId(v){const s=text(v).replace(/[\s-]/g,'');return /^\d{6,7}$/.test(s)?s.padStart(7,'0'):'';}
  function officialIdentifiers(row){
    const arcIds=new Set(),gdotPis=new Set();
    for(const [k,value]of Object.entries(row.raw||{})){
      const key=k.toUpperCase().replace(/[^A-Z0-9]/g,'');
      if(['ARCID','ARCPROJECTID','ARCPROJECTNUMBER'].includes(key))for(const v of text(value).split(/[,;/|]+/)){const id=arcId(v);if(id)arcIds.add(id);}
      if(['GDOTPI','GDOTPINUMBER','PINUMBER','PINO','PROJECTPI'].includes(key))for(const v of text(value).split(/[,;/|]+/)){const id=piId(v);if(id)gdotPis.add(id);}
    }
    for(const m of (text(row.description)+' '+text(row.name)).matchAll(/\b(?:GDOT\s+)?PI(?:\s*(?:#|No\.?|Number))?\s*[:#-]?\s*(\d{6,7})\b/gi))gdotPis.add(piId(m[1]));
    for(const value of [row.raw?.Link,row.projectUrl])try{const u=new URL(value);if(/(^|\.)dot\.ga\.gov$/i.test(u.hostname))for(const [key,v]of u.searchParams)if(/^(projectid|pi)$/i.test(key)&&piId(v))gdotPis.add(piId(v));}catch{}
    return {arcIds:[...arcIds],gdotPis:[...gdotPis].filter(Boolean)};
  }
  function projectPhase(name){const m=text(name).toUpperCase().match(/\bPHASE\s*[-:]?\s*([0-9]+[A-Z]?|IV|III|II|I|[A-Z])\b/);return m?({I:'1',II:'2',III:'3',IV:'4'}[m[1]]||m[1]):'';}
  function nameTokens(name){return [...new Set(text(name).toLowerCase().replace(/\brd\b/g,'road').replace(/\bave\b/g,'avenue').replace(/\bblvd\b/g,'boulevard').replace(/\bpkwy\b/g,'parkway').replace(/\bst\b/g,'street').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(v=>v&&!/^(the|of|and|from|to|at|in|for|project|improvements?|construction|road|street|avenue|boulevard|parkway|phase|widening|sidewalks?)$/.test(v)))];}
  function reconcileInfrastructure(input){
    const excludedRapidTransitRows=input.filter(isImportedRapidTransit),retained=input.filter(r=>!isImportedRapidTransit(r));
    const locals=retained.filter(r=>r.source.kind!=='arc').map(r=>({...r,arcReferences:[],identifiers:officialIdentifiers(r)}));
    const arcs=retained.filter(r=>r.source.kind==='arc'&&arcJurisdictions(r.raw).length).map(r=>({...r,identifiers:officialIdentifiers(r)}));
    const piCounts=new Map();for(const r of arcs)for(const id of r.identifiers.gdotPis)piCounts.set(id,(piCounts.get(id)||0)+1);
    const additions=[];let matched=0;
    for(const arc of arcs){
      const official=locals.filter(r=>r.identifiers.arcIds.some(id=>arc.identifiers.arcIds.includes(id))||r.identifiers.gdotPis.some(id=>arc.identifiers.gdotPis.includes(id)));
      const safe=official.filter(r=>{
        const explicit=r.identifiers.arcIds.length===1&&arc.identifiers.arcIds.includes(r.identifiers.arcIds[0]);
        const uniquePi=r.identifiers.gdotPis.some(id=>arc.identifiers.gdotPis.includes(id)&&piCounts.get(id)===1);
        const a=projectPhase(r.name),b=projectPhase(arc.name);
        return (explicit||uniquePi)&&!(a&&b&&a!==b)&&(!r.geometry||!arc.geometry||geometryDistance(r.geometry,arc.geometry)<=1609.344);
      });
      if(official.length===1&&safe.length===1){
        const target=safe[0];target.arcReferences.push(arc);
        target.jurisdictions=[...new Set([...(target.jurisdictions||[target.jurisdiction]),...arc.jurisdictions])];
        if(!target.geometry&&arc.geometry){target.geometry=arc.geometry;target.geometryBasis=arc.geometryBasis;target.geometryUpdated=arc.updated;target.locationNote='ARC project area used; the local feed has no mapped project-specific location.';}
        matched++;continue;
      }
      let candidates=official.map(r=>({id:r.id,name:r.name,reason:'Shared official identifier; phase, location or multiple records need review'}));
      if(!candidates.length){
        const tokens=nameTokens(arc.name);
        candidates=locals.filter(r=>{
          const other=nameTokens(r.name),shared=tokens.filter(t=>other.includes(t)).length;
          if(shared<2||shared/Math.max(1,Math.min(tokens.length,other.length))<0.8)return false;
          if(r.geometry&&arc.geometry)return geometryDistance(r.geometry,arc.geometry)<=250;
          return tokens.slice().sort().join('|')===other.slice().sort().join('|')&&(arc.jurisdictions.includes(r.jurisdiction));
        }).map(r=>({id:r.id,name:r.name,reason:'Similar project name and nearby geometry; not an identity confirmation'}));
      }
      if(candidates.length)arc.possibleMatches=candidates;additions.push(arc);
    }
    return {rows:[...locals,...additions],excludedRapidTransitRows,matchedArcCount:matched,possibleArcCount:additions.filter(r=>r.possibleMatches?.length).length,newArcCount:additions.filter(r=>!r.possibleMatches?.length).length};
  }
  function geometryParts(g) {
    if(!g)return [];if(g.type==='GeometryCollection')return g.geometries.flatMap(geometryParts);if(g.type==='Point')return [[g.coordinates]];if(g.type==='MultiPoint')return g.coordinates.map(p=>[p]);
    if(g.type==='LineString')return [g.coordinates];if(g.type==='MultiLineString'||g.type==='Polygon')return g.coordinates;
    if(g.type==='MultiPolygon')return g.coordinates.flat();return [];
  }
  function ringContains(p,ring) {
    let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside;
  }
  function contains(g,p) {
    const polys=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
    return polys.some(poly=>ringContains(p,poly[0])&&!poly.slice(1).some(r=>ringContains(p,r)));
  }
  function pointSegment(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function segmentsCross(a,b,c,d) {
    const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
    if(((x>0&&y<0)||(x<0&&y>0))&&((z>0&&w<0)||(z<0&&w>0)))return true;
    return pointSegment(a,c,d)<1e-7||pointSegment(b,c,d)<1e-7||pointSegment(c,a,b)<1e-7||pointSegment(d,a,b)<1e-7;
  }
  // Local planar screening distance, including crossings between sparse vertices.
  function geometryDistance(a,b) {
    const pa=geometryParts(a),pb=geometryParts(b);if(!pa.length||!pb.length)return Infinity;
    if(pa.some(part=>contains(b,part[0]))||pb.some(part=>contains(a,part[0])))return 0;
    const lat=(pa[0][0][1]+pb[0][0][1])/2*Math.PI/180;
    const project=p=>[p[0]*111195*Math.cos(lat),p[1]*111195];let min=Infinity;
    for(const x of pa)for(const y of pb) {
      const px=x.map(project),py=y.map(project);
      for(let i=0;i<px.length;i++)for(let j=0;j<py.length;j++) {
        if(i&&j&&segmentsCross(px[i-1],px[i],py[j-1],py[j]))return 0;
        min=Math.min(min,Math.hypot(px[i][0]-py[j][0],px[i][1]-py[j][1]));
        if(i)min=Math.min(min,pointSegment(py[j],px[i-1],px[i]));if(j)min=Math.min(min,pointSegment(px[i],py[j-1],py[j]));
      }
    }return min;
  }
  return {text,pick,numeric,http,parcel,groupParcels,dateRange,dateLabel,schedule,category,infrastructure,joinFulton,geometryDistance,arcJurisdictions,officialIdentifiers,reconcileInfrastructure,isImportedRapidTransit};
});
