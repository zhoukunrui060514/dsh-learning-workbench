import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbench } from '../../src/core/workbench.mjs';
const record = {kind:'deadline',externalId:'exam',subjectRef:'biology',observedAt:'2026-11-13T00:00:00Z',data:{date:'2026-12-01'}};
function fixture(store = new Map()) {
  const wb = createWorkbench({storage:{list:()=>[...store.values()],put:async(k,v)=>store.set(k,structuredClone(v))},clock:{now:()=> '2026-11-13T00:00:00Z'}});
  wb.registerDomain({id:'learning',title:'学习',recordKinds:['deadline']});
  const source = {id:'study',domain:'learning',kind:'example',title:'示例',capabilities:()=>['deadline'],check:async()=>({ok:true}),read:async()=>({records:[record],fetchedAt:'2026-11-13T00:00:00Z'})};
  return {wb,source,store};
}
test('snapshot replacement removes missing records and survives a new engine',async()=>{
  const {wb,source,store}=fixture();wb.registerSource(source);await wb.sync('study');
  assert.equal(wb.snapshot().sources[0].records.length,1);
  const second=fixture(store);second.wb.registerSource(source);
  assert.equal(second.wb.snapshot().sources[0].records[0].sourceId,'study');
  source.read=async()=>({records:[],fetchedAt:'2026-11-13T01:00:00Z'});await wb.sync('study');
  assert.equal(wb.snapshot().sources[0].records.length,0);
});
test('failed source retains successful data and reports error',async()=>{
  const {wb,source}=fixture();wb.registerSource(source);await wb.sync('study');
  source.read=async()=>{throw Error('offline')};await assert.rejects(wb.sync('study'),/offline/);
  const s=wb.snapshot().sources[0];assert.equal(s.records.length,1);assert.equal(s.status,'error');assert.equal(s.lastSuccessAt,'2026-11-13T00:00:00Z');
});
test('concurrent sync shares one read and rejects invalid or duplicate records',async()=>{
  const {wb,source}=fixture();let resolve;let calls=0;
  source.read=()=>{calls++;return new Promise(r=>resolve=r)};wb.registerSource(source);
  const a=wb.sync('study'),b=wb.sync('study');await Promise.resolve();await Promise.resolve();
  resolve({records:[record],fetchedAt:'2026-11-13T00:00:00Z'});await Promise.all([a,b]);assert.equal(calls,1);
  source.read=async()=>({records:[record,record],fetchedAt:'2026-11-13T00:00:00Z'});await assert.rejects(wb.sync('study'),/duplicate/);
  source.read=async()=>({records:[{...record,kind:'money'}],fetchedAt:'2026-11-13T00:00:00Z'});await assert.rejects(wb.sync('study'),/kind/);
});
test('registration is scoped and shutdown waits for work',async()=>{
  const {wb,source}=fixture();assert.throws(()=>wb.registerSource({...source,domain:'unknown'}),/domain/);
  const dispose=wb.registerSource(source);assert.throws(()=>wb.registerSource(source),/duplicate/);
  await wb.sync('study');dispose();assert.equal(wb.snapshot().sources[0].status,'unavailable');
  await assert.rejects(wb.sync('study'),/unavailable/);await wb.close();assert.throws(()=>wb.registerSource(source),/closed/);
});
test('closing drains an in-flight snapshot before returning',async()=>{
  const {wb,source,store}=fixture();let release;
  source.read=()=>new Promise(r=>release=r);wb.registerSource(source);
  const work=wb.sync('study');await Promise.resolve();await Promise.resolve();
  let drained=false;const closing=wb.close().then(()=>{drained=true});await Promise.resolve();assert.equal(drained,false);
  release({records:[record],fetchedAt:'2026-11-13T00:00:00Z'});await work;await closing;
  assert.equal(store.get('study').records.length,1);
});

test('successful source and importer snapshots persist warnings and replace them on the next success',async()=>{
  for(const input of ['source','importer']) {
    const {wb,source,store}=fixture();
    let result={records:[record],fetchedAt:record.observedAt,warnings:[{code:'unsupported-shards',message:'分片版本未适配'}]};
    source.read=source.import=async()=>result;
    if(input==='source')wb.registerSource(source);else wb.registerImporter(source);
    const sync=()=>input==='source'?wb.sync(source.id):wb.importFile(source.id,{name:'x',bytes:new Uint8Array()});
    const first=await sync();
    assert.deepEqual(first.warnings,result.warnings);assert.equal(first.status,'ready');assert.equal(first.error,null);
    const reopened=fixture(store);assert.deepEqual(reopened.wb.snapshot().sources[0].warnings,result.warnings);
    result={records:[],fetchedAt:record.observedAt};await sync();
    assert.deepEqual(wb.snapshot().sources[0].warnings,[]);assert.equal(wb.snapshot().sources[0].records.length,0);
  }
});
