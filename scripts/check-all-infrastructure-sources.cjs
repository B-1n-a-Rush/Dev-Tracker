const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite, reviewStore, runtimeFile } = require('./check-infrastructure-source.cjs');
const catalog = require(runtimeFile('trackside-infrastructure-sources.js'));
const { captureProjectPages } = require('./check-atlanta-project-pages.cjs');
const { captureRegional } = require('./check-regional-infrastructure-feeds.cjs');
const { writeMonitoringImport } = require('./infrastructure-review-import.cjs');

const root = path.resolve(__dirname,'..');
const sortValues = values => [...new Set(values)].sort((a,b)=>String(a??'').localeCompare(String(b??''),'en'));
const stable = value => JSON.stringify(value);

function combine(records) {
  const groups=new Map();
  for(const record of records) {
    if(!groups.has(record.id)) groups.set(record.id,[]);
    groups.get(record.id).push(record);
  }
  return [...groups].sort(([a],[b])=>a.localeCompare(b,'en')).map(([id,items])=>{
    const keys=sortValues(items.flatMap(x=>Object.keys(x.fields)));
    const fields=Object.fromEntries(keys.map(key=>[key,sortValues(items.map(item=>item.fields[key]??null))]));
    return {id,name:sortValues(items.map(x=>x.name)).join(' / '),fields};
  });
}

function differences(before, after) {
  const previous=new Map(before.map(row=>[row.id,row]));
  const current=new Map(after.map(row=>[row.id,row]));
  const items=[];
  for(const id of new Set([...previous.keys(),...current.keys()])) {
    const old=previous.get(id),next=current.get(id);
    const fields=[...new Set([...Object.keys(old?.fields??{}),...Object.keys(next?.fields??{})])];
    const changes=fields.filter(key=>stable(old?.fields[key])!==stable(next?.fields[key]))
      .map(field=>({field,before:old?.fields[field]??[],after:next?.fields[field]??[]}));
    if(old&&next&&old.name!==next.name) changes.unshift({field:'Project name',before:[old.name],after:[next.name]});
    if(!old||!next||changes.length) items.push({id,name:(next||old).name,
      kind:!old?'new':!next?'missing':'changed',changes});
  }
  return items;
}

function compareSource(source, previous, capture, checkedAt) {
  if(capture.status==='rejected') {
    const error=capture.reason;
    const message=[error?.message??'Check failed',error?.cause?.code].filter(Boolean).join(' · ').slice(0,500);
    return {...source,status:'failed',checkedAt,message,
      lastSuccessfulCheck:previous?.lastSuccessfulCheck??null,records:previous?.records??null,
      retainedChanges:previous?.changes??previous?.retainedChanges??[], alert:previous?.status!=='failed'||previous.message!==message};
  }
  const rows=combine(capture.value.records);
  if(!rows.length || (previous?.records?.length>=20 && rows.length<previous.records.length*.75)) {
    return compareSource(source,previous,{status:'rejected',reason:Error('The source inventory shrank unexpectedly. Verify coverage before accepting removals.')},checkedAt);
  }
  const old=previous?.records;
  return {...source,status:old?'checked':'baseline',checkedAt,lastSuccessfulCheck:checkedAt,
    sourceUpdated:capture.value.editedAt??null,count:rows.length,records:rows,
    changes:old?differences(old,rows):[],recovered:previous?.status==='failed'};
}

async function capturePages() {
  const pages=await captureProjectPages();
  return {records:pages.map(page=>({
    id:page.id,name:page.title,url:page.url,fields:{
      'Construction start':page.start,'Construction finish':page.finish,'Published phase':page.phase,
      'Project page':page.url,'Date review':page.invalid?'Finish precedes start':null
    }
  }))};
}

function sourceEntries() {
  const regional=catalog.filter(source=>source.kind!=='atlanta');
  for(const source of catalog) if(source.locationsUrl) regional.push({
    id:source.id+'-locations',name:source.name+' locations',kind:'fulton-location',
    url:source.locationsUrl,metadataUrl:source.locationMetadataUrl,viewer:source.viewer
  });
  return [{id:'atl-project-pages',name:'Atlanta DOT project pages',viewer:'https://atldot.atlantaga.gov/projects/',capture:capturePages},
    ...regional.map(source=>({...source,capture:()=>captureRegional(source)}))];
}

async function run() {
  const dir=path.join(root,'work','infrastructure-refresh');
  const file=path.join(dir,'regional-latest.json');
  fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,'regional-review.lock');
  const fd=fs.openSync(lock,'wx');
  try {
    fs.writeFileSync(fd,String(process.pid));
    const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
    if(previous&&previous.version!==1)throw Error('Regional comparison report uses an unsupported version.');
    const entries=sourceEntries();
    const existing=reviewStore();
    const results=await Promise.allSettled([existing.check(),...entries.map(source=>source.capture())]);
    const checkedAt=new Date().toISOString();
    const [gis,...regional]=results;
    const sources=entries.map(({id,name,viewer},i)=>compareSource({id,name,url:viewer},
      previous?.sources.find(row=>row.id===id),regional[i],checkedAt));
    const atlantaGIS=gis.status==='fulfilled'?{status:'checked',...gis.value}:{
      status:'failed',message:gis.reason.message,alert:previous?.atlantaGIS.status!=='failed'||previous?.atlantaGIS.message!==gis.reason.message
    };
    const report={version:1,checkedAt,atlantaGIS,sources};
    const queueImport=writeMonitoringImport(dir,report,atlantaGIS.status==='checked'?existing.latest().report:null);
    atomicWrite(file,JSON.stringify(report,null,2)+'\n');
    const findings=sources.flatMap(source=>(source.changes||[]).map(change=>({...change,source:source.name})));
    const counts=Object.fromEntries(['new','changed','missing'].map(kind=>[kind,findings.filter(row=>row.kind===kind).length]));
    const failures=[...(atlantaGIS.status==='failed'?[{name:'Atlanta DOT GIS',message:atlantaGIS.message,alert:atlantaGIS.alert}]:[]),
      ...sources.filter(x=>x.status==='failed').map(({name,message,alert})=>({name,message,alert}))];
    console.log(JSON.stringify({checkedAt,reportFile:file,...queueImport,coverage:sources.map(({name,status,count})=>({name,status,count})),
      atlantaGIS,counts,findings:findings.slice(0,20),failures,recovered:sources.filter(x=>x.recovered).map(x=>x.name)}));
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

module.exports={combine,differences,compareSource,sourceEntries};
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
