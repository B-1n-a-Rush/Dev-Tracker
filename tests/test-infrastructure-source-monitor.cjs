const runtimeFile = require('./helpers/runtime-file.cjs');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const catalog=require(runtimeFile('trackside-infrastructure-sources.js'));
const {combine,differences,compareSource,sourceEntries}=require('../scripts/check-all-infrastructure-sources.cjs');

const source={id:'agency',name:'Agency'};
const project=(id,phase='Planning',start=null)=>({id,name:'Project '+id,fields:{'Construction start':start,'Published phase':phase}});
const success=records=>({status:'fulfilled',value:{records}});
const failed=message=>({status:'rejected',reason:Error(message)});
const now='2026-11-24T12:00:00Z';

test('Every configured feed has a checker, including separate project pages and location records',()=>{
  const expected=[...catalog.filter(s=>s.kind!=='atlanta').map(s=>s.id),'atl-project-pages','fulton-tsplost-locations'].sort();
  assert.deepEqual(sourceEntries().map(s=>s.id).sort(),expected);
});

test('Initial and unchanged captures generate no alerts, while real date and phase changes appear once',()=>{
  const base=compareSource(source,null,success([project('1'),project('2')]),now);
  assert.equal(base.status,'baseline');
  assert.deepEqual(base.changes,[]);
  const revised=[project('1','Construction','2027-07-19'),project('3')];
  const updated=compareSource(source,base,success(revised),now);
  assert.deepEqual(updated.changes.map(c=>[c.id,c.kind]),[['1','changed'],['2','missing'],['3','new']]);
  assert.deepEqual(updated.changes[0].changes,[{field:'Construction start',before:[null],after:['2027-07-19']},
    {field:'Published phase',before:['Planning'],after:['Construction']}]);
  assert.deepEqual(compareSource(source,updated,success(revised),now).changes,[]);
});

test('One failed feed preserves its successful data and never reports projects missing',()=>{
  const base=compareSource(source,null,success([project('1')]),now);
  const outage=compareSource(source,base,failed('HTTP 503'),now);
  assert.equal(outage.status,'failed');
  assert.equal(outage.alert,true);
  assert.equal(outage.records,base.records);
  assert.equal(outage.changes,undefined);
  assert.equal(compareSource(source,outage,failed('HTTP 503'),now).alert,false);
  assert.deepEqual(compareSource(source,outage,success([project('1')]),now).changes,[]);
});

test('Segment order and exact segment duplicates do not trigger schedule warnings',()=>{
  const pieces=[project('1'),project('1','Construction')];
  assert.deepEqual(differences(combine(pieces),combine([pieces[1],...pieces])),[]);
});
