/* A read-only, location-centered overview of the connected Trackside datasets. */
(function(){
  'use strict';
  const C=window.TracksideLandCore,H=window.TracksideHereCore,A=window.TracksideLand;
  if(!C||!H||!A||typeof map==='undefined')return;
  const $=id=>document.getElementById(id),aside=document.querySelector('aside.detail');
  const n=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const note=text=>n('p','land-note',text);
  function action(text,fn,cls='land-button'){const b=n('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
  function link(text,url){const a=n('a','land-link',text);a.href=C.http(url);a.target='_blank';a.rel='noopener noreferrer';return a;}
  const panel=n('section','land-profile here-profile');panel.id='hereProfile';panel.hidden=true;panel.tabIndex=-1;panel.setAttribute('aria-labelledby','hereTitle');aside.append(panel);
  panel.innerHTML='<div class="eyebrow">Location overview</div><h2 id="hereTitle">What’s happening here?</h2><p class="land-subtitle" id="hereLocation"></p><div class="here-controls"><label class="land-field">Look around this location<select id="hereRadius"><option value="160.9344">0.1 mile</option><option value="402.336">¼ mile</option><option value="804.672" selected>½ mile</option><option value="1609.344">1 mile</option></select></label><div class="land-actions"><button type="button" class="land-button" id="herePick">Choose another point</button><button type="button" class="land-button" id="hereRefresh">Refresh data</button></div><label class="land-check"><input type="checkbox" id="hereCompleted">Include completed infrastructure</label><label class="land-check"><input type="checkbox" id="hereLongRange">Include long-range infrastructure</label></div><p class="here-status" id="hereStatus" role="status" aria-live="polite"></p><p class="land-note">This overview uses all tracked development in the radius, independently of your active map filters. Distances are straight-line screening distances, not walking routes or confirmed construction conflicts.</p><div id="hereStats" class="here-stats"></div><div id="hereResults"></div><div class="land-actions" id="hereReturn"></div>';
  const toolbar=document.querySelector('.map-toolbar');
  const tool=action('What’s here?',()=>openAtCurrent(),'map-layers-button here-map-button');tool.id='hereButton';tool.setAttribute('aria-controls','hereProfile');tool.setAttribute('aria-label','Explore what is happening around a map location');toolbar.append(tool);
  L.DomEvent.disableClickPropagation(tool);
  const overlay=L.layerGroup().addTo(map),parcelCache=new Map();
  let active=null,generation=0,picking=false,lastResult=null,expanded=new Set();
  function current(token){return token===generation&&!panel.hidden&&panel.style.display!=='none';}
  function distance(value){return value<160.9344?Math.round(value/0.3048).toLocaleString()+' ft':(value/1609.344).toFixed(2)+' mi';}
  const count=value=>Number(value||0).toLocaleString('en-US');
  function dataProjects(){return (typeof projects==='undefined'?[]:projects).map(p=>({...p,residentialUnits:typeof residentialUnitsFor==='function'?residentialUnitsFor(p):p.residentialUnits,projectType:typeof projectType==='function'?projectType(p):p.projectType}));}
  function dataRoutes(){
    return [...(typeof railLines==='undefined'?[]:railLines).map(route=>({route,kind:'rail',mode:'Rail'})),...(typeof brtArtRoutes==='undefined'?[]:brtArtRoutes).map(route=>({route,kind:'rapid',mode:route.mode||(/\bART\b/i.test(route.name)?'ART':'BRT')}))].filter(r=>r.route.published!==false).map(r=>({...r,id:r.kind+':'+r.route.name,name:r.route.name,geometry:{type:'MultiLineString',coordinates:routePointParts(r.route).map(line=>line.map(p=>[p[1],p[0]]))}})).filter(r=>r.geometry.coordinates.length);
  }
  function dataStations(){return (typeof railStations==='undefined'?[]:railStations).map(raw=>({raw,name:raw[0],lat:raw[1],lng:raw[2],lines:raw[3]}));}
  function cancelPick(){if(!picking)return;picking=false;map.off('click',pickPoint);map.getContainer().classList.remove('here-picking');$('herePick').textContent='Choose another point';$('herePick').setAttribute('aria-pressed','false');}
  function dismiss(){cancelPick();panel.hidden=true;overlay.clearLayers();generation++;tool.setAttribute('aria-pressed','false');}
  function openAtCurrent(){
    const p=typeof projects!=='undefined'&&typeof selected!=='undefined'?projects.find(p=>p.id===selected):null;
    return open({center:p||map.getCenter(),label:p?.name||'Selected map center',projectId:p?.id});
  }
  async function open(options={}){
    const center=H.point(options.center);if(!center)return;
    cancelPick();generation++;repaint=null;active={...options,center};expanded=new Set();A.openContextProfile(panel);panel.hidden=false;panel.style.display='';tool.setAttribute('aria-pressed','true');panel.focus?.({preventScroll:true});
    if(typeof setPage==='function')setPage('explore');
    $('hereLocation').textContent=(options.label||'Selected location')+' · '+center.lat.toFixed(5)+', '+center.lng.toFixed(5);
    const ret=$('hereReturn');ret.replaceChildren();
    if(options.projectId)ret.append(action('Return to project',()=>show(options.projectId)));
    if(options.parcelContext)ret.append(action('Return to parcel',()=>A.showParcel(options.parcelContext.group,options.parcelContext.source,center)));
    return refresh();
  }
  function openInfrastructure(row){const center=L.geoJSON(row.geometry).getBounds().getCenter();return open({center,label:row.name});}
  function pickPoint(event){if(!picking)return;const center=event.latlng;cancelPick();open({center,label:'Selected map location'});}
  function startPick(){
    if(picking){cancelPick();$('hereStatus').textContent='Location selection canceled.';return;}
    if((typeof studyAreaMode!=='undefined'&&studyAreaMode)||(typeof scenarioMapMode!=='undefined'&&scenarioMapMode)||(typeof pickLocation!=='undefined'&&pickLocation)||(typeof parcelSelectionMode!=='undefined'&&parcelSelectionMode)){$('hereStatus').textContent='Finish or cancel the current map drawing or editing task first.';return;}
    picking=true;$('herePick').textContent='Cancel point selection';$('herePick').setAttribute('aria-pressed','true');$('hereStatus').textContent='Click or tap the map to choose a location. Press Escape to cancel.';
    map.getContainer().classList.add('here-picking');map.on('click',pickPoint);setDetailDrawerOpen(false);
  }
  async function parcelsAt(center,context,force){
    if(context)return {groups:C.groupParcels(context.group).map(group=>({group,source:context.source})),failures:[],truncated:false};
    const key=center.lat.toFixed(6)+','+center.lng.toFixed(6);if(force)parcelCache.delete(key);
    if(!parcelCache.has(key))parcelCache.set(key,(async()=>{
      const extra={geometry:center.lng+','+center.lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
      const results=await Promise.allSettled(A.parcelConfig.map(source=>A.queryFeatures(source.url,extra,100))),groups=[],failures=[];let truncated=false;
      results.forEach((r,i)=>{if(r.status==='rejected'){failures.push(A.parcelConfig[i].name);return;}truncated||=r.value.truncated;C.groupParcels(r.value.features.filter(f=>/Polygon/.test(f.geometry?.type))).forEach(group=>groups.push({group,source:A.parcelConfig[i]}));});
      if(!groups.length){try{const fallback=await A.queryFeatures(A.atlantaParcels.url,extra,100);truncated||=fallback.truncated;C.groupParcels(fallback.features.filter(f=>/Polygon/.test(f.geometry?.type))).forEach(group=>groups.push({group,source:A.atlantaParcels}));}catch{failures.push('Atlanta parcel fallback');}}
      return {groups,failures,truncated};
    })());
    return parcelCache.get(key);
  }
  function listSection(title,items,render,empty,key){
    const section=n('details','here-section');section.open=true;section.append(n('summary','',title+' ('+items.length+')'));
    const list=n('div','here-list'),limit=expanded.has(key)?items.length:8;list.append(...items.slice(0,limit).map(render));section.append(list);
    if(!items.length)list.append(note(empty));
    if(items.length>limit){const more=action('Show all '+items.length,()=>{expanded.add(key);list.replaceChildren(...items.map(render));more.remove();});section.append(more);}
    return section;
  }
  function projectCard({record:p,distance:d}){
    const card=n('article','here-card');card.append(action(p.name,()=>show(p.id),'land-project-name'),note([p.projectType,H.status(p.status),distance(d)+' away'].filter(Boolean).join(' · ')));
    const quantities=[['residentialUnits','residential units'],['hotelUnits','hotel rooms'],['retailSpaceSqFt','sq ft retail'],['commercialSpaceSqFt','sq ft commercial'],['medicalSpaceSqFt','sq ft medical']].filter(([key])=>H.quantity(p[key])>0).map(([key,label])=>count(p[key])+' '+label);
    if(quantities.length)card.append(note(quantities.join(' · ')));
    const verified=p.lastVerifiedAt||p.metadata?.last_verified_at,updated=p.updatedAt||p.metadata?.updated_at;
    card.append(note(verified?'Last verified '+C.dateLabel(verified):updated?'Project record updated '+C.dateLabel(updated):'Verification date not recorded'));
    if(C.http(p.sourceUrl))card.append(link('Project source ↗',p.sourceUrl));else card.append(note('Source not yet linked'));
    return card;
  }
  function infrastructureCard({record:r,distance:d}){
    const card=n('article','here-card');card.append(action(r.name,()=>A.focusInfrastructure(r),'land-project-name'),note([r.jurisdiction,r.category,distance(d)+' from published geometry'].join(' · ')),n('span','land-badge',r.source.kind==='arc'?'ARC · '+r.sourceStatus:r.sourceStatus||'Phase not published'));
    card.append(note(r.scheduleType+': '+C.dateLabel(r.start)+' → '+C.dateLabel(r.finish)),note(r.geometryBasis));
    if(!C.dateRange(r.start)||!C.dateRange(r.finish))card.append(n('span','land-badge unknown','Schedule incomplete / unknown'));
    if(r.source.kind==='arc')card.append(note('Planning area; ARC programming status does not establish that construction has started.'));
    if(r.arcReferences?.length)card.append(note('Local and ARC records linked; counted once.'));
    card.append(note(r.agency),link('Official source ↗',r.source.viewer));
    return card;
  }
  function routeCard({record:r,distance:d}){
    const card=n('article','here-card');card.append(action(r.name,()=>{if(typeof showCorridorHighlight==='function')showCorridorHighlight(r);showCorridorOverview(r);},'land-project-name'),note(r.mode+' · '+distance(d)+' from alignment'),note(r.kind==='rapid'?'Trackside route shapefile':'MARTA rail service geometry in Trackside'));return card;
  }
  function stationCard({record:r,distance:d}){
    const card=n('article','here-card');card.append(action(r.name+' Station',()=>showStationOverview(r.raw),'land-project-name'),note(r.lines+' · '+distance(d)+' straight-line distance'));return card;
  }
  function parcelCard(item){
    const row=C.parcel(item.group[0],item.source),card=n('article','here-card');
    card.append(action(row.address||row.id,()=>A.showParcel(item.group,item.source,active.center),'land-project-name'),note(item.source.name+' · '+item.group.length+' tax record'+(item.group.length===1?'':'s')+' on this footprint'),note('Parcel '+row.id+(row.landUse?' · '+row.landUse:'')));
    if(row.owner)card.append(note('Published owner: '+row.owner));
    if(row.zoning)card.append(note('Published zoning: '+row.zoning));
    card.append(link('Official property viewer ↗',item.source.viewer));return card;
  }
  function renderStats(result,infraUnavailable){
    const root=$('hereStats'),t=result.totals;root.replaceChildren();
    for(const [value,label]of [[result.projects.length,'development projects'],[t.residential,'recorded residential units'],[infraUnavailable?'—':result.infrastructure.length,'infrastructure projects'],[result.routes.length,'transit routes / services']]){
      const stat=n('div');stat.append(n('strong','',typeof value==='number'?count(value):value),n('span','',label));root.append(stat);
    }
  }
  function renderParcels(root,result,loading){
    if(loading){const section=n('section','here-section');section.append(n('h3','','Parcels at this point'),note('Checking connected county parcel sources…'));root.append(section);return;}
    const section=listSection('Parcel footprints at this point',result?.groups||[],parcelCard,'No tax parcel was returned at this point by the connected sources. This does not establish that the location has no parcel.','parcels');
    section.append(note('Parcels refer to the selected point, not every parcel in the surrounding radius. Tax values and existing property units are separate from proposed development quantities.'));
    if(result?.failures.length)section.append(n('p','land-banner','Parcel coverage incomplete. Unavailable: '+result.failures.join(', ')));
    if(result?.truncated)section.append(n('p','land-banner','Parcel records were capped. Open the official viewer for the complete set of tax records.'));
    root.append(section);
  }
  function renderResults(result,parcels,loading){
    const root=$('hereResults'),t=result.totals;root.replaceChildren();
    const quantities=n('section','here-section');quantities.append(n('h3','','Development in this radius'),note(Object.entries(t.statuses).filter(([,v])=>v).map(([k,v])=>count(v)+' '+k).join(' · ')||'No development projects found in the loaded records.'));
    const facts=n('dl','land-facts');for(const [label,value]of [['Hotel rooms',t.hotel],['Retail sq ft',t.retail],['Commercial sq ft',t.commercial],['Medical sq ft',t.medical]]){const pair=n('div');pair.append(n('dt','',label),n('dd','',count(value)));facts.append(pair);}quantities.append(facts);
    quantities.append(note(t.reportedResidential+' projects report a positive residential-unit count. Totals sum recorded quantities; missing values are not evidence of zero development.'),note(result.types.map(([type,total])=>type+' · '+total).join(' / ')));
    root.append(quantities,listSection('Development projects',result.projects,projectCard,'No tracked, located development projects were found within this radius.','projects'),listSection('Nearby infrastructure',result.infrastructure,infrastructureCard,loading.infrastructure?'Loading connected infrastructure sources…':'No mapped infrastructure matches were found within the connected sources and these overview settings.','infrastructure'),listSection('Nearby transit alignments',result.routes,routeCard,'No loaded transit alignment falls within this radius.','routes'),listSection('Rail stations',result.stations,stationCard,'No tracked rail station falls within this radius.','stations'));
    renderParcels(root,parcels,loading.parcels);
    const coverage=n('details','here-section');coverage.append(n('summary','','Sources, coverage & limitations'));
    for(const source of A.sourceResults){const row=n('div','here-source');row.append(link(source.source.name+' ↗',source.source.viewer),note(source.ok?'Connected · dataset update '+C.dateLabel(source.sourceUpdated):'Unavailable · '+source.error));coverage.append(row);}
    if(A.loadedAt)coverage.append(note('Infrastructure retrieved '+A.loadedAt.toLocaleString()+'. Retrieval is not project verification.'));
    if(result.unlocatedInfrastructure)coverage.append(note(result.unlocatedInfrastructure+' eligible infrastructure records have no usable location and are excluded from proximity counts. Area-wide work may still require coordination.'));
    if(result.unlocatedProjects)coverage.append(note(result.unlocatedProjects+' tracked development records have no usable coordinates and could not be screened.'));
    coverage.append(note('Possible infrastructure duplicates and imported ART/BRT/LRT alignments are excluded. Uploaded route shapefiles supply rapid-transit geometry. Long-range and completed infrastructure follow the overview settings above.'),note('These feeds do not cover every agency or program. Fulton and Clayton utility capital-project feeds are not connected. Proximity is not proof of a shared construction footprint, conflict, or walking access.'));
    root.append(coverage);
  }
  function draw(result,fit){
    overlay.clearLayers();
    const circle=L.circle([result.center.lat,result.center.lng],{radius:result.radiusMeters,color:'#136647',weight:2,fillColor:'#c9ee6e',fillOpacity:.09,interactive:false}).addTo(overlay);
    L.circleMarker([result.center.lat,result.center.lng],{radius:5,color:'#fffefa',weight:2,fillColor:'#136647',fillOpacity:1,interactive:false}).addTo(overlay);
    for(const item of result.infrastructure){const row=item.record;L.geoJSON(row.geometry,{style:{color:'#92754c',weight:3,dashArray:'5 5',fillOpacity:.04},pointToLayer:(_,p)=>L.circleMarker(p,{radius:5,color:'#92754c'})}).bindTooltip(n('span','',row.name)).on('click',()=>A.focusInfrastructure(row)).addTo(overlay);}
    for(const item of result.routes){const r=item.record;L.geoJSON(r.geometry,{style:{color:r.route.color||'#3853a4',weight:4,opacity:.7,dashArray:r.kind==='rapid'?(r.route.dashArray||'8 5'):null}}).bindTooltip(n('span','',r.name)).on('click',()=>{if(typeof showCorridorHighlight==='function')showCorridorHighlight(r);showCorridorOverview(r);}).addTo(overlay);}
    for(const item of result.projects){const p=item.record;L.circleMarker([Number(p.lat),Number(p.lng)],{radius:8,color:p.color||'#136647',weight:2,fillOpacity:.12}).bindTooltip(n('span','',p.name)).on('click',()=>show(p.id)).addTo(overlay);}
    if(fit)map.fitBounds(circle.getBounds(),{padding:[30,30],maxZoom:16});
  }
  let repaint=null;
  async function refresh(force=false){
    if(!active||panel.hidden)return;
    const token=++generation,center={...active.center},context=active.parcelContext,loading={infrastructure:true,parcels:true};
    let parcels=null,infraError='';$('hereRefresh').disabled=true;
    function paint(fit=false){
      if(!current(token))return;
      const result=H.analyze({center,radiusMeters:Number($('hereRadius').value),projects:dataProjects(),infrastructure:A.infrastructureRows,routes:dataRoutes(),stations:dataStations(),includeCompleted:$('hereCompleted').checked,includeLongRange:$('hereLongRange').checked});
      lastResult=result;
      const failed=A.sourceResults.filter(r=>!r.ok),unavailable=Boolean(infraError)||(A.sourceResults.length>0&&failed.length===A.sourceResults.length);
      renderStats(result,unavailable||(loading.infrastructure&&!A.sourceResults.length));renderResults(result,parcels,loading);draw(result,fit);
      if(loading.infrastructure||loading.parcels)$('hereStatus').textContent='Showing loaded development and transit. Checking '+[loading.infrastructure?'infrastructure':null,loading.parcels?'parcel sources':null].filter(Boolean).join(' and ')+'…';
      else $('hereStatus').textContent=(Number($('hereRadius').value)/1609.344).toLocaleString('en-US',{maximumFractionDigits:2})+'-mile overview · '+result.projects.length+' development projects'+(unavailable?' · Infrastructure unavailable':failed.length?' · '+failed.length+' infrastructure feed(s) unavailable; counts incomplete':' · Connected infrastructure loaded')+(parcels?.failures.length?' · Parcel coverage incomplete':'');
      if(infraError)$('hereStatus').textContent+=' · '+infraError;
    }
    repaint=()=>paint();paint(true);
    await Promise.allSettled([
      A.loadInfrastructure(force).catch(e=>{infraError=e.message;}).finally(()=>{loading.infrastructure=false;paint();}),
      parcelsAt(center,context,force).then(result=>{parcels=result;},()=>{parcels={groups:[],failures:['Connected parcel sources'],truncated:false};}).finally(()=>{loading.parcels=false;paint();})
    ]);
    if(current(token))$('hereRefresh').disabled=false;
  }
  map.getContainer().addEventListener('click',event=>{if(!picking||event.target.closest?.('button,a,input,select,textarea,.leaflet-control,.leaflet-popup'))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();pickPoint({latlng:map.mouseEventToLatLng(event)});},{capture:true});
  $('hereRadius').addEventListener('change',()=>refresh());
  $('hereCompleted').addEventListener('change',()=>refresh());
  $('hereLongRange').addEventListener('change',()=>refresh());
  $('hereRefresh').addEventListener('click',()=>refresh(true));
  $('herePick').addEventListener('click',startPick);
  $('closeDetailDrawer')?.addEventListener('click',dismiss);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&picking){cancelPick();setDetailDrawerOpen(true);$('hereStatus').textContent='Location selection canceled.';}});
  const projectButton=action('What’s happening here?',openAtCurrent,'detail-share');projectButton.id='hereProjectButton';document.querySelector('#detail .detail-actions').append(projectButton);
  if(typeof render==='function'){const previous=render;render=function(...args){const value=previous(...args);if(repaint)repaint();return value;};}
  window.TracksideHere={open,openAtCurrent,openInfrastructure,dismiss,refresh,get result(){return lastResult;},get picking(){return picking;}};
})();
