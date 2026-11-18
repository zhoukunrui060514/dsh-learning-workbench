import test from 'node:test';
import assert from 'node:assert/strict';
import {mountModules} from '../../src/host/modules.mjs';
import {createWorkbench} from '../../src/core/workbench.mjs';
import {createLocalModules} from '../../src/core/local-modules.mjs';
import {memoryPorts} from '../support/ports.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture() {
 const events=[],gate=deferred(),readGate=deferred(),entered=deferred();
 const ports=memoryPorts(),wb=createWorkbench(ports);let resourceOpen=true,storageOpen=true;
 const put=ports.storage.put;ports.storage.put=async(...args)=>{assert.ok(storageOpen);assert.ok(resourceOpen);await put(...args);events.push('source saved');};
 const local=createLocalModules({get:()=>undefined,put:async()=>{assert.ok(storageOpen);assert.ok(resourceOpen);events.push('choice saved');}});
 const modules=[{id:'finance',domains:[{id:'finance',title:'Finance',recordKinds:[]}],setup({state,registerAction}){
  registerAction('confirm',async()=>{entered.resolve();await gate.promise;assert.equal(wb.metric('resource'),7);await state.put('pair','a+b');});
  return ()=>events.push('finance cleanup');
 }},{id:'resource',setup({workbench,registerAction}){
  const off=workbench.registerMetric({id:'resource',domain:'finance',compute:()=>{assert.ok(resourceOpen);return 7;}});
  registerAction('other',async()=>{throw Error('must not accept new action');});
  const offSource=workbench.registerSource({id:'source',domain:'finance',kind:'fixture',title:'Source',capabilities:()=>[],read:async()=>{await readGate.promise;assert.ok(resourceOpen);return {records:[],fetchedAt:ports.clock.now()};}});
  return ()=>{resourceOpen=false;off();offSource();events.push('resource cleanup');};
 }}];
 const unmount=await mountModules(modules,{workbench:wb,ports,localModules:local,config:{}});
 return {events,gate,readGate,entered,wb,local,unmount,domain:{close:async()=>{storageOpen=false;events.push('storage closed');}}};
}

test('actual mount unload drains every module action before any resource or core cleanup',async()=>{
 const f=await fixture();const action=f.local.invoke('finance','confirm',{});await f.entered.promise;
 const stopped=f.unmount();
 const rejected=assert.rejects(f.local.invoke('resource','other',{}),/unknown/);
 f.gate.resolve();await action;await stopped;await rejected;
 assert.deepEqual(f.events,['choice saved','resource cleanup','finance cleanup']);
});

test('host shutdown removes route, drains actions then source sync before storage closes',async()=>{
 const {shutdown}=await import('../../src/host/shutdown.mjs');
 const f=await fixture();const action=f.local.invoke('finance','confirm',{});await f.entered.promise;
 const sync=f.wb.sync('source');
 const stopped=shutdown({remove:()=>f.events.push('route removed'),unmount:f.unmount,domain:f.domain});
 f.gate.resolve();await action;
 assert.deepEqual(f.events,['route removed','choice saved']);
 f.readGate.resolve();await sync;await stopped;
 assert.deepEqual(f.events,['route removed','choice saved','source saved','resource cleanup','finance cleanup','storage closed']);
});
