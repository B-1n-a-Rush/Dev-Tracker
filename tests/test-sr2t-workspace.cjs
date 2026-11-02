const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),V=require(path.join(__dirname,fs.existsSync(path.join(__dirname,'../outputs/trackside-sr2t-state.js'))?'../outputs/trackside-sr2t-state.js':'../trackside-sr2t-state.js'));let count=0;function test(name,fn){fn();console.log('PASS '+name);count++}
const site=(id,changes={})=>({site_id:id,is_published:true,profile:{name:'Site '+id,status:'Planning',jurisdiction:'Fulton County',location:'Example Street',stops:[{number:'0012',stop_name:'Main Street'}]},...changes});
const a=site('A'),b=site('B',{is_published:false}),c=site('C',{removed_at:'2026-01-01'}),d=site('D',{profile:{...a.profile,name:'DeKalb corner',jurisdiction:'DeKalb',status:'Construction'}}),all=[a,b,c,d],empty={};
test('Public view excludes drafts and removed sites, even with removed mode requested',()=>assert.deepEqual(V.filter(all,empty,false,true),[a,d]));
test('Staff active and removed lists are separate',()=>{assert.deepEqual(V.filter(all,empty,true,false),[a,b,d]);assert.deepEqual(V.filter(all,empty,true,true),[c])});
test('Search covers exact leading-zero stop codes and stop names',()=>{assert.equal(V.filter(all,{search:'0012'},false,false).length,2);assert.equal(V.filter(all,{search:' MAIN street '},false,false).length,2);assert.deepEqual(V.filter(all,{search:'site a'},false,false),[a])});
test('County values stay intact and filters compose',()=>assert.deepEqual(V.filter(all,{jurisdiction:'Fulton County',status:'Construction'},true,false),[]));
test('Selection survives filtering and saved name/status changes',()=>{const saved={...a,profile:{...a.profile,name:'Updated name',status:'Complete'}};assert.equal(V.selection([saved,d],[d],'A',false,false),'A')});
test('Role loss clears a draft selection before a profile can render',()=>assert.equal(V.selection(all,[a,d],'B',false,false),'A'));
test('Removed selections cannot leak into active profiles',()=>assert.equal(V.selection(all,[a,d],'C',true,false),'A'));
test('Missing selection chooses first visible site or none',()=>{assert.equal(V.selection(all,[d],'missing',false,false),'D');assert.equal(V.selection(all,[],'missing',false,false),'')});
test('Refreshing jurisdiction options retains an intentionally selected empty filter',()=>assert.deepEqual(V.jurisdictions([a], 'Clayton County'),['Clayton County','Fulton County']));
test('Filtering never mutates inventory or filter state',()=>{const before=JSON.stringify(all),filters=Object.freeze({search:'a'});V.filter(all,filters,false,false);assert.equal(JSON.stringify(all),before)});
console.log(count+' SR2T workspace checks passed');
