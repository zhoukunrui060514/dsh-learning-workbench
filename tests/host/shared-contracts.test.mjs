import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverModules,mountModules} from '../../src/host/modules.mjs';
import {createWorkbench} from '../../src/core/workbench.mjs';
import {memoryPorts} from '../support/ports.mjs';
import {createLocalModules} from '../../src/core/local-modules.mjs';

test('independent learning sub-modules mount against the shipped learning declaration',async()=>{
 const ports=memoryPorts(),wb=createWorkbench(ports);
 const base=await discoverModules(new URL('../../src/domains/',import.meta.url));
 const independent=await discoverModules(new URL('../fixtures/parallel-learning/',import.meta.url));
 const dispose=await mountModules([...independent,...base],{workbench:wb,ports,localModules:createLocalModules({get:()=>undefined,put:async()=>{}}),config:{}});
 await wb.sync('ics');await wb.sync('studyhub');assert.deepEqual(wb.metric('exams'),[['anatomy','2026-12-02','Asia/Shanghai'],['anatomy','2026-12-01','Asia/Shanghai']]);
 await dispose();await wb.close();
});
test('module private choices persist across reopen and only registered explicit actions write',async()=>{
 const rows=new Map();const storage={get:k=>rows.get(k),put:async(k,v)=>rows.set(k,structuredClone(v))};
 const local=createLocalModules(storage),finance=local.forModule('finance');
 finance.registerAction('confirm',async input=>{assert.equal(typeof input.pair,'string');await finance.state.put('pair',input.pair);return {saved:true};});
 await local.invoke('finance','confirm',{pair:'a+b'});
 const reopened=createLocalModules(storage);assert.equal(reopened.forModule('finance').state.get('pair'),'a+b');
 assert.equal(reopened.forModule('learning').state.get('pair'),undefined);
 await assert.rejects(local.invoke('finance','unknown',{}),/unknown/);
 assert.deepEqual(Object.keys(local),['forModule','invoke','remove']);
});

test('learning fixtures retain units, unknown mastery and local exam dates across sources',async()=>{
 const ports=memoryPorts(),wb=createWorkbench(ports),at=ports.clock.now();
 const modules=await discoverModules(new URL('../../src/domains/',import.meta.url));
 const dispose=await mountModules(modules,{workbench:wb,ports,localModules:createLocalModules({get:()=>undefined,put:async()=>{}}),config:{}});
 const records=[
  {kind:'review-event',externalId:'r',subjectRef:'anatomy',observedAt:at,data:{occurredAt:at,localDate:'2026-11-13',timeZone:'Asia/Shanghai',itemRef:'q1',correct:null,durationSeconds:null}},
  {kind:'due-item',externalId:'d',subjectRef:'anatomy',observedAt:at,data:{due:{date:'2026-11-14',timeZone:'Asia/Shanghai'},count:3,unit:'question',itemRef:null}},
  {kind:'mastery-snapshot',externalId:'m',subjectRef:'anatomy',observedAt:at,data:{asOf:at,topicRef:'bones',value:null,scale:'ratio',numerator:null,denominator:null,method:'unavailable'}},
 ];
 const other=[{kind:'calendar-event',externalId:'event',subjectRef:null,observedAt:at,data:{title:'Appointment',start:{at:'2026-11-14T12:00:00+08:00',timeZone:'Asia/Shanghai'},end:{at:'2026-11-14T13:00:00+08:00',timeZone:'Asia/Shanghai'},busy:true}}];
 for(const [id,items] of [['study',records],['ics',other]])wb.registerSource({id,domain:'learning',title:id,kind:id,capabilities:()=>[],read:async()=>({records:items,fetchedAt:at})});
 wb.registerMetric({id:'fixture',domain:'learning',compute:({records})=>({reviews:records.filter(r=>r.kind==='review-event').length,due:records.filter(r=>r.kind==='due-item').map(r=>[r.data.count,r.data.unit]),mastery:records.find(r=>r.kind==='mastery-snapshot').data.value,busy:records.find(r=>r.kind==='calendar-event').data.busy})});
 await wb.sync('study');await wb.sync('ics');assert.deepEqual(wb.metric('fixture'),{reviews:1,due:[[3,'question']],mastery:null,busy:true});
 await wb.close();await dispose();
});

test('local operation serialization and unload wait for durable writes without retry',async()=>{
 let release,writes=0;const gate=new Promise(r=>release=r);
 const local=createLocalModules({get:()=>undefined,put:async()=>{writes++;await gate;}});
 const module=local.forModule('choice');module.registerAction('save',()=>module.state.put('x',1));
 const first=local.invoke('choice','save',{});
 await assert.rejects(local.invoke('choice','save',{}),{code:'BUSY'});
 let removed=false;const stop=local.remove('choice').then(()=>removed=true);
 await Promise.resolve();assert.equal(removed,false);
 await assert.rejects(local.invoke('choice','save',{}),/unknown/);
 release();await first;await stop;assert.equal(writes,1);
 const failure=createLocalModules({get:()=>undefined,put:async()=>{throw Error('disk');}});
 const f=failure.forModule('choice');f.registerAction('save',()=>f.state.put('x',1));
 await assert.rejects(failure.invoke('choice','save',{}),/disk/);
});
