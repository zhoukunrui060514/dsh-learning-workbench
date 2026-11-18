import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { createWorkbench } from '../core/workbench.mjs';
import { hostPorts } from './ports.mjs';
import { discoverModules, mountModules } from './modules.mjs';
import { createLocalModules } from '../core/local-modules.mjs';
import { shutdown } from './shutdown.mjs';
import { makeHandler } from './routes.mjs';
export const name='learning-workbench';
export const inject=['storageDomain','webServer'];
const spec=defineDomain({name:'learning_workbench',version:2,compatibleVersions:[1],tables:{snapshots:domainTable(z.object({
  id:z.string(),domain:z.string(),title:z.string(),kind:z.string(),capabilities:z.array(z.string()),
  records:z.array(z.object({kind:z.string(),externalId:z.string(),sourceId:z.string(),domain:z.string(),observedAt:z.string()}).passthrough()),
  status:z.enum(['ready','error']),lastSuccessAt:z.string().nullable()
}).passthrough()),local_state:domainTable(z.object({value:z.unknown()}))}});
export function apply(ctx,config={}) {
  ctx.effect(async()=>{
    const domain=await ctx.storageDomain.open(spec);
    const ports=hostPorts(domain.table('snapshots'));
    const workbench=createWorkbench(ports);
    const localTable=domain.table('local_state');
    const localModules=createLocalModules({get:key=>localTable.get(key)?.value,put:(key,value)=>localTable.put(key,{value})});
    let unmount=()=>workbench.close(),remove=()=>{};
    try {
      const modules=await discoverModules(new URL('../domains/',import.meta.url),{includeExample:config.includeExample===true});
      unmount=await mountModules(modules,{workbench,ports,localModules,config:config.modules || {},initialLearningSources:{studyhub:config.modules?.studyhub,ics:config.modules?.['learning-ics']},getService:name=>ctx.get(name)});
      const assets=new Map(),clientModules=[];
      assets.set('/learning-workbench/charts.mjs',await readFile(new URL('../ui/charts.mjs',import.meta.url),'utf8'));
      for(const module of modules.filter(m=>m.client)) {
        const url=`/learning-workbench/module/${module.id}.mjs`;
        assets.set(url,await readFile(new URL('./client.mjs',module.url),'utf8'));
        clientModules.push({id:module.id,url});
      }
      remove=ctx.webServer.register({kind:'prefix',path:'/learning-workbench',handler:makeHandler({workbench,localModules,getOrigin:()=>ctx.webServer.getOrigin(),modules:clientModules,assets})});
      ctx.provide('learningWorkbench',workbench);
    } catch(error) {await shutdown({remove,unmount,domain});throw error;}
    return ()=>shutdown({remove,unmount,domain});
  });
}
