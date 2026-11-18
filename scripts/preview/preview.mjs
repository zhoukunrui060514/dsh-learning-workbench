// Dev-only: boots the real shell as DSH would and answers its requests from the fixtures, in memory.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {summary,settings,state,pathNotFound} from '/tests/fixtures/learning-v02.mjs';
const $=id=>document.getElementById(id);
$('theme').onchange=e=>{document.documentElement.dataset.theme=e.target.value;};
const mode=()=>$('mode').value;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const STATUS={BUSY:409,REVISION_CONFLICT:409,DUPLICATE_SOURCE:409,NOT_FOUND:404,INVALID_INPUT:400,STORAGE_FAILED:500};
// In-memory choices and settings, so clicks show their effect until the page reloads.
const extra={subjects:[],renamed:{},mapping:{},exams:[],removedExams:new Set()};
let config=settings();
function learning(filter){
 const v=summary(filter);
 const subjectOptions=[...v.subjectOptions.map(o=>({...o,name:extra.renamed[o.id]??o.name})),...extra.subjects];
 const mappingRows=v.mappingRows.map(r=>{const k=r.sourceId+'/'+r.sourceSubjectRef;return k in extra.mapping?{...r,subjectRef:extra.mapping[k],origin:extra.mapping[k]?'local':'unmapped'}:r;});
 const localExams=[...v.localExams,...extra.exams].filter(e=>!extra.removedExams.has(e.id));
 return {...v,subjectOptions,subjects:subjectOptions.filter(o=>o.origin==='local'),mappingRows,localExams};
}
function settingsMetric(){
 const s=$('settings').value;
 if(s==='schema')return reply({error:{code:'INVALID_INPUT',message:'invalid settings'}},400);
 if(s==='empty')return reply({...config,origin:'profile',revision:0,entries:[],retainedCacheCount:0});
 return reply({...config,reloadRequired:s==='reload'});
}
const id=()=>crypto.randomUUID();
function learningAction(name,input){
 if(name==='subject-create')extra.subjects.push({id:'subject_'+id(),name:input.name,origin:'local'});
 if(name==='subject-rename')extra.renamed[input.subjectId]=input.name;
 if(name==='mapping-set'){let target=input.target.existingId;if(input.target.create){target='subject_'+id();extra.subjects.push({id:target,name:input.target.create.name,origin:'local'});}extra.mapping[input.sourceId+'/'+input.sourceSubjectRef]=target;}
 if(name==='mapping-remove')extra.mapping[input.sourceId+'/'+input.sourceSubjectRef]=null;
 if(name==='exam-create')extra.exams.push({id:'exam_'+id(),...input});
 if(name==='exam-update'){const e=extra.exams.find(x=>x.id===input.id);if(e)Object.assign(e,input);}
 if(name==='remove-exam')extra.removedExams.add(input.id);
 return {saved:true};
}
function settingsAction(name,input){
 if(input.revision!==config.revision)return reply({error:{code:'REVISION_CONFLICT',message:'stale'}},409);
 const entries=config.entries;
 if(name==='source-check')return reply(mode()==='path-missing'?pathNotFound.check:{ok:true,code:'CHECK_OK',recordCount:6,warnings:[]});
 if(name==='source-save'){
  const d=input.draft,location=d.location.type==='url'?{type:'url',configured:true}:d.location;
  const old=entries.find(e=>e.entryId===input.entryId);
  const next={entryId:old?.entryId??'source_'+id(),sourceId:old?.sourceId??'src_'+id().slice(0,8),kind:d.kind,title:d.title,enabled:old?.enabled??true,schedule:d.schedule,location,...(d.timeZone?{timeZone:d.timeZone}:{}),advancedInherited:old?.advancedInherited??false,
   runtime:{status:'idle',lastSuccessAt:null,lastAttemptAt:null,recordCount:0,warnings:[],error:null}};
  config={...config,revision:config.revision+1,origin:'workbench',entries:old?entries.map(e=>e===old?next:e):[...entries,next]};
  return reply({saved:true,revision:config.revision,entryId:next.entryId,sourceId:next.sourceId,identityChanged:false});
 }
 if(name==='source-set-enabled')config={...config,revision:config.revision+1,origin:'workbench',entries:entries.map(e=>e.entryId===input.entryId?{...e,enabled:input.enabled,runtime:{...e.runtime,status:input.enabled?'idle':'disabled',error:null}}:e)};
 if(name==='source-delete')config={...config,revision:config.revision+1,origin:'workbench',retainedCacheCount:config.retainedCacheCount+1,entries:entries.filter(e=>e.entryId!==input.entryId)};
 return reply({saved:true,revision:config.revision,entryId:input.entryId});
}
const realFetch=window.fetch.bind(window);
window.fetch=async(url,init={})=>{
 if(!String(url).startsWith('/learning-workbench/'))return realFetch(url,init);
 const u=new URL(url,location.href),path=u.pathname.replace('/learning-workbench/',''),q=u.searchParams;
 await delay(init.method==='POST'?500:120);
 if(path==='state')return reply(state);
 if(path==='metric')return q.get('id')==='learning-source-settings'?settingsMetric():reply(learning(q.has('subject')?JSON.parse(q.get('subject')):undefined));
 if(path==='sync'){await delay(700);if(mode()==='BUSY')return reply({error:{code:'BUSY',message:'busy'}},409);if(mode()==='sync-fail'||mode()==='path-missing'){
   // As the backend does: the failure lands in the entry's runtime, which the card reads back.
   const error=mode()==='sync-fail'?{code:'sync-failed',message:'同步或保存失败，上次成功数据已保留'}:pathNotFound.error;
   config={...config,entries:config.entries.map(e=>e.sourceId===q.get('source')?{...e,runtime:{...e.runtime,status:'error',error,lastAttemptAt:new Date().toISOString()}}:e)};
   return reply({error:'同步失败'},502);}
  config={...config,entries:config.entries.map(e=>e.sourceId===q.get('source')?{...e,runtime:{...e.runtime,status:'ready',error:null,lastSuccessAt:new Date().toISOString(),lastAttemptAt:new Date().toISOString(),recordCount:e.runtime.recordCount||12}}:e)};return reply({});}
 if(path==='action'){
  const m=mode(),input=JSON.parse(init.body);
  if(m==='legacy')return reply({error:'保存失败'},422);
  if(STATUS[m])return reply({error:{code:m,message:'fixed',...(m==='INVALID_INPUT'?{field:'path'}:{})}},STATUS[m]);
  return q.get('module')==='learning-source-settings'?settingsAction(q.get('name'),input):reply(learningAction(q.get('name'),input));
 }
 return reply({error:'no route'},404);
};
// The DSH module loader and slot host, reduced to what client.js uses.
let plugin;
window.__ModuleLoader__={load:({factory})=>{plugin=factory(name=>{if(name!=='react')throw Error(name);return React;});}};
await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='/learning-workbench/client.js';s.onload=ok;s.onerror=fail;document.head.append(s);});
let Main;
plugin.apply({provide(){},effect(){},layout:{selectPanel:p=>console.info('selectPanel',p)},slots:{inject:(name,fn)=>fn(),register:(opts,Component)=>{if(opts.name==='main')Main=Component;}}});
createRoot($('root')).render(React.createElement(Main));
