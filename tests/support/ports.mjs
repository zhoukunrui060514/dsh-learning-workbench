export function memoryPorts() {
  const rows=new Map(), timers=new Map(), files=new Map(), responses=new Map();
  let time='2026-11-13T00:00:00Z',next=0;
  return {
    storage:{list:()=>structuredClone([...rows.values()]),put:async(id,row)=>{rows.set(id,structuredClone(row));}},
    clock:{now:()=>time,every(ms,fn){const id=++next;timers.set(id,{ms,fn});return ()=>timers.delete(id);}},
    files:{read:async(path)=>{if(!files.has(path))throw Error('file not found');return files.get(path);}},
    http:{get:async(url)=>{if(!responses.has(url))throw Error('HTTP unavailable');return responses.get(url);}},
    control:{rows,timers,files,responses,setTime:value=>{time=value;},tick:async()=>{for(const {fn} of timers.values())await fn();}}
  };
}
