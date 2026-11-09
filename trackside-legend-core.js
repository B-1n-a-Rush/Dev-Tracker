/* Shared, geometry-free descriptions for on-screen and printed map keys. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TracksideLegendCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const statusColors={Planning:'#7b61c7',Construction:'#f4a261',Complete:'#3d9bd1',Unknown:'#737c79'};
const infraColors={'Utilities':'#2670ad','Trails & paths':'#44803e','Sidewalks':'#c45b91','Bikeways':'#168e93','Streetscape':'#9162b4','Signals & safety':'#b77a14','Roads & bridges':'#b85d35','Transit':'#3853a4','Other':'#6a7570'};
const color=(v,fallback='#136647')=>/^#[0-9a-f]{6}$/i.test(String(v||''))?v:fallback;
const row=(label,kind,paint,note='',extra={})=>({label:String(label||''),kind,color:color(paint),note,...extra});
const unique=items=>[...new Set(items||[])];
const routes=items=>(items||[]).map(r=>row(r.name||r.line_name,r.dashed?'dash':'line',r.color||r.line_color,r.mode||'',r.sharedColors?{colors:r.sharedColors.map(c=>color(c))}:{}));
const group=(id,title,rows,note='',fold=false)=>({id,title,rows,note,fold});
function main(s={}){
 const groups=[];
 if(s.projects){const rows=unique(s.projectStatuses||['Construction','Planning','Complete']).filter(k=>statusColors[k]).map(k=>row(k,'dot',statusColors[k]));if(s.clustered&&!s.projectEmpty)rows.push(row('Grouped projects','cluster','#277b57','Number = project count; darker green = larger group, not project status.'));groups.push(group('projects','Development',rows,s.projectEmpty?'Enabled; no filtered project pins are currently shown.':''));}
 if(s.rail)groups.push(group('rail','Existing rail',routes(s.railRoutes),'Paired colors identify shared rail segments.',true));
 if(s.stations)groups.push(group('stations','Rail stations',[row('Station reference point','ring','#14251e')]));
 const service=(s.routes||[]).filter(r=>r.existing),rapid=(s.routes||[]).filter(r=>!r.existing);
 if(service.length)groups.push(group('service','Existing streetcar',routes(service)));
 if(rapid.length)groups.push(group('rapid','BRT / ART / LRT alignments',routes(rapid),'Dashed alignment = high-capacity transit project; the line does not indicate a construction date.',true));
 if(s.bus?.enabled){groups.push(group('bus','Local bus routes',routes(s.bus.routes),s.bus.loaded?(s.bus.verified?'Network operational use confirmed; service days and hours are not shown.':'Unverified network — test / planning data. Intended operational use is not confirmed.'):'Enabled; waiting for route data.',true));if(s.bus.stops)groups.push(group('busStops','Local bus stops',[row('Stop location','ring','#305b4a')],s.bus.zoom<14?'Stops appear at zoom 14 or closer.':'Stops follow the route filter and map view.'));}
 if(s.sr2t?.enabled)groups.push(group('sr2t','Safe Routes to Transit',unique(s.sr2t.statuses).map(k=>row(k,'walk',statusColors[k]||statusColors.Unknown)),s.sr2t.count?'One walking figure at each linked stop. Hover or select to highlight its site group.':'Enabled; no linked published stop markers are shown.'));
 if(s.infrastructure?.enabled){const cats=unique(s.infrastructure.categories);const rows=cats.map(k=>row(k,'line',infraColors[k]||infraColors.Other));if(cats.length)rows.push(row('Construction phase','line','#6a7570'),row('Other phases','dash','#6a7570'),row('Long-range plan','dots','#6a7570'),row('Point or area geometry','area','#6a7570','Published location; may not be a work footprint.'));groups.push(group('infrastructure','Public infrastructure',rows,cats.length?'Color = project type. Solid / dashed styling applies to lines and polygon outlines.':'Enabled; no mapped projects loaded for the current filters.',true));}
 if(s.parcels)groups.push(group('parcels','Tax parcels',[row('Parcel boundary','area','#49665a')],s.zoom<16?'Parcel display starts at zoom 16.':'Tax boundaries are not surveyed work limits.'));
 if(s.boundaries)groups.push(group('boundaries','Service-area boundaries',[row('County','dash','#136647'),row('City of Atlanta','dash','#365d8d')]));
 if(s.stationBuffer)groups.push(group('stationBuffer','Station distance',[row('Straight-line radius','area','#136647')],'Proximity does not establish walking access.'));
 if(s.study)groups.push(group('study','Study area',[row('Selected study area','area','#136647')]));
 if(s.scenario)groups.push(group('scenario','What-if routes',[row('Hypothetical alignment','dash','#6847a5'),row('Proposed stop','ring','#c9ee6e')],'Concepts are separate from published services and projects.'));
 if(s.search)groups.push(group('search','Search selection',[row('Search pin','pin','#136647'),...(s.searchParcel?[row('Selected parcel','area','#136647')]:[])],'A parcel pin is a representative interior point, not a surveyed entrance.'));
 return {title:'Map key',context:'Enabled layers · some features appear only when zoomed in.',groups};
}
function bus(s={}){
 const groups=[group('busRoute','Selected local bus route',routes(s.route?[s.route]:[]),s.loaded?(s.verified?'Network operational use confirmed; operating calendars are not provided.':'Unverified test / planning network. Operational use is not confirmed.'):'Choose a loaded route.')];
 if(s.potential)groups.push(group('impacts','Potential impact — review needed',[row('Screened route segment','impact',s.route?.color||s.route?.line_color),row('Nearby / intersecting stop','ring','#bd6b2f'),row('Project location','dot','#c56b2d'),row('Point fallback','dot','#8063a1','Lower-confidence project location.')],'Proximity may reflect a crossing, bridge or unrelated work; it does not establish a closure, delay or detour.'));
 if(s.stops)groups.push(group('stops','Other route stops',[row('Stop location','ring','#526c5a')],'All-stop display starts at zoom 14.'));
 return {title:'Map key',context:'Selected route, directions, patterns and project filters.',groups};
}
function walking(s={}){
 const rows=(s.bands||[]).map(b=>row(b.label,'line',b.color));if(s.base)rows.push(row('Other mapped paths','line','#a8b4ac'),row('Station / stop reference','dot','#6b4fb3'),row('Straight-line comparison','dash','#809383'));
 if(s.result)rows.push(row('Walking start','dot','#136647'),...['Planning','Construction','Complete'].map(k=>row(k+' project candidate','dot',statusColors[k])));
 if(s.inventory)rows.push(row('County sidewalk inventory','line','#a270ba'));
 return {title:'Walking map key',context:'Walking time along connected mapped paths, not distance bands.',groups:[group('walking','Estimated walking time',rows,'Missing paths, crossings and entrances remain uncertain. Estimates do not certify safe or ADA-accessible access.')]};
}
function hotspots(s={}){
 const groups=[group('routes','Shown route alignments',routes((s.routes||[]).map(r=>({...r,dashed:true}))),'',true)];
 const rows=[];if(s.overlap)rows.push(row('Potential schedule overlap','dot','#bd632f'));if(s.unknown)rows.push(row('Timing unknown','ring','#697386'));if(s.geometry)rows.push(row('Selected published geometry','area','#172e26'));
 groups.push(group('screening','Screening locations',rows,'Markers are calculated screening locations, not confirmed work sites. Unknown timing does not establish an overlap; proximity does not establish a service disruption.'));
 return {title:'Map key',context:'The current hotspot filters.',groups};
}
function briefing(s={}){
 const route=s.route||{},rows=s.rows||[],types=unique(rows.map(x=>x.state));return{title:'Map key',context:'Only the selected route and infrastructure in this briefing.',groups:[group('route','Selected route',routes([{...route,dashed:route.kind==='rapid'}])),group('screening','Infrastructure screening',[...(types.includes('overlap')?[row('Potential schedule overlap','line','#b85d35')]:[]),...(types.some(x=>x!=='overlap')?[row('Other nearby infrastructure','line','#718d76')]:[])],'Schedule overlap and proximity require review. Neither confirms a closure, detour or service interruption. Published geometry may be a planning area or representative point.')]};
}
return {color,row,routes,main,bus,walking,hotspots,briefing,statusColors,infraColors};
});
