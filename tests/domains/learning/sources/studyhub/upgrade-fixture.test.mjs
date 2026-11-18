import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createSource} from '../../../../../src/domains/learning/sources/studyhub/module.mjs';
import {computeLearning} from '../../../../../src/domains/learning/metrics/compute.mjs';
import {apply} from '../../../../integration/fixtures/study-runtime.mjs';

test('upgrade fixture has learned memory states and coherent topic levels without inventing a course summary',async t=>{
 const root=await mkdtemp(join(tmpdir(),'workbench-mastery-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'home','profiles','v02-rc1'),{recursive:true});
 execFileSync(process.execPath,[new URL('../../../../integration/prepare.mjs',import.meta.url).pathname,root]);
 let runtime;apply({provide(name,value){assert.equal(name,'studyRuntime');runtime=value;}});
 const now='2026-11-15T10:12:01.882Z';
 const source=createSource({config:{libraryRoot:join(root,'data','library')},ports:{files:{read:readFile},clock:{now:()=>now}},getService:()=>runtime});
 const {records}=await source.read();
 const ratios=records.filter(r=>r.data.scale==='ratio');
 assert.equal(ratios.length,3);
 for(const r of ratios){assert.equal(r.data.value,1);assert.equal(r.data.numerator,1);assert.equal(r.data.denominator,1);assert.ok(r.data.method.includes(`local calendar days in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`));}
 for(const course of ['biology','chemistry','unmapped']){
  const deck=JSON.parse(await readFile(join(root,'data','library','shards','decks',course+'.json')));
  const progress=await runtime.forLibrary().call('course.focusProgress',{course});
  assert.equal(progress.topics[0].cards,deck.cards.length);
  // Official cardLevel: successful reviewed card with interval below 6 days is learning (.45).
  assert.equal(deck.cards[0].review.interval_days,2);
  assert.equal(progress.topics[0].mastery,45);
 }
 const value=computeLearning({now,records:records.map(r=>({...r,sourceId:source.id})),sources:[{id:source.id,domain:'learning',registered:true}]});
 for(const m of value.mastery.filter(m=>m.scale==='weighted-level')){assert.equal(m.summary,null);assert.equal(m.topics[0].value,45);assert.equal(m.weakTopics[0].value,45);}
});
