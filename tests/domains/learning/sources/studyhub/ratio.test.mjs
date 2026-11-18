import test from 'node:test';
import assert from 'node:assert/strict';
import { retrievability,courseRatios } from '../../../../../src/domains/learning/sources/studyhub/ratio.mjs';
const now='2026-11-13T00:10:00Z',timeZone='Asia/Shanghai';
test('FSRS-6 threshold, new cards and legacy SM2 memory state use the official curve',()=>{
 assert.equal(retrievability({stability:1,difficulty:5,last_review:'2026-11-12T00:10:00Z'},{now,timeZone}),0.9);
 assert.equal(retrievability({stability:1,difficulty:5,last_review:now},{now,timeZone}),1);
 assert.equal(retrievability({interval_days:1,due_at:now},{now,timeZone}),0.9);
 assert.equal(retrievability({interval_days:1},{now,timeZone}),0.9);
 assert.equal(retrievability({repetitions:0,interval_days:0},{now,timeZone}),null);
 // Local calendar days, not 24-hour periods: these two instants straddle midnight in Shanghai.
 assert.equal(retrievability({stability:1,difficulty:5,last_review:'2026-11-12T15:59:00Z'},{now:'2026-11-12T16:01:00Z',timeZone}),0.9);
 assert.throws(()=>retrievability({}, {now,timeZone,settings:{w:[1]}}),/weights/);
});
test('ratio denominator includes new cards but excludes suspended, archived and system cards; empty is unknown',()=>{
 const courses=[{id:'a',name:'A'},{id:'b',name:'B'}];
 const decks=[{id:'d',courseId:'a',cards:[{id:'learned',review:{stability:1,difficulty:5,last_review:now}},{id:'new',review:{}},{id:'off',suspended:true,review:{}}]},{id:'old',courseId:'a',archived:true,cards:[{id:'x'}]}];
 const records=courseRatios({decks,courses,courseOf:d=>courses.find(c=>c.id===d.courseId),now,timeZone});
 assert.equal(records[0].data.value,0.5);assert.equal(records[0].data.numerator,1);assert.equal(records[0].data.denominator,2);
 assert.equal(records[1].data.value,null);assert.equal(records[1].data.denominator,null);
 assert.equal(records[0].data.scale,'ratio');assert.match(records[0].data.method,/0.9/);
});
test('matches all frozen official 4.6.0 scheduler reference cases (including custom clipped weights)',async()=>{
 const {readFile}=await import('node:fs/promises');
 const reference=JSON.parse(await readFile(new URL('./ratio-reference.json',import.meta.url),'utf8'));
 assert.equal(reference.cases.length,44);
 for(const {review,settings,expected} of reference.cases)assert.equal(retrievability(review,{now:reference.now,timeZone:reference.timeZone,settings}),expected,JSON.stringify({review,settings}));
});

test('all new cards have no individual estimate but course threshold coverage remains zero',()=>{
 const course={id:'new',name:'New'};
 const review={repetitions:0,interval_days:0};
 assert.equal(retrievability(review,{now,timeZone}),null);
 const [row]=courseRatios({decks:[{cards:[{id:'card',review}]}],courses:[course],courseOf:()=>course,now,timeZone});
 assert.equal(row.data.value,0);assert.equal(row.data.numerator,0);assert.equal(row.data.denominator,1);
});
