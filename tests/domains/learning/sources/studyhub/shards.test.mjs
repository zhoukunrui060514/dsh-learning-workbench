import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readShards } from '../../../../../src/domains/learning/sources/studyhub/shards.mjs';
const now='2026-11-13T00:00:00Z';
function fixture(){
 const libraryRoot=path.resolve('/library');
 const index={format:'study-sharded',version:5,shards:{decks:['decks/d.hash.json'],attempts:['attempts/0.hash.json']}};
 const deck={id:'d',courseId:'a',cards:[{id:'x',review:{repetitions:1,due_at:'2026-11-12T23:00:00Z'}},{id:'y',review:{repetitions:1,due_at:'2026-11-14T00:00:00Z'}},{id:'new',review:{repetitions:0,due_at:'2026-11-12T00:00:00Z'}},{id:'off',suspended:true,review:{repetitions:1,due_at:now}}]};
 const attempts=[{id:'a1',deckId:'d',quiz_id:'x',timestamp:'2026-11-12T23:30:00Z',grade:4,assessment:'graded',elapsed_ms:1500},{id:'a2',deckId:'d',quiz_id:'x',timestamp:now,grade:5,assessment:'self',retry:true}];
 const files=new Map([[path.join(libraryRoot,'study-workspace.json'),index],[path.join(libraryRoot,'shards','decks/d.hash.json'),deck],[path.join(libraryRoot,'shards','attempts/0.hash.json'),attempts]]);
 const reads=[];return {index,deck,attempts,reads,options:{libraryRoot,files:{read:async p=>{reads.push(p);if(!files.has(p))throw Error('missing shard');return new TextEncoder().encode(JSON.stringify(files.get(p)));}},courses:[{id:'a',name:'解剖',active:true}],timeZone:'Asia/Shanghai',now}};
}
test('v5 decks and attempt chunks produce scheduled detail and event history without question content',async()=>{
 const f=fixture();const r=await readShards(f.options);
 assert.ok(r.records.every(row=>row.sourceSubjectName==='解剖'));
 const ids=r.records.map(row=>[row.kind,row.externalId,row.sourceSubjectRef]);
 f.options.courses[0].name='人体解剖';const renamed=await readShards(f.options);
 assert.ok(renamed.records.every(row=>row.sourceSubjectName==='人体解剖'));
 assert.deepEqual(renamed.records.map(row=>[row.kind,row.externalId,row.sourceSubjectRef]),ids);
 const due=r.records.filter(r=>r.kind==='due-item');assert.equal(due.length,2);assert.equal(due[0].data.count,1);assert.equal(due[1].data.due.at,'2026-11-14T00:00:00.000Z');
 const reviews=r.records.filter(r=>r.kind==='review-event');assert.equal(reviews.length,2);assert.equal(reviews[0].data.localDate,'2026-11-13');assert.equal(reviews[0].data.correct,true);assert.equal(reviews[0].data.durationSeconds,1.5);assert.equal(reviews[1].data.correct,null);assert.equal(reviews[1].data.durationSeconds,null);
 assert.equal(reviews[0].sourceSubjectRef,'a');assert.equal(reviews[0].subjectRef,null);assert.equal(reviews[0].data.itemRef,due[0].data.itemRef);
 assert.deepEqual(r.capabilities,['review-event','due-item']);assert.equal(f.reads.filter(p=>p.endsWith('study-workspace.json')).length,4);
});
test('unknown manifest format or version emits a warning and never opens shards',async()=>{
 for(const change of [{version:6},{format:'other'}]){const f=fixture();Object.assign(f.index,change);const r=await readShards(f.options);assert.deepEqual(r.records,[]);assert.deepEqual(r.capabilities,[]);assert.equal(r.warnings[0].code,'studyhub-shards-unsupported');assert.equal(f.reads.length,1);}
});
test('archived decks and parked courses are excluded from due counts, not from actual event history',async()=>{
 for(const change of ['archived','parked']){const f=fixture();if(change==='archived')f.deck.archived=true;else f.options.courses[0].active=false;const r=await readShards(f.options);assert.equal(r.records.filter(x=>x.kind==='due-item').length,0);assert.equal(r.records.filter(x=>x.kind==='review-event').length,2);}
});
test('broken chunks and escaping shard names reject instead of claiming zero',async()=>{
 const f=fixture();f.index.shards.attempts=['../private.json'];await assert.rejects(readShards(f.options),/shard path/);
 const g=fixture();g.attempts[0].timestamp='not-time';await assert.rejects(readShards(g.options),/timestamp/);
 const h=fixture();h.index.shards.decks=['decks/missing.json'];await assert.rejects(readShards(h.options),/missing shard/);
});
test('a concurrent manifest replacement rejects the mixed snapshot without retry',async()=>{
 const f=fixture();const original=f.options.files.read;let indexes=0;
 f.options.files.read=async p=>{if(p.endsWith('study-workspace.json')&&++indexes===2)f.index.revision=2;return original(p);};
 await assert.rejects(readShards(f.options),/changed during read/);assert.equal(indexes,2);
});
test('unassigned history has no invented course id and legacy course name wins over stale id',async()=>{
 const f=fixture();f.deck.course='';let r=await readShards(f.options);
 assert.equal(r.records[0].subjectRef,null);assert.equal(Object.hasOwn(r.records[0],'sourceSubjectRef'),false);
 f.deck.course='Old Anatomy';f.options.courses[0].aliases=['Old Anatomy'];r=await readShards(f.options);
 assert.equal(r.records[0].sourceSubjectRef,'a');
});
