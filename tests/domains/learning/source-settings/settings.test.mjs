import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostPorts} from '../../../../src/host/ports.mjs';
import {createWorkbench} from '../../../../src/core/workbench.mjs';
import {createLocalModules} from '../../../../src/core/local-modules.mjs';
import {discoverModules,mountModules} from '../../../../src/host/modules.mjs';
import {makeHandler} from '../../../../src/host/routes.mjs';
import {memoryPorts} from '../../../support/ports.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const calendar=new TextEncoder().encode('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nEND:VCALENDAR\r\n');
const profile={studyhub:{libraryRoot:'/fiction/library',subjectMap:{c:'anatomy'}},ics:{calendars:[{id:'a',path:'/fiction/a.ics',intervalMs:1234,timeZone:'Asia/Shanghai'},{id:'b',url:'https://calendar.invalid/private?token=fiction-secret',timeZone:'Asia/Shanghai'}]}};
const draft=(path='/fiction/new.ics',extra={})=>({kind:'ics',title:'日历',location:{type:'file',path},schedule:{mode:'manual'},timeZone:'Asia/Shanghai',...extra});
async function fixture(t,{initial=profile,rows=new Map(),ports=memoryPorts(),put,getService=()=>undefined}={}) {
  let writes=0;
  const locals=createLocalModules({get:k=>rows.get(k),put:async(k,v)=>{writes++;if(put)await put(k,v);rows.set(k,structuredClone(v));}});
  const wb=createWorkbench(ports),modules=await discoverModules(new URL('../../../../src/domains/',import.meta.url));
  const dispose=await mountModules(modules,{workbench:wb,ports,localModules:locals,config:{studyhub:initial.studyhub,'learning-ics':initial.ics},initialLearningSources:initial,getService});
  let origin;const server=createServer(makeHandler({workbench:wb,localModules:locals,getOrigin:()=>origin,modules:[],assets:new Map()}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await dispose();});
  const get=async(route='/metric?id=learning-source-settings')=>fetch(origin+'/learning-workbench'+route);
  const post=async(name,input)=>{const res=await fetch(origin+'/learning-workbench/action?module=learning-source-settings&name='+name,{method:'POST',headers:{'x-learning-workbench':'1'},body:JSON.stringify(input)});return {status:res.status,body:await res.json()};};
  const sync=async id=>{const res=await fetch(origin+'/learning-workbench/sync?source='+id,{method:'POST',headers:{'x-learning-workbench':'1'}});return {status:res.status,body:await res.json()};};
  return {wb,ports,rows,post,sync,get,dto:async()=> (await get()).json(),writes:()=>writes,dispose};
}
const error=(response,status,code)=>{assert.equal(response.status,status);assert.equal(response.body.error.code,code);};
test('profile inheritance is read-only; full persisted list wins, including disabled and empty',async t=>{
 const f=await fixture(t);const first=await f.dto();assert.equal(first.origin,'profile');assert.equal(first.revision,0);assert.equal(first.entries.length,3);assert.equal(f.writes(),0);
 assert.equal(f.wb.snapshot().sources.length,3);assert.equal(f.ports.control.timers.size,1);assert.deepEqual(first.entries[1].schedule,{mode:'interval',intervalMs:1234});
 assert.ok(first.entries.every(e=>e.entryId===`legacy:${e.sourceId}`));
 const a=first.entries[0];assert.equal((await f.post('source-set-enabled',{revision:0,entryId:a.entryId,enabled:false})).status,200);
 const persisted=structuredClone([...f.rows.values()][0]);assert.deepEqual(persisted.entries[0].adapter.subjectMap,{c:'anatomy'});
 const reopen=await fixture(t,{rows:f.rows,initial:{ics:{calendars:[{id:'extra',path:'/fiction/extra.ics'}]}}});assert.equal((await reopen.dto()).entries.length,3);assert.equal((await reopen.dto()).entries[0].enabled,false);
 let revision=1;for(const e of first.entries)assert.equal((await f.post('source-delete',{revision:revision++,entryId:e.entryId})).status,200);
 const empty=await fixture(t,{rows:f.rows});assert.deepEqual((await empty.dto()).entries,[]);assert.equal(empty.wb.snapshot().sources.length,0);
});
test('duplicate identities are invalid independently; new duplicate is rejected via POST',async t=>{
 const f=await fixture(t);error(await f.post('source-save',{revision:0,draft:{kind:'studyhub',title:'重复',location:{type:'library',path:'/fiction/../fiction/library'},schedule:{mode:'manual'}}}),409,'DUPLICATE_SOURCE');assert.equal(f.writes(),0);
 const d=await fixture(t,{initial:{ics:{calendars:[{id:'same',path:'/fiction/a.ics'},{id:'same',path:'/fiction/a.ics'}]}}});
 const value=await d.dto();assert.equal(new Set(value.entries.map(e=>e.entryId)).size,2);assert.ok(value.entries.every(e=>e.runtime.status==='invalid'));assert.equal(d.wb.snapshot().sources.length,0);
 assert.equal((await d.post('source-delete',{revision:0,entryId:value.entries[0].entryId})).status,200);
 const remaining=(await d.dto()).entries[0];assert.equal(remaining.runtime.status,'invalid');assert.equal(remaining.runtime.error.message,'重复已解除，重新保存或启用后生效');
 assert.equal(d.wb.snapshot().sources.filter(s=>s.registered).length,0);
 assert.equal((await d.post('source-save',{revision:1,entryId:remaining.entryId,draft:draft('/fiction/a.ics',{timeZone:undefined})})).status,200);
 assert.equal(d.wb.snapshot().sources.filter(s=>s.registered).length,1);
});
test('invalid inherited entry is retained, not registered, and can be repaired or deleted',async t=>{
 const f=await fixture(t,{initial:{ics:{calendars:[{id:'bad',path:'relative.ics'},{id:'ok',path:'/fiction/ok.ics'}]}}});
 const value=await f.dto();assert.equal(value.entries[0].runtime.error.code,'CONFIG_INVALID');assert.equal(f.wb.snapshot().sources.length,1);
 assert.equal((await f.post('source-save',{revision:0,entryId:value.entries[0].entryId,draft:draft(undefined,{timeZone:undefined})})).status,200);
 assert.equal(f.wb.snapshot().sources.length,2);
});
test('in-flight read rejects save, disable and delete with 409; same instance and settings survive',async t=>{
 const read=deferred(),entered=deferred(),ports=memoryPorts();ports.http.get=async()=>{entered.resolve();await read.promise;return {bytes:calendar};};
 const f=await fixture(t,{ports});const e=(await f.dto()).entries[2];const syncing=f.sync(e.sourceId);await entered.promise;
 for(const [name,input] of [['source-save',{draft:draft('',{location:{type:'url',operation:'keep'}})}],['source-set-enabled',{enabled:false}],['source-delete',{}]])error(await f.post(name,{revision:0,entryId:e.entryId,...input}),409,'BUSY');
 assert.equal(f.writes(),0);assert.equal((await f.dto()).revision,0);assert.equal(f.wb.snapshot().sources.find(s=>s.id===e.sourceId).registered,true);
 read.resolve();assert.equal((await syncing).status,200);
});
test('commit reserves IDs, timer skips and sync returns 409; first read waits a complete interval',async t=>{
 const gate=deferred(),entered=deferred(),ports=memoryPorts();let reads=0;ports.files.read=async()=>{reads++;return calendar;};
 const f=await fixture(t,{ports,put:async()=>{entered.resolve();await gate.promise;}});const e=(await f.dto()).entries[1];
 const saving=f.post('source-save',{revision:0,entryId:e.entryId,draft:draft('/fiction/a.ics',{schedule:{mode:'interval',intervalMs:1000}})});await entered.promise;
 error(await f.sync(e.sourceId),409,'BUSY');await ports.control.tick();assert.equal(reads,0);
 error(await f.post('source-delete',{revision:0,entryId:e.entryId}),409,'BUSY');
 assert.equal((await f.dto()).revision,0);gate.resolve();assert.equal((await saving).status,200);await ports.control.tick();assert.equal(reads,0);
 ports.control.setTime('2026-11-13T00:00:01Z');await ports.control.tick();assert.equal(reads,1);assert.equal(ports.control.timers.size,1);
});
test('definite put failure retains old instance/configuration; uncertain failure requires reload',async t=>{
 for(const certain of [true,false]) {
  const f=await fixture(t,{put:async()=>{throw Object.assign(Error('fiction-secret'),certain?{committed:false}:{});}});const e=(await f.dto()).entries[1];
  error(await f.post('source-save',{revision:0,entryId:e.entryId,draft:draft()}),500,'STORAGE_FAILED');
  assert.equal((await f.dto()).revision,0);assert.equal((await f.dto()).reloadRequired,!certain);assert.equal(f.wb.snapshot().sources.find(s=>s.id===e.sourceId).registered,true);assert.equal(f.ports.control.timers.size,1);
  error(await f.post('source-delete',{revision:0,entryId:e.entryId}),500,'STORAGE_FAILED');assert.equal(f.writes(),certain?2:1);
 }
});
test('timer allocation failure precedes persistence and leaves old source intact',async t=>{
 const f=await fixture(t);const e=(await f.dto()).entries[1];f.ports.clock.every=()=>{throw Error('allocation failed');};
 const response=await f.post('source-save',{revision:0,entryId:e.entryId,draft:draft('/fiction/a.ics',{schedule:{mode:'interval',intervalMs:500}})});
 assert.equal(response.status,422);assert.equal(f.writes(),0);assert.equal(f.ports.control.timers.size,1);assert.equal((await f.dto()).revision,0);
});
test('lost save response does not permit replay with an old revision; stale edit is 404 after refresh',async t=>{
 const f=await fixture(t,{initial:{}});await f.post('source-save',{revision:0,draft:draft()});assert.equal((await f.dto()).revision,1);
 error(await f.post('source-save',{revision:0,draft:draft()}),409,'REVISION_CONFLICT');assert.equal((await f.dto()).entries.length,1);
 const e=(await f.dto()).entries[0];await f.post('source-delete',{revision:1,entryId:e.entryId});error(await f.post('source-save',{revision:2,entryId:e.entryId,draft:draft()}),404,'NOT_FOUND');
});
test('location changes retain unavailable cache, disable and re-enable recover same ID',async t=>{
 const f=await fixture(t,{initial:{}});f.ports.files.read=async()=>calendar;
 const saved=await f.post('source-save',{revision:0,draft:draft()});const {entryId,sourceId}=saved.body;await f.sync(sourceId);
 const changed=await f.post('source-save',{revision:1,entryId,draft:draft('/fiction/other.ics')});assert.equal(changed.body.identityChanged,true);assert.notEqual(changed.body.sourceId,sourceId);
 assert.equal(f.wb.snapshot().sources.find(s=>s.id===sourceId).registered,false);assert.equal((await f.dto()).retainedCacheCount,1);
 const restored=await f.post('source-save',{revision:2,entryId,draft:draft()});assert.equal(restored.body.sourceId,sourceId);assert.ok((await f.dto()).entries[0].runtime.lastSuccessAt);
 await f.post('source-set-enabled',{revision:3,entryId,enabled:false});assert.equal(f.wb.snapshot().sources.find(s=>s.id===sourceId).registered,false);
 await f.post('source-set-enabled',{revision:4,entryId,enabled:true});assert.equal(f.wb.snapshot().sources.find(s=>s.id===sourceId).registered,true);
 assert.ok(f.ports.storage.list().every(s=>!('registered' in s)));
});
test('remote keep/replace and failed check never disclose URL in state/settings/results/logs',async t=>{
 const logs=[];t.mock.method(console,'log',(...args)=>logs.push(args));t.mock.method(console,'error',(...args)=>logs.push(args));t.mock.method(console,'warn',(...args)=>logs.push(args));
 const f=await fixture(t);f.ports.http.get=async()=>{throw Object.assign(Error(profile.ics.calendars[1].url),{code:'ENOENT'});};const value=await f.dto(),entry=value.entries[2];const replies=[value];
 replies.push(await f.post('source-save',{revision:0,entryId:entry.entryId,draft:draft('',{location:{type:'url',operation:'keep'}})}));
 assert.equal([...f.rows.values()][0].entries[2].adapter.url,profile.ics.calendars[1].url);
 replies.push(await f.post('source-check',{revision:1,entryId:entry.entryId}));assert.equal(replies.at(-1).body.code,'CHECK_FAILED');assert.equal(f.ports.storage.list().length,0);
 replies.push(await f.sync(entry.sourceId));replies.push(await (await f.get('/state')).json());
 replies.push(await f.dto());assert.equal(replies.at(-1).entries[2].runtime.error.code,'sync-failed');
 replies.push(await f.post('source-save',{revision:1,entryId:entry.entryId,draft:draft('',{location:{type:'url',operation:'replace',value:'https://calendar.invalid/changed?token=fiction-secret'}})}));
 error(await f.post('source-save',{revision:2,draft:draft('',{location:{type:'url',operation:'keep'}})}),400,'INVALID_INPUT');
 replies.push(await f.dto());assert.doesNotMatch(JSON.stringify([replies,logs]),/fiction-secret|calendar\.invalid/);
});
test('draft validation rejects unknown adapter fields, bad locations and schedule over real route',async t=>{
 const f=await fixture(t,{initial:{}});
 for(const value of [draft('relative'),draft('',{location:{type:'url',operation:'replace',value:'file:///fiction'}}),draft('',{schedule:{mode:'interval',intervalMs:0}}),draft('',{adapter:{url:'https://invalid'}}),draft('',{timeZone:'not-zone'}),draft('',{location:{type:'file',path:'/fiction/x',operation:'keep'}})])error(await f.post('source-save',{revision:0,draft:value}),400,'INVALID_INPUT');
 assert.equal(f.writes(),0);
});
test('StudyHub manual and interval only read on explicit check/sync or timer, checks use library read',async t=>{
 let reads=0;const f=await fixture(t,{initial:{studyhub:{libraryRoot:'/fiction/study'}},getService:()=>({forLibrary:()=>{reads++;throw Error('offline');}})});
 const e=(await f.dto()).entries[0];assert.equal(f.ports.control.timers.size,0);assert.equal(reads,0);
 const check=await f.post('source-check',{revision:0,entryId:e.entryId});assert.equal(check.body.code,'CHECK_FAILED');assert.equal(reads,1);assert.equal(f.ports.storage.list().length,0);
 assert.equal((await f.post('source-save',{revision:0,entryId:e.entryId,draft:{kind:'studyhub',title:'库',location:{type:'library',path:'/fiction/study'},schedule:{mode:'interval',intervalMs:1000}}})).status,200);
 assert.equal(reads,1);await f.ports.control.tick();assert.equal(reads,1);f.ports.control.setTime('2026-11-13T00:00:01Z');await f.ports.control.tick();assert.equal(reads,2);
 await f.post('source-save',{revision:1,entryId:e.entryId,draft:{kind:'studyhub',title:'库',location:{type:'library',path:'/fiction/study'},schedule:{mode:'manual'}}});assert.equal(f.ports.control.timers.size,0);
});
test('subject query is validated only for learning-summary and no arbitrary options are forwarded',async t=>{
 const f=await fixture(t,{initial:{}});f.wb.registerMetric({id:'options',domain:'learning',compute:({options})=>options});
 for(const filter of ['{','null','{"mode":"x"}','{"mode":"subject","subjectRef":""}','{"mode":"all","extra":1}']){const r=await f.get('/metric?id=learning-summary&subject='+encodeURIComponent(filter));assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_INPUT');}
 assert.deepEqual(await (await f.get('/metric?id=options&subject=bad')).json(),{});
 assert.equal((await f.get('/metric?id=learning-summary&subject='+encodeURIComponent('{"mode":"all"}'))).status,200);
});
test('unknown settings schema refuses settings actions and never reimports profile',async t=>{
 const rows=new Map([[JSON.stringify(['learning-source-settings','settings']),{schemaVersion:99,entries:[]}]]);
 const f=await fixture(t,{rows});assert.equal(f.wb.snapshot().sources.length,0);assert.equal((await f.get()).status,400);
 error(await f.post('source-delete',{revision:0,entryId:'unknown'}),400,'INVALID_INPUT');assert.equal(f.writes(),0);
});
test('invalid legacy public fields do not echo a subscription URL',async t=>{
 const secret='https://calendar.invalid/?token=fiction-secret';
 const f=await fixture(t,{initial:{studyhub:{libraryRoot:secret},ics:{calendars:[{id:'invalid',url:secret,title:secret,timeZone:secret,intervalMs:secret}]}}});
 const value=await f.dto();assert.ok(value.entries.every(e=>e.runtime.status==='invalid'));assert.doesNotMatch(JSON.stringify(value),/fiction-secret|calendar\.invalid/);
});
test('invalid unregistered entry can be disabled without creating an instance',async t=>{
 const f=await fixture(t,{initial:{ics:{calendars:[{id:'broken',path:'relative'}]}}});const e=(await f.dto()).entries[0];
 assert.equal((await f.post('source-set-enabled',{revision:0,entryId:e.entryId,enabled:false})).status,200);
 assert.equal((await f.dto()).entries[0].enabled,false);assert.equal(f.wb.snapshot().sources.length,0);
});
test('successful draft check is read-only and does not register or start a timer',async t=>{
 const f=await fixture(t,{initial:{}});f.ports.files.read=async()=>calendar;
 const checked=await f.post('source-check',{revision:0,draft:draft(undefined,{schedule:{mode:'interval',intervalMs:1000}})});
 assert.deepEqual(checked,{status:200,body:{ok:true,code:'CHECK_OK',recordCount:0,warnings:[]}});
 assert.equal(f.writes(),0);assert.equal(f.ports.storage.list().length,0);assert.equal(f.wb.snapshot().sources.length,0);assert.equal(f.ports.control.timers.size,0);
});

test('local ICS ENOENT check is read-only and failed sync preserves the last successful snapshot',async t=>{
 const root=await mkdtemp(join(tmpdir(),'fiction-ics-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const path=join(root,'calendar.ics'),ports=memoryPorts();ports.files=hostPorts(new Map()).files;
 const f=await fixture(t,{initial:{},ports});
 const missing={status:200,body:{ok:false,code:'PATH_NOT_FOUND',warnings:[]}};
 assert.deepEqual(await f.post('source-check',{revision:0,draft:draft(path)}),missing);
 assert.equal(f.writes(),0);assert.deepEqual(ports.storage.list(),[]);
 const saved=await f.post('source-save',{revision:0,draft:draft(path)});assert.equal(saved.status,200);
 const {entryId,sourceId}=saved.body;
 assert.deepEqual(await f.post('source-check',{revision:1,entryId}),missing);
 assert.equal(f.writes(),1);assert.deepEqual(ports.storage.list(),[]);
 await writeFile(path,'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//fiction//EN\r\nBEGIN:VEVENT\r\nUID:fiction-event\r\nDTSTART;VALUE=DATE:20261120\r\nSUMMARY:fiction exam\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
 assert.equal((await f.sync(sourceId)).status,200);
 const previous=ports.storage.list()[0];assert.ok(previous.records.length>0);
 await unlink(path);assert.equal((await f.sync(sourceId)).status,502);
 assert.deepEqual((await f.dto()).entries[0].runtime.error,{code:'PATH_NOT_FOUND',message:'找不到该文件，请确认路径'});
 assert.deepEqual(ports.storage.list()[0].records,previous.records);
 assert.equal(ports.storage.list()[0].lastSuccessAt,previous.lastSuccessAt);
 await writeFile(path,'not a calendar');
 assert.deepEqual(await f.post('source-check',{revision:1,entryId}),{status:200,body:{ok:false,code:'CHECK_FAILED',warnings:[]}});
 assert.equal((await f.sync(sourceId)).status,502);
 assert.equal((await f.dto()).entries[0].runtime.error.code,'sync-failed');
 assert.deepEqual(ports.storage.list()[0].records,previous.records);
});

test('non-ENOENT local ICS errors and StudyHub ENOENT retain generic failures',async t=>{
 for(const code of ['EACCES','EISDIR']) {
  const ports=memoryPorts();ports.files.read=async()=>{throw Object.assign(Error('fiction read failed'),{code});};
  const f=await fixture(t,{initial:{},ports});
  assert.equal((await f.post('source-check',{revision:0,draft:draft()})).body.code,'CHECK_FAILED');
  const saved=await f.post('source-save',{revision:0,draft:draft()});
  assert.equal((await f.sync(saved.body.sourceId)).status,502);
  assert.equal((await f.dto()).entries[0].runtime.error.code,'sync-failed');
 }
 const f=await fixture(t,{initial:{studyhub:{libraryRoot:'/fiction/study'}},getService:()=>({forLibrary:()=>{throw Object.assign(Error('missing library'),{code:'ENOENT'});}})});
 const entry=(await f.dto()).entries[0];
 assert.equal((await f.post('source-check',{revision:0,entryId:entry.entryId})).body.code,'CHECK_FAILED');
 assert.equal((await f.sync(entry.sourceId)).status,502);
 assert.equal((await f.dto()).entries[0].runtime.error.code,'sync-failed');
});
