// Explicit stages around package install/restart; evidence stays outside git.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {get,post,action,metric} from './http.mjs';
const [stage,directory]=process.argv.slice(2),root=resolve(directory),evidence=join(root,'evidence');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(['local.ics','remote.ics','library/study-workspace.json'].map(async p=>[p,digest(await readFile(join(root,'data',p)))])));
const keys=['subjects','mappings','goals','localExams','pairs'];
if(stage==='baseline'){
 const initial=await get('state');assert.equal(initial.sources.length,2);
 for(const s of initial.sources)await post('sync?source='+encodeURIComponent(s.id));
 const state=await get('state');assert(state.sources.every(s=>s.status==='ready'&&s.records.length>0));
 const study=state.sources.find(s=>s.kind==='studyhub');
 for(const [course,subjectRef,name] of [['biology','legacy-biology','示例生理学'],['chemistry','legacy-chemistry','示例药理学']])await action('save-mapping',{sourceId:study.id,sourceSubjectRef:course,subjectRef,name});
 await action('save-goal',{subjectRef:'legacy-biology',timeZone:'Asia/Shanghai',count:17});
 await action('save-exam',{id:'legacy-manual',title:'旧版手工考试',subjectRef:'legacy-biology',due:{at:'2026-11-25T10:30:00+08:00',timeZone:'Asia/Shanghai'}});
 const manual=JSON.stringify(['local','legacy-manual']);
 await action('save-range',{examId:manual,remaining:42,unit:'question'});
 const before=await metric(),other=before.allExams.find(e=>e.sourceId===study.id);
 await action('confirm-pair',{ids:[manual,other.id],same:false});
 await writeFile(join(evidence,'baseline.json'),JSON.stringify({state:await get('state'),metric:await metric(),hashes:await hashes()},null,2));
 console.log('PASS 0.1.1 sync + subjects/mappings/goal/manual exam/range/pair saved');
}else if(stage==='upgrade'){
 const old=JSON.parse(await readFile(join(evidence,'baseline.json'),'utf8')),state=await get('state'),current=await metric(),settings=await get('metric?id=learning-source-settings');
 assert.equal(settings.origin,'profile');assert.equal(settings.revision,0);
 assert.deepEqual(settings.entries.map(e=>e.sourceId).sort(),old.state.sources.map(s=>s.id).sort());
 for(const oldSource of old.state.sources){const source=state.sources.find(s=>s.id===oldSource.id);assert.equal(source.registered,true);assert.deepEqual(source.records,oldSource.records);}
 for(const key of keys)assert.deepEqual(current[key],old.metric[key],key);
 assert.equal(current.allExams.find(e=>e.id==='["local","legacy-manual"]').remaining,42);
 assert.deepEqual(await hashes(),old.hashes);
 const created=await action('subject-create',{name:'免ID示例学科'});assert.match(created.subject.id,/^subject_/);
 const exam=await action('exam-create',{title:'免ID示例考试',subjectRef:created.subject.id,due:{date:'2026-12-05',timeZone:'Asia/Shanghai'}});assert.match(exam.exam.id,/^exam_/);
 const remote=await action('source-save',{revision:0,draft:{kind:'ics',title:'受控HTTP日历',location:{type:'url',operation:'replace',value:'http://127.0.0.1:3111/fixture.ics'},timeZone:'Asia/Shanghai',schedule:{mode:'manual'}}},'learning-source-settings');
 await post('sync?source='+encodeURIComponent(remote.sourceId));
 const disabled=await action('source-save',{revision:remote.revision,draft:{kind:'ics',title:'已停用的演示日历',location:{type:'file',path:join(root,'data','local.ics')},timeZone:'Asia/Shanghai',schedule:{mode:'manual'}}},'learning-source-settings');
 await action('source-set-enabled',{revision:disabled.revision,entryId:disabled.entryId,enabled:false},'learning-source-settings');
 const expected={settings:await get('metric?id=learning-source-settings'),metric:await metric(),hashes:await hashes()};
 assert.equal(expected.settings.origin,'workbench');assert.equal(expected.settings.revision,3);
 assert.deepEqual(expected.hashes,old.hashes);
 await writeFile(join(evidence,'upgraded.json'),JSON.stringify(expected,null,2));
 console.log('PASS upgrade identities/snapshots/choices + ID-free actions + remote ICS + persisted source settings');
}else throw Error('expected baseline or upgrade stage');
