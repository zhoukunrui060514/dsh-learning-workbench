import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** Discover only installed project modules, never user-uploaded source code. */
export async function discoverModules(root, {includeExample=false} = {}) {
  const entries=[];
  async function walk(dir) {
    for (const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && (!entry.name.startsWith('_') || (includeExample && entry.name==='_example'))) await walk(join(dir,entry.name));
      else if (entry.isFile() && entry.name==='module.mjs') entries.push(join(dir,entry.name));
    }
  }
  await walk(root instanceof URL ? fileURLToPath(root) : root);
  const modules=[];
  for (const path of entries) {
    const value=await import(pathToFileURL(path).href);
    if (!/^[a-z][a-z0-9-]*$/.test(value.id) || modules.some(m=>m.id===value.id)) throw Error('invalid or duplicate module id');
    modules.push({...value,url:pathToFileURL(path)});
  }
  return modules;
}
export async function mountModules(modules, context) {
  const disposers=[],localIds=[];
  const dispose=async()=>{
    // Revoke all modules before waiting for any: an action may depend on another module.
    await Promise.all(localIds.map(id=>context.localModules.remove(id)));
    // Keep core and module resources alive until actions AND source reads have finished.
    await context.workbench.close();
    for(const fn of disposers.reverse())await fn();
  };
  try {
    // Two passes let learning/views and learning/sources/* mount independently of file ordering.
    for (const module of modules) for(const domain of module.domains || []) disposers.push(context.workbench.registerDomain(domain));
    for (const module of modules) {
      const local=context.localModules?.forModule(module.id);
      if(local)localIds.push(module.id);
      const remove=await module.setup?.({...context,...local,config:context.config[module.id] || {}});
      if(remove)disposers.push(remove);
    }
    return dispose;
  } catch(error) {await dispose();throw error;}
}
