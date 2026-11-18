import test from 'node:test';
import assert from 'node:assert/strict';
import { readActions } from '../../../../../src/domains/learning/sources/studyhub/actions.mjs';
const now='2026-11-13T00:00:00Z';
function fixture(){
 const calls=[];
 const courses=[{id:'a',name:'解剖',exam:{date:'2026-12-05'}},{id:'b',name:'生理'}];
 const library={async call(action,args){calls.push([action,args]);
  if(action==='library.context')return {timeZone:'Asia/Shanghai'};
  if(action==='course.list')return {courses};
  if(action==='course.get')return courses.find(c=>c.id===args.id);
  if(action==='course.focusProgress')return {course:args.course,topics:args.course==='解剖'?[{topic:'骨骼',cards:2,mastery:60},{topic:'神经',cards:0,mastery:0}]:[]};
  throw Error('unexpected action');
 }};
 return {calls,courses,library};
}
test('official exams and weighted topic levels keep course identity, local date and missing evidence',async()=>{
 const {library,calls}=fixture();
 const {records,timeZone}=await readActions({library,now,subjectMap:{a:'anatomy'}});
 assert.equal(timeZone,'Asia/Shanghai');
 assert.deepEqual(records.filter(r=>r.kind==='deadline'),[{kind:'deadline',externalId:'exam:a',sourceSubjectRef:'a',sourceSubjectName:'解剖',subjectRef:'anatomy',observedAt:now,data:{title:'解剖考试',type:'exam',due:{date:'2026-12-05',timeZone}}}]);
 const levels=records.filter(r=>r.kind==='mastery-snapshot');
 assert.deepEqual(levels.map(r=>r.data.value),[60,null,null]);
 assert.equal(levels[0].data.scale,'weighted-level');assert.equal(levels[0].data.denominator,null);
 assert.equal(levels[2].subjectRef,null);assert.equal(levels[2].sourceSubjectRef,'b');
 assert.deepEqual(calls.filter(([a])=>a==='course.focusProgress').map(([,args])=>args),[{course:'解剖'},{course:'生理'}]);
 assert.deepEqual([...new Set(calls.map(([a])=>a))].sort(),['course.focusProgress','course.get','course.list','library.context']);
});
test('invalid official dates and mismatched course responses reject rather than publish invented data',async()=>{
 const f=fixture();f.courses[0].exam.date='2026-02-30';
 await assert.rejects(readActions({library:f.library,now}),/date/);
 const g=fixture();const original=g.library.call.bind(g.library);
 g.library.call=async(a,args)=>a==='course.focusProgress'?{course:'wrong',topics:[]}:original(a,args);
 await assert.rejects(readActions({library:g.library,now}),/course/);
});
