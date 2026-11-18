import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSource } from '../../../../../src/domains/learning/sources/studyhub/module.mjs';
import { createWorkbench } from '../../../../../src/core/workbench.mjs';
import { memoryPorts } from '../../../../support/ports.mjs';
import { recordKinds } from '../../../../../src/domains/learning/records.mjs';
function fixture(){
 const libraryRoot=path.resolve('/library');
 const ports=memoryPorts(),workbench=createWorkbench(ports);workbench.registerDomain({id:'learning',title:'学习',recordKinds});
 const course={id:'a',name:'Test',exam:{date:'2026-12-01'},active:true};
 let runtime={forLibrary(root){assert.equal(root,libraryRoot);return {call:async(action,args)=>{
  if(action==='library.context')return {timeZone:'Asia/Shanghai'};
  if(action==='course.list')return {courses:[course]};
  if(action==='course.get')return course;
  if(action==='course.focusProgress')return {course:args.course,topics:[]};
  throw Error('write action forbidden');
 }}}};
 const setIndex=version=>ports.control.files.set(path.join(libraryRoot,'study-workspace.json'),new TextEncoder().encode(JSON.stringify({format:'study-sharded',version,shards:{decks:[],attempts:[]}})));
 setIndex(5);
 return {ports,workbench,setIndex,course,context:{ports,workbench,config:{libraryRoot},getService:name=>{assert.equal(name,'studyRuntime');return runtime;}},offline(){runtime=undefined;}};
}
test('source survives absent optional service and unconfigured module does not register',async()=>{
 const f=fixture();setup({...f.context,config:{}});assert.equal(f.workbench.snapshot().sources.length,0);
 const source=createSource(f.context);f.offline();assert.deepEqual(await source.check(),{ok:false,detail:'StudyHub studyRuntime 服务未加载'});
 f.workbench.registerSource(source);await assert.rejects(f.workbench.sync(source.id),/unavailable/);assert.equal(f.workbench.snapshot().sources[0].status,'error');
});
test('source uses replace snapshots and removes obsolete shard data on unsupported version with warning',async()=>{
 const f=fixture();const off=setup(f.context);const id=f.workbench.snapshot().sources[0].id;
 let r=await f.workbench.sync(id);assert.equal(r.status,'ready');assert.ok(r.capabilities.includes('due-item'));
 // Persist a previous shard record to demonstrate replacement, not hiding behind an empty fixture.
 const previous=f.ports.control.rows.get(id);previous.records.push({kind:'due-item',externalId:'old',domain:'learning',sourceId:id,data:{count:1}});
 f.setIndex(6);r=await f.workbench.sync(id);assert.equal(r.records.length,2);assert.equal(r.error,null);assert.equal(r.warnings[0].code,'studyhub-shards-unsupported');assert.ok(!r.capabilities.includes('due-item'));
 assert.equal(r.records.find(x=>x.kind==='deadline').sourceSubjectRef,'a');off();
});
test('library identity changes with its root, and no relative library path is accepted',()=>{
 const f=fixture();assert.notEqual(createSource(f.context).id,createSource({...f.context,config:{libraryRoot:path.resolve('/other')}}).id);
 assert.throws(()=>createSource({...f.context,config:{libraryRoot:'relative'}}),/absolute/);
});

test('course display name reaches metrics on resync without changing record identities',async()=>{
 const {computeLearning}=await import('../../../../../src/domains/learning/metrics/compute.mjs');
 const f=fixture();setup(f.context);const id=f.workbench.snapshot().sources[0].id;
 const first=await f.workbench.sync(id);
 assert.ok(first.records.every(r=>r.sourceSubjectName==='Test'));
 const identities=first.records.map(r=>[r.sourceId,r.kind,r.externalId,r.sourceSubjectRef]);
 f.course.name='Renamed';const next=await f.workbench.sync(id);
 assert.deepEqual(next.records.map(r=>[r.sourceId,r.kind,r.externalId,r.sourceSubjectRef]),identities);
 assert.ok(next.records.every(r=>r.sourceSubjectName==='Renamed'));
 const value=computeLearning({sources:f.workbench.snapshot().sources,records:next.records,now:f.ports.clock.now()});
 assert.equal(value.unmapped[0].sourceSubjectName,'Renamed');
 assert.ok(value.mastery.every(m=>m.sourceSubjectName==='Renamed'));
});

function setup(context){if(!context.config.libraryRoot)return;return context.workbench.registerSource(createSource(context));}
