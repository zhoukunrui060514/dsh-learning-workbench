import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {hostPorts} from '../../src/host/ports.mjs';
import {createWorkbench} from '../../src/core/workbench.mjs';
import {createLocalModules} from '../../src/core/local-modules.mjs';
import {makeHandler} from '../../src/host/routes.mjs';
import {domains} from '../../src/domains/learning/module.mjs';
import {setup} from '../../src/domains/learning/source-settings/module.mjs';
const month=2592000000,maxDelay=2147483647;
test('actual host clock saves and restores a 30-day source without overflow, then reads at full intervals and cancels',async t=>{
 const snapshots=new Map(),settings=new Map();let reads=0,wb,locals,off;
 const table={entries:()=>snapshots.entries(),put:async(id,value)=>snapshots.set(id,structuredClone(value))};
 const ports=hostPorts(table);
 ports.files.read=async()=>{reads++;return new TextEncoder().encode('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//fixture//EN\r\nEND:VCALENDAR\r\n');};
 function mount(){
  wb=createWorkbench(ports);wb.registerDomain(domains[0]);
  locals=createLocalModules({get:k=>settings.get(k),put:async(k,v)=>settings.set(k,structuredClone(v))});
  off=setup({workbench:wb,ports,...locals.forModule('learning-source-settings'),initialLearningSources:{}});
 }
 async function unmount(){await locals.remove('learning-source-settings');await wb.close();off();}
 mount();let origin;
 const server=createServer((req,res)=>makeHandler({workbench:wb,localModules:locals,getOrigin:()=>origin,modules:[],assets:new Map()})(req,res));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await unmount();server.closeAllConnections();await new Promise(r=>server.close(r));});
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:Date.parse('2026-11-13T00:00:00Z')});
 const delays=[];
 // Record the actual host clock's calls. Node clamps values beyond maxDelay to 1ms.
 for(const name of ['setTimeout','setInterval']){
  const original=globalThis[name];t.mock.method(globalThis,name,(fn,delay,...args)=>{delays.push(delay);return original(fn,delay,...args);});
 }
 const response=await fetch(origin+'/learning-workbench/action?module=learning-source-settings&name=source-save',{method:'POST',headers:{'x-learning-workbench':'1'},body:JSON.stringify({revision:0,draft:{kind:'ics',title:'monthly',location:{type:'file',path:'/fiction/calendar.ics'},timeZone:'Asia/Shanghai',schedule:{mode:'interval',intervalMs:month}}})});
 assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
 assert.ok(delays.every(delay=>delay<=maxDelay),'host must never hand Node an overflowing delay');
 assert.equal(reads,0);await unmount();delays.length=0;mount();
 assert.deepEqual(delays,[maxDelay]);
 t.mock.timers.tick(30);assert.equal(reads,0);assert.deepEqual(delays,[maxDelay]);
 t.mock.timers.tick(maxDelay-30);assert.equal(reads,0);assert.deepEqual(delays,[maxDelay,month-maxDelay]);
 t.mock.timers.tick(month-maxDelay-1);assert.equal(reads,0);
 t.mock.timers.tick(1);assert.equal(reads,1);await wb.sync(wb.snapshot().sources[0].id); // join the timer's in-flight read
 t.mock.timers.tick(maxDelay);assert.equal(reads,1);t.mock.timers.tick(month-maxDelay);assert.equal(reads,2);await wb.sync(wb.snapshot().sources[0].id);
 await unmount();const calls=delays.length;t.mock.timers.tick(month*2);assert.equal(reads,2);assert.equal(delays.length,calls);
});
test('host clock accepts safe integer maximum without overflow and stop cancels the remaining chunks',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const clock=hostPorts({}).clock;let reads=0;const delays=[];
 for(const name of ['setTimeout','setInterval']){const original=globalThis[name];t.mock.method(globalThis,name,(fn,delay)=>{delays.push(delay);return original(fn,delay);});}
 const stop=clock.every(Number.MAX_SAFE_INTEGER,()=>reads++);
 assert.deepEqual(delays,[maxDelay]);t.mock.timers.tick(maxDelay);assert.deepEqual(delays,[maxDelay,maxDelay]);assert.equal(reads,0);
 stop();t.mock.timers.tick(maxDelay);assert.equal(reads,0);assert.equal(delays.length,2);
});
