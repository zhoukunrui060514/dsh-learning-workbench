import {createLocalModules} from '../../src/core/local-modules.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import { discoverModules, mountModules } from '../../src/host/modules.mjs';
import { createWorkbench } from '../../src/core/workbench.mjs';
import { memoryPorts } from '../support/ports.mjs';
test('example is opt-in; discovered domain goes source -> store -> metric and unregisters',async()=>{
 const root=new URL('../../src/domains/',import.meta.url);
 const ids=(await discoverModules(root)).map(m=>m.id);assert.ok(ids.includes('learning'));assert.ok(!ids.includes('example'));
 const modules=await discoverModules(root,{includeExample:true});assert.ok(modules.some(m=>m.id==='example'));
 const ports=memoryPorts(),wb=createWorkbench(ports);const dispose=await mountModules(modules,{workbench:wb,ports,localModules:createLocalModules({get:()=>undefined,put:async()=>{}}),config:{},getService:()=>undefined});
 await wb.sync('example-daily');const result=wb.metric('example-summary');
 assert.equal(result.total,5);assert.equal(result.points.length,2);assert.equal(wb.snapshot().sources.find(s=>s.id==='example-daily').records.length,2);
 await dispose();assert.equal(wb.snapshot().domains.length,0);await wb.close();
});
test('example metric ignores other record kinds retained in the same domain',async()=>{
 const ports=memoryPorts();await ports.storage.put('retired',{id:'retired',domain:'example',title:'Old',kind:'fixture',capabilities:[],records:[{kind:'deadline',externalId:'old',data:{date:'2026-12-01'}}],status:'ready'});
 const wb=createWorkbench(ports);const modules=await discoverModules(new URL('../../src/domains/',import.meta.url),{includeExample:true});
 const dispose=await mountModules(modules,{workbench:wb,ports,localModules:createLocalModules({get:()=>undefined,put:async()=>{}}),config:{}});await wb.sync('example-daily');assert.equal(wb.metric('example-summary').total,5);await dispose();await wb.close();
});
