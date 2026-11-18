import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkbench} from '../../../../src/core/workbench.mjs';
import {createLocalModules} from '../../../../src/core/local-modules.mjs';
import {memoryPorts} from '../../../support/ports.mjs';
import * as module from '../../../../src/domains/learning/views/module.mjs';
import {domains} from '../../../../src/domains/learning/module.mjs';
const at='2026-11-13T00:00:00Z';
async function harness(rows=new Map(),fail=false){
 const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain(domains[0]);
 wb.registerSource({id:'study',domain:'learning',kind:'fixture',capabilities:()=>[],read:async()=>({fetchedAt:at,records:[{kind:'due-item',externalId:'d',sourceSubjectRef:'course1',subjectRef:null,observedAt:at,data:{due:{date:'2026-11-13',timeZone:'Asia/Shanghai'},count:7,unit:'card',itemRef:null}},...['exam'].map(id=>({kind:'deadline',externalId:id,subjectRef:null,observedAt:at,data:{title:'期末',type:'exam',due:{date:'2026-11-15',timeZone:'Asia/Shanghai'}}}))]})});await wb.sync('study');
 let writes=0;const local=createLocalModules({get:k=>structuredClone(rows.get(k)),put:async(k,v)=>{writes++;if(fail)throw Error('disk');rows.set(k,structuredClone(v));}});
 const off=module.setup({workbench:wb,ports,...local.forModule(module.id)});
 return {wb,rows,local,writes:()=>writes,invoke:(name,input)=>local.invoke(module.id,name,input),close:async()=>{await local.remove(module.id);off();await wb.close();}};
}
test('mapping and goals persist across module rebuild; repeated GET computes without writes',async()=>{
 const h=await harness();await h.invoke('save-mapping',{sourceId:'study',sourceSubjectRef:'course1',subjectRef:'bio',name:'生物'});await h.invoke('save-goal',{subjectRef:'bio',timeZone:'Asia/Shanghai',count:8});
 assert.equal(h.wb.metric('learning-summary').due.subjects[0].subjectRef,'bio');const writes=h.writes();h.wb.metric('learning-summary');h.wb.metric('learning-summary');assert.equal(h.writes(),writes);await h.close();
 const reopened=await harness(h.rows);assert.equal(reopened.wb.metric('learning-summary').due.subjects[0].subjectRef,'bio');assert.equal(reopened.wb.metric('learning-summary').plans[0].target,8);assert.equal(reopened.writes(),0);await reopened.close();
});
test('manual exams and explicit pair confirmation stay local; range supplies needed quantity',async()=>{
 const h=await harness();await h.invoke('save-exam',{id:'manual',title:'期末',subjectRef:null,due:{date:'2026-11-15',timeZone:'Asia/Shanghai'}});
 let v=h.wb.metric('learning-summary');assert.equal(v.exams.length,2);assert.equal(v.candidates.length,1);
 await h.invoke('confirm-pair',{ids:v.candidates[0].ids,same:true});v=h.wb.metric('learning-summary');assert.equal(v.exams.length,1);assert.equal(v.candidates.length,0);
 await h.invoke('save-range',{examId:v.exams[0].id,remaining:11,unit:'question'});assert.equal(h.wb.metric('learning-summary').exams[0].dailyNeeded,6);
 assert.equal(h.wb.snapshot().sources[0].records.length,2);await assert.rejects(h.invoke('confirm-pair',{ids:['missing','also-missing'],same:true}));await h.close();
});
test('invalid local inputs are rejected and failed durable save is not reported successful',async()=>{
 const h=await harness();await assert.rejects(h.invoke('save-goal',{subjectRef:null,count:-1,timeZone:'Asia/Shanghai'}));await assert.rejects(h.invoke('save-exam',{id:'bad',title:'bad',subjectRef:null,due:{date:'2026-02-30',timeZone:'Asia/Shanghai'}}));assert.equal(h.writes(),0);await h.close();
 const failed=await harness(new Map(),true);await assert.rejects(failed.invoke('save-goal',{subjectRef:null,count:8,timeZone:'Asia/Shanghai'}),/disk/);assert.equal(failed.wb.metric('learning-summary').plans.length,0);await failed.close();
});
