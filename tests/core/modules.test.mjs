import test from 'node:test';import assert from 'node:assert/strict';
import { createWorkbench } from '../../src/core/workbench.mjs';
import { memoryPorts } from '../support/ports.mjs';
const rec=(id,value)=>({kind:'sample',externalId:id,observedAt:'2026-11-13T00:00:00Z',data:{value}});
function fixture(){const ports=memoryPorts();const wb=createWorkbench(ports);wb.registerDomain({id:'health',title:'Health',recordKinds:['sample']});return {ports,wb};}
const source={id:'watch',domain:'health',kind:'export',title:'Watch',capabilities:()=>['health'],check:async()=>({ok:true})};
test('incremental cursor commits with rows, upserts stable identities and deletes explicit removals',async()=>{
 const {wb}=fixture();let cursor;
 const s={...source,read:async(range,c)=>{cursor=c;return {mode:'merge',cursor:'one',records:[rec('a',1)],fetchedAt:'2026-11-13T00:00:00Z'}}};wb.registerSource(s);
 await wb.sync('watch');assert.equal(wb.snapshot().sources[0].cursor,'one');
 s.read=async(range,c)=>{cursor=c;return {mode:'merge',cursor:'two',records:[rec('a',2),rec('b',3)],fetchedAt:'2026-11-13T01:00:00Z'}};
 await wb.sync('watch');assert.equal(cursor,'one');assert.equal(wb.snapshot().sources[0].records.length,2);
 s.read=async()=>({mode:'merge',cursor:'three',records:[],removed:[{kind:'sample',externalId:'a'}],fetchedAt:'2026-11-13T02:00:00Z'});
 await wb.sync('watch');assert.deepEqual(wb.snapshot().sources[0].records.map(r=>r.externalId),['b']);
 s.read=async()=>{throw Error('network contains secret URL')};await assert.rejects(wb.sync('watch'));
 assert.equal(wb.snapshot().sources[0].cursor,'three');assert.doesNotMatch(JSON.stringify(wb.snapshot()),/secret URL/);
});
test('import twice is idempotent, metrics consume stored rows, source config is never exposed',async()=>{
 const {wb}=fixture();wb.registerImporter({...source,id:'csv',accept:'.csv',import:async file=>({mode:'merge',records:[rec('transaction-1',Number(file.text))],fetchedAt:'2026-11-13T00:00:00Z'})});
 wb.registerMetric({id:'total',domain:'health',compute:({records})=>records.reduce((n,r)=>n+r.data.value,0)});
 await wb.importFile('csv',{name:'a.csv',text:'7'});await wb.importFile('csv',{name:'a.csv',text:'7'});
 assert.equal(wb.snapshot().sources[0].records.length,1);assert.equal(wb.metric('total'),7);
 await assert.rejects(wb.sync('csv'),/not a scheduled source/);
});
test('scheduled sources use clock port and disposal removes timer',async()=>{
 const {wb,ports}=fixture();const remove=wb.registerSource({...source,intervalMs:60000,read:async()=>({records:[rec('a',1)],fetchedAt:ports.clock.now()})});
 assert.equal(ports.control.timers.size,1);await ports.control.tick();assert.equal(wb.snapshot().sources[0].records.length,1);
 remove();assert.equal(ports.control.timers.size,0);await wb.close();
});
test('storage failure rejects once, retains cursor and exposes failed synchronization',async()=>{
 const {wb,ports}=fixture();wb.registerSource({...source,read:async()=>({records:[rec('a',1)],cursor:'one',fetchedAt:ports.clock.now()})});
 await wb.sync('watch');let writes=0;ports.storage.put=async()=>{writes++;throw Error('disk failed')};
 await assert.rejects(wb.sync('watch'),/disk failed/);assert.equal(writes,1);
 const state=wb.snapshot().sources[0];assert.equal(state.status,'error');assert.equal(state.cursor,'one');assert.equal(state.error.code,'sync-failed');
});
