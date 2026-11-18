import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createWorkbench} from '../../../../src/core/workbench.mjs';
import {createLocalModules} from '../../../../src/core/local-modules.mjs';
import {makeHandler} from '../../../../src/host/routes.mjs';
import {memoryPorts} from '../../../support/ports.mjs';
import {domains} from '../../../../src/domains/learning/module.mjs';
import {setup,id as moduleId} from '../../../../src/domains/learning/views/module.mjs';
const at='2026-11-13T00:00:00Z',zone='Asia/Shanghai',date={date:'2026-11-15',timeZone:zone};
const localKey=JSON.stringify([moduleId,'choices']);
async function harness(t,{choices={},fail=false}={}) {
 const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain(domains[0]);
 const records=[{kind:'due-item',externalId:'due',subjectRef:null,sourceSubjectRef:'course',sourceSubjectName:'课程',observedAt:at,data:{due:date,count:7,unit:'card',itemRef:null}},
 {kind:'deadline',externalId:'exam',subjectRef:'canonical',sourceSubjectRef:'explicit',observedAt:at,data:{title:'期末',type:'exam',due:date}}];
 const unregister=wb.registerSource({id:'study',domain:'learning',kind:'fixture',title:'学习库',capabilities:()=>[],read:async()=>({records,fetchedAt:at})});await wb.sync('study');
 const rows=new Map([[localKey,structuredClone(choices)]]);let writes=0;
 const locals=createLocalModules({get:k=>rows.get(k),put:async(k,v)=>{writes++;if(fail)throw Error('disk');rows.set(k,structuredClone(v));}});
 const off=setup({workbench:wb,ports,...locals.forModule(moduleId)});
 let origin;const server=createServer(makeHandler({workbench:wb,localModules:locals,getOrigin:()=>origin,modules:[],assets:new Map()}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await locals.remove(moduleId);off();await wb.close();});
 const post=async(name,input)=>{const r=await fetch(origin+`/learning-workbench/action?module=${moduleId}&name=${name}`,{method:'POST',headers:{'x-learning-workbench':'1'},body:JSON.stringify(input)});return {status:r.status,body:await r.json()};};
 const metric=async subject=>{const r=await fetch(origin+'/learning-workbench/metric?id=learning-summary'+(subject?'&subject='+encodeURIComponent(JSON.stringify(subject)):''));assert.equal(r.status,200);return r.json();};
 return {post,metric,wb,unregister,records,rows,choices:()=>structuredClone(rows.get(localKey)),writes:()=>writes};
}
const saved=response=>{assert.equal(response.status,200);assert.equal(response.body.saved,true);return response.body;};
const rejected=response=>{assert.equal(response.status,422);assert.equal(typeof response.body.error,'string');};
test('POST creates distinct server IDs for same-name subjects and exams, then updates existing exam',async t=>{
 const h=await harness(t);const first=saved(await h.post('subject-create',{name:' 同名 '})).subject,second=saved(await h.post('subject-create',{name:'同名'})).subject;
 assert.match(first.id,/^subject_[0-9a-f-]{36}$/);assert.notEqual(first.id,second.id);assert.equal(first.name,'同名');
 const data={title:'期末',subjectRef:first.id,due:date};const a=saved(await h.post('exam-create',data)).exam,b=saved(await h.post('exam-create',data)).exam;
 assert.match(a.id,/^exam_[0-9a-f-]{36}$/);assert.notEqual(a.id,b.id);assert.equal(h.choices().exams.length,2);
 const edited=saved(await h.post('exam-update',{...a,title:'改名',due:{date:'2026-11-16',timeZone:zone}})).exam;assert.equal(edited.id,a.id);assert.equal(h.choices().exams.length,2);
 rejected(await h.post('exam-create',{id:'client-id',...data}));rejected(await h.post('exam-update',{id:'missing',...data}));
 rejected(await h.post('subject-create',{id:'client-id',name:'x'}));
});
test('mapping-set creates subject and mapping in one durable write, failed write leaves neither',async t=>{
 const input={sourceId:'study',sourceSubjectRef:'course',target:{create:{name:'新学科'}}};
 const h=await harness(t);const body=saved(await h.post('mapping-set',input));assert.match(body.subjectId,/^subject_/);assert.equal(h.writes(),1);
 assert.deepEqual(h.choices().subjects,[{id:body.subjectId,name:'新学科'}]);assert.deepEqual(h.choices().mappings,[{sourceId:'study',sourceSubjectRef:'course',subjectRef:body.subjectId}]);
 assert.equal((await h.metric({mode:'subject',subjectRef:body.subjectId})).due.subjects[0].subjectRef,body.subjectId);
 const failed=await harness(t,{fail:true});rejected(await failed.post('mapping-set',input));assert.equal(failed.writes(),1);assert.deepEqual(failed.choices(),{});
});
test('mapping can target an existing canonical option and removal preserves its local subject',async t=>{
 const h=await harness(t,{choices:{subjects:[{id:'local',name:'本地'}]}});
 saved(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'course',target:{existingId:'canonical'}}));assert.equal(h.choices().mappings[0].subjectRef,'canonical');
 saved(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'course',target:{existingId:'local'}}));saved(await h.post('mapping-remove',{sourceId:'study',sourceSubjectRef:'course'}));assert.deepEqual(h.choices().subjects,[{id:'local',name:'本地'}]);assert.deepEqual(h.choices().mappings,[]);
 rejected(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'course',target:{existingId:'local',create:{name:'both'}}}));
 rejected(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'course',target:{}}));
 rejected(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'course',target:{existingId:'unknown'}}));
});
test('explicit mappings cannot be reassigned or removed; canonical naming only accepts active known IDs',async t=>{
 const h=await harness(t);const before=h.choices();
 rejected(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'explicit',target:{create:{name:'override'}}}));
 rejected(await h.post('mapping-remove',{sourceId:'study',sourceSubjectRef:'explicit'}));assert.deepEqual(h.choices(),before);
 saved(await h.post('subject-rename',{subjectId:'canonical',name:'来源学科名称'}));assert.deepEqual(h.choices().subjects,[{id:'canonical',name:'来源学科名称'}]);
 assert.deepEqual((await h.metric()).subjectOptions.find(s=>s.id==='canonical'),{id:'canonical',name:'来源学科名称',origin:'local'});
 rejected(await h.post('subject-rename',{subjectId:'invented',name:'不存在'}));
});
test('legacy subject rename and exam update preserve old IDs, goal/range/pair refs and instant due kind',async t=>{
 const instant={at:'2026-11-15T10:30:00+08:00',timeZone:zone},examId='["local","old-exam"]';
 const choices={subjects:[{id:'old-subject',name:'旧名'}],mappings:[{sourceId:'study',sourceSubjectRef:'course',subjectRef:'old-subject'}],
 goals:[{subjectRef:'old-subject',timeZone:zone,count:8}],exams:[{id:'old-exam',title:'期末',subjectRef:'old-subject',due:instant}],
 examRanges:[{examId,remaining:10,unit:'question'}],pairs:[{ids:[examId,'["study","exam"]'],same:false}]};
 const h=await harness(t,{choices});saved(await h.post('subject-rename',{subjectId:'old-subject',name:'新名'}));
 const due={...instant,at:'2026-11-16T10:30:00+08:00'};const edited=saved(await h.post('exam-update',{id:'old-exam',title:'新考试名',subjectRef:'old-subject',due}));
 assert.equal(edited.exam.id,'old-exam');assert.deepEqual(edited.exam.due,due);assert.equal('date' in edited.exam.due,false);
 for(const key of ['goals','examRanges','pairs','mappings'])assert.deepEqual(h.choices()[key],choices[key]);
 assert.equal((await h.metric()).allExams.find(e=>e.id===examId).remaining,10);
});
test('old save-mapping/save-exam still work and implicit all equals explicit all over HTTP',async t=>{
 const h=await harness(t);saved(await h.post('save-mapping',{sourceId:'study',sourceSubjectRef:'course',subjectRef:'legacy',name:'旧客户端'}));
 saved(await h.post('save-exam',{id:'legacy-exam',title:'旧手工考试',subjectRef:'legacy',due:date}));
 const all=await h.metric();assert.deepEqual(all,await h.metric({mode:'all'}));assert.equal(all.localExams[0].id,'legacy-exam');assert.equal(all.mappingRows.find(r=>r.sourceSubjectRef==='course').origin,'local');
});
test('unregistered cache cannot be mapped, renamed as canonical, ranged or paired by current()',async t=>{
 const h=await harness(t);h.unregister();
 rejected(await h.post('mapping-set',{sourceId:'study',sourceSubjectRef:'course',target:{create:{name:'stale'}}}));
 rejected(await h.post('save-mapping',{sourceId:'study',sourceSubjectRef:'course',subjectRef:'stale',name:'stale'}));
 rejected(await h.post('subject-rename',{subjectId:'canonical',name:'stale'}));
 rejected(await h.post('save-range',{examId:'["study","exam"]',remaining:1,unit:'card'}));
 saved(await h.post('exam-create',{title:'local',subjectRef:null,due:date}));const manual=(await h.metric()).allExams[0];
 rejected(await h.post('confirm-pair',{ids:[manual.id,'["study","exam"]'],same:true}));
 assert.equal((await h.metric()).due,null);assert.equal((await h.metric()).sources.length,0);
});

for(const removal of ['unregister','sync-empty'])test(`manual exam subject survives ${removal} for filtering and both edit actions`,async t=>{
 const h=await harness(t),due={at:'2026-11-20T10:30:00+08:00',timeZone:zone};
 const exam={id:'old-exam',title:'旧手工考试',subjectRef:'canonical',due};
 saved(await h.post('save-exam',exam));
 const examId=JSON.stringify(['local',exam.id]);
 saved(await h.post('save-range',{examId,remaining:12,unit:'question'}));
 saved(await h.post('confirm-pair',{ids:[examId,'["study","exam"]'],same:false}));
 const before=h.choices(),writes=h.writes();
 if(removal==='unregister')h.unregister();
 else {h.records.length=0;await h.wb.sync('study');}
 for(const filter of [{mode:'all'},{mode:'unmapped'},{mode:'subject',subjectRef:'canonical'}]){
  const result=await h.metric(filter);
  assert.deepEqual(result.subjectOptions,[{id:'canonical',name:'canonical',origin:'local'}]);
  assert.equal(result.localExams.length,1);assert.equal(result.allExams.length,1);
  assert.equal(result.exams?.length??0,filter.mode==='unmapped'?0:1);
  assert.equal(result.due,null);
 }
 assert.equal(h.writes(),writes);assert.deepEqual(h.choices(),before);
 rejected(await h.post('subject-rename',{subjectId:'canonical',name:'不可补名'}));
 for(const action of ['exam-update','save-exam']){
  saved(await h.post(action,{...exam,title:action}));
  assert.deepEqual(h.choices().exams,[{...exam,title:action}]);
  assert.deepEqual(h.choices().examRanges,before.examRanges);
  assert.deepEqual(h.choices().pairs,before.pairs);
 }
 saved(await h.post('remove-exam',{id:exam.id}));
 assert.deepEqual((await h.metric()).subjectOptions,[]);
 rejected(await h.post('save-exam',exam));
});
