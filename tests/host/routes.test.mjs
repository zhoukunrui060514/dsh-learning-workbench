import test from 'node:test';import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { makeHandler } from '../../src/host/routes.mjs';
import { createWorkbench } from '../../src/core/workbench.mjs';
import { memoryPorts } from '../support/ports.mjs';
test('HTTP shares source, importer and metric path while enforcing origin and request size',async(t)=>{
 const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain({id:'x',title:'x',recordKinds:['x']});
 wb.registerImporter({id:'file',domain:'x',kind:'file',title:'File',capabilities:()=>['import'],import:async file=>({mode:'merge',records:[{kind:'x',externalId:file.name,observedAt:ports.clock.now(),data:{value:new TextDecoder().decode(file.bytes)}}],fetchedAt:ports.clock.now()})});
 wb.registerMetric({id:'count',domain:'x',compute:({records})=>records.length});
 let origin;const server=createServer(makeHandler({workbench:wb,getOrigin:()=>origin,modules:[],assets:new Map(),maxImportBytes:8}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await wb.close();});
 const post=body=>fetch(origin+'/learning-workbench/import?source=file&name=a.txt',{method:'POST',headers:{'x-learning-workbench':'1'},body});
 assert.equal((await post('7')).status,200);assert.equal((await post('7')).status,200);
 assert.equal(await (await fetch(origin+'/learning-workbench/metric?id=count')).json(),1);
 assert.equal((await post('123456789')).status,413);
 assert.equal((await fetch(origin+'/learning-workbench/state',{headers:{Origin:'http://evil.test'}})).status,403);
 const badHost=await new Promise((resolve,reject)=>get(origin+'/learning-workbench/state',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
 assert.equal(badHost,403);
 assert.equal((await fetch(origin+'/learning-workbench/../../package.json')).status,404);
});

test('explicit local action saves a finance choice; state/config stay private and reopen exposes only projection',async(t)=>{
 const {createLocalModules}=await import('../../src/core/local-modules.mjs');
 const rows=new Map(),storage={get:key=>rows.get(key),put:async(key,value)=>rows.set(key,structuredClone(value))};
 let locals=createLocalModules(storage),finance=locals.forModule('finance');
 await finance.state.put('private-setting','backend-only');
 finance.registerAction('confirm',async input=>{
  if(input?.pair!=='a+b')throw Error('invalid pair backend-only');
  await finance.state.put('confirmed',input.pair);return {saved:true};
 });
 const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain({id:'finance',title:'Finance',recordKinds:[]});
 wb.registerMetric({id:'choice',domain:'finance',compute:()=>({confirmed:finance.state.get('confirmed')??null})});
 let origin;const server=createServer(makeHandler({workbench:wb,localModules:{invoke:(...args)=>locals.invoke(...args)},getOrigin:()=>origin,modules:[],assets:new Map()}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await wb.close();});
 const url=origin+'/learning-workbench/action?module=finance&name=confirm';
 const post=(body,headers={'x-learning-workbench':'1'})=>fetch(url,{method:'POST',headers,body});
 assert.equal((await fetch(url)).status,404);
 assert.equal((await post('{"pair":"a+b"}',{})).status,403);
 assert.equal((await post('{"pair":"a+b"}',{'x-learning-workbench':'1',Origin:'http://evil.test'})).status,403);
 assert.equal((await post('x')).status,400);
 assert.equal((await post(' '.repeat(65537))).status,413);
 assert.equal((await post('{"pair":"invalid"}')).status,422);
 assert.equal(finance.state.get('confirmed'),undefined);
 assert.equal((await post('{"pair":"a+b"}')).status,200);
 locals=createLocalModules(storage);finance=locals.forModule('finance');
 assert.deepEqual(await (await fetch(origin+'/learning-workbench/metric?id=choice')).json(),{confirmed:'a+b'});
 assert.equal((await post('{"pair":"a+b"}')).status,422); // no registered actions after reopen
 assert.equal((await (await fetch(origin+'/learning-workbench/state')).text()).includes('backend-only'),false);
});
