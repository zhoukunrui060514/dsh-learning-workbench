// Run only in a new isolated directory; makes fictional sources and profile patch.
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]);
const data=join(root,'data'),library=join(data,'library');
await mkdir(join(library,'shards','decks'),{recursive:true});await mkdir(join(library,'shards','attempts'),{recursive:true});
const courses=['biology','chemistry','unmapped'];
await writeFile(join(library,'study-workspace.json'),JSON.stringify({format:'study-sharded',version:5,shards:{decks:courses.map(c=>`decks/${c}.json`),attempts:['attempts/demo.json']}}));
for(const c of courses)await writeFile(join(library,'shards','decks',c+'.json'),JSON.stringify({id:c,courseId:c,cards:[{id:'card-1',review:{due_at:'2026-11-16T00:00:00Z',repetitions:2,interval_days:2,stability:4,difficulty:5,last_review:'2026-11-14T00:00:00Z'}}]}));
await writeFile(join(library,'shards','attempts','demo.json'),JSON.stringify(courses.flatMap((c,i)=>Array.from({length:3},(_,n)=>({id:`${c}-${n}`,deckId:c,quiz_id:'card-1',timestamp:`2026-11-${13+n}T01:00:00Z`,assessment:'graded',grade:4,correct:true,elapsed_ms:1000*(i+1)})))));
const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Fictional Workbench Acceptance//EN\r\nBEGIN:VEVENT\r\nUID:demo-exam\r\nDTSTART;VALUE=DATE:20261125\r\nSUMMARY:学习通考试：示例生理学\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
await writeFile(join(data,'local.ics'),ics);await writeFile(join(data,'remote.ics'),ics.replace('demo-exam','remote-exam'));
await copyFile(new URL('./fixtures/study-runtime.mjs',import.meta.url),join(root,'study-runtime.mjs'));
const patch=[{insert:[{id:'upgrade-fixture',name:join(root,'study-runtime.mjs').replaceAll('\\','/'),config:{}}]},{id:'learning-workbench',config:{modules:{studyhub:{libraryRoot:library},'learning-ics':{calendars:[{id:'legacy-file',title:'示例课程日历',path:join(data,'local.ics'),timeZone:'Asia/Shanghai'}]}}}}];
await writeFile(join(root,'home','profiles','v02-rc1','cordis.patch.yml'),JSON.stringify(patch,null,2));
console.log('fictional profile and sources prepared');
