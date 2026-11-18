import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSource } from '../sources/studyhub/module.mjs';
import { createIcsSource } from '../sources/ics/module.mjs';
import { SafeError, sourceReadError } from '../../../host/safe-errors.mjs';
const invalid=field=>{throw new SafeError('INVALID_INPUT',field);};
const object=(value,keys,field)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))invalid(field);
};
const text=(value,field)=>{if(typeof value!=='string'||!value.trim())invalid(field);return value.trim();};
function schedule(value) {
  object(value,['mode','intervalMs'],'schedule');
  if(value.mode==='manual'&&Object.keys(value).length===1)return {mode:'manual'};
  if(value.mode==='interval'&&Number.isSafeInteger(value.intervalMs)&&value.intervalMs>0)return {mode:'interval',intervalMs:value.intervalMs};
  invalid('schedule');
}
function zone(value){text(value,'timeZone');try{new Intl.DateTimeFormat('en',{timeZone:value});}catch{invalid('timeZone');}}
// Titles are public metadata. Never derive them from private subscription locations.
function title(value){const result=text(value,'title');if(/https?:\/\//i.test(result))invalid('title');return result;}
function location(adapter,kind) {
  if(kind==='studyhub') {
    if(typeof adapter.libraryRoot!=='string'||!path.isAbsolute(adapter.libraryRoot))invalid('location');
  } else {
    if(Boolean(adapter.path)===Boolean(adapter.url))invalid('location');
    if(adapter.path&&(typeof adapter.path!=='string'||!path.isAbsolute(adapter.path)))invalid('location');
    if(adapter.url){let url;try{url=new URL(adapter.url);}catch{invalid('location');}if(!['http:','https:'].includes(url.protocol))invalid('location');}
    if(adapter.timeZone!==undefined)zone(adapter.timeZone);
  }
}
export function createSettings({workbench,ports,state,registerAction,getService,initialLearningSources={}}) {
  const persisted=state.get('settings');
  let origin=persisted===undefined?'profile':'workbench',reloadRequired=false;
  let settings;
  const stops=[];
  function factory(entry) {
    if(!['studyhub','ics'].includes(entry.kind)||typeof entry.enabled!=='boolean')invalid('kind');
    title(entry.title);location(entry.adapter,entry.kind);
    const timing=schedule(entry.schedule),config={...entry.adapter,title:entry.title};
    delete config.intervalMs;
    if(timing.mode==='interval')config.intervalMs=timing.intervalMs;
    const source=entry.kind==='studyhub'?createSource({ports,config,getService}):createIcsSource(config,ports);
    source.title=entry.title;return source;
  }
  if(persisted===undefined) {
    const entries=[];
    const add=(kind,adapter)=>{
      let sourceId;
      try{sourceId=(kind==='studyhub'?createSource({ports,config:adapter,getService}):createIcsSource(adapter,ports)).id;}catch{}
      entries.push({entryId:sourceId?`legacy:${sourceId}`:`legacy:invalid_${randomUUID()}`,kind,
        title:kind==='studyhub'?'StudyHub 学习库':(/https?:\/\//i.test(adapter?.title||'')?'ICS 日历':adapter?.title||'ICS 日历'),enabled:true,
        schedule:kind==='ics'&&adapter?.intervalMs!==undefined?{mode:'interval',intervalMs:adapter.intervalMs}:{mode:'manual'},adapter:structuredClone(adapter)});
    };
    if(initialLearningSources.studyhub&&Object.keys(initialLearningSources.studyhub).length)add('studyhub',initialLearningSources.studyhub);
    for(const adapter of initialLearningSources.ics?.calendars||[])add('ics',adapter);
    // Duplicate identities remain independently editable, but none is registered.
    const used=new Set();for(const entry of entries){if(used.has(entry.entryId))entry.entryId+=`:${randomUUID()}`;used.add(entry.entryId);}
    settings={schemaVersion:1,revision:0,entries};
  }else {
    if(persisted.schemaVersion!==1) {
      const reject=()=>{throw new SafeError('INVALID_INPUT');};
      stops.push(workbench.registerMetric({id:'learning-source-settings',domain:'learning',compute:reject}));
      for(const name of ['source-save','source-check','source-set-enabled','source-delete'])stops.push(registerAction(name,reject));
      return ()=>{for(const stop of stops.reverse())stop();};
    }
    settings=persisted;
  }
  function inspect(entries) {
    const results=entries.map(entry=>{try{return {source:factory(entry)}}catch{return {error:{code:'CONFIG_INVALID',message:'来源配置无效，请修正或删除'}};}});
    for(const result of results)if(result.source&&results.filter(r=>r.source?.id===result.source.id).length>1)result.error={code:'DUPLICATE_SOURCE',message:'此来源已经接入，请修正或删除重复项'};
    return results;
  }
  const initial=inspect(settings.entries);
  for(let i=0;i<initial.length;i++)if(!initial[i].error&&settings.entries[i].enabled)stops.push(workbench.registerSource(initial[i].source));
  const find=id=>{const entry=settings.entries.find(e=>e.entryId===id);if(!entry)throw new SafeError('NOT_FOUND');return entry;};
  function draftEntry(draft,old) {
    object(draft,['kind','title','location','schedule','timeZone'],'draft');
    if(!['studyhub','ics'].includes(draft.kind)||old&&old.kind!==draft.kind)invalid('kind');
    const entry=old?structuredClone(old):{entryId:`source_${randomUUID()}`,kind:draft.kind,enabled:true,adapter:draft.kind==='ics'?{id:randomUUID()}: {}};
    entry.title=title(draft.title);entry.schedule=schedule(draft.schedule);
    object(draft.location,['type','path','operation','value'],'location');
    const loc=draft.location,adapter={...entry.adapter};entry.adapter=adapter;
    if(draft.kind==='studyhub') {
      if(draft.timeZone!==undefined||loc.type!=='library'||Object.keys(loc).some(k=>!['type','path'].includes(k)))invalid('location');
      adapter.libraryRoot=text(loc.path,'location');
    }else {
      if(old){if(draft.timeZone!==undefined&&draft.timeZone!==adapter.timeZone)invalid('timeZone');}
      else {zone(draft.timeZone);adapter.timeZone=draft.timeZone;}
      if(loc.type==='file') {
        if(Object.keys(loc).some(k=>!['type','path'].includes(k)))invalid('location');
        adapter.path=text(loc.path,'location');delete adapter.url;
      }else if(loc.type==='url') {
        if(Object.keys(loc).some(k=>!['type','operation','value'].includes(k)))invalid('location');
        if(loc.operation==='keep'){if(!old?.adapter.url||'value' in loc)invalid('location');}
        else if(loc.operation==='replace'){adapter.url=text(loc.value,'location');delete adapter.path;}
        else invalid('location');
      }else invalid('location');
    }
    location(adapter,entry.kind);return entry;
  }
  function dto() {
    const sources=workbench.snapshot().sources,results=inspect(settings.entries);
    return {revision:settings.revision,origin,reloadRequired,entries:settings.entries.map((entry,i)=>{
      const {source}=results[i],row=sources.find(s=>s.id===source?.id),adapter=entry.adapter||{};
      const error=results[i].error??(entry.enabled&&!row?.registered?{code:'CONFIG_INVALID',message:'重复已解除，重新保存或启用后生效'}:null);
      const publicPath=value=>typeof value==='string'&&path.isAbsolute(value)?value:'';
      let publicSchedule;try{publicSchedule=schedule(entry.schedule);}catch{publicSchedule={mode:'manual'};}
      let publicZone;try{if(adapter.timeZone!==undefined){zone(adapter.timeZone);publicZone=adapter.timeZone;}}catch{}
      let publicTitle;try{publicTitle=title(entry.title);}catch{publicTitle=entry.kind==='studyhub'?'StudyHub 学习库':'ICS 日历';}
      const loc=entry.kind==='studyhub'?{type:'library',path:publicPath(adapter.libraryRoot)}:
        adapter.url?{type:'url',configured:true}:{type:'file',path:publicPath(adapter.path)};
      return {entryId:entry.entryId,sourceId:source?.id??null,kind:entry.kind,title:publicTitle,enabled:entry.enabled,
        schedule:publicSchedule,location:loc,...(publicZone?{timeZone:publicZone}:{}),
        advancedInherited:Boolean(adapter.rules||adapter.subjectMap||adapter.subjectRef),
        runtime:{status:error?'invalid':!entry.enabled?'disabled':row?.registered?row.status:'idle',
          lastSuccessAt:row?.lastSuccessAt??null,lastAttemptAt:row?.lastAttemptAt??null,recordCount:row?.records.length??0,
          warnings:row?.warnings??[],error:error??row?.error??null}};
    }),retainedCacheCount:sources.filter(s=>s.domain==='learning'&&!s.registered).length};
  }
  async function apply(old,entry,{validate=true}={}) {
    const nextEntries=old?settings.entries.flatMap(e=>e.entryId===old.entryId?(entry?[entry]:[]):[e]):[...settings.entries,entry];
    let source=null;
    if(entry){if(validate)source=factory(entry);else {try{source=factory(entry);}catch{ /* Disabling an invalid unregistered entry only persists enabled=false. */ }}}
    if(validate&&source&&nextEntries.some(e=>e!==entry&&(()=>{try{return factory(e).id===source.id;}catch{return false;}})()))throw new SafeError('DUPLICATE_SOURCE');
    let previousId=null;
    if(old){try{const id=factory(old).id;if(workbench.snapshot().sources.some(s=>s.id===id&&s.registered))previousId=id;}catch{}}
    const next={schemaVersion:1,revision:settings.revision+1,entries:nextEntries};
    const commit=async()=>{
      try {await state.put('settings',next);}
      catch(error){if(error?.committed!==false)reloadRequired=true;throw new SafeError('STORAGE_FAILED');}
    };
    if(previousId||entry?.enabled)await workbench.changeSource({previousId,next:entry?.enabled?source:null,commit});
    else await commit();
    settings=next;origin='workbench';
    return {sourceId:source?.id??null,identityChanged:!!old&&(()=>{try{return factory(old).id!==source?.id;}catch{return true;}})()};
  }
  const actions={
    async 'source-save'(input){
      object(input,['revision','entryId','draft']);const old=input.entryId===undefined?null:find(input.entryId);
      const entry=draftEntry(input.draft,old),result=await apply(old,entry);
      return {saved:true,revision:settings.revision,entryId:entry.entryId,...result};
    },
    async 'source-check'(input){
      object(input,['revision','entryId','draft']);const old=input.entryId===undefined?null:find(input.entryId);
      if(!old&&!input.draft)invalid('draft');
      const source=factory(input.draft?draftEntry(input.draft,old):old);
      try {const result=await source.read({},null);return {ok:true,code:'CHECK_OK',recordCount:result.records.length,warnings:result.warnings??[]};}
      catch (error) {return {ok:false,code:sourceReadError(error)?.code??'CHECK_FAILED',warnings:[]};}
    },
    async 'source-set-enabled'(input){
      object(input,['revision','entryId','enabled']);if(typeof input.enabled!=='boolean')invalid('enabled');
      const old=find(input.entryId);await apply(old,{...old,enabled:input.enabled},{validate:input.enabled});return {saved:true,revision:settings.revision,entryId:old.entryId};
    },
    async 'source-delete'(input){object(input,['revision','entryId']);await apply(find(input.entryId),null);return {saved:true,revision:settings.revision};},
  };
  for(const [name,run] of Object.entries(actions))stops.push(registerAction(name,async input=>{
    if(!input||!Number.isSafeInteger(input.revision)||input.revision<0)invalid('revision');
    if(input.revision!==settings.revision)throw new SafeError('REVISION_CONFLICT');
    if(reloadRequired&&name!=='source-check')throw new SafeError('STORAGE_FAILED');
    return run(input);
  }));
  stops.push(workbench.registerMetric({id:'learning-source-settings',domain:'learning',compute:dto}));
  return ()=>{for(const stop of stops.reverse())stop();};
}
