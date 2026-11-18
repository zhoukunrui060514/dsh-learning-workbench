import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {base,get,metric} from './http.mjs';
const root=process.env.WORKBENCH_UPGRADE_ROOT;
assert(root,'WORKBENCH_UPGRADE_ROOT must name the isolated package acceptance directory');
test('installed 0.2 package runs against actual DSH storageDomain and serves both clients',async()=>{
 const pkg=JSON.parse(await readFile(join(root,'home/profiles/v02-rc1/node_modules/dsh-learning-workbench/package.json'),'utf8'));assert.equal(pkg.version,'0.2.0');
 const state=await get('state');assert(state.domains.some(d=>d.id==='learning'));
 assert.deepEqual(state.clientModules.map(m=>m.id).sort(),['learning-source-settings','learning-views']);
 for(const path of ['/learning-workbench/charts.mjs',...state.clientModules.map(m=>m.url)]){const response=await fetch(base+path);assert.equal(response.status,200);assert((await response.text()).length>0);}
});
test('restart restores saved settings and all legacy choices with stable identities',async()=>{
 const expected=JSON.parse(await readFile(join(root,'evidence/upgraded.json'),'utf8'));
 const settings=await get('metric?id=learning-source-settings');
 assert.equal(settings.origin,'workbench');assert.equal(settings.revision,3);
 const config=s=>s.entries.map(({runtime,...entry})=>entry);
 assert.deepEqual(config(settings),config(expected.settings));assert.equal(settings.entries.filter(e=>!e.enabled).length,1);
 const current=await metric();for(const key of ['subjects','mappings','goals','localExams','pairs'])assert.deepEqual(current[key],expected.metric[key],key);
 assert.equal(current.allExams.find(e=>e.id==='["local","legacy-manual"]').remaining,42);
 assert.equal(current.unmapped.length,1);assert.equal(current.localExams.length,2);
 const state=await get('state');assert(state.sources.filter(s=>s.registered).every(s=>s.records.length>0));
});
test('file and controlled HTTP ICS snapshots persist and source bytes stay unchanged',async()=>{
 const expected=JSON.parse(await readFile(join(root,'evidence/baseline.json'),'utf8'));
 for(const [path,hash] of Object.entries(expected.hashes)){const bytes=await readFile(join(root,'data',path));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);}
 const state=await get('state'),ics=state.sources.filter(s=>s.registered&&s.kind==='ics');assert.equal(ics.length,2);assert(ics.every(s=>s.records.some(r=>r.kind==='deadline')));
});
