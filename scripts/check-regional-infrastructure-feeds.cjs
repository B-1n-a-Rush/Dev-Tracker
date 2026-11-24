const { runtimeFile } = require('./check-infrastructure-source.cjs');
const land = require(runtimeFile('trackside-land-core.js'));
async function json(base, params) {
  const url = new URL(base);
  url.search = new URLSearchParams(params);
  const response = await fetch(url, {signal:AbortSignal.timeout(16000)});
  if (!response.ok) throw Error('HTTP '+response.status);
  const result = await response.json();
  if(result.error || result.errorCode) throw Error(result.error?.message || result.message || result.errorCode);
  return result;
}
const iso = value => Number.isFinite(value) && value>0 ? new Date(value).toISOString() : null;
async function readArc(source) {
  const url = source.url + '/query', where = source.where || '1=1';
  const idsOnly = async() => {
    const { objectIdFieldName, objectIds } = await json(url,{f:'json',where,returnIdsOnly:'true'});
    if (!objectIdFieldName || !Array.isArray(objectIds) || !objectIds.length || !objectIds.every(Number.isSafeInteger) || new Set(objectIds).size!==objectIds.length) throw Error('Invalid source ID inventory');
    return [objectIdFieldName,objectIds.sort((a,b)=>a-b)];
  };
  const meta = await json(source.url,{f:'json'});
  const [idField,ids]=await idsOnly();
  const rows = [];
  for(let i=0;i<ids.length;i+=200) {
    const batch=ids.slice(i,i+200);
    const r=await json(url,{f:'json',where,objectIds:batch.join(','),outFields:'*',returnGeometry:'false'});
    if (r.exceededTransferLimit || !Array.isArray(r.features) || JSON.stringify(r.features.map(f=>f.attributes[idField]).sort((a,b)=>a-b))!==JSON.stringify(batch)) throw Error('Source returned incomplete records');
    rows.push(...r.features.map(f=>f.attributes));
  }
  const [finalMeta,[,finalIds]] = await Promise.all([json(source.url,{f:'json'}), idsOnly()]);
  if (JSON.stringify(ids)!==JSON.stringify(finalIds)||meta.editingInfo?.lastEditDate!==finalMeta.editingInfo?.lastEditDate) throw Error('Source changed during capture');
  return {rows,editedAt:iso(finalMeta.editingInfo?.lastEditDate)};
}

async function readSocrata(source) {
  const getMeta = () => json(source.metadataUrl, {});
  const count = async () => Number((await json(source.url,{'$select':'count(*)'}))[0]?.count);
  const [meta,total] = await Promise.all([getMeta(),count()]);
  if (!Number.isSafeInteger(total) || total < 1 || total > 10000) throw Error('Invalid Socrata source count');
  const rows = [];
  for (let offset=0;offset<total;offset+=500) {
    const batch=await json(source.url,{'$limit':'500','$offset':String(offset),'$order':':id'});
    if(!Array.isArray(batch)||batch.length!==Math.min(500,total-offset)) throw Error('Incomplete Socrata source results');
    rows.push(...batch);
  }
  const [end,endTotal] = await Promise.all([getMeta(),count()]);
  if(total!==endTotal||meta.rowsUpdatedAt!==end.rowsUpdatedAt) throw Error('Socrata source changed during capture');
  return { rows,editedAt:iso(end.rowsUpdatedAt*1000) };
}

function normalizeDate(value) {
  const date=land.dateRange(value);
  if (!date) return null;
  return new Date(date.first).toISOString().slice(0,{year:4,month:7,day:10}[date.precision]);
}

function projectRecord(properties,source) {
  const row=land.infrastructure({properties,geometry:null},source);
  if (source.kind==='arc'&&!row.jurisdictions?.length) return null;
  if (source.kind==='splost'&&!/resurfac|transportation|beautification|patch|greenway|trail|sidewalk|bikeway|bridge|drainage|intersection|pedestrian|safety|streetscape|utilities/i.test(row.kind)) return null;
  if (land.isImportedRapidTransit(row)) return null;
  if (!row.sourceId) throw Error('A source record has no project ID');
  const dates=land.constructionDates(row);
  return { id:row.sourceId, name:row.name, fields:{
    'Construction start':normalizeDate(dates.start),
    'Construction finish':normalizeDate(dates.finish),
    'Published phase':row.sourceStatus || null,
    'Published status':land.text(land.pick(properties,['PROJECT_STATUS','status','Status'])) || null,
    'Program':row.program || null,
    'Category':row.category || null,
    'Published activity':row.activity || null
  } };
}

function locationRecord(properties) {
  const id=land.text(properties.project_id).toUpperCase().replace(/\s+/g,'');
  if (!id) return null;
  if (properties.the_geom?.type!=='Point' || properties.the_geom.coordinates?.length<2) return null;
  const point=properties.the_geom.coordinates.slice(0,2);
  if (!point.every(Number.isFinite)) return null;
  return {id,name:land.text(properties.project_na)||id,fields:{'Representative location':point.map(x=>Number(x.toFixed(6))).join(', ')}};
}

async function captureRegional(source) {
  const {rows,editedAt} = await (source.kind==='fulton'||source.kind==='fulton-location'?readSocrata(source):readArc(source));
  const records = rows.map(properties=>source.kind==='fulton-location'?locationRecord(properties):projectRecord(properties,source)).filter(Boolean);
  if (!records.length) throw Error('No in-scope project records returned');
  return {records,editedAt};
}

module.exports = { captureRegional };
