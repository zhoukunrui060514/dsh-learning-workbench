import { readFile } from 'node:fs/promises';
/** Only source adapters receive these capabilities; no arbitrary path/URL route exists. */
export function hostPorts(table) {
  return {
    storage:{list:()=>[...table.entries()].map(([,v])=>v),put:(id,row)=>table.put(id,row)},
    clock:{now:()=>new Date().toISOString(),every(ms,fn){
      // Node turns delays above signed 32-bit milliseconds into 1ms timers.
      // Wait in bounded chunks; only a complete interval invokes the source.
      let timer,remaining=ms;
      const schedule=()=>{
        const delay=Math.min(remaining,2147483647);
        timer=setTimeout(()=>{
          remaining-=delay;
          if(remaining>0){schedule();return;}
          remaining=ms;schedule();fn();
        },delay);
      };
      schedule();return ()=>clearTimeout(timer);
    }},
    files:{read:async path=>new Uint8Array(await readFile(path))},
    http:{get:async(url,{headers={},signal}={})=>{
      const response=await fetch(url,{headers,signal});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      return {bytes:new Uint8Array(await response.arrayBuffer()),contentType:response.headers.get('content-type') || ''};
    }}
  };
}
