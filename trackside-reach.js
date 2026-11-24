/* Imported MARTA Reach zone boundaries and planning context. */
(function(){
  'use strict';
  const data=window.TRACKSIDE_REACH_DATA,C=window.TracksideReachCore,S=window.TracksideReachService;
  if(!data?.features?.length||!C||!S||!window.TracksideLand||typeof map==='undefined')return;
  const zones=new Map(data.features.map(zone=>[String(zone.id),zone]));
  const color='#51429a',transferColor='#a4510f';
  const name=zone=>zone.properties.name;
  const point=(lng,lat)=>({type:'Point',coordinates:[lng,lat]});
  const transfers=zone=>S.byZone[zone.id]||[];
  const miles=meters=>(meters/1609.344).toFixed(2)+' mi';
  const count=value=>value.toLocaleString('en-US');
  const label={inside:'Inside mapped zone',boundary:'Meets zone boundary',near:'Near zone · expansion review'};
  const pane=map.createPane('reachZones');
  pane.style.zIndex='415';
  const style={pane:'reachZones',color,weight:2,fillColor:color,fillOpacity:.09,bubblingMouseEvents:false};
  const layer=L.geoJSON(data,{pane:'reachZones',style,onEachFeature(zone,shape){
    shape.bindTooltip(zone.id+' · '+name(zone),{sticky:true});
    shape.on('mouseover',()=>shape.setStyle({weight:3,fillOpacity:.2}));
    shape.on('mouseout',()=>shape.setStyle(style));
    shape.on('click',()=>open(zone.id,{fit:false}));
  }});
  const zoneLayers=new Map(layer.getLayers().map(shape=>[String(shape.feature.id),shape]));
  const transferLayer=L.layerGroup();
  const expansionLayer=L.layerGroup();
  const toggle=document.getElementById('layerReach'),picker=document.getElementById('reachZonePicker');
  const panel=element('section','reach-detail');
  panel.id='reachDetail';
  panel.style.display='none';
  panel.setAttribute('aria-labelledby','reachDetailTitle');
  document.querySelector('aside.detail').append(panel);
  let active='',generation=0;
  const isOpen=()=>panel.style.display!=='none'&&shellElement.classList.contains('detail-open');

  function element(tag,cls,text){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function button(text,action,cls='reach-button'){
    const node=element('button',cls,text);
    node.type='button';
    node.addEventListener('click',action);
    return node;
  }
  function link(text,url){
    const node=element('a','',text);
    node.href=url;node.target='_blank';node.rel='noopener noreferrer';
    return node;
  }
  function section(title,...children){
    const node=element('section','station-section reach-section');
    node.append(element('h3','',title),...children);
    return node;
  }

  function showLayer(visible){
    toggle.checked=visible;
    if(visible){layer.addTo(map);transferLayer.addTo(map);expansionLayer.addTo(map);}
    else{layer.remove();transferLayer.remove();expansionLayer.remove();expansionLayer.clearLayers();}
    try{localStorage.setItem('trackside-reach-visible',visible?'1':'0');}catch{}
    updateMapLayersCount();
    window.TracksideMapLegend?.refresh?.();
  }
  function focusZone(zone,fit){
    for(const [id,shape] of zoneLayers)shape.setStyle(id===zone.id?{weight:3,fillOpacity:.16}:style);
    expansionLayer.clearLayers();
    transferLayer.clearLayers();
    for(const transfer of transfers(zone))for(const [id,lng,lat] of transfer.stops){
      const popup=element('div','reach-transfer-popup');
      popup.append(element('strong','',transfer.name),element('p','',transfer.service),
        element('small','','MARTA GTFS reference '+id+' · confirm pickup with MARTA Reach.'));
      L.circleMarker([lat,lng],{pane:'overlayPane',radius:6,weight:2,color:'#fff',fillColor:transferColor,fillOpacity:1})
        .bindPopup(popup).addTo(transferLayer);
    }
    if(fit){
      const scope=L.latLngBounds([]).extend(zoneLayers.get(zone.id).getBounds());
      for(const t of transfers(zone))for(const [,lng,lat] of t.stops)scope.extend([lat,lng]);
      map.fitBounds(scope,{padding:[35,35],maxZoom:15});
    }
  }
  function showExpansion(model){
    focusZone(model.zone,false);
    const area=L.latLngBounds([]).extend(zoneLayers.get(model.zone.id).getBounds());
    for(const {project,distance,location} of model.groups.near){
      const b=C.bounds(location.geometry);
      const coords=[(b[1]+b[3])/2,(b[0]+b[2])/2];
      const popup=element('div','reach-transfer-popup');
      popup.append(button(project.name,()=>{map.closePopup();show(project.id,true);},'reach-text-button'),
        element('p','','Expansion review · '+miles(distance)+' to zone edge'),
        element('small','',location.basis));
      L.circleMarker(coords,{radius:8,weight:3,color:transferColor,fillColor:'#fff',fillOpacity:.85})
        .bindPopup(popup).addTo(expansionLayer);
      area.extend(coords);
    }
    map.fitBounds(area,{padding:[35,35],maxZoom:15});
    window.TracksideMapLegend?.refresh?.();
  }

  function lookup(geometry){
    return [...zones.values()].map(zone=>{
      const result=C.classify(geometry,zone.geometry);
      return result?{zone,...result}:null;
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance||a.zone.id.localeCompare(b.zone.id));
  }
  function appendLookup(host,coords,geometry,options={}){
    const footprint=['Polygon','MultiPolygon'].includes(geometry?.type)&&C.bounds(geometry);
    const fallback=Array.isArray(coords)?point(...coords):null;
    const found=lookup(footprint?geometry:fallback);
    if(!found.length&&!options.always)return false;
    const list=element('div','reach-lookup');
    list.append(element('strong','','MARTA Reach'));
    if(!found.length)list.append(element('p','','Outside mapped zones and the ¼-mile review area.'));
    for(const {zone,relation,distance} of found){
      const row=element('div','reach-lookup-row');
      row.append(button(zone.id+' · '+name(zone),()=>open(zone.id),'reach-text-button'),
        element('small','',label[relation]+(relation==='near'?' · '+miles(distance)+' to edge':'')));
      list.append(row);
    }
    list.append(element('small','reach-note',options.basis||(footprint?'Selected parcel footprint':'Approximate search location')));
    host.append(list);
    return true;
  }
  function renderProject(host,project){
    host.replaceChildren();
    host.hidden=true;
    const location=project&&C.projectLocation(project);
    if(!location)return;
    const geometry=location.geometry;
    host.hidden=!appendLookup(host,geometry.type==='Point'?geometry.coordinates:null,geometry,{basis:location.basis});
  }

  function buildProfile(zone){
    const groups={inside:[],boundary:[],near:[]};
    for(const project of projects.filter(row=>row.isPublished!==false)){
      const location=C.projectLocation(project);
      if(!location)continue;
      const match=C.classify(location.geometry,zone.geometry);
      if(match)groups[match.relation].push({project,location,...match});
    }
    for(const items of Object.values(groups)){
      items.sort((a,b)=>(window.TracksideAreaCore.housing(b.project)||0)-(window.TracksideAreaCore.housing(a.project)||0)
        ||a.distance-b.distance||a.project.name.localeCompare(b.project.name));
    }
    const totals=window.TracksideAreaCore.summarize(groups.inside.map(i=>i.project),displayStatus);
    const affordability=totals.rows.filter(row=>row.kind!=='master-plan').map(row=>window.TracksideAreaCore.affordability(row.project)).filter(Boolean);
    const reported=affordability.filter(value=>value.units!==null);
    return {zone,groups,totals,reported,affordability,sr2t:null,sr2tError:false,coordination:null};
  }
  function pipelineText(model){
    const {totals,groups,reported,affordability}=model;
    return [
      count(groups.inside.length)+' projects inside · '+count(groups.boundary.length)+' at the boundary · '+count(groups.near.length)+' just outside',
      (totals.known?count(totals.units)+' reported residential units inside':'No residential unit counts reported inside')+
        (totals.unknown?' · '+count(totals.unknown)+' housing project(s) without counts':''),
      reported.length?count(reported.reduce((sum,value)=>sum+value.units,0))+' source-backed affordable units across '+count(reported.length)+' project(s)':
        affordability.length?'Some projects report affordability terms without counts.':'No source-backed affordable unit counts recorded.'
    ];
  }
  function projectList(model,relation,title){
    const items=model.groups[relation],list=element('details','reach-projects'),ul=element('ul','reach-list');
    list.open=relation==='near'&&items.length>0;
    list.append(element('summary','',title+' ('+count(items.length)+')'));
    for(const item of items){
      const {project,location,distance}=item;
      const li=element('li');
      li.append(button(project.name,()=>{
        window.TracksideWorkspacePreview?.activate('explore');
        setPage('explore');
        show(project.id,true);
      },'reach-text-button'),element('small','',[displayStatus(project),window.TracksideAreaCore.projectScale(project),
        relation==='near'?miles(distance)+' to edge':'',location.basis].filter(Boolean).join(' · ')));
      ul.append(li);
    }
    list.append(items.length?ul:element('p','reach-note','No tracked projects match.'));
    return list;
  }
  function connectionList(zone){
    const items=transfers(zone),list=element('ul','reach-list');
    for(const t of items){
      const row=element('li');
      row.append(element('strong','',t.name),element('small','',t.service));
      if(t.notice)row.append(link(t.notice,t.url));
      list.append(row);
    }
    return items.length?list:element('p','reach-note','MARTA’s Reach page lists no designated out-of-zone transfer for this zone.');
  }
  function sr2tText(model){
    if(model.sr2tError)return 'Published SR2T locations could not load.';
    if(model.sr2t===null)return 'Checking published SR2T sites…';
    return count(model.sr2t.length)+' published Safe Routes to Transit site(s) with a matched stop in or at this zone.';
  }
  function paintSR2T(host,model){
    host.replaceChildren(element('p','',sr2tText(model)));
    if(!model.sr2t?.length)return;
    const list=element('ul','reach-list');
    for(const site of model.sr2t){
      const row=element('li');
      row.append(button(site.profile.name,()=>window.TracksideSR2T.open(false,site.site_id),'reach-text-button'),
        element('small','',site.profile.status));
      list.append(row);
    }
    host.append(list);
  }
  async function screenTransfers(host,model){
    const token=generation,land=window.TracksideLand,bus=window.TracksideBusCore,core=window.TracksideLandCore;
    host.replaceChildren(element('p','','Loading public infrastructure sources…'));
    try{
      await land.loadInfrastructure();
      if(token!==generation||!isOpen())return;
      const sources=land.sourceResults;
      if(!sources.some(row=>row.ok))throw Error('Public infrastructure sources could not load.');
      const findings=[];
      for(const row of land.infrastructureRows){
        if(row.complete||row.longRange||row.possibleMatches?.length||core.isImportedRapidTransit(row))continue;
        const location=bus.location(row);
        if(!location.geometry)continue;
        const matched=transfers(model.zone).map(transfer=>{
          const distance=Math.min(...transfer.stops.map(([,lng,lat])=>core.geometryDistance(point(lng,lat),location.geometry)));
          return {transfer,distance};
        }).filter(result=>result.distance<=C.transferMeters);
        if(matched.length)findings.push({row,location,matched,windows:bus.phases(row).filter(w=>w.timing_scope==='construction')});
      }
      findings.sort((a,b)=>a.matched[0].distance-b.matched[0].distance||a.row.name.localeCompare(b.row.name));
      model.coordination={findings,partial:sources.some(row=>!row.ok||row.truncated)};
      const list=element('ul','reach-list');
      for(const finding of findings){
        const {row,matched,location,windows}=finding,item=element('li');
        item.append(button(row.name,()=>land.focusInfrastructure(row),'reach-text-button'),
          element('small','',[row.agency,row.jurisdiction,location.basis].filter(Boolean).join(' · ')),
          element('small','',matched.map(i=>i.transfer.name+' · '+Math.round(i.distance)+' m').join(' / ')));
        for(const w of windows.length?windows:[null])item.append(element('small','',w&&(w.start||w.finish)?
          [w.name,(w.start||'Start unknown')+' to '+(w.finish||'Finish unknown'),w.certainty].join(' · '):'Construction timing unknown'));
        list.append(item);
      }
      host.replaceChildren(element('p','',count(findings.length)+' potential coordination item(s) within 150 m of a GTFS transfer reference.'),
        element('p','reach-note',model.coordination.partial?'Some infrastructure feeds were unavailable or incomplete. Review work limits and service impacts.':'Review actual work limits and service impacts.'),
        list);
    }catch(error){
      if(token===generation&&isOpen())host.replaceChildren(element('p','',error.message),
        button('Retry infrastructure check',()=>screenTransfers(host,model)));
    }
  }
  function printBrief(model){
    const {zone,totals}=model;
    const nearby=Object.values(model.groups).reduce((sum,group)=>sum+group.length,0);
    const brief={
      kind:'Reach zone',name:zone.id+' · '+name(zone),filters:[],milestones:[],
      routes:transfers(zone).map(t=>({name:t.name,detail:t.service,source:S.source})),
      context:[
        {title:'Zone and expansion review',lines:[...pipelineText(model),
          'Inside-zone pipeline shown below. The ¼-mile outside band is for potential expansion review.',sr2tText(model),
          model.coordination?model.coordination.findings.length+' potential infrastructure item(s) near transfer references'+(model.coordination.partial?' · partial source coverage':'')+'.':
            'Transfer-area infrastructure screening was not run for this brief.',
          'Boundaries imported '+data.source.imported_on+' from '+data.source.filename+'. Effective date not supplied.']},
        ...(['boundary','near'].filter(key=>model.groups[key].length).map(key=>({
          title:key==='boundary'?'Projects meeting the boundary':'Projects just outside the zone',
          lines:model.groups[key].map(({project,distance,location})=>[project.name,displayStatus(project),
            window.TracksideAreaCore.projectScale(project),key==='near'?miles(distance)+' to edge':'',location.basis].filter(Boolean).join(' · '))
        })))
      ],
      note:'Project screening uses mapped footprints or linked parcels where available, with approximate pins for other projects. Confirm service and pickup through MARTA Reach.'
    };
    window.TracksideAreaViews.showBrief({brief,totals,nearby,scope:'Inside the imported MARTA Reach boundary.'},()=>{
      const rows=Object.entries(model.groups).flatMap(([key,items])=>items.map(({project,location})=>({
        color:key==='inside'?'#174a83':transferColor,
        row:{geometry:Number.isFinite(project.lng)&&Number.isFinite(project.lat)?point(project.lng,project.lat):location.geometry}
      })));
      return window.TracksideBriefingMap.create({
        route:{kind:'reach',geometry:zone.geometry,color},rows,tileUrl:cartoBasemapUrl,projectMap:true,width:920,height:288,
        frameGeometries:[zone.geometry,...rows.map(item=>item.row.geometry)]
      });
    });
  }
  function render(model){
    const {zone}=model;
    const title=element('h2','',zone.id+' · '+name(zone));title.id='reachDetailTitle';
    title.tabIndex=-1;
    const hero=element('div','detail-hero reach-detail-hero');
    hero.append(element('span','tag','MARTA REACH'));
    const main=element('div','detail-body'),actions=element('div','reach-actions');
    const include=element('input');include.type='checkbox';
    const band=element('label','reach-band');band.append(include,document.createTextNode(' Include projects up to ¼ mile outside'));
    actions.append(button('Show on map',()=>focusZone(zone,true)),
      button('Open printable brief',()=>printBrief(model)),
      button('Follow this Reach zone',()=>{
        window.TracksideDigest.open({type:'reach',key:zone.id,includeBoundary:include.checked,name:'Reach '+zone.id+' · '+name(zone)},{quick:true});
      }),band);
    const summary=section('Development in and around the zone',...pipelineText(model).map(line=>element('p','',line)),
      element('p','reach-note','The ¼-mile exterior band highlights projects for expansion review. Check MARTA’s zone profiles for service coverage.'),
      projectList(model,'inside','Inside the mapped zone'),projectList(model,'boundary','At the zone boundary'),projectList(model,'near','Within ¼ mile outside'));
    if(model.groups.near.length)summary.append(button('Show expansion candidates on map',()=>showExpansion(model)));
    const connections=section('Designated out-of-zone transfers',connectionList(zone));
    if(transfers(zone).length){
      const coord=element('div','reach-coordination');
      connections.append(element('p','reach-note','Map markers show fixed-route GTFS references. Confirm your pickup location with MARTA Reach.'),
        link('MARTA GTFS reference',S.gtfs),coord,
        button(model.coordination?'Check transfer-area infrastructure again':'Check transfer-area infrastructure',()=>screenTransfers(coord,model)));
    }
    const sites=element('div');
    paintSR2T(sites,model);
    const source=element('div','reach-source');
    source.append(link('Official service and zone profiles',S.source));
    main.append(element('div','eyebrow','MARTA Reach zone'),title,
      element('div','location','Curb-to-curb service · '+S.hours),
      source,actions,summary,connections,
      section('Safe Routes to Transit',sites),
      element('p','reach-note','Boundaries: '+data.source.filename+' · imported '+data.source.imported_on+' · effective date unavailable. Service and transfer sources checked '+S.checked+'.'));
    panel.replaceChildren(hero,main);
    const token=generation;
    Promise.resolve().then(()=>window.TracksideSR2T.publicLocations()).then(records=>{
      if(token!==generation)return;
      model.sr2t=records.filter(site=>site.positions.some(({lng,lat})=>{
        const hit=C.classify(point(lng,lat),zone.geometry);
        return hit&&hit.relation!=='near';
      }));
    },()=>{model.sr2tError=true;}).finally(()=>{if(token===generation&&isOpen())paintSR2T(sites,model);});
  }
  function open(id,{fit=true}={}){
    const zone=zones.get(String(id));
    if(!zone||window.TracksideWorkspacePreview?.activate('explore')===false)return;
    if(document.querySelector('.shell')?.classList.contains('list-mode')){
      document.querySelector('.view-switch [data-view="map"]')?.click();
    }
    active=zone.id;
    picker.value=zone.id;
    openButton.disabled=false;
    showLayer(true);
    generation++;
    render(buildProfile(zone));
    window.TracksideLand.openContextProfile(panel);
    window.TracksideProjectDetails?.refresh();
    map.closePopup();
    focusZone(zone,fit);
    panel.closest('aside').scrollTop=0;
    panel.querySelector('h2').focus({preventScroll:true});
  }

  toggle.addEventListener('change',()=>showLayer(toggle.checked));
  for(const zone of zones.values())picker.add(new Option(zone.id+' · '+name(zone),zone.id));
  const openButton=document.getElementById('openReachZone');
  openButton.addEventListener('click',()=>open(picker.value));
  picker.addEventListener('change',()=>{openButton.disabled=!picker.value;});
  try{if(localStorage.getItem('trackside-reach-visible')==='1')showLayer(true);}catch{}
  window.TracksideReach={
    list:()=>[...zones.values()],get:id=>zones.get(String(id)),get selected(){return active;},get enabled(){return toggle.checked;},
    open,appendLookup,renderProject,transfers,service:S,
    get legendState(){return {enabled:toggle.checked,transfers:transferLayer.getLayers().length>0,expansion:expansionLayer.getLayers().length>0};}
  };
  const linked=new URLSearchParams(location.search).get('reach');
  if(zones.has(linked))void Promise.resolve(window.tracksideAppReady).then(()=>open(linked));
  window.TracksideProjectDetails?.refresh();
})();
