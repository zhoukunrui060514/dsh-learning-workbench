import path from 'node:path';
import { createHash } from 'node:crypto';
import { readActions } from './actions.mjs';
import { readShards } from './shards.mjs';
export const id='studyhub';
export function createSource({ports,config,getService}) {
  if(typeof config.libraryRoot!=='string'||!path.isAbsolute(config.libraryRoot))throw Error('StudyHub libraryRoot must be an absolute path');
  const libraryRoot=path.resolve(config.libraryRoot),subjectMap=config.subjectMap??{};
  if(typeof subjectMap!=='object'||Array.isArray(subjectMap)||Object.values(subjectMap).some(v=>typeof v!=='string'||!v))throw Error('invalid StudyHub subjectMap');
  // A changed root must not inherit the old library's snapshot or mapping keys.
  const sourceId=`studyhub-${createHash('sha256').update(libraryRoot).digest('hex').slice(0,24)}`;
  let capabilities=['deadline','mastery-snapshot'];
  return {id:sourceId,domain:'learning',kind:'studyhub',title:'StudyHub 学习库',
    ...(config.intervalMs===undefined?{}:{intervalMs:config.intervalMs}),
    capabilities:()=>[...capabilities],
    check:async()=>getService('studyRuntime')?{ok:true}:{ok:false,detail:'StudyHub studyRuntime 服务未加载'},
    async read() {
      const service=getService('studyRuntime');
      if(!service)throw Error('StudyHub studyRuntime unavailable');
      const now=ports.clock.now();
      const official=await readActions({library:service.forLibrary(libraryRoot),now,subjectMap});
      const shards=await readShards({libraryRoot,files:ports.files,courses:official.courses,timeZone:official.timeZone,now,subjectMap});
      capabilities=['deadline','mastery-snapshot',...shards.capabilities];
      return {records:[...official.records,...shards.records],fetchedAt:now,mode:'replace',warnings:shards.warnings};
    }
  };
}
// Source settings owns registration.
