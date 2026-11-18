import test from 'node:test';
import assert from 'node:assert/strict';
import {computeLearning} from '../../../../src/domains/learning/metrics/compute.mjs';
const now='2026-11-13T01:00:00Z',sh='Asia/Shanghai',la='America/Los_Angeles';
const source=(id,registered=true)=>({id,domain:'learning',title:`来源${id}`,registered,status:'ready'});
const row=(kind,id,subjectRef,data,sourceId='study',extra={})=>({kind,externalId:id,subjectRef,data,sourceId,observedAt:now,...extra});
const due=(id,subjectRef,date,count,unit='question',timeZone=sh)=>row('due-item',id,subjectRef,{due:{date,timeZone},count,unit,itemRef:null});
const review=(id,subjectRef,date,timeZone=sh)=>row('review-event',id,subjectRef,{localDate:date,timeZone,itemRef:id,occurredAt:now,correct:true,durationSeconds:1});
const exam=(id,subjectRef,title='期末',sourceId='study')=>row('deadline',id,subjectRef,{type:'exam',title,due:{date:'2026-11-15',timeZone:sh}},sourceId);
const mastery=(id,subjectRef,value,method='recall')=>row('mastery-snapshot',id,subjectRef,{asOf:now,topicRef:null,value,scale:'ratio',numerator:null,denominator:null,method});
const records=[
 due('a','a','2026-11-13',7),due('a-old','a','2026-11-12',3),due('b','b','2026-11-12',4,'card',la),due('u',null,'2026-11-13',2),
 review('a1','a','2026-11-11'),review('a2','a','2026-11-12'),review('a3','a','2026-11-13'),review('b1','b','2026-11-12',la),review('u1',null,'2026-11-13'),
 mastery('ma','a',.7),mastery('mb','b',.4,'other'),mastery('mu',null,null),exam('ea','a'),exam('eb','b','另一场'),exam('eu',null,'未映射考试'),
].map(r=>({...r,sourceSubjectRef:r.subjectRef??'unmapped-course',sourceSubjectName:r.subjectRef==='a'?'来源学科A':r.subjectRef==='b'?'来源学科B':'未映射课程'}));
const local={subjects:[{id:'a',name:'本地A'},{id:'unused',name:'无数据学科'}],mappings:[{sourceId:'retired',sourceSubjectRef:'old',subjectRef:'a'}],
 exams:[{id:'manual',title:'手工考试',subjectRef:'a',due:{at:'2026-11-16T12:00:00+08:00',timeZone:sh}}],
 goals:[{subjectRef:null,timeZone:sh,count:10},{subjectRef:'a',timeZone:sh,count:5},{subjectRef:'b',timeZone:la,count:6}],
 pairs:[{ids:['["retired","old-exam"]','["study","ea"]'],same:true}]};
const compute=subject=>computeLearning({records,sources:[source('study'),source('retired',false)],now,local,options:subject?{subject}:{}});
test('all, subject and unmapped recompute due, review days/streak, mastery and exams with units/timezones intact',()=>{
 const all=compute(),a=compute({mode:'subject',subjectRef:'a'}),b=compute({mode:'subject',subjectRef:'b'}),u=compute({mode:'unmapped'});
 assert.deepEqual(all.filter,{mode:'all'});assert.deepEqual(all.due.totals.map(d=>[d.unit,d.timeZone,d.today,d.backlog]),[['question',sh,9,3],['card',la,4,0]]);
 assert.deepEqual(a.due.totals.map(d=>[d.unit,d.today,d.backlog]),[['question',7,3]]);assert.equal(a.due.totals[0].forecast[0].value,7);
 assert.deepEqual(b.due.totals.map(d=>[d.unit,d.timeZone,d.today]),[['card',la,4]]);assert.equal(u.due.totals[0].today,2);
 assert.deepEqual(a.reviews.totals[0].points,[{date:'2026-11-11',value:1},{date:'2026-11-12',value:1},{date:'2026-11-13',value:1}]);assert.equal(a.reviews.totals[0].streak,3);
 assert.equal(all.reviews.totals[0].today,2);assert.equal(u.reviews.totals[0].today,1);assert.equal(u.reviews.totals[0].streak,1);assert.equal(b.reviews.totals[0].date,'2026-11-12');
 assert.equal(all.mastery.length,3);assert.equal(a.mastery[0].summary.value,.7);assert.equal(b.mastery[0].method,'other');assert.equal(u.mastery[0].summary.value,null);
 assert.deepEqual(a.exams.map(e=>e.title),['期末','手工考试']);assert.deepEqual(b.exams.map(e=>e.title),['另一场']);assert.deepEqual(u.exams.map(e=>e.title),['未映射考试']);
 assert.equal(a.plans.length,1);assert.equal(a.plans[0].subjectRef,'a');assert.equal(a.plans[0].actual,1);assert.equal(a.plans[0].remaining,4);assert.equal(b.plans.length,1);assert.equal(u.plans.length,0);
 assert.equal(all.plans.find(p=>p.subjectRef===null).actual,2);
});
test('filter preserves complete options and editing directories, with inactive mapping and pair markers',()=>{
 const all=compute(),filtered=compute({mode:'subject',subjectRef:'a'});
 for(const name of ['subjectOptions','mappingRows','pairDetails','subjects','mappings','unmapped','localExams','goals','pairs','allExams','sources'])assert.deepEqual(filtered[name],all[name],name);
 assert.deepEqual(all.subjectOptions,[{id:'a',name:'本地A',origin:'local'},{id:'unused',name:'无数据学科',origin:'local'},{id:'b',name:'来源学科B',origin:'source'}]);
 assert.equal(all.mappingRows.find(r=>r.sourceSubjectRef==='a').editable,false);assert.equal(all.mappingRows.find(r=>r.sourceSubjectRef==='unmapped-course').origin,'unmapped');
 const old=all.mappingRows.find(r=>r.sourceId==='retired');assert.equal(old.active,false);assert.equal(old.editable,false);assert.equal(old.origin,'local');
 assert.equal(all.pairDetails[0].active,false);assert.equal(all.pairDetails[0].exams[0],null);assert.equal(all.pairDetails[0].exams[1].title,'期末');
});
test('inactive caches are excluded while enabled error sources keep last successful data',()=>{
 const active=source('study');active.status='error';active.lastSuccessAt='2026-11-12T00:00:00Z';
 const stale=records.map(r=>({...r,sourceId:'retired',subjectRef:'stale'}));
 const v=computeLearning({records:[...records,...stale],sources:[active,source('retired',false)],now});
 assert.equal(v.due.totals[0].today,9);assert.equal(v.mastery.length,3);assert.equal(v.exams.length,3);assert.equal(v.subjectOptions.some(s=>s.id==='stale'),false);
 assert.deepEqual(v.sources,[{id:'study',title:'来源study',status:'error',lastSuccessAt:active.lastSuccessAt}]);
 const none=computeLearning({records:stale,sources:[source('retired',false)],now});assert.equal(none.due,null);assert.equal(none.reviews,null);assert.equal(none.mastery,null);assert.equal(none.exams,null);
 assert.equal(computeLearning({records,now}).due,null); // missing registration metadata never revives a source
 const absent=compute({mode:'subject',subjectRef:'unused'});assert.equal(absent.due,null);assert.equal(absent.reviews,null);assert.equal(absent.mastery,null);assert.equal(absent.exams,null);
});
test('mapping resolves before filter, explicit source mapping wins and no course row is invented',()=>{
 const mapped={...due('mapped',null,'2026-11-13',5),sourceSubjectRef:'course'},explicit={...due('explicit','b','2026-11-13',8),sourceSubjectRef:'explicit'},canonical=due('canonical','c','2026-11-13',9);
 const choices={mappings:[{sourceId:'study',sourceSubjectRef:'course',subjectRef:'a'},{sourceId:'study',sourceSubjectRef:'explicit',subjectRef:'a'}]};
 const v=computeLearning({records:[mapped,explicit,canonical],sources:[source('study')],now,local:choices,options:{subject:{mode:'subject',subjectRef:'a'}}});
 assert.equal(v.due.totals[0].today,5);assert.equal(v.mappingRows.length,2);assert.equal(v.mappingRows[0].origin,'local');assert.equal(v.mappingRows[1].origin,'source');assert.equal(v.mappingRows[1].subjectRef,'b');
});
test('deduplication resolves on full active set before filtering, candidates require both visible ends',()=>{
 const a=exam('a','a','同名','a-source'),b=exam('b','b','同名','b-source'),sources=[source('a-source'),source('b-source')];
 const ids=['["a-source","a"]','["b-source","b"]'];
 const v=computeLearning({records:[a,b],sources,now,local:{pairs:[{ids,same:true}]},options:{subject:{mode:'subject',subjectRef:'b'}}});
 assert.deepEqual(v.exams,[]);assert.equal(v.allExams.length,2);assert.equal(v.pairDetails[0].active,true);assert.equal(v.pairDetails[0].exams.length,2);
 const unconfirmed=computeLearning({records:[a,b],sources,now});assert.equal(unconfirmed.candidates.length,1);
 const filtered=computeLearning({records:[a,b],sources,now,options:{subject:{mode:'subject',subjectRef:'b'}}});assert.equal(filtered.candidates.length,0);
 const retired=computeLearning({records:[a,b],sources:[source('a-source',false),source('b-source')],now,local:{pairs:[{ids,same:true}]}});assert.equal(retired.exams.length,1);assert.equal(retired.pairDetails[0].active,false);
});
