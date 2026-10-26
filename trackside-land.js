/* Parcel profiles and public-source infrastructure coordination. */
(function() {
  'use strict';
  const C=window.TracksideLandCore;
  if(!C||typeof map==='undefined')return;
  const $=id=>document.getElementById(id);
  const aside=document.querySelector('aside.detail');
  const profiles=['placeholder','detail','stationDetail','corridorDetail','studyAreaDetail','scenarioDetail','hereProfile'];
  const colors={'Utilities':'#2670ad','Trails & paths':'#44803e','Sidewalks':'#c45b91','Bikeways':'#168e93','Streetscape':'#9162b4','Signals & safety':'#b77a14','Roads & bridges':'#b85d35','Transit':'#3853a4','Other':'#6a7570'};
  function node(tag,cls,content){const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=content;return n;}
  function button(label,action,cls='land-button'){const b=node('button',cls,label);b.type='button';b.addEventListener('click',action);return b;}
  function link(label,url){const a=node('a','land-link',label);a.href=C.http(url);a.target='_blank';a.rel='noopener noreferrer';return a;}
  function note(content){return node('p','land-note',content);}
  function money(value){return value===null?'Not published':Number(value).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});}
  function facts(rows){const dl=node('dl','land-facts');for(const [label,value] of rows){if(value===null||value===undefined||value==='')continue;const div=node('div');div.append(node('dt','',label),node('dd','',value));dl.append(div);}return dl;}
  function rawDetails(p,aliases={}){const d=node('details','land-raw');d.append(node('summary','','All published fields'));const rows=Object.entries(p).filter(([k,v])=>!/^_|shape|globalid|creator|editor|objectid/i.test(k)&&C.text(v)).map(([k,v])=>[aliases[k]||k,C.text(v)]);d.append(facts(rows));return d;}
  const parcelPanel=node('section','land-profile');parcelPanel.id='parcelProfile';parcelPanel.hidden=true;aside.append(parcelPanel);
  const infraPanel=node('section','land-profile');infraPanel.id='infrastructureProfile';infraPanel.hidden=true;aside.append(infraPanel);
  const parcelHighlight=L.geoJSON(null,{style:{color:'#0c6651',weight:4,fillColor:'#b6da69',fillOpacity:.22,interactive:false}}).addTo(map);
  const infraLayer=L.layerGroup();const infraHighlight=L.layerGroup().addTo(map);
  let parcelGeneration=0,profileGeneration=0;
  function dismissProfiles(){window.TracksideHere?.dismiss();parcelPanel.hidden=true;infraPanel.hidden=true;parcelHighlight.clearLayers();infraHighlight.clearLayers();profileGeneration++;}
  function openProfile(panel){if(panel.id!=='hereProfile')window.TracksideHere?.dismiss();profiles.forEach(id=>{if($(id))$(id).style.display=$(id)===panel?'':'none';});parcelPanel.hidden=panel!==parcelPanel;infraPanel.hidden=panel!==infraPanel;selected=null;setDetailDrawerOpen(true);if(typeof syncSelectedProjectUrl==='function')syncSelectedProjectUrl(null);}
  const oldShow=show;show=function(...args){dismissProfiles();return oldShow(...args);};
  const oldStation=showStationOverview;showStationOverview=function(...args){dismissProfiles();return oldStation(...args);};
  const oldCorridor=showCorridorOverview;showCorridorOverview=function(...args){dismissProfiles();return oldCorridor(...args);};
  const oldStudy=showStudyAreaOverview;showStudyAreaOverview=function(...args){dismissProfiles();return oldStudy(...args);};
  const oldScenario=showScenarioComparison;showScenarioComparison=function(...args){dismissProfiles();return oldScenario(...args);};
  const oldClear=clearDetailPanel;clearDetailPanel=function(...args){dismissProfiles();return oldClear(...args);};
  async function fetchJson(url,signal){const response=await fetch(url,{signal:signal||AbortSignal.timeout(25000)});if(!response.ok)throw new Error('HTTP '+response.status);const j=await response.json();if(j.error)throw new Error(j.error.message||'GIS service unavailable');return j;}
  async function queryFeatures(url,extra={},maximum=6000){
    const all=[];let offset=0;
    while(all.length<maximum){
      const params=new URLSearchParams({f:'geojson',where:'1=1',outFields:'*',outSR:'4326',returnGeometry:'true',orderByFields:'OBJECTID ASC',resultRecordCount:String(Math.min(1000,maximum-all.length)),resultOffset:String(offset),...extra});
      const j=await fetchJson(url.replace(/\/query$/,'')+'/query?'+params);
      if(!Array.isArray(j.features))throw new Error('Source did not return GIS features');
      all.push(...j.features);offset+=j.features.length;
      if(!j.features.length||(!j.exceededTransferLimit&&j.features.length<1000))return {features:all,truncated:false};
      if(!j.exceededTransferLimit&&all.length<maximum)continue;
      if(all.length>=maximum)return {features:all,truncated:true};
    }
    return {features:all,truncated:true};
  }
  const parcelConfig=[
    {name:'Fulton County',url:'https://gismaps.fultoncountyga.gov/arcgispub2/rest/services/PropertyMapViewer/ParcelHighlighter/MapServer/1',viewer:'https://gis.fultoncountyga.gov/Apps/PropertyMapViewer/'},
    {name:'DeKalb County',url:'https://dcgis.dekalbcountyga.gov/mapping/rest/services/TaxParcels/FeatureServer/0',viewer:'https://experience.arcgis.com/experience/541b6d8e1f1249a0ab98f01c62fffce0'},
    {name:'Clayton County',url:'https://gis.claytoncountyga.gov/server/rest/services/TaxAssessor/Parcels/MapServer/0',viewer:'https://clayton-county-gis-data-portal-cccd-gis.hub.arcgis.com/apps/daff6d6be7a14000a1595a99bb67b1f8/explore'}
  ];
  const atlantaParcels={name:'City of Atlanta',url:'https://services5.arcgis.com/5RxyIIJ9boPdptdo/arcgis/rest/services/coa_tax_parcels/FeatureServer/0',viewer:'https://gis.atlantaga.gov/propinfo/'};
  // County polygons provide one tax boundary; Atlanta planning layers enrich clicks.
  parcelSources.splice(0,parcelSources.length,...parcelConfig.map(s=>({name:s.name,url:s.url+'/query'})));
  function parcelTooltip(row,count){const p=node('span','',row.address||row.id);if(count>1)p.append(node('small','',` · ${count} tax records`));return p;}
  function installParcels(result,source,generation){
    if(generation!==parcelGeneration||!parcelsEnabled)return;
    C.groupParcels(result.features).forEach(group=>{
      const first=group[0];const layer=L.geoJSON(first,{style:f=>parcelStyle(f,source.name)});
      const row=C.parcel(first,source);
      layer.bindTooltip(parcelTooltip(row,group.length),{sticky:true});
      layer.on('click',e=>{
        if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);
        if(parcelSelectionMode){const item={id:row.id,county:source.name,geometry:first.geometry};const i=draftParcels.findIndex(p=>parcelKey(p)===parcelKey(item));if(i<0)draftParcels.push(item);else draftParcels.splice(i,1);layer.setStyle(parcelStyle(first,source.name));updateParcelState();}
        else showParcel(group,source,e.latlng);
      });layer.addTo(parcelLayer);
    });
  }
  loadParcels=async function(){
    const generation=++parcelGeneration;if(!parcelsEnabled)return;
    if(map.getZoom()<parcelMinimumZoom){parcelLayer.clearLayers();setParcelLayerHelp('Zoom in to level '+parcelMinimumZoom+' to inspect parcels');return;}
    const b=map.getBounds();const geometry=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');
    const extra={geometry,geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
    setParcelLayerHelp('Loading parcel boundaries and property details…');
    const results=await Promise.allSettled(parcelConfig.map(s=>queryFeatures(s.url,extra,4000)));
    if(generation!==parcelGeneration||!parcelsEnabled)return;
    parcelLayer.clearLayers();let count=0;const failures=[];let truncated=false;
    results.forEach((r,i)=>{if(r.status==='fulfilled'){count+=r.value.features.length;truncated||=r.value.truncated;installParcels(r.value,parcelConfig[i],generation);}else failures.push(parcelConfig[i].name);});
    if(!count&&failures.length){try{const fallback=await queryFeatures(atlantaParcels.url,extra,3000);count+=fallback.features.length;installParcels(fallback,atlantaParcels,generation);}catch{}}
    if(generation!==parcelGeneration||!parcelsEnabled)return;
    setParcelLayerHelp(`${count.toLocaleString()} tax records · click a parcel for details${truncated?' · zoom in for full coverage':''}${failures.length?' · unavailable: '+failures.join(', '):''}`);
  };
  const metadataCache=new Map();
  function sourceMetadata(source){if(!metadataCache.has(source.url))metadataCache.set(source.url,fetchJson(source.url+'?f=json').catch(()=>({})));return metadataCache.get(source.url);}
  async function showParcel(group,source,latlng,index=0){
    const generation=++profileGeneration;const row=C.parcel(group[index],source);
    openProfile(parcelPanel);parcelHighlight.clearLayers();parcelHighlight.addData(group[index]);infraHighlight.clearLayers();parcelPanel.replaceChildren();
    parcelPanel.append(node('div','eyebrow','Parcel overview'),node('h2','',row.address||row.id),node('p','land-subtitle',source.name));
    if(group.length>1){const label=node('label','land-field','Tax record on this footprint');const select=node('select');group.forEach((f,i)=>select.add(new Option(C.parcel(f,source).id,String(i),false,i===index)));select.addEventListener('change',()=>showParcel(group,source,latlng,Number(select.value)));label.append(select);parcelPanel.append(label,note('Condominium or other tax records can share one boundary. Select a record to view its own values.'));}
    parcelPanel.append(facts([['Parcel ID',row.id],['Owner',row.owner||'Not published'],['Lot size',row.acres===null?'Not published':row.acres.toLocaleString('en-US',{maximumFractionDigits:3})+' acres'],['Existing land use',row.landUse||'Not published'],['Zoning',row.zoning||'Not published'],['Tax year',row.taxYear||'Not published'],['Appraised value',money(row.appraised)],['Assessed value',money(row.assessed)],['Building area',row.buildingArea===null?'':row.buildingArea.toLocaleString()+' sq ft'],['Year built',row.yearBuilt],['Existing tax-record units',row.existingUnits===null?'':row.existingUnits.toLocaleString()],['Last sale',row.saleDate],['Sale price',row.salePrice===null?'':money(row.salePrice)]]));
    parcelPanel.append(note('Tax-record values describe existing property and may lag redevelopment. Proposed residential units remain in the project overview.'));
    const planning=node('section','land-planning');planning.append(node('h3','','City planning context'),note('Checking Atlanta zoning and overlays…'));parcelPanel.append(planning);
    const links=node('div','land-actions');links.append(link('Official property viewer ↗',source.viewer));if(row.propertyCard)links.append(link('Property card ↗',row.propertyCard));if(row.taxCard)links.append(link('Tax card ↗',row.taxCard));
    if(source.name==='DeKalb County')links.append(link('Assessor property record ↗','https://propertyappraisal.dekalbcountyga.gov/datalets/datalet.aspx?mode=profileall&UseSearch=no&pin='+encodeURIComponent(row.id)+'&jur=000'));
    if(window.TracksideHere)links.append(button('What’s happening here?',()=>window.TracksideHere.open({center:latlng,label:row.address||row.id,parcelContext:{group,source,latlng}})));parcelPanel.append(links);const freshness=note('Retrieved '+new Date().toLocaleString()+'. Source update date not supplied.');parcelPanel.append(freshness);
    const raw=rawDetails(row.raw);parcelPanel.append(raw);
    sourceMetadata(source).then(meta=>{if(generation!==profileGeneration)return;raw.replaceWith(rawDetails(row.raw,Object.fromEntries((meta.fields||[]).map(f=>[f.name,f.alias]))));if(meta.editingInfo?.lastEditDate)freshness.textContent+=' Dataset updated '+C.dateLabel(meta.editingInfo.lastEditDate)+'.';});
    await enrichPlanning(planning,latlng,generation);
  }
  async function enrichPlanning(root,latlng,generation){
    if(!latlng){root.replaceChildren(note('Use the official property viewer for additional planning layers.'));return;}
    const extra={geometry:`${latlng.lng},${latlng.lat}`,geometryType:'esriGeometryPoint',inSR:'4326',returnGeometry:'false',spatialRel:'esriSpatialRelIntersects'};
    try{
      const city=await queryFeatures('https://gis.atlantaga.gov/dpcd/rest/services/AdministrativeArea/GeopoliticalArea/MapServer/0',extra,10);
      if(generation!==profileGeneration)return;
      if(!city.features.length){root.replaceChildren(note('Outside City of Atlanta. County zoning is shown above when published; use the official viewer for municipal overlays.'));return;}
      const layers=[['Zoning district',0],['Zoning overlay',1],['Historic district',6],['Future land use / development pattern',8]];
      const results=await Promise.allSettled(layers.map(([,id])=>queryFeatures('https://gis.atlantaga.gov/dpcd/rest/services/LandUsePlanning/LandUsePlanning/MapServer/'+id,extra,15)));
      if(generation!==profileGeneration)return;
      root.replaceChildren(node('h3','','City of Atlanta planning context'));
      results.forEach((r,i)=>{const title=layers[i][0];if(r.status==='rejected'){root.append(note(title+': source unavailable'));return;}const values=r.value.features.map(f=>C.text(C.pick(f.properties||{},['DP_NAME','ZONING','ZONECLASS','ZONE_CLASS','ZONINGCLASS','ZONING_DESC','ZONE','DESCRIPTION','NAME','LANDUSEDES','LANDUSE','LAND_USE','FLU','LU_DESC','DISTRICT','OVERLAY']))).filter(Boolean);root.append(facts([[title,values.length?[...new Set(values)].join('; '):r.value.features.length?'See published fields below':'No intersecting feature']]));r.value.features.forEach(f=>root.append(rawDetails(f.properties||{})));});
      root.append(link('Atlanta property and planning viewer ↗','https://gis.atlantaga.gov/propinfo/'),note('Planning layers are identified at the clicked location. A parcel can cross multiple districts.'));
    }catch{if(generation===profileGeneration)root.replaceChildren(note('Atlanta planning layers are temporarily unavailable. Parcel and county details remain available.'));}
  }
  const infrastructureSources=[
    {id:'atl-capital',group:'atl-capital',kind:'atlanta',jurisdiction:'Atlanta',agency:'Atlanta Department of Transportation',name:'Atlanta capital delivery',url:'https://services2.arcgis.com/zLeajbicrDRLQcny/arcgis/rest/services/CapitalDeliveryProjects_View_Public/FeatureServer/0',viewer:'https://atldot.atlantaga.gov/resources-2/capital-delivery/'},
    {id:'dk-splost-lines',group:'dk-splost',kind:'splost',jurisdiction:'DeKalb',agency:'DeKalb County SPLOST',name:'DeKalb SPLOST lines',url:'https://dcgis.dekalbcountyga.gov/hosted/rest/services/SPLOSTProjectLines/FeatureServer/1',viewer:'https://experience.arcgis.com/experience/541b6d8e1f1249a0ab98f01c62fffce0'},
    {id:'dk-splost-points',group:'dk-splost',kind:'splost',jurisdiction:'DeKalb',agency:'DeKalb County SPLOST',name:'DeKalb SPLOST points',url:'https://dcgis.dekalbcountyga.gov/hosted/rest/services/SPLOSTProjectPoint/FeatureServer/0',viewer:'https://experience.arcgis.com/experience/541b6d8e1f1249a0ab98f01c62fffce0'},
    {id:'dk-water-lines',group:'dk-water-lines',kind:'watershed',jurisdiction:'DeKalb',agency:'DeKalb Department of Watershed Management',name:'DeKalb water/sewer lines',url:'https://services2.arcgis.com/IxVN2oUE9EYLSnPE/arcgis/rest/services/Projects/FeatureServer/0',viewer:'https://experience.arcgis.com/experience/541b6d8e1f1249a0ab98f01c62fffce0'},
    {id:'dk-water-points',group:'dk-water-points',kind:'watershed',jurisdiction:'DeKalb',agency:'DeKalb Department of Watershed Management',name:'DeKalb water/sewer points',url:'https://services2.arcgis.com/IxVN2oUE9EYLSnPE/arcgis/rest/services/Point_Projects/FeatureServer/0',viewer:'https://experience.arcgis.com/experience/541b6d8e1f1249a0ab98f01c62fffce0'},
    {id:'fulton-tsplost',group:'fulton-tsplost',kind:'fulton',jurisdiction:'Fulton',agency:'Fulton County municipalities · TSPLOST',name:'Fulton municipal TSPLOST',url:'https://data.fultoncountyga.gov/resource/wab3-52sv.json',locationsUrl:'https://data.fultoncountyga.gov/resource/bcjt-asar.json',metadataUrl:'https://data.fultoncountyga.gov/api/views/wab3-52sv.json',locationMetadataUrl:'https://data.fultoncountyga.gov/api/views/bcjt-asar.json',viewer:'https://tsplost.fultoncountyga.gov/projects',coverage:'Outside Atlanta. Representative project points, not alignments. Area-wide and unmatched records are excluded from proximity totals.'},
    {id:'clayton-splost',group:'clayton-splost',kind:'clayton',jurisdiction:'Clayton',agency:'Clayton County Transportation and Development',name:'Clayton SPLOST road improvements',url:'https://gis.claytoncountyga.gov/server/rest/services/Transportation/Transportation_Improvement_Projects/MapServer/18',viewer:'https://www.claytonsplost.com/transportation-projects/',geometryBasis:'Published road-improvement centerline',coverage:'One centerline record per named project; marker and CAD component copies are not counted. Some published phases and estimates are old. Start dates are not provided.'},
    {id:'clayton-gdot',group:'clayton-gdot',kind:'clayton',jurisdiction:'Clayton',agency:'Georgia Department of Transportation · Clayton GIS inventory',name:'Clayton GIS · GDOT road projects',url:'https://gis.claytoncountyga.gov/server/rest/services/Transportation/Transportation_Improvement_Projects/MapServer/24',viewer:'https://gis.claytoncountyga.gov/server/rest/services/Transportation/Transportation_Improvement_Projects/MapServer/24',geometryBasis:'Published road-improvement line',coverage:'County-published GDOT inventory, not all GDOT work. Estimates and phases require confirmation; start dates are not provided.'},
    {id:'clayton-resurfacing-2026',group:'clayton-resurfacing-2026',kind:'clayton-resurfacing',jurisdiction:'Clayton',agency:'Clayton County Transportation and Development',name:'Clayton 2026 milling & resurfacing',programYear:'2026 SPLOST',url:'https://services5.arcgis.com/m528W8U8YDYeMPrQ/arcgis/rest/services/2026_SPLOST_Milling_and_Resurfacing/FeatureServer/0',viewer:'https://www.arcgis.com/home/item.html?id=cec01906ff2a41bda9b3807588bce1ac',geometryBasis:'Published resurfacing street segment',coverage:'2026 public GIS layer. Program year and individual activity dates are not a full construction window. The county-linked resurfacing app currently references 2025 layers.'}
  ];
  infrastructureSources.push({id:'arc-mtp',group:'arc-mtp',kind:'arc',jurisdiction:'ARC four-jurisdiction coverage',agency:'Atlanta Regional Commission / project sponsors',name:'ARC MTP / TIP · MARTA jurisdictions',url:'https://services1.arcgis.com/Ug5xGQbHsD8zuZzM/arcgis/rest/services/ARC_MTP/FeatureServer/2',where:"UPPER(COUNTY) LIKE '%FULTON%' OR UPPER(COUNTY) LIKE '%DEKALB%' OR UPPER(COUNTY) LIKE '%CLAYTON%' OR UPPER(CITY) LIKE '%ATLANTA%'",viewer:'https://experience.arcgis.com/experience/0e308ec9423e4a52bd527f7b83acdf85/',coverage:'Only Atlanta, Fulton, DeKalb and Clayton matches, including cross-county projects touching these jurisdictions. ARC polygons are planning/project areas. Programmed is not proof that construction has started. Long Range and Completed are optional; construction dates must be verified separately.'});
  let infrastructureRows=[],infrastructureLoad=null,loadedAt=null,lastScreened=[],lastUnlocated=[],lastPotential=[],sourceResults=[],reconciliation={matchedArcCount:0,possibleArcCount:0,newArcCount:0};
  const distanceCache=new Map();let routeGeometrySignature='';
  const layerSection=node('section','map-layer-section');
  layerSection.innerHTML='<div class="map-layer-section-title">Infrastructure</div><label class="map-layer-option"><span class="map-layer-copy"><strong>Public infrastructure projects</strong><small id="infrastructureLayerHelp">Four-jurisdiction coverage · roads, paths, sidewalks and utilities</small></span><input id="layerInfrastructure" type="checkbox" /></label><button type="button" class="land-button land-wide" id="browseInfrastructure">Browse & coordinate</button>';
  $('mapLayersPanel').querySelector('.map-layers-head').after(layerSection);
  const layerInput=$('layerInfrastructure'),layerHelp=$('infrastructureLayerHelp');
  function setInfrastructureVisible(visible){layerInput.checked=visible;if(visible){infraLayer.addTo(map);loadInfrastructure();}else{map.removeLayer(infraLayer);infraHighlight.clearLayers();}updateMapLayersCount();}
  layerInput.addEventListener('change',()=>setInfrastructureVisible(layerInput.checked));
  $('browseInfrastructure').addEventListener('click',()=>{setPage('explore');setInfrastructureVisible(true);showInfrastructure();$('mapLayersPanel').hidden=true;$('mapLayersButton').setAttribute('aria-expanded','false');});
  const originalCount=updateMapLayersCount;updateMapLayersCount=function(){originalCount();if(layerInput.checked){const count=$('mapLayersCount');count.textContent=String((Number(count.textContent)||0)+1);}};
  infraPanel.innerHTML='<div class="eyebrow">Infrastructure coordination</div><h2>Coordinate along a corridor</h2><p class="land-subtitle">Local-agency and ARC projects · MARTA’s four jurisdictions</p><div class="land-banner">ARC projects are limited to Atlanta, Fulton, DeKalb and Clayton, including cross-county projects touching them. Programmed does not mean under construction. Long-range plans, completed work and possible duplicates are optional. ART, BRT and LRT routes are shown only from Trackside route shapefiles; imported rapid-transit alignments are excluded.</div><div class="land-controls"><label class="land-field">MARTA route / alignment<select id="infraRoute"><option value="">All loaded projects</option></select></label><label class="land-field">Distance from alignment<select id="infraDistance"><option value="30.48">100 feet</option><option value="76.2" selected>250 feet</option><option value="152.4">500 feet</option><option value="402.336">¼ mile</option><option value="804.672">½ mile</option></select></label><div class="land-control-row"><label class="land-field">Jurisdiction<select id="infraJurisdiction"><option value="">All four</option><option>Atlanta</option><option>DeKalb</option><option>Fulton</option><option>Clayton</option></select></label><label class="land-field">Project type<select id="infraCategory"><option value="">All types</option></select></label></div><label class="land-field">Municipality<select id="infraMunicipality"><option value="">All / not published</option></select></label><label class="land-field">Source / program<select id="infraProgram"><option value="">All connected sources</option></select></label><fieldset class="land-window"><legend>Your comparison window</legend><label class="land-field">Start<input type="date" id="infraStart" /></label><label class="land-field">Finish<input type="date" id="infraFinish" /></label><p>Enter the MARTA construction phase or study dates you want to compare. These dates are for this browser session.</p></fieldset><label class="land-check"><input id="infraIncludeComplete" type="checkbox" /> Include completed / closeout projects</label><label class="land-check"><input id="infraIncludeLongRange" type="checkbox" /> Include ARC long-range projects</label><label class="land-check"><input id="infraIncludePossible" type="checkbox" /> Include possible duplicates in map and totals</label><label class="land-check"><input id="infraOverlapOnly" type="checkbox" /> Overlaps + unknown schedules only</label></div><p class="land-message" id="infraMessage" role="status"></p><div class="land-stats" id="infraStats"></div><div class="land-actions"><button type="button" class="land-button" id="infraRefresh">Refresh sources</button><button type="button" class="land-button" id="infraExport">Export comparison CSV</button></div><p class="land-note">Proximity and schedule matches identify potential coordination needs. Line geometry is not a construction footprint. Project dates and anticipated construction dates are labeled separately. ARC planning areas use dashed outlines.</p><div id="infrastructureList" class="land-project-list"></div><details class="land-raw" id="infraDuplicates"><summary id="infraDuplicatesSummary">Possible duplicate ARC projects</summary><p class="land-note">Name/location similarities and ambiguous identifiers are not automatic merges. These candidates match your current filters but stay out of map totals unless explicitly included above. Compare both sources; related phases can be distinct projects.</p><button type="button" class="land-button" id="infraExportDuplicates">Export duplicate candidates</button><div id="infraDuplicatesList" class="land-project-list"></div></details><details class="land-raw" id="infraUnlocated"><summary id="infraUnlocatedSummary">Unmapped / area-wide records</summary><p class="land-note">Not plotted or counted in route proximity totals. These records may still need agency coordination. Jurisdiction, municipality, type and source filters apply; route and date-overlap filters do not.</p><button type="button" class="land-button" id="infraExportUnlocated">Export unmapped CSV</button><div id="infraUnlocatedList" class="land-project-list"></div></details><details class="land-raw"><summary>Sources & coverage</summary><div id="infraCoverage"></div></details>';
  Object.keys(colors).forEach(cat=>$('infraCategory').add(new Option(cat,cat)));
  function refreshRouteChoices(){const select=$('infraRoute'),previous=select.value;select.replaceChildren(new Option('All loaded projects',''));for(const r of railLines)select.add(new Option(r.name+' · MARTA rail','rail:'+r.name));for(const r of brtArtRoutes)select.add(new Option(r.name+' · '+(r.mode||'BRT / ART'),'rapid:'+r.name));if([...select.options].some(o=>o.value===previous))select.value=previous;}
  function referenceGeometry(){const value=$('infraRoute').value;if(!value)return null;const rail=value.startsWith('rail:');const name=value.slice(rail?5:6);const route=(rail?railLines:brtArtRoutes).find(r=>r.name===name);if(!route)return null;const lines=routePointParts(route).map(line=>line.map(p=>[p[1],p[0]]));const signature=value+'|'+JSON.stringify(lines);if(signature!==routeGeometrySignature){routeGeometrySignature=signature;distanceCache.clear();}return {type:'MultiLineString',coordinates:lines};}
  function showInfrastructure(){profileGeneration++;parcelHighlight.clearLayers();openProfile(infraPanel);refreshRouteChoices();const c=selectedCorridor();if(c){const key=(c.kind==='rail'?'rail:':'rapid:')+c.name;if([...$('infraRoute').options].some(o=>o.value===key))$('infraRoute').value=key;}screenInfrastructure();}
  function bbox(geometry){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;function walk(c){if(!Array.isArray(c))return;if(typeof c[0]==='number'){minX=Math.min(minX,c[0]);minY=Math.min(minY,c[1]);maxX=Math.max(maxX,c[0]);maxY=Math.max(maxY,c[1]);}else c.forEach(walk);}if(geometry?.type==='GeometryCollection')geometry.geometries.forEach(g=>{const b=bbox(g);minX=Math.min(minX,b[0]);minY=Math.min(minY,b[1]);maxX=Math.max(maxX,b[2]);maxY=Math.max(maxY,b[3]);});else walk(geometry?.coordinates);return [minX,minY,maxX,maxY];}
  function distanceToRoute(row,reference){const key=$('infraRoute').value+'|'+row.id;if(distanceCache.has(key))return distanceCache.get(key);const a=bbox(reference),b=bbox(row.geometry),margin=805/90000;if(a[0]-margin>b[2]||a[2]+margin<b[0]||a[1]-margin>b[3]||a[3]+margin<b[1])return Infinity;const value=C.geometryDistance(row.geometry,reference);distanceCache.set(key,value);return value;}
  function mergeInfrastructure(rows){const byId=new Map();for(const row of rows){const key=row.source.group+':'+row.sourceId;const old=byId.get(key);if(!old){row.id=key;byId.set(key,row);}else if(row.geometry){const parts=old.geometry?.type==='GeometryCollection'?old.geometry.geometries:[old.geometry];old.geometry={type:'GeometryCollection',geometries:[...parts.filter(Boolean),row.geometry]};}}return [...byId.values()];}
  async function querySocrata(url,maximum=6000){
    const records=[];let offset=0;
    while(records.length<maximum){
      const limit=Math.min(1000,maximum-records.length),u=new URL(url);
      u.search=new URLSearchParams({'$limit':String(limit),'$offset':String(offset),'$order':':id'});
      const rows=await fetchJson(u.href);if(!Array.isArray(rows))throw new Error('Source did not return a public project inventory');
      records.push(...rows);offset+=rows.length;if(rows.length<limit)return {records,truncated:false};
    }
    return {records,truncated:true};
  }
  async function readInfrastructureSource(source){
    if(source.kind!=='fulton'){
      const [result,meta]=await Promise.all([queryFeatures(source.url,source.where?{where:source.where}:{},6000),sourceMetadata(source)]);
      const features=source.kind==='arc'?result.features.filter(f=>C.arcJurisdictions(f.properties||{}).length):result.features;
      return {...result,features,sourceUpdated:meta.editingInfo?.lastEditDate,notes:source.kind==='arc'?['Client-side jurisdiction validation applied. ARC year/status fields are not converted to construction dates.']:[]};
    }
    const [records,locations,metadata,locationMetadata]=await Promise.allSettled([
      querySocrata(source.url),querySocrata(source.locationsUrl),fetchJson(source.metadataUrl),fetchJson(source.locationMetadataUrl)
    ]);
    if(records.status==='rejected')throw records.reason;
    const locationRows=locations.status==='fulfilled'?locations.value.records:[];
    const features=C.joinFulton(records.value.records,locationRows);
    const geometryDate=locationMetadata.status==='fulfilled'?locationMetadata.value.rowsUpdatedAt*1000:null;
    if(geometryDate)for(const feature of features)if(!feature.properties._location_updated_at)feature.properties._location_updated_at=new Date(geometryDate).toISOString();
    const notes=[];
    if(locations.status==='rejected')notes.push('Location feed unavailable: '+locations.reason.message+'. Records remain in the unmapped inventory.');
    notes.push(features.filter(f=>!f.geometry).length+' records excluded from proximity totals (unmapped / area-wide).');
    return {features,truncated:records.value.truncated||(locations.status==='fulfilled'&&locations.value.truncated),sourceUpdated:metadata.status==='fulfilled'?metadata.value.rowsUpdatedAt*1000:null,geometryUpdated:geometryDate,notes};
  }
  function refreshInventoryChoices(){
    for(const [id,values,label]of [['infraMunicipality',[...new Set(infrastructureRows.flatMap(rowMunicipalities))].sort(),'All / not published'],['infraProgram',infrastructureSources.map(s=>s.id),'All connected sources']]){
      const select=$(id),previous=select.value;select.replaceChildren(new Option(label,''));
      for(const value of values)select.add(new Option(id==='infraProgram'?infrastructureSources.find(s=>s.id===value).name:value,value));
      if([...select.options].some(o=>o.value===previous))select.value=previous;
    }
  }
  async function loadInfrastructure(force=false){
    if(infrastructureLoad)return infrastructureLoad;if(loadedAt&&!force){screenInfrastructure();return;}
    if(force)for(const source of infrastructureSources)metadataCache.delete(source.url);
    layerHelp.textContent='Loading official infrastructure sources…';$('infraMessage').textContent='Loading official infrastructure sources…';
    $('infraRefresh').disabled=true;
    infrastructureLoad=(async()=>{
      const results=await Promise.allSettled(infrastructureSources.map(readInfrastructureSource));
      sourceResults=results.map((r,i)=>({source:infrastructureSources[i],ok:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.features.length:0,truncated:r.status==='fulfilled'&&r.value.truncated,error:r.status==='rejected'?r.reason.message:'',sourceUpdated:r.status==='fulfilled'?r.value.sourceUpdated:null,geometryUpdated:r.status==='fulfilled'?r.value.geometryUpdated:null,notes:r.status==='fulfilled'?r.value.notes:[]}));
      const rows=[];
      results.forEach((r,i)=>{if(r.status!=='fulfilled')return;const source=infrastructureSources[i];for(const feature of r.value.features){const row=C.infrastructure(feature,source);if(!row.geometry&&source.kind!=='fulton')continue;if(source.kind==='splost'&&!/resurfac|transportation|beautification|patch|greenway|trail|sidewalk|bikeway|bridge|drainage|intersection|pedestrian|safety|streetscape|utilities/i.test(row.kind))continue;rows.push(row);}});
      reconciliation=C.reconcileInfrastructure(mergeInfrastructure(rows));infrastructureRows=reconciliation.rows;for(const result of sourceResults)result.excludedRapidTransitCount=reconciliation.excludedRapidTransitRows.filter(r=>r.source.id===result.source.id).length;distanceCache.clear();loadedAt=new Date();refreshInventoryChoices();renderCoverage();screenInfrastructure();if(typeof window.dispatchEvent==='function'&&typeof window.CustomEvent==='function')window.dispatchEvent(new window.CustomEvent('trackside:infrastructure-loaded'));
    })().catch(e=>{$('infraMessage').textContent='Infrastructure could not load: '+e.message;layerHelp.textContent='Sources unavailable · use Browse & coordinate to retry';}).finally(()=>{infrastructureLoad=null;$('infraRefresh').disabled=false;});
    return infrastructureLoad;
  }
  function renderCoverage(){
    const root=$('infraCoverage');root.replaceChildren();
    for(const r of sourceResults){
      const item=node('div','land-source');item.append(link(r.source.name+' ↗',r.source.viewer),note(r.ok?String(r.count.toLocaleString())+' source records retrieved'+(r.truncated?' · capped; coverage incomplete':''):'Unavailable: '+r.error));
      if(r.source.coverage)item.append(note(r.source.coverage));
      if(r.excludedRapidTransitCount)item.append(note(r.excludedRapidTransitCount+' imported ART/BRT/LRT alignment records excluded. These routes are shown only from Trackside route shapefiles.'));
      if(r.sourceUpdated)item.append(note('Dataset updated '+C.dateLabel(r.sourceUpdated)+'. This does not verify every project.'));
      if(r.geometryUpdated)item.append(note('Location dataset updated '+C.dateLabel(r.geometryUpdated)+'. Project details and locations can have different vintages.'));
      if(r.source.kind==='fulton')item.append(link('Fulton County location data · CC BY 4.0 ↗','https://creativecommons.org/licenses/by/4.0/'),note('Official IDs are normalized to join project details with published locations; area-wide and unmatched records are kept off the map.'));
      if(r.source.kind==='arc')item.append(note(reconciliation.matchedArcCount+' ARC records linked to existing projects by unambiguous official IDs; '+reconciliation.possibleArcCount+' potential duplicates held for comparison; '+reconciliation.newArcCount+' additional ARC records (all statuses).'));
      for(const message of r.notes||[])item.append(note(message));
      root.append(item);
    }
    root.append(note('Connected programs are not a complete inventory of every jurisdiction. Fulton and Clayton utility capital-project feeds are not connected. Plans and phases may have changed; confirm with the publishing agency.'),note('Retrieved '+loadedAt.toLocaleString()+'. Retrieval time is not a source verification date.'));
  }
  function recordUrl(row){
    if(row.source.kind==='fulton'){const url=new URL(row.source.url);const where=C.text(row.raw.project_id)?"project_id='"+C.text(row.raw.project_id).replaceAll("'","''")+"'":/^\d+$/.test(String(row.raw.id))?'id='+row.raw.id:'1=0';url.search=new URLSearchParams({'$where':where});return url.href;}
    return row.source.url+'/query?'+new URLSearchParams({f:'pjson',objectIds:String(C.pick(row.raw,['OBJECTID','ObjectId'])),outFields:'*',returnGeometry:'false'});
  }
  function warnings(row){
    const messages=[];
    if(row.locationNote)messages.push(row.locationNote);
    if(row.source.kind==='arc')messages.push(row.longRange?'Long-range planning context, not a committed construction schedule.':'ARC programming status is not construction status; construction dates are not supplied by this map.');
    if(row.possibleMatches?.length)messages.push('Possible duplicate — excluded from totals unless you explicitly include possible duplicates.');
    if(row.arcReferences?.length&&row.arcReferences.some(a=>a.complete!==row.complete))messages.push('Local and ARC statuses differ. The local source status is retained; review both source records.');
    const geometryDate=C.dateRange(row.geometryUpdated);
    if(row.geometry&&geometryDate&&geometryDate.last<Date.now()-365*86400000)messages.push('Published location data is over one year old; verify the alignment with the agency.');
    const finish=C.dateRange(row.finish);
    if(!row.complete&&finish&&finish.last<Date.now())messages.push('Published finish is in the past; confirm the current phase and dates with the agency.');
    const update=C.dateRange(row.updated);
    if(update&&update.last<Date.now()-365*86400000)messages.push('Project record was last updated over one year ago.');
    return messages;
  }
  const labels={overlap:'Possible schedule overlap',outside:'Outside your dates',unknown:'Schedule unknown',invalid:'Source dates need review','reference-needed':'Add comparison dates','invalid-reference':'Check your date range'};
  function rowMunicipalities(row){return [...new Set([row,...(row.arcReferences||[])].flatMap(r=>C.text(r.municipality).split(/[,;/|]+/).map(v=>C.text(v)).filter(Boolean)))];}
  function rowSourceIds(row){return [row,...(row.arcReferences||[])].map(r=>r.source.id);}
  function rowJurisdictions(row){return row.jurisdictions||[row.jurisdiction];}
  function screenInfrastructure(){
    const reference=referenceGeometry(),threshold=Number($('infraDistance').value),jurisdiction=$('infraJurisdiction').value,cat=$('infraCategory').value;
    const start=$('infraStart').value,finish=$('infraFinish').value,municipality=$('infraMunicipality').value,program=$('infraProgram').value;
    $('infraDistance').disabled=!reference;$('infraOverlapOnly').disabled=!start||!finish;
    const base=infrastructureRows.filter(r=>($('infraIncludeComplete').checked||!r.complete)&&($('infraIncludeLongRange').checked||!r.longRange)&&(!jurisdiction||rowJurisdictions(r).includes(jurisdiction))&&(!cat||r.category===cat)&&(!municipality||rowMunicipalities(r).includes(municipality))&&(!program||rowSourceIds(r).includes(program)));
    lastUnlocated=base.filter(r=>!r.geometry).map(r=>({...r,distance:null,screen:'not-located'}));
    const visible=base.filter(r=>r.geometry).map(r=>{let screen=C.schedule(r.start,r.finish,start,finish);if(screen==='reference-needed'&&(!C.dateRange(r.start)||!C.dateRange(r.finish)))screen='unknown';return {...r,distance:reference?distanceToRoute(r,reference):null,screen};}).filter(r=>!reference||r.distance<=threshold);
    const dateMatches=r=>!$('infraOverlapOnly').checked||!start||!finish||r.screen!=='outside';
    lastPotential=visible.filter(r=>r.possibleMatches?.length&&dateMatches(r));
    const counted=visible.filter(r=>!r.possibleMatches?.length||$('infraIncludePossible').checked);
    lastScreened=counted.filter(dateMatches);
    lastScreened.sort((a,b)=>(a.distance??0)-(b.distance??0)||a.name.localeCompare(b.name));
    const unknown=counted.filter(r=>!C.dateRange(r.start)||!C.dateRange(r.finish)).length,overlap=counted.filter(r=>r.screen==='overlap').length;
    $('infraStats').replaceChildren();for(const [n,label] of [[counted.length,reference?'near alignment':'mapped projects'],[overlap,'possible overlaps'],[unknown,'unknown schedules']]){const s=node('div');s.append(node('strong','',String(n)),node('span','',label));$('infraStats').append(s);}
    const failed=sourceResults.filter(r=>!r.ok).length;let message=loadedAt?String(lastScreened.length)+' mapped shown · '+lastUnlocated.length+' unmapped / area-wide · '+lastPotential.length+' possible duplicates'+(failed?' · '+failed+' source(s) unavailable':'')+' · retrieved '+loadedAt.toLocaleTimeString():'Enable the layer to load public sources.';
    if((start&&!finish)||(!start&&finish))message+=' · Set both comparison dates.';
    if(start&&finish&&C.schedule(null,null,start,finish)==='invalid-reference')message='Finish must be on or after start. No overlap results are available.';
    $('infraMessage').textContent=message;$('infraExport').disabled=!loadedAt||!lastScreened.length;
    layerHelp.textContent=loadedAt?String(lastScreened.length)+' mapped projects shown'+(failed?' · '+failed+' source(s) unavailable':''):'Four-jurisdiction infrastructure';
    renderInfrastructureMap();const list=$('infrastructureList');list.replaceChildren();
    for(const row of lastScreened.slice(0,120)){
      const card=node('article','land-project'),head=button(row.name,()=>focusInfrastructure(row),'land-project-name'),badge=node('span','land-badge '+row.screen,labels[row.screen]);
      card.append(head,note([row.jurisdiction,row.municipality,row.kind||row.category,row.sourceStatus||'Phase not published'].filter(Boolean).join(' · ')),badge,note(row.scheduleType+': '+C.dateLabel(row.start)+' → '+C.dateLabel(row.finish)));
      if(row.geometryBasis.startsWith('Representative'))card.append(node('span','land-badge','Representative point · not an alignment'));
      if(row.source.kind==='arc')card.append(node('span','land-badge',row.longRange?'ARC · Long Range':row.complete?'ARC · Completed':'ARC · Programmed'));
      if(row.arcReferences?.length)card.append(node('span','land-badge','ARC-linked · counted once'));
      if(reference)card.append(note(Math.round(row.distance/0.3048).toLocaleString()+' ft from alignment'+(row.geometryBasis.startsWith('Representative')?' to source point':'')));
      const stale=warnings(row).filter(v=>!v.startsWith('Representative'));if(stale.length)card.append(note(stale.join(' ')));
      list.append(card);
    }
    if(lastScreened.length>120)list.append(note('Showing the first 120 cards. All matching mapped projects appear on the map and in the CSV. Narrow by route or type.'));
    if(loadedAt&&!lastScreened.length)list.append(note('No mapped projects match within the connected sources. Unmapped records and other agency work may still be relevant.'));
    $('infraUnlocatedSummary').textContent='Unmapped / area-wide records ('+lastUnlocated.length+')';
    $('infraExportUnlocated').disabled=!lastUnlocated.length;
    const unlocated=$('infraUnlocatedList');unlocated.replaceChildren();
    for(const row of lastUnlocated.slice(0,80)){
      const card=node('article','land-project');card.append(button(row.name,()=>focusInfrastructure(row),'land-project-name'),note([row.jurisdiction,row.municipality,row.sourceStatus].filter(Boolean).join(' · ')),note(row.locationNote||'Published location unavailable'),node('span','land-badge','Not spatially screened'));unlocated.append(card);
    }
    if(lastUnlocated.length>80)unlocated.append(note('First 80 unmapped records shown. Export includes all '+lastUnlocated.length+' matching records.'));
    $('infraDuplicatesSummary').textContent='Possible duplicate ARC projects ('+lastPotential.length+')';$('infraExportDuplicates').disabled=!lastPotential.length;
    const duplicates=$('infraDuplicatesList');duplicates.replaceChildren();
    for(const row of lastPotential.slice(0,80)){const card=node('article','land-project');card.append(button(row.name,()=>focusInfrastructure(row),'land-project-name'),note(row.sourceStatus+' · '+row.jurisdiction),note('May match: '+row.possibleMatches.map(r=>r.name).join('; ')),node('span','land-badge',$('infraIncludePossible').checked?'Included by your selection — counts may overlap':'Excluded from map totals'));duplicates.append(card);}
    if(lastPotential.length>80)duplicates.append(note('First 80 candidates shown; export includes all matching candidates.'));
  }
  function renderInfrastructureMap(){
    infraLayer.clearLayers();if(!layerInput.checked)return;
    for(const row of lastScreened){
      const color=colors[row.category]||colors.Other,planning=row.source.kind==='arc'||row.geometryBasis.startsWith('ARC');
      const layer=L.geoJSON({type:'Feature',geometry:row.geometry,properties:{}},{style:{color,weight:planning?3:4,dashArray:row.longRange?'2 7':row.phase==='Construction'?null:'7 5',opacity:planning?.7:.85,fillOpacity:planning?.06:.12},pointToLayer:(_,p)=>L.circleMarker(p,{radius:6,color:'#fff',weight:2,fillColor:color,fillOpacity:.95})});
      layer.bindTooltip(node('span','',row.name+(row.source.kind==='arc'?' · ARC '+row.sourceStatus:'')));
      layer.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);focusInfrastructure(row);});layer.addTo(infraLayer);
    }
  }
  function appendArcDetails(detail,row){
    const records=[...(row.source.kind==='arc'?[row]:[]),...(row.arcReferences||[])];
    for(const arc of records){
      const block=node('section','land-arc-reference');block.append(node('h3','','ARC planning information'),facts([['ARC ID',arc.raw.ARCID],['GDOT PI',arc.raw.GDOTPI],['ARC status',arc.sourceStatus],['Sponsor',arc.agency],['County coverage',arc.raw.COUNTY],['Project limits',arc.limits],['ARC record updated',C.dateLabel(arc.updated)]]),note('Programmed and Long Range are planning/programming labels, not verified construction phases. No construction start or finish is inferred from them.'),link('ARC source record ↗',recordUrl(arc)));
      if(arc.projectUrl)block.append(link('ARC-published fact sheet ↗',arc.projectUrl));
      if(row.source.kind!=='arc')block.append(note('Linked by an unambiguous official project identifier. Local phase, schedule and geometry are retained when available; counted as one project.'),rawDetails(arc.raw));
      detail.append(block);
    }
    if(row.possibleMatches?.length){
      const block=node('section','land-arc-reference');block.append(node('h3','','Compare possible matches'),note('These have not been merged. A shared corridor or similar name can describe different phases or scopes.'));
      for(const match of row.possibleMatches){const target=infrastructureRows.find(r=>r.id===match.id);if(target)block.append(button(target.name,()=>focusInfrastructure(target)),note(match.reason));}
      detail.append(block);
    }
  }
  function focusInfrastructure(row){
    openProfile(infraPanel);infraHighlight.clearLayers();
    if(row.geometry){
      const layer=L.geoJSON({type:'Feature',geometry:row.geometry,properties:{}},{style:{color:'#172e26',weight:7,opacity:.65,interactive:false},pointToLayer:(_,p)=>L.circleMarker(p,{radius:10,color:'#172e26',interactive:false})}).addTo(infraHighlight);
      const bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[45,45],maxZoom:16});
    }
    let detail=$('infraSelectedProject');if(!detail){detail=node('section','land-selected');detail.id='infraSelectedProject';$('infrastructureList').before(detail);}
    const cost=C.numeric(row.cost);
    detail.replaceChildren(node('h3','',row.name),note(row.agency),facts([['Source project / inventory ID',row.sourceId],['Municipality',row.municipality],['Published phase',row.sourceStatus||'Not published'],['Published status',row.raw.Status&&row.raw.Status!==row.sourceStatus?row.raw.Status:null],['Type',row.kind],['Program / funding',row.program],['Geometry basis',row.geometry?row.geometryBasis:'Unmapped / not spatially screened'],['Schedule basis',row.scheduleType],['Start',C.dateLabel(row.start)],['Finish',C.dateLabel(row.finish)],['Anticipated duration',row.duration],['Published activity',row.activity],['Location / limits',row.limits||row.municipality],['Contractor',row.contractor],['Published cost / budget',cost===null?C.text(row.cost):money(cost)],['Project record updated',C.dateLabel(row.updated)],['Location record / dataset updated',row.geometryUpdated?C.dateLabel(row.geometryUpdated):'']]));
    if(row.description)detail.append(note(row.description));
    appendArcDetails(detail,row);
    if(window.TracksideHere&&row.geometry)detail.append(button('What’s happening here?',()=>window.TracksideHere.openInfrastructure(row)));
    for(const message of warnings(row))detail.append(node('p','land-banner',message));
    detail.append(link('Official project map / inventory ↗',row.source.viewer),link('Published source record ↗',recordUrl(row)));
    if(row.projectUrl&&row.source.kind!=='arc')detail.append(link('Agency project website ↗',row.projectUrl));
    detail.append(rawDetails(row.raw),button('Close project detail',()=>{detail.remove();infraHighlight.clearLayers();}));detail.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function exportInfrastructure(mode='mapped'){
    const unmapped=mode==='unmapped',duplicates=mode==='duplicates';
    const fields=['Project','Jurisdiction','Municipality','Agency','Project / inventory ID','Type','Program','Published phase','ARC IDs','GDOT PIs','ARC statuses','ARC fact sheets','Linked source records','Possible duplicate','Possible matches','Schedule basis','Start as published','Finish as published','Comparison route','Screening distance feet','Comparison start','Comparison finish','Result','Distance feet','Geometry basis','Location note','Project updated','Geometry updated','Published activity','Source record URL','Source URL','Retrieved at'];
    const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const rows=(unmapped?lastUnlocated:duplicates?lastPotential:lastScreened).map(r=>{
      const arcs=[...(r.source.kind==='arc'?[r]:[]),...(r.arcReferences||[])],ids=r.identifiers||C.officialIdentifiers(r);
      const arcIds=[...new Set([...ids.arcIds,...arcs.flatMap(a=>a.identifiers?.arcIds||[])])],pis=[...new Set([...ids.gdotPis,...arcs.flatMap(a=>a.identifiers?.gdotPis||[])])];
      const result=unmapped?'Not spatially screened; route and overlap filters not applied':duplicates?'Possible duplicate; not an automatic merge':labels[r.screen];
      return [r.name,rowJurisdictions(r).join(' / '),r.municipality,r.agency,r.sourceId,r.kind,r.program,r.sourceStatus,arcIds.join('; '),pis.join('; '),arcs.map(a=>a.sourceStatus).join('; '),arcs.map(a=>a.projectUrl).filter(Boolean).join('; '),arcs.map(recordUrl).join('; '),r.possibleMatches?.length?'Yes — may overlap with existing totals':'',r.possibleMatches?.map(m=>m.name+' ['+m.id+']').join('; '),r.scheduleType,C.dateLabel(r.start),C.dateLabel(r.finish),$('infraRoute').value||'All loaded projects',$('infraRoute').value?Math.round(Number($('infraDistance').value)/0.3048):'',$('infraStart').value,$('infraFinish').value,result,r.distance===null?'':Math.round(r.distance/0.3048),r.geometry?r.geometryBasis:'Unmapped',r.locationNote,C.dateLabel(r.updated),r.geometryUpdated?C.dateLabel(r.geometryUpdated):'',r.activity,recordUrl(r),r.source.url,loadedAt?.toISOString()];
    });
    const csv=[fields,...rows].map(row=>row.map(v=>quote(/^[=+@\-\t\r]/.test(String(v??''))?'\''+v:v)).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='trackside-infrastructure-'+(unmapped?'unmapped':duplicates?'duplicate-candidates':'comparison')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  ['infraRoute','infraDistance','infraJurisdiction','infraCategory','infraMunicipality','infraProgram','infraStart','infraFinish','infraIncludeComplete','infraIncludeLongRange','infraIncludePossible','infraOverlapOnly'].forEach(id=>$(id).addEventListener('change',()=>{$('infraSelectedProject')?.remove();infraHighlight.clearLayers();screenInfrastructure();if(id==='infraRoute'){const geometry=referenceGeometry();if(geometry){const bounds=L.geoJSON(geometry).getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:15});}}}));
  $('infraRefresh').addEventListener('click',()=>{$('infraSelectedProject')?.remove();infraHighlight.clearLayers();loadInfrastructure(true);});
  $('infraExport').addEventListener('click',()=>exportInfrastructure('mapped'));
  $('infraExportUnlocated').addEventListener('click',()=>exportInfrastructure('unmapped'));
  $('infraExportDuplicates').addEventListener('click',()=>exportInfrastructure('duplicates'));
  // Public diagnostics support end-to-end verification without changing source records.
  window.TracksideLand={version:'20261024-here',openContextProfile(panel){profileGeneration++;parcelHighlight.clearLayers();infraHighlight.clearLayers();openProfile(panel);},focusInfrastructure,get loadedAt(){return loadedAt;},showInfrastructure,showParcel,parcelConfig,atlantaParcels,infrastructureSources,queryFeatures,readInfrastructureSource,loadInfrastructure,get infrastructureRows(){return infrastructureRows;},get sourceResults(){return sourceResults;},get screenedRows(){return lastScreened;},get unlocatedRows(){return lastUnlocated;},get possibleRows(){return lastPotential;},get excludedRapidTransitRows(){return reconciliation.excludedRapidTransitRows||[];},get reconciliation(){return {matchedArcCount:reconciliation.matchedArcCount,possibleArcCount:reconciliation.possibleArcCount,newArcCount:reconciliation.newArcCount};}};
  if(parcelsEnabled)loadParcels();
})();
