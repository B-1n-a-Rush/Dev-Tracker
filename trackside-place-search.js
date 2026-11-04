/* Map location finder. Project input, filters and published data retain their existing owners. */
(function(){
'use strict';
if(window.TracksidePlaceSearch||!window.TracksidePlaceSearchCore||typeof map==='undefined'||typeof L==='undefined')return;
const projectInput=document.getElementById('search'),original=projectInput?.closest('.search');if(!original)return;
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const sidebar=document.getElementById('projectSidebar'),mapArea=document.querySelector('.map-area');if(!sidebar||!mapArea)return;
original.classList.add('ts-project-search');sidebar.querySelector('.intro').after(original);
projectInput.placeholder='Search projects…';projectInput.setAttribute('aria-label','Search projects');
const root=make('div','ts-place-search'),row=make('div','ts-place-search-row'),field=make('label','search ts-map-search');root.id='tracksidePlaceSearch';root.setAttribute('role','search');root.setAttribute('aria-label','Find an address or place');mapArea.append(root);root.append(row);row.append(field);
const icon=original.querySelector('svg')?.cloneNode(true);if(icon){icon.setAttribute('aria-hidden','true');field.append(icon);}
const placeInput=make('input');placeInput.id='placeSearchQuery';placeInput.type='search';placeInput.placeholder='Address or place…';placeInput.setAttribute('aria-label','Search addresses and places');placeInput.setAttribute('aria-describedby','placeSearchHelp');placeInput.autocomplete='off';placeInput.spellcheck=false;placeInput.maxLength=160;placeInput.enterKeyHint='search';field.append(placeInput);
const submit=make('button','ts-place-submit','Find');submit.type='button';submit.id='placeSearchSubmit';row.append(submit);
L.DomEvent.disableClickPropagation(root);L.DomEvent.disableScrollPropagation(root);
const panel=make('section','ts-place-panel');panel.id='placeSearchPanel';panel.hidden=true;panel.setAttribute('aria-label','Address and place search');
const head=make('div','ts-place-head'),heading=make('strong','','Find a location'),close=make('button','ts-place-close','×');close.type='button';close.setAttribute('aria-label','Close address search results');head.append(heading,close);
const help=make('p','ts-place-help','Search county parcel site addresses in the MARTA service-area jurisdictions: Fulton, DeKalb and Clayton, including Atlanta. Enter a street number and name; place names use a supplemental search.');help.id='placeSearchHelp';
const status=make('p','ts-place-status','Enter an address or place, then press Find or Enter.');status.id='placeSearchStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
const list=make('ul','ts-place-results');list.id='placeSearchResults';list.setAttribute('aria-label','Matching places');
const foot=make('div','ts-place-foot'),credit=make('span'),osm=make('a','','OpenStreetMap'),photon=make('a','','Photon');osm.href='https://www.openstreetmap.org/copyright';photon.href='https://photon.komoot.io/';for(const a of[osm,photon]){a.target='_blank';a.rel='noopener noreferrer';}credit.append('Addresses: county parcel GIS · Place names: ',osm,' / ',photon);
const clear=make('button','ts-place-clear','Remove search pin');clear.type='button';clear.hidden=true;clear.id='placeSearchClear';foot.append(credit,clear);panel.append(head,help,status,list,foot);root.append(panel);
const parcelClient=window.TracksideParcelSearchCore.createClient(),placeClient=window.TracksidePlaceSearchCore.createClient({endpoint:window.TracksidePlaceSearchConfig?.endpoint||undefined});
let boundaryCache=null,boundaryPending=null;
async function serviceBoundaries({signal}={}){
 if(typeof countyBoundaryFeatures!=='undefined'&&countyBoundaryFeatures.length===3)return countyBoundaryFeatures;
 if(boundaryCache)return boundaryCache;
 // Boundary requests have their own timeout: canceling one search cannot poison
 // a later search that shares the same small boundary request.
 if(!boundaryPending)boundaryPending=(async()=>{const url='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/19/query?'+new URLSearchParams({where:"STATE='13' AND COUNTY IN ('063','089','121')",outFields:'NAME,COUNTY',returnGeometry:'true',outSR:'4326',f:'geojson'}),response=await fetch(url,{signal:AbortSignal.timeout(10000),credentials:'omit'});if(!response.ok)throw Error('Service-area boundary unavailable');const data=await response.json();if(data.error||data.features?.length!==3)throw Error('Service-area boundary unavailable');boundaryCache=data.features;return boundaryCache;})().finally(()=>{boundaryPending=null;});
 const result=await boundaryPending;if(signal?.aborted){const error=Error('Canceled');error.name='AbortError';throw error;}return result;
}
const client=window.TracksideParcelSearchCore.createSearch({parcels:parcelClient,places:placeClient,boundaries:serviceBoundaries});
let controller=null,generation=0,marker=null,parcelOutline=null,selectedPlace=null,lastRows=[],busy=false;
function openPanel(){panel.hidden=false;}
function closePanel(focus=false){if(focus)placeInput.focus({preventScroll:true});panel.hidden=true;}
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
function cancel(){generation++;controller?.abort();controller=null;busy=false;submit.disabled=false;list.removeAttribute('aria-busy');}
function clearPin(){if(parcelOutline){map.removeLayer(parcelOutline);parcelOutline=null;}if(marker){map.removeLayer(marker);marker=null;}selectedPlace=null;clear.hidden=true;message('Search pin removed. Enter another address or place.');}
async function selectPlace(place){
 cancel();const token=generation;controller=new AbortController();busy=true;submit.disabled=true;
 try{
 if(place.kind==='parcel'){openPanel();message('Loading the selected parcel footprint…');place=await client.resolve(place,{signal:controller.signal});if(token!==generation)return;if(window.TracksideDataStatus){const checked=window.TracksideDataStatus.begin('parcels:'+place.sourceId);window.TracksideDataStatus.success(checked,{count:1,partial:false});}}
 else if(!Number.isFinite(place.lat)||!Number.isFinite(place.lon))throw Error('This location is unavailable. Search again.');
 if(window.TracksideWorkspacePreview?.activate('explore')===false){message('Finish or discard your current edit before opening a location.',true);return;}
 const mapButton=document.querySelector('.view-switch [data-view="map"]');if(document.querySelector('.shell')?.classList.contains('list-mode'))mapButton?.click();
 if(marker)map.removeLayer(marker);if(parcelOutline){map.removeLayer(parcelOutline);parcelOutline=null;}
 const popup=make('div','ts-place-popup'),title=make('strong','',place.title);popup.append(title);if(place.detail)popup.append(make('p','',place.detail));popup.append(make('small','',place.kind==='parcel'?'County parcel footprint · marker is inside the parcel, not a surveyed entrance.':'Supplemental place result · approximate location'));
 if(window.TracksideHere?.open){const here=make('button','','What’s happening here?');here.type='button';here.addEventListener('click',()=>{marker?.closePopup();window.TracksideHere.open({center:L.latLng(place.lat,place.lon),label:place.title});});popup.append(here);}
 if(place.kind==='parcel'&&window.TracksideLand?.showParcel){const details=make('button','','View parcel overview');details.type='button';details.addEventListener('click',()=>{marker?.closePopup();window.TracksideLand.showParcel([place.feature],place.source,L.latLng(place.lat,place.lon));});popup.append(details);}
 if(place.source?.viewer){const source=make('a','','Official parcel viewer ↗');source.href=place.source.viewer;source.target='_blank';source.rel='noopener noreferrer';popup.append(source);}
 const remove=make('button','','Remove search pin');remove.type='button';remove.addEventListener('click',clearPin);popup.append(remove);
 marker=L.marker([place.lat,place.lon],{title:place.title,alt:'Search location: '+place.title,zIndexOffset:900,bubblingMouseEvents:false,icon:L.divIcon({className:'ts-place-marker',html:'<span aria-hidden="true"></span>',iconSize:[26,34],iconAnchor:[13,34],popupAnchor:[0,-32]})}).addTo(map).bindPopup(popup,{maxWidth:290});
 selectedPlace={...place};clear.hidden=false;closePanel();map.invalidateSize();if(place.feature){parcelOutline=L.geoJSON(place.feature,{style:{color:'#136647',weight:3,fillColor:'#82aa72',fillOpacity:.15},interactive:false}).addTo(map);map.fitBounds(parcelOutline.getBounds(),{padding:[45,45],maxZoom:18});}else map.setView([place.lat,place.lon],17);marker.openPopup();
 document.dispatchEvent(new CustomEvent('trackside:place-selected',{detail:{title:place.title,lat:place.lat,lon:place.lon,kind:place.kind,sourceId:place.sourceId}}));
 }catch(e){if(token===generation&&e.name!=='AbortError'){openPanel();message(e.message||'The selected location could not load. Search again.',true);}}finally{if(token===generation){busy=false;controller=null;submit.disabled=false;}}
}
function renderRows(rows){lastRows=rows;list.replaceChildren();rows.forEach(place=>{const li=make('li'),button=make('button','ts-place-result');button.type='button';button.append(make('strong','',place.title));if(place.detail)button.append(make('span','',place.detail));button.addEventListener('click',()=>selectPlace(place));li.append(button);list.append(li);});}
async function search(){
 if(busy)return;try{window.TracksidePlaceSearchCore.query(placeInput.value);}catch(e){openPanel();message(e.message,true);return;}cancel();const token=generation;controller=new AbortController();busy=true;submit.disabled=true;list.setAttribute('aria-busy','true');renderRows([]);openPanel();message(window.TracksideParcelSearchCore.parse(placeInput.value)?'Searching county parcel addresses…':'Finding places within the MARTA service-area jurisdictions…');
 try{const result=await client.search(placeInput.value,{signal:controller.signal});if(token!==generation)return;renderRows(result.rows);let text=result.rows.length?result.rows.length+' '+(result.supplemental?'supplemental place':'parcel address')+' result'+(result.rows.length===1?'':'s')+' found. Choose a result to locate it on the map.':result.scopeUnavailable?'Supplemental place results could not be checked against the service-area boundary. Try a numbered street address.':result.placeUnavailable?'Supplemental place search is unavailable. Try a numbered street address or retry shortly.':'No matching location found in the connected service-area sources. Try the street number and street name; parcel addresses can be missing or recorded differently.';if(result.failures.length)text+=' Parcel coverage incomplete: '+result.failures.join(', ')+' unavailable; retry to check those counties.';if(result.limited)text+=' Results limited; add more of the street name to narrow the search.';message(text,!!result.failures.length||result.scopeUnavailable||result.placeUnavailable);
 }catch(e){if(token===generation&&e.name!=='AbortError')message(e.message||'Address search is unavailable. Please try again.',true);
 }finally{if(token===generation){busy=false;controller=null;submit.disabled=false;list.removeAttribute('aria-busy');}}
}
submit.addEventListener('click',search);close.addEventListener('click',()=>closePanel(true));clear.addEventListener('click',clearPin);
placeInput.addEventListener('input',()=>{cancel();renderRows([]);message('Press Find or Enter to search. Project filters stay as set.');openPanel();});
placeInput.addEventListener('focus',openPanel);placeInput.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();search();}else if(e.key==='ArrowDown'){e.preventDefault();openPanel();list.querySelector('button')?.focus();}});
root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();cancel();closePanel(true);panel.hidden=true;}else if((e.key==='ArrowDown'||e.key==='ArrowUp')&&e.target.closest('.ts-place-result')){e.preventDefault();const buttons=[...list.querySelectorAll('button')],i=buttons.indexOf(e.target.closest('button')),next=i+(e.key==='ArrowDown'?1:-1);if(next<0)placeInput.focus();else buttons[Math.min(next,buttons.length-1)]?.focus();}});
document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))closePanel();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.contains(e.target))closePanel();});
window.TracksidePlaceSearch={clear:clearPin,get selection(){return selectedPlace?{...selectedPlace}:null;},get mode(){return 'places';}};
})();
