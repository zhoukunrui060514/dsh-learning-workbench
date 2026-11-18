import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkbench} from '../../src/core/workbench.mjs';
import {memoryPorts} from '../support/ports.mjs';
const gate=()=>{let release;return {promise:new Promise(r=>release=r),release:()=>release()};};
function fixture(){const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain({id:'x',recordKinds:['x']});const source=(id,intervalMs)=>({id,domain:'x',kind:'x',title:id,intervalMs,capabilities:()=>[],read:async()=>({records:[],fetchedAt:ports.clock.now()})});return {ports,wb,source};}
test('close waits accepted changeSource commit and clears its newly activated timer',async()=>{
 const {wb,ports,source}=fixture(),blocked=gate();wb.registerSource(source('a',1000));
 const change=wb.changeSource({previousId:'a',next:source('b',1000),commit:()=>blocked.promise});
 let closed=false;const closing=wb.close().then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);
 blocked.release();await change;await closing;assert.equal(closed,true);assert.equal(ports.control.timers.size,0);assert.equal(wb.snapshot().sources.length,0);
});
test('failed commit unpauses original timer, while rejected timer allocation never commits',async()=>{
 const {wb,ports,source}=fixture();let reads=0;const old=source('a',1000);old.read=async()=>{reads++;return {records:[],fetchedAt:ports.clock.now()};};wb.registerSource(old);
 await assert.rejects(wb.changeSource({previousId:'a',next:source('b',1000),commit:async()=>{throw Error('disk');}}),{code:'STORAGE_FAILED'});
 await ports.control.tick();assert.equal(reads,1);assert.equal(ports.control.timers.size,1);
 let commits=0;ports.clock.every=()=>{throw Error('timer');};assert.throws(()=>wb.changeSource({previousId:'a',next:source('b',1000),commit:async()=>{commits++;}}),/timer/);
 assert.equal(commits,0);await wb.sync('a');assert.equal(reads,2);await wb.close();
});
test('new and old identity reservations reject registration and sync before commit',async()=>{
 const {wb,source}=fixture(),blocked=gate();wb.registerSource(source('a'));
 const change=wb.changeSource({previousId:'a',next:source('b'),commit:()=>blocked.promise});
 assert.throws(()=>wb.registerSource(source('b')),{code:'BUSY'});await assert.rejects(wb.sync('b'),{code:'BUSY'});
 assert.throws(()=>wb.changeSource({previousId:'a',next:null,commit:async()=>{}}),{code:'BUSY'});
 blocked.release();await change;await wb.sync('b');await wb.close();
});
test('same ID cannot change kind before its first snapshot exists',async()=>{
 const {wb,source}=fixture();wb.registerSource(source('a'));let committed=false;
 assert.throws(()=>wb.changeSource({previousId:'a',next:{...source('a'),kind:'other'},commit:async()=>{committed=true;}}),{code:'INVALID_INPUT'});
 assert.equal(committed,false);assert.equal(wb.snapshot().sources[0].kind,'x');await wb.close();
});
