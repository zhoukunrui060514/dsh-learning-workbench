import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
for(const path of walk('src').filter(p=>/\.(mjs|js)$/.test(p))){const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
const tests=walk('tests').filter(p=>p.endsWith('.test.mjs')&&!p.includes('integration'));
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});process.exit(result.status??1);
