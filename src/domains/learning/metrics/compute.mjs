/** Learning calendar arithmetic never uses the server's local timezone. */
export function localDate(at, timeZone) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export const dayNumber=date=>Date.parse(`${date}T00:00:00Z`)/86400000;
export const addDays=(date,n)=>new Date((dayNumber(date)+n)*86400000).toISOString().slice(0,10);
export const whenDate=when=>when.date??localDate(when.at,when.timeZone);
export const recordId=r=>JSON.stringify([r.sourceId,r.externalId]);
const key=(...parts)=>JSON.stringify(parts);
function groups(rows,identity){const result=new Map();for(const row of rows){const k=identity(row);if(!result.has(k))result.set(k,[]);result.get(k).push(row);}return [...result.values()];}
const sum=rows=>rows.reduce((n,r)=>n+r.data.count,0);
const daily=rows=>[...groups(rows,r=>r.data.localDate)].map(g=>({date:g[0].data.localDate,value:g.length})).sort((a,b)=>a.date.localeCompare(b.date));
function reviewStats(rows,now){
 const timeZone=rows[0].data.timeZone,date=localDate(now,timeZone),points=daily(rows),days=new Set(points.filter(p=>p.date<=date).map(p=>p.date));
 let cursor=days.has(date)?date:addDays(date,-1),streak=0;
 while(days.has(cursor)){streak++;cursor=addDays(cursor,-1);}
 const today=rows.filter(r=>r.data.localDate===date);
 return {timeZone,date,today:today.length,uniqueItems:today.some(r=>r.data.itemRef===null)?null:new Set(today.map(r=>key(r.sourceId,r.data.itemRef))).size,streak,points};
}
function dueStats(rows,now){
 const {unit,due:{timeZone}}=rows[0].data,date=localDate(now,timeZone);
 return {unit,timeZone,date,today:sum(rows.filter(r=>whenDate(r.data.due)===date)),backlog:sum(rows.filter(r=>whenDate(r.data.due)<date)),forecast:Array.from({length:14},(_,i)=>{const d=addDays(date,i);return {date:d,value:sum(rows.filter(r=>whenDate(r.data.due)===d))};})};
}
// Names are display metadata, never grouping keys. Prefer the newest named observation.
const sourceName=rows=>rows.filter(r=>r.sourceSubjectName!==undefined).toSorted((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]?.sourceSubjectName;
function masteryStats(rows){
 return groups(rows,r=>key(r.sourceId,r.subjectRef,r.sourceSubjectRef??null,r.data.scale,r.data.method)).map(g=>{
  const latest=groups(g,r=>r.data.topicRef).map(topic=>topic.toSorted((a,b)=>Date.parse(b.data.asOf)-Date.parse(a.data.asOf))[0].data);
  return {sourceId:g[0].sourceId,subjectRef:g[0].subjectRef,sourceSubjectRef:g[0].sourceSubjectRef??null,sourceSubjectName:sourceName(g),scale:g[0].data.scale,method:g[0].data.method,summary:latest.find(r=>r.topicRef===null)??null,topics:latest.filter(r=>r.topicRef!==null),weakTopics:latest.filter(r=>r.topicRef!==null&&r.value!==null).sort((a,b)=>a.value-b.value),trend:g.map(r=>r.data).sort((a,b)=>Date.parse(a.asOf)-Date.parse(b.asOf))};
 });
}
export function computeLearning({records,now,sources=[],options={},local:inputLocal={}},localInput) {
 // All persisted choices are owned by views/module; this function has no effects.
 const local=localInput??inputLocal;
 const subjects=local.subjects??[],mappings=local.mappings??[];
 const activeSources=sources.filter(s=>s.domain==='learning'&&s.registered===true),activeIds=new Set(activeSources.map(s=>s.id));
 const activeRecords=records.filter(r=>activeIds.has(r.sourceId));
 const filter=options.subject??{mode:'all'};
 const matches=subjectRef=>filter.mode==='all'||(filter.mode==='unmapped'?subjectRef===null:subjectRef===filter.subjectRef);
 const resolvedAll=activeRecords.map(r=>({...r,subjectRef:r.subjectRef??mappings.find(m=>m.sourceId===r.sourceId&&m.sourceSubjectRef===r.sourceSubjectRef)?.subjectRef??null}));
 const resolved=resolvedAll.filter(r=>matches(r.subjectRef));
 const subjectOptions=subjects.map(s=>({...s,origin:'local'}));
 for(const g of groups(resolvedAll.filter(r=>r.subjectRef!==null),r=>r.subjectRef))if(!subjectOptions.some(s=>s.id===g[0].subjectRef))subjectOptions.push({id:g[0].subjectRef,name:sourceName(g)||g[0].subjectRef,origin:'source'});
 // Manual exams remain valid when their original source disappears.
 for(const e of local.exams??[])if(e.subjectRef!==null&&!subjectOptions.some(s=>s.id===e.subjectRef))subjectOptions.push({id:e.subjectRef,name:e.subjectRef,origin:'local'});
 const mappingRows=groups(activeRecords.filter(r=>r.sourceSubjectRef),r=>key(r.sourceId,r.sourceSubjectRef)).map(g=>{
  const first=g[0],explicit=g.find(r=>r.subjectRef!=null),mapping=mappings.find(m=>m.sourceId===first.sourceId&&m.sourceSubjectRef===first.sourceSubjectRef);
  return {sourceId:first.sourceId,sourceTitle:activeSources.find(s=>s.id===first.sourceId)?.title??first.sourceId,sourceSubjectRef:first.sourceSubjectRef,
   sourceSubjectName:sourceName(g)??null,subjectRef:explicit?.subjectRef??mapping?.subjectRef??null,origin:explicit?'source':mapping?'local':'unmapped',active:true,editable:!explicit};
 });
 for(const m of mappings)if(!mappingRows.some(r=>r.sourceId===m.sourceId&&r.sourceSubjectRef===m.sourceSubjectRef))mappingRows.push({
  sourceId:m.sourceId,sourceTitle:sources.find(s=>s.id===m.sourceId)?.title??m.sourceId,sourceSubjectRef:m.sourceSubjectRef,
  sourceSubjectName:sourceName(records.filter(r=>r.sourceId===m.sourceId&&r.sourceSubjectRef===m.sourceSubjectRef))??null,
  subjectRef:m.subjectRef,origin:'local',active:false,editable:false});
 const reviews=resolved.filter(r=>r.kind==='review-event');
 // The contract forbids mixed representations. If a cached bucket overlaps details,
 // retain the bucket once per source/subject/day/unit/zone, never add details to it.
 const due=groups(resolved.filter(r=>r.kind==='due-item'),r=>key(r.sourceId,r.subjectRef,r.sourceSubjectRef??null,r.data.unit,r.data.due.timeZone,whenDate(r.data.due))).flatMap(g=>g.some(r=>r.data.itemRef===null)?g.filter(r=>r.data.itemRef===null):g);
 const mastery=resolved.filter(r=>r.kind==='mastery-snapshot');
 const examRecords=[...resolvedAll.filter(r=>r.kind==='deadline'&&r.data.type==='exam'),...(local.exams??[]).map(e=>({sourceId:'local',externalId:e.id,subjectRef:e.subjectRef,data:{title:e.title,due:e.due,type:'exam'}}))];
 const allExams=examRecords.map(r=>{
  const {due,title}=r.data,id=recordId(r),days=due.date?dayNumber(due.date)-dayNumber(localDate(now,due.timeZone)):Math.ceil((Date.parse(due.at)-Date.parse(now))/86400000);
  const expired=due.date?days<0:Date.parse(due.at)<Date.parse(now);
  const range=(local.examRanges??[]).find(x=>x.examId===id);
  return {id,sourceId:r.sourceId,subjectRef:r.subjectRef,title,due,days,expired,remaining:range?.remaining??null,unit:range?.unit??null,dailyNeeded:range&&!expired?Math.ceil(range.remaining/Math.max(1,days)):null};
 }).sort((a,b)=>whenDate(a.due).localeCompare(whenDate(b.due))||a.id.localeCompare(b.id));
 const pairs=local.pairs??[],hidden=new Set(pairs.filter(p=>p.same&&p.ids.every(id=>allExams.some(e=>e.id===id))).map(p=>p.ids[1]));
 const candidates=[];
 for(let i=0;i<allExams.length;i++)for(let j=i+1;j<allExams.length;j++){
  const a=allExams[i],b=allExams[j],ids=[a.id,b.id].sort();
  if(matches(a.subjectRef)&&matches(b.subjectRef)&&a.sourceId!==b.sourceId&&whenDate(a.due)===whenDate(b.due)&&(a.title.trim()===b.title.trim()||(a.subjectRef!==null&&a.subjectRef===b.subjectRef))&&!pairs.some(p=>key(...p.ids)===key(...ids)))candidates.push({ids,exams:[a,b]});
 }
 const plans=(local.goals??[]).filter(g=>filter.mode==='all'||(filter.mode==='subject'&&g.subjectRef===filter.subjectRef)).map(g=>{
  const selected=reviews.filter(r=>(g.subjectRef===null||r.subjectRef===g.subjectRef)&&r.data.timeZone===g.timeZone),date=localDate(now,g.timeZone);
  const actual=selected.length?selected.filter(r=>r.data.localDate===date).length:null;
  return {...g,date,target:g.count,actual,remaining:actual===null?null:Math.max(0,g.count-actual),difference:actual===null?null:actual-g.count};
 });
 const unmapped=groups(resolvedAll.filter(r=>r.subjectRef===null&&r.sourceSubjectRef),r=>key(r.sourceId,r.sourceSubjectRef)).map(g=>({sourceId:g[0].sourceId,sourceSubjectRef:g[0].sourceSubjectRef,sourceSubjectName:sourceName(g)}));
 const pairDetails=pairs.map(p=>({ids:p.ids,same:p.same,active:p.ids.every(id=>allExams.some(e=>e.id===id)),exams:p.ids.map(id=>{
  const exam=allExams.find(e=>e.id===id);return exam?{id:exam.id,title:exam.title,due:exam.due}:null;
 })}));
 const selectedExams=allExams.filter(e=>matches(e.subjectRef));
 return {filter,subjectOptions,mappingRows,pairDetails,subjects,mappings:mappings.map(m=>({...m,sourceSubjectName:sourceName(records.filter(r=>r.sourceId===m.sourceId&&r.sourceSubjectRef===m.sourceSubjectRef))})),unmapped,localExams:local.exams??[],goals:local.goals??[],pairs,candidates,allExams,
  due:due.length?{totals:groups(due,r=>key(r.data.unit,r.data.due.timeZone)).map(g=>dueStats(g,now)),subjects:groups(due,r=>key(r.subjectRef,r.data.unit,r.data.due.timeZone)).map(g=>({...dueStats(g,now),subjectRef:g[0].subjectRef}))}:null,
  reviews:reviews.length?{totals:groups(reviews,r=>r.data.timeZone).map(g=>reviewStats(g,now)),subjects:groups(reviews,r=>key(r.subjectRef,r.data.timeZone)).map(g=>({...reviewStats(g,now),subjectRef:g[0].subjectRef}))}:null,
  mastery:mastery.length?masteryStats(mastery):null,exams:selectedExams.length?selectedExams.filter(e=>!hidden.has(e.id)):null,plans,
  sources:activeSources.map(s=>({id:s.id,title:s.title,status:s.status,lastSuccessAt:s.lastSuccessAt??null}))};
}
