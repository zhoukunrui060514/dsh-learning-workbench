import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const archive=resolve(process.argv[2]);
const temp=await mkdtemp(join(tmpdir(),'workbench-package-'));
try {
  execFileSync('tar',['-xzf',archive,'-C',temp]);
  const root=join(temp,'package'), files=[];
  async function walk(dir,prefix='') {for(const e of await readdir(dir,{withFileTypes:true})) {const p=prefix+e.name;if(e.isDirectory())await walk(join(dir,e.name),p+'/');else files.push(p);}}
  await walk(root);
  for(const file of files)assert.match(file,/^(package\.json|README(\.en)?\.md|LICENSE|cordis\.patch\.yml|docs\/deployment\.md|src\/(core|host|ui|domains\/learning)\/|node_modules\/ical\.js\/)/,file);
  assert(files.includes('LICENSE'));
  assert(files.includes('node_modules/ical.js/LICENSE'));
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  assert.equal(pkg.private,true);assert.equal(pkg.dependencies['ical.js'],'2.2.1');
  assert.deepEqual(pkg.bundleDependencies,['ical.js']);
  assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml');
  assert.match(await readFile(join(root,'cordis.patch.yml'),'utf8'),/name: dsh-learning-workbench/);
  for(const entry of [pkg.exports['.'],pkg.exports['./client']])assert((await readFile(join(root,entry),'utf8')).length>0);
  const {discoverModules}=await import(pathToFileURL(join(root,'src/host/modules.mjs')));
  const modules=await discoverModules(join(root,'src/domains'));
  assert.deepEqual(modules.map(m=>m.id).sort(),['learning','learning-ics','learning-source-settings','learning-views','studyhub']);
  assert.equal(modules.find(m=>m.id==='learning-source-settings').client,true);
  for(const m of modules.filter(m=>m.client))assert((await readFile(new URL('./client.mjs',m.url),'utf8')).length>0);
  assert((await readFile(join(root,'src/ui/charts.mjs'),'utf8')).length>0);
  console.log(`PASS packed files=${files.length}; private package, bundled license, imports, recursive modules and client assets`);
} finally {await rm(temp,{recursive:true,force:true});}
