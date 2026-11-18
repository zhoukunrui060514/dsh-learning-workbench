import test from 'node:test';
import assert from 'node:assert/strict';
import {computeLearning} from '../../../../src/domains/learning/metrics/compute.mjs';
export const now='2026-11-13T01:00:00Z';
export const row=(kind,externalId,data,extra={})=>({kind,externalId,data,sourceId:'study',subjectRef:'biology',observedAt:now,...extra});
const due=(id,date,count,itemRef=null)=>row('due-item',id,{due:{date,timeZone:'Asia/Shanghai'},count,unit:'question',itemRef});
const review=(id,date,tz='Asia/Shanghai',itemRef=id)=>row('review-event',id,{occurredAt:`${date}T23:30:00+08:00`,localDate:date,timeZone:tz,itemRef,correct:null,durationSeconds:null});
export function fixture(){return [due('old','2026-11-12',3),due('bucket','2026-11-13',8),due('detail','2026-11-13',1,'q1'),due('future','2026-11-14',4),review('a','2026-11-11'),review('b','2026-11-12'),review('c','2026-11-13')];}
test('remaining due buckets replace overlapping details; backlog is not reduced by reviews',()=>{
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:fixture(),now});
 const d=v.due.totals[0];assert.equal(d.today,8);assert.equal(d.backlog,3);assert.equal(d.forecast.length,14);assert.deepEqual(d.forecast.slice(0,2),[{date:'2026-11-13',value:8},{date:'2026-11-14',value:4}]);assert.equal(v.reviews.totals[0].today,1);assert.equal(v.reviews.totals[0].streak,3);
});
test('learning days remain in their own timezone; yesterday may continue a streak',()=>{
 const records=[review('a','2026-11-11','America/Los_Angeles'),review('b','2026-11-12','America/Los_Angeles'),review('c','2026-11-13')];
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records,now});assert.deepEqual(v.reviews.totals.map(x=>[x.timeZone,x.date,x.today,x.streak]),[['America/Los_Angeles','2026-11-12',1,2],['Asia/Shanghai','2026-11-13',1,1]]);
 const yesterday=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[review('y','2026-11-12')],now});assert.equal(yesterday.reviews.totals[0].streak,1);
});
test('absent kinds are unknown; empty forecast days are zero only within available due data',()=>{
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[],now});assert.equal(v.due,null);assert.equal(v.reviews,null);assert.equal(v.mastery,null);assert.equal(v.exams,null);
 assert.equal(computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:fixture(),now}).due.totals[0].forecast[13].value,0);
});
test('mastery groups preserve source, method, scale and latest measurement per topic',()=>{
 const m=(id,topicRef,value,scale='ratio',asOf=now)=>row('mastery-snapshot',id,{asOf,topicRef,value,scale,numerator:null,denominator:null,method:scale==='ratio'?'recall':'level 0–5'});
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[m('a',null,.8),m('b','heart',.2),m('c','lung',.6),m('d',null,4,'weighted-level'),m('e','heart',.1,'ratio','2026-11-12T01:00:00Z'),m('f','unknown',null)],now});
 assert.equal(v.mastery.length,2);assert.equal(v.mastery[0].summary.value,.8);assert.deepEqual(v.mastery[0].weakTopics.map(x=>[x.topicRef,x.value]),[['heart',.2],['lung',.6]]);assert.equal(v.mastery[1].summary.value,4);assert.equal(v.mastery[0].trend.length,5);
});
test('date exams count local calendar days including DST and today, ranges require user input',()=>{
 const exam=row('deadline','exam',{title:'期末',type:'exam',due:{date:'2026-11-12',timeZone:'America/Los_Angeles'}});
 let v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[exam],now});assert.equal(v.exams[0].days,0);assert.equal(v.exams[0].dailyNeeded,null);
 v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[exam],now,local:{examRanges:[{examId:'["study","exam"]',remaining:9,unit:'question'}]}});assert.equal(v.exams[0].dailyNeeded,9);
 const dst=row('deadline','dst',{title:'DST',type:'exam',due:{date:'2026-11-02',timeZone:'America/New_York'}});assert.equal(computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[dst],now:'2026-11-01T04:30:00Z'}).exams[0].days,1);
});
test('goals compare review events only, and mapping resolves source IDs without name merging',()=>{
 const records=fixture().map(r=>({...r,subjectRef:null,sourceSubjectRef:'course1'}));
 const local={subjects:[{id:'bio',name:'生物'}],mappings:[{sourceId:'study',sourceSubjectRef:'course1',subjectRef:'bio'}],goals:[{subjectRef:'bio',timeZone:'Asia/Shanghai',count:5}]};
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records,now,local});assert.equal(v.plans[0].actual,1);assert.equal(v.plans[0].remaining,4);assert.equal(v.plans[0].target,5);assert.equal(v.due.subjects[0].subjectRef,'bio');
});
test('unmapped source courses do not discard each other’s detail records; units stay separate',()=>{
 const a={...due('bucket','2026-11-13',8),subjectRef:null,sourceSubjectRef:'a'};
 const b={...due('detail','2026-11-13',1,'q'),subjectRef:null,sourceSubjectRef:'b'};
 const card=due('card','2026-11-13',2);card.data.unit='card';
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[a,b,card],now});assert.deepEqual(v.due.totals.map(x=>[x.unit,x.today]),[['question',9],['card',2]]);
});
test('mastery for unmapped courses remains separate rather than choosing one as latest',()=>{
 const data={asOf:now,topicRef:null,value:.5,scale:'ratio',numerator:1,denominator:2,method:'recall'};
 const records=['a','b'].map(sourceSubjectRef=>row('mastery-snapshot',sourceSubjectRef,data,{subjectRef:null,sourceSubjectRef}));
 assert.equal(computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records,now}).mastery.length,2);
});
test('pair confirmation cannot hide the sole remaining exam when its counterpart disappears',()=>{
 const records=[row('deadline','exam',{title:'期末',type:'exam',due:{date:'2026-11-15',timeZone:'Asia/Shanghai'}})];
 const v=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records,now,local:{pairs:[{ids:['["local","deleted"]','["study","exam"]'],same:true}]}});assert.equal(v.exams.length,1);
});
test('instant expiry uses the timestamp, while future instants and date-only today remain actionable',()=>{
 const cases=[
  {due:{at:'2026-11-13T08:00:00+08:00',timeZone:'Asia/Shanghai'},days:-0,expired:true,needed:null},
  {due:{at:'2026-11-13T10:00:00+08:00',timeZone:'Asia/Shanghai'},days:1,expired:false,needed:9},
  {due:{date:'2026-11-13',timeZone:'Asia/Shanghai'},days:0,expired:false,needed:9},
 ];
 for(const c of cases){
  const record=row('deadline','exam',{title:'边界考试',type:'exam',due:c.due});
  const exam=computeLearning({sources:[{id:'study',domain:'learning',registered:true}],records:[record],now:'2026-11-13T01:00:00Z',local:{examRanges:[{examId:'["study","exam"]',remaining:9,unit:'question'}]}}).exams[0];
  assert.equal(exam.dailyNeeded,c.needed);assert.equal(exam.expired,c.expired);assert.equal(exam.days,c.days);
 }
});
