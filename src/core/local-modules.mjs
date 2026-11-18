import { SafeError } from '../host/safe-errors.mjs';
/** Module-owned local choices, separate from read-only source snapshots. */
export function createLocalModules(storage) {
  const actions=new Map(),pending=new Map();
  const key=(module,name)=>JSON.stringify([module,name]);
  function forModule(module) {
    return {
      state:{get:name=>structuredClone(storage.get(key(module,name))),
        put:(name,value)=>storage.put(key(module,name),structuredClone(value))},
      registerAction(name,run) {
        const id=key(module,name);
        if(actions.has(id))throw Error('duplicate local action');
        actions.set(id,run);return ()=>actions.delete(id);
      }
    };
  }
  async function invoke(module,name,input) {
    const run=actions.get(key(module,name));
    if(!run)throw Error('unknown local action');
    // Reject overlapping writes within a module rather than lose a read-modify-write choice.
    if(pending.has(module))throw new SafeError('BUSY');
    const task=Promise.resolve().then(()=>run(structuredClone(input)));
    pending.set(module,task);
    try{return await task;}finally{pending.delete(module);}
  }
  async function remove(module) {
    for(const id of actions.keys())if(JSON.parse(id)[0]===module)actions.delete(id);
    await Promise.allSettled(pending.has(module)?[pending.get(module)]:[]);
  }
  return {forModule,invoke,remove};
}
