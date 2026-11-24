const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),State=require(path.join(__dirname,fs.existsSync(path.resolve(__dirname,'../outputs/index.html'))?'../outputs/trackside-project-state.js':'../trackside-project-state.js'));const tasks=[],test=(n,f)=>tasks.push([n,f]),tick=()=>new Promise(setImmediate);
function fixture(){let p=null,staff=false,newsCalls=0,historyCalls=0;const gates=new Map(),s=State.create({getProject:()=>p,describe:v=>({...v}),canHistory:()=>staff,news:id=>{newsCalls++;return gates.get(id)?.promise||Promise.resolve([{title:id,url:'https://example.org/'+id}])},newsStatus:()=>Promise.resolve({last_checked_at:'2026-11-01'}),history:async()=>{historyCalls++;return gates.get('history')?.promise||[{id:'private'}]},describeHistory:v=>v});return{s,set:value=>p=value,staff:value=>staff=value,gate(key){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});gates.set(key,{promise});return{resolve,reject}},get newsCalls(){return newsCalls},get historyCalls(){return historyCalls}}}
test('Snapshots stay stable between changes; subscriptions detach cleanly',()=>{const h=fixture(),a=h.s.getSnapshot();assert.equal(a,h.s.getSnapshot());assert(Object.isFrozen(a));let calls=0;const off=h.s.subscribe(()=>calls++);h.set({id:'A'});h.s.refresh();off();const count=calls;h.s.tab('overview');assert.equal(calls,count)});
test('Selecting a project loads approved news and source check date',async()=>{const h=fixture();h.set({id:'A'});h.s.refresh();assert.equal(h.s.getSnapshot().news.status,'loading');await tick();assert.equal(h.s.getSnapshot().news.items[0].title,'A');assert.equal(h.s.getSnapshot().news.checked,'2026-11-01')});
test('Repeated renders of the same project do not refetch news',async()=>{const h=fixture();h.set({id:'A'});h.s.refresh();await tick();for(let i=0;i<5;i++)h.s.refresh();assert.equal(h.newsCalls,1)});
test('Late news from an earlier selection cannot replace the current project',async()=>{const h=fixture(),a=h.gate('A');h.set({id:'A'});h.s.refresh();h.set({id:'B'});h.s.refresh();await tick();a.resolve([{title:'old A'}]);await tick();assert.equal(h.s.getSnapshot().project.id,'B');assert.equal(h.s.getSnapshot().news.items[0].title,'B')});
test('Leaving and returning to the same ID also invalidates older responses',async()=>{const h=fixture(),a=h.gate('A');h.set({id:'A'});h.s.refresh();h.set(null);h.s.refresh();h.set({id:'A',revision:2});h.s.refresh();const fresh=h.gate('A');h.s.news();fresh.resolve([{title:'new'}]);await tick();a.resolve([{title:'stale'}]);await tick();assert.equal(h.s.getSnapshot().news.items[0].title,'new')});
test('News failure is recoverable without changing selection',async()=>{const h=fixture(),a=h.gate('A');h.set({id:'A'});h.s.refresh();a.reject(Error('offline'));await tick();assert.equal(h.s.getSnapshot().news.status,'error');const retry=h.gate('A');h.s.news();retry.resolve([]);await tick();assert.equal(h.s.getSnapshot().news.status,'ready');assert.equal(h.s.getSnapshot().project.id,'A')});
test('Public profiles cannot request administrative history',async()=>{const h=fixture();h.set({id:'A'});h.s.refresh();h.s.tab('history');await h.s.history(true);assert.equal(h.historyCalls,0);assert.equal(h.s.getSnapshot().tab,'overview')});
test('History loads on request and reuses the current result until Refresh',async()=>{const h=fixture();h.staff(true);h.set({id:'A'});h.s.refresh();assert.equal(h.historyCalls,0);h.s.tab('history');await tick();h.s.tab('overview');h.s.tab('history');await tick();assert.equal(h.historyCalls,1);await h.s.history(true);assert.equal(h.historyCalls,2)});
test('Role loss immediately removes private history and ignores its late response',async()=>{const h=fixture(),g=h.gate('history');h.staff(true);h.set({id:'A'});h.s.refresh();h.s.tab('history');h.staff(false);h.s.refresh();g.resolve([{id:'private'}]);await tick();assert.deepEqual(h.s.getSnapshot().history.items,[]);assert.equal(h.s.getSnapshot().tab,'overview');assert.equal(h.s.getSnapshot().canHistory,false)});
test('A saved edit updates facts and refreshes active history while preserving the tab',async()=>{const h=fixture();h.staff(true);h.set({id:'A',units:10});h.s.refresh();h.s.tab('history');await tick();h.set({id:'A',units:20});h.s.refresh();await tick();assert.equal(h.s.getSnapshot().project.units,20);assert.equal(h.s.getSnapshot().tab,'history');assert.equal(h.historyCalls,2);assert.equal(h.newsCalls,1)});
test('Changing projects clears the previous history and selects Overview',async()=>{const h=fixture();h.staff(true);h.set({id:'A'});h.s.refresh();h.s.tab('history');await tick();h.set({id:'B'});h.s.refresh();assert.equal(h.s.getSnapshot().tab,'overview');assert.deepEqual(h.s.getSnapshot().history.items,[])});
test('Clearing the selection removes all displayed project and history data',async()=>{const h=fixture();h.staff(true);h.set({id:'A'});h.s.refresh();h.s.tab('history');await tick();h.set(null);h.s.refresh();assert.equal(h.s.getSnapshot().project,null);assert.deepEqual(h.s.getSnapshot().history.items,[]);assert.deepEqual(h.s.getSnapshot().news.items,[])});

test('Project milestones stay visible behind a long series of routine edits',()=>{
 const source='https://example.org/announcement';
 const view=State.timeline([
  ...Array.from({length:8},()=>['Oct 2026','Project details updated',0]),
  ['Aug 2026','Construction groundbreaking',0],
  ['TBD','Homes and retail delivery',1],
 ],'Construction began August 2026; completion expected spring 2028',source);
 assert.deepEqual(view.milestones,[
  {date:'Aug 2026',label:'Construction groundbreaking',expected:false,sourceUrl:source},
  {date:'Spring 2028',label:'Homes and retail delivery',expected:true,sourceUrl:source},
 ]);
 assert.deepEqual(view.history,[{date:'Oct 2026',label:'Project details updated',count:8}]);
});
test('The profile preserves existing dates and marks explicit estimates regardless of entry order',()=>{
 const view=State.timeline([
  ['Q1 2028','Estimated construction completion',0],['Jul 2026','Permit issued',0],
 ],'Completion expected during an unspecified phase','https://example.org/source');
 assert.deepEqual(view.milestones.map(({date,expected,sourceUrl})=>[date,expected,sourceUrl]),[['Jul 2026',false,''],['Q1 2028',true,'']]);
 assert.equal(State.timeline([], 'Completion expected spring 2028').milestones.length,0);
});
test('Transit coverage distinguishes operating, planned and unverified service from alignment distance',()=>{
 const result={mode:'BRT',distanceMeters:321.8688};
 assert.deepEqual(State.routeAccessDetail(result,'Planning / environmental review',false),{service:'BRT · Planned service',distance:'0.2 mi straight-line to alignment'});
 assert.equal(State.routeAccessDetail(result,'In service with remaining construction',false).service,'BRT · Operating service');
 assert.equal(State.routeAccessDetail(result,'Current construction schedule unconfirmed',false).service,'BRT · Service status unverified');
 assert.equal(State.routeAccessDetail({...result,distanceMeters:Infinity,overridden:true},'',true).distance,'Alignment distance unavailable · Admin selected');
});

test('Public record history shows cited before-and-after values and omits routine or malformed entries',()=>{
 const source='https://example.org/public-announcement';
 const change={changed_at:'2026-11-23T22:46:21.524Z',source_url:source,
  fields:[{field:'units',before:120,after:130},{field:'actor',before:'private',after:'private2'}]};
 const result=State.publishedRecordChanges([
  {changed_at:'2026-11-23T22:00:00Z',fields:[{field:'units',before:100,after:120}]},
  change,{...change,source_url:'javascript:alert(1)'},change,
  {...change,fields:[{field:'status',before:'Planning',after:'Planning'}]},
 ]);
 assert.equal(result.length,1);
 assert.deepEqual(result[0].fields,[{key:'units',label:'Residential units',before:120,after:130}]);
 assert.equal(result[0].source,source);
});
test('A source-backed edit records only changed project facts with meaningful before values',()=>{
 const old={id:'existing',residentialUnits:0,status:'Planning',metadata:{}};
 const current={...old,status:'Construction',residentialUnits:130,notes:'private'};
 const now='2026-11-23T22:46:21.524Z';
 const rows=State.backedRecordEdit(old,current,'https://example.org/public-announcement',now);
 assert.deepEqual(rows[0].fields,[{field:'status',before:'Planning',after:'Construction'},{field:'units',before:null,after:130}]);
 assert.throws(()=>State.backedRecordEdit(old,current,'',now),/direct public source/);
 assert.throws(()=>State.backedRecordEdit(old,old,'https://example.org',now),/Change a project fact/);
 assert.throws(()=>State.backedRecordEdit(null,current,'https://example.org',now),/existing project/);
});
(async()=>{for(const[n,f]of tasks){await f();console.log('PASS '+n)}console.log(tasks.length+' project profile checks passed')})().catch(e=>{console.error(e);process.exitCode=1});
