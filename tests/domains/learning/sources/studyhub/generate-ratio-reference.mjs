// One-off fixture generation from the verified release; not part of normal tests.
// TZ=Asia/Shanghai node <this-file> /path/to/official-4.6.0/package/lib/sm2.js
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source=await readFile(process.argv[2]);
const sha256=createHash('sha256').update(source).digest('hex');
if(sha256!=='94338040e0a7ef4853433245d78f57b142f1403eeef8b70d6b25526f05a1bdaa')throw Error('reference scheduler hash mismatch');
if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Asia/Shanghai')throw Error('run with TZ=Asia/Shanghai');
const api=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {algorithm,dayDiff};').toString('base64'));
const now='2026-11-13T00:10:00Z';
const reviews=[{}, {interval_days:1}, {interval_days:4,due_at:'2026-11-15T00:10:00Z'},
 {stability:1,difficulty:5,last_review:'2026-11-12T00:10:00Z'},
 {stability:0.0001,difficulty:5,last_review:'2026-11-10T00:10:00Z'},
 {stability:40000,difficulty:5,last_review:'2026-01-01T00:10:00Z'},
 {stability:2.3,difficulty:5,last_review:'2026-11-12T15:59:00Z'},
 {stability:2.3,difficulty:5,last_review:'2026-11-12T16:01:00Z'},
 {stability:2.3,difficulty:5,last_review:'2026-11-14T16:01:00Z'},
 {stability:2.3,difficulty:5},
 {stability:2.3,difficulty:0,interval_days:3,due_at:'2026-11-12T00:10:00Z'}];
const cases=[];
for(const w20 of [null,0.1,0.8,1])for(const review of reviews){
 const settings=w20===null?{}:{w:api.FSRS6_WEIGHTS.map((w,i)=>i===20?w20:w)};
 const memory=api.memoryState(review,Date.parse(now));
 const elapsed=memory.isNew||memory.lastReview===null?0:Math.max(0,api.dayDiff(memory.lastReview,Date.parse(now)));
 const expected=memory.isNew?null:api.algorithm(api.checkSettings(settings)).forgettingCurve(elapsed,memory.stability);
 cases.push({review,settings,expected});
}
await writeFile(new URL('./ratio-reference.json',import.meta.url),JSON.stringify({sha256,now,timeZone:'Asia/Shanghai',cases},null,2)+'\n');
console.log(`Generated ${cases.length} cases from verified official scheduler`);
