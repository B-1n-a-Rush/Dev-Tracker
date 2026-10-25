/* Portable public view settings only. Never serialize forms, sessions or review notes. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./trackside-land-core.js'));else root.TracksideCoordinationViewsCore=factory(root.TracksideLandCore);})(typeof globalThis!=='undefined'?globalThis:this,function(L){
'use strict';
const storageKey='trackside-coordination-views-v1',limit=20;
const fields=['route','distance','jurisdiction','category','screen','completed','longRange','duplicates','study','start','finish','view','scale','fit','project'];
const booleans=['completed','longRange','duplicates','study'];
const param=field=>'coord'+field[0].toUpperCase()+field.slice(1);
function text(value,max=100){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error('A saved-view value is invalid.');return value.trim();}
function choice(value,values,fallback){const v=value===undefined?fallback:value;if(!values.includes(v))throw Error('A saved-view option is not supported.');return v;}
function normalize(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.v!==1)throw Error('This coordination view uses an unsupported format.');
 const route=text(input.route,140);if(!/^(?:rapid|rail):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route))throw Error('This view has an invalid route.');
 const distance=choice(String(input.distance??'76.2'),['30.48','76.2','152.4','402.336','804.672','1609.344'],'76.2');
 const out={v:1,route,distance,jurisdiction:choice(input.jurisdiction,['','Atlanta','Fulton','DeKalb','Clayton'],''),category:text(input.category??'',100),screen:choice(input.screen,['','overlap','unknown','outside'],''),view:choice(input.view,['timeline','list'],'timeline'),scale:choice(input.scale,['years','quarters','months'],'years'),fit:choice(input.fit,['route','all'],'route')};
 for(const key of booleans){if(input[key]!==undefined&&typeof input[key]!=='boolean')throw Error('A saved-view switch is invalid.');out[key]=input[key]===true;}
 out.start=out.study?text(input.start??'',10):'';out.finish=out.study?text(input.finish??'',10):'';
 for(const value of [out.start,out.finish])if(value&&(!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)||!L.dateRange(value)))throw Error('Use valid study dates in YYYY, YYYY-MM or YYYY-MM-DD format.');
 if(out.start&&out.finish&&L.dateRange(out.start).first>L.dateRange(out.finish).last)throw Error('The study finish must be on or after the study start.');
 out.project=text(input.project??'',200);return out;
}
function buildUrl(base,input){
 const view=normalize(input),url=new URL(base);if(!/^https?:$/.test(url.protocol)||url.username||url.password)throw Error('A coordination link needs an http(s) tracker address.');
 url.search='';url.hash='';url.searchParams.set('coord','1');
 for(const key of fields){const value=view[key];if(booleans.includes(key)){if(value)url.searchParams.set(param(key),'1');}else if(value!=='')url.searchParams.set(param(key),value);}
 return url.href;
}
function readUrl(value){
 const url=new URL(value);if(!url.searchParams.has('coord'))return null;if(url.searchParams.getAll('coord').length!==1||url.searchParams.get('coord')!=='1')throw Error('This coordination link version is not supported.');
 const raw={v:1};for(const key of fields){const values=url.searchParams.getAll(param(key));if(values.length>1)throw Error('The link contains conflicting view settings.');if(!values.length)continue;if(values[0].length>240)throw Error('A coordination link value is too long.');if(booleans.includes(key)){if(!['1','0'].includes(values[0]))throw Error('A coordination link switch is invalid.');raw[key]=values[0]==='1';}else raw[key]=values[0];}
 return normalize(raw);
}
function removeViewParams(value){const url=new URL(value);url.searchParams.delete('coord');for(const field of fields)url.searchParams.delete(param(field));return url;}
function readLibrary(storage){
 const raw=storage.getItem(storageKey);if(!raw)return [];let data;try{data=JSON.parse(raw);}catch{throw Error('Saved views could not be read. They have been left unchanged.');}
 if(!Array.isArray(data)||data.length>limit)throw Error('Saved views could not be read. They have been left unchanged.');
 const ids=new Set();return data.map(item=>{if(!item||typeof item!=='object')throw Error('A saved view is damaged. It has been left unchanged.');const id=text(item.id,100),name=text(item.name,80);if(!id||!name||ids.has(id))throw Error('A saved view is damaged. It has been left unchanged.');ids.add(id);return {id,name,state:normalize(item.state),savedAt:typeof item.savedAt==='string'?item.savedAt:''};});
}
function writeLibrary(storage,items){if(items.length>limit)throw Error('You can save up to '+limit+' views in this browser.');const names=new Set();const safe=items.map(item=>{const id=text(item.id,100),name=text(item.name,80);if(!id||!name)throw Error('Enter a name for this view.');const key=name.toLocaleLowerCase('en-US');if(names.has(key))throw Error('A view with this name already exists. Choose another name or update that saved view.');names.add(key);return {id,name,state:normalize(item.state),savedAt:item.savedAt};});storage.setItem(storageKey,JSON.stringify(safe));return safe;}
return {normalize,buildUrl,readUrl,removeViewParams,readLibrary,writeLibrary,storageKey,limit};
});
