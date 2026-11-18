import {randomUUID} from 'node:crypto';
import {computeLearning} from '../metrics/compute.mjs';
export const id='learning-views';
export const client=true;
const text=value=>{if(typeof value!=='string'||!value.trim())throw Error('expected nonempty text');return value.trim();};
const count=value=>{if(!Number.isSafeInteger(value)||value<0)throw Error('expected nonnegative integer');return value;};
function zone(value){text(value);new Intl.DateTimeFormat('en',{timeZone:value});return value;}
function when(value){
 zone(value.timeZone);
 if(typeof value.date==='string'&&value.at===undefined&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Number.isFinite(Date.parse(value.date))&&new Date(value.date).toISOString().slice(0,10)===value.date)return {date:value.date,timeZone:value.timeZone};
 if(typeof value.at==='string'&&value.date===undefined&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value.at)&&Number.isFinite(Date.parse(value.at)))return {at:value.at,timeZone:value.timeZone};
 throw Error('expected calendar date or offset timestamp');
}
const replace=(rows,item,matches)=>[...rows.filter(x=>!matches(x)),item];
export function setup({workbench,ports,state,registerAction}) {
 const read=()=>state?.get('choices')??{};
 const compute=input=>computeLearning(input,read());
 const activeSources=()=>workbench.snapshot().sources.filter(s=>s.domain==='learning'&&s.registered===true);
 const current=()=>{const sources=activeSources();return compute({sources,records:sources.flatMap(s=>s.records),now:ports.clock.now()});};
 const subject=value=>{if(value===null)return null;if(!current().subjectOptions.some(s=>s.id===value))throw Error('unknown subject');return value;};
 const off=[workbench.registerMetric({id:'learning-summary',domain:'learning',title:'学习指标',compute})];
 // Pure module fixtures may omit local-state ports; the host supplies both for actions.
 if(registerAction&&state){
  const action=(name,update)=>off.push(registerAction(name,async input=>{const local=read();const next=update(local,input);await state.put('choices',next);return {saved:true};}));
  const fields=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('invalid input fields');};
  const resultAction=(name,update)=>off.push(registerAction(name,async input=>{const {next,result}=update(read(),input);await state.put('choices',next);return {saved:true,...result};}));
  const editableCourse=input=>{
   const sourceId=text(input.sourceId),sourceSubjectRef=text(input.sourceSubjectRef);
   const row=current().mappingRows.find(r=>r.sourceId===sourceId&&r.sourceSubjectRef===sourceSubjectRef);
   if(!row?.active||!row.editable)throw Error('source subject is unavailable or explicitly mapped');
   return {sourceId,sourceSubjectRef};
  };
  resultAction('subject-create',(local,input)=>{
   fields(input,['name']);const created={id:`subject_${randomUUID()}`,name:text(input.name)};
   return {next:{...local,subjects:[...(local.subjects??[]),created]},result:{subject:created}};
  });
  resultAction('subject-rename',(local,input)=>{
   fields(input,['subjectId','name']);const id=text(input.subjectId),name=text(input.name);
   if(!(local.subjects??[]).some(s=>s.id===id)&&!activeSources().some(s=>s.records.some(r=>r.subjectRef===id)))throw Error('unknown subject');
   return {next:{...local,subjects:replace(local.subjects??[],{id,name},s=>s.id===id)},result:{subject:{id,name}}};
  });
  resultAction('mapping-set',(local,input)=>{
   fields(input,['sourceId','sourceSubjectRef','target']);const course=editableCourse(input);
   fields(input.target,['existingId','create']);
   if(('existingId' in input.target)===('create' in input.target))throw Error('choose one subject target');
   let subjectRef,subjects=local.subjects??[];
   if('existingId' in input.target)subjectRef=subject(text(input.target.existingId));
   else {fields(input.target.create,['name']);subjectRef=`subject_${randomUUID()}`;subjects=[...subjects,{id:subjectRef,name:text(input.target.create.name)}];}
   return {next:{...local,subjects,mappings:replace(local.mappings??[],{...course,subjectRef},m=>m.sourceId===course.sourceId&&m.sourceSubjectRef===course.sourceSubjectRef)},result:{subjectId:subjectRef}};
  });
  resultAction('mapping-remove',(local,input)=>{
   fields(input,['sourceId','sourceSubjectRef']);const course=editableCourse(input);
   return {next:{...local,mappings:(local.mappings??[]).filter(m=>m.sourceId!==course.sourceId||m.sourceSubjectRef!==course.sourceSubjectRef)},result:{}};
  });
  const examInput=input=>({title:text(input.title),subjectRef:subject(input.subjectRef),due:when(input.due)});
  resultAction('exam-create',(local,input)=>{
   fields(input,['title','subjectRef','due']);const exam={id:`exam_${randomUUID()}`,...examInput(input)};
   return {next:{...local,exams:[...(local.exams??[]),exam]},result:{exam}};
  });
  resultAction('exam-update',(local,input)=>{
   fields(input,['id','title','subjectRef','due']);const id=text(input.id);
   if(!(local.exams??[]).some(e=>e.id===id))throw Error('unknown manual exam');
   const exam={id,...examInput(input)};
   return {next:{...local,exams:replace(local.exams??[],exam,e=>e.id===id)},result:{exam}};
  });
  action('save-mapping',(local,input)=>{
   const sourceId=text(input.sourceId),sourceSubjectRef=text(input.sourceSubjectRef),subjectRef=text(input.subjectRef),name=text(input.name);
   const exists=activeSources().some(s=>s.id===sourceId&&s.records.some(r=>r.sourceSubjectRef===sourceSubjectRef));if(!exists)throw Error('unknown source subject');
   const old=(local.subjects??[]).find(s=>s.id===subjectRef);
   return {...local,subjects:old?local.subjects:[...(local.subjects??[]),{id:subjectRef,name}],mappings:replace(local.mappings??[],{sourceId,sourceSubjectRef,subjectRef},m=>m.sourceId===sourceId&&m.sourceSubjectRef===sourceSubjectRef)};
  });
  action('save-goal',(local,input)=>{
   const item={subjectRef:subject(input.subjectRef,local),timeZone:zone(input.timeZone),count:count(input.count)};
   return {...local,goals:replace(local.goals??[],item,g=>g.subjectRef===item.subjectRef&&g.timeZone===item.timeZone)};
  });
  action('remove-goal',(local,input)=>({...local,goals:(local.goals??[]).filter(g=>g.subjectRef!==input.subjectRef||g.timeZone!==input.timeZone)}));
  action('save-exam',(local,input)=>{
   const item={id:text(input.id),title:text(input.title),subjectRef:subject(input.subjectRef,local),due:when(input.due)};
   return {...local,exams:replace(local.exams??[],item,e=>e.id===item.id)};
  });
  action('remove-exam',(local,input)=>{
   const id=text(input.id),examId=JSON.stringify(['local',id]);
   return {...local,exams:(local.exams??[]).filter(e=>e.id!==id),examRanges:(local.examRanges??[]).filter(e=>e.examId!==examId),pairs:(local.pairs??[]).filter(p=>!p.ids.includes(examId))};
  });
  action('save-range',(local,input)=>{
   if(!current().allExams.some(e=>e.id===input.examId))throw Error('unknown exam');
   if(!['card','question'].includes(input.unit))throw Error('unknown quantity unit');
   const item={examId:input.examId,remaining:count(input.remaining),unit:input.unit};return {...local,examRanges:replace(local.examRanges??[],item,r=>r.examId===item.examId)};
  });
  action('confirm-pair',(local,input)=>{
   if(!Array.isArray(input.ids)||input.ids.length!==2||input.ids[0]===input.ids[1]||typeof input.same!=='boolean')throw Error('invalid exam pair');
   const ids=input.ids.toSorted(),all=current().allExams;
   if(ids.some(id=>!all.some(e=>e.id===id))||all.find(e=>e.id===ids[0]).sourceId===all.find(e=>e.id===ids[1]).sourceId)throw Error('unknown cross-source exams');
   return {...local,pairs:replace(local.pairs??[],{ids,same:input.same},p=>JSON.stringify(p.ids)===JSON.stringify(ids))};
  });
  action('remove-pair',(local,input)=>({...local,pairs:(local.pairs??[]).filter(p=>JSON.stringify(p.ids)!==JSON.stringify(input.ids))}));
 }
 return ()=>{for(const fn of off.reverse())fn();};
}
