// Fictional 0.2 DTOs for front-end tests and the dev preview; shapes follow the v0.2 design §5 and §7.
const tz='Asia/Shanghai',day='2026-11-13';
const days=(start,values)=>values.map((value,i)=>({date:`2026-11-${String(Number(start.slice(-2))+i).padStart(2,'0')}`,value}));
export const subjectOptions=[
 {id:'subject_a1',name:'基础生理',origin:'local'},
 {id:'subject_b2',name:'药理基础',origin:'local'},
 {id:'subject_c3',name:'药理基础',origin:'local'},
 {id:'cal-pharm',name:'cal-pharm',origin:'source'},
];
export const sources=[
 {id:'hub',domain:'learning',title:'我的学习库',status:'ready',registered:true,input:'source',capabilities:['due','reviews','mastery'],records:[],lastSuccessAt:'2026-11-13T00:40:00Z',lastAttemptAt:'2026-11-13T00:40:00Z',error:null,warnings:[]},
 {id:'cal',domain:'learning',title:'课程日历',status:'error',registered:true,input:'source',capabilities:['deadlines'],records:[],lastSuccessAt:'2026-11-12T00:40:00Z',lastAttemptAt:'2026-11-13T00:40:00Z',error:{code:'SOURCE_READ_FAILED',message:'来源暂时无法读取'},warnings:[]},
 {id:'old',domain:'learning',title:'旧学习库',status:'unavailable',registered:false,input:'source',capabilities:[],records:[],lastSuccessAt:'2026-10-01T00:00:00Z',lastAttemptAt:null,error:null,warnings:[]},
];
const sourceMeta=sources.map(({id,title,status,lastSuccessAt})=>({id,title,status,lastSuccessAt}));
const exam=(id,sourceId,subjectRef,title,due,daysLeft,remaining=null,unit=null)=>({id,sourceId,subjectRef,title,due,days:daysLeft,expired:daysLeft<0,remaining,unit,dailyNeeded:remaining===null||daysLeft<0?null:Math.ceil(remaining/Math.max(1,daysLeft))});
export const exams={
 hub:exam('["hub","e1"]','hub','subject_a1','基础生理阶段测验',{date:'2026-11-20',timeZone:tz},7,56,'question'),
 cal:exam('["cal","u1"]','cal','subject_a1','基础生理阶段测验',{date:'2026-11-20',timeZone:tz},7),
 pharm:exam('["cal","u2"]','cal','cal-pharm','药理基础单元考试',{date:'2026-11-26',timeZone:tz},13),
 lab:exam('["local","exam_1"]','local',null,'实验方法检查',{date:day,timeZone:tz},0,0,'question'),
 oral:exam('["local","legacy-oral"]','local','subject_a1','旧口试',{at:'2026-11-18T09:00:00+08:00',timeZone:tz},5),
};
export const localExams=[
 {id:'exam_1',title:'实验方法检查',subjectRef:null,due:{date:day,timeZone:tz}},
 {id:'legacy-oral',title:'旧口试',subjectRef:'subject_a1',due:{at:'2026-11-18T09:00:00+08:00',timeZone:tz}},
];
export const mappingRows=[
 {sourceId:'hub',sourceTitle:'我的学习库',sourceSubjectRef:'course-a',sourceSubjectName:'基础生理 · 秋季班',subjectRef:'subject_a1',origin:'local',active:true,editable:true},
 {sourceId:'hub',sourceTitle:'我的学习库',sourceSubjectRef:'course-b',sourceSubjectName:'药理基础',subjectRef:'subject_b2',origin:'local',active:true,editable:true},
 {sourceId:'hub',sourceTitle:'我的学习库',sourceSubjectRef:'course-c',sourceSubjectName:'实验方法',subjectRef:null,origin:'unmapped',active:true,editable:true},
 {sourceId:'cal',sourceTitle:'课程日历',sourceSubjectRef:'pharm',sourceSubjectName:null,subjectRef:'cal-pharm',origin:'source',active:true,editable:false},
 {sourceId:'old',sourceTitle:'旧学习库',sourceSubjectRef:'course-x',sourceSubjectName:'旧课程',subjectRef:'subject_a1',origin:'local',active:false,editable:false},
];
const pairs=[{ids:['["cal","u1"]','["hub","e1"]'],same:true},{ids:['["gone","x"]','["local","exam_1"]'],same:false}];
export const pairDetails=[
 {ids:pairs[0].ids,same:true,active:true,exams:[{id:exams.cal.id,title:exams.cal.title,due:exams.cal.due},{id:exams.hub.id,title:exams.hub.title,due:exams.hub.due}]},
 {ids:pairs[1].ids,same:false,active:false,exams:[null,{id:exams.lab.id,title:exams.lab.title,due:exams.lab.due}]},
];
const goals=[{subjectRef:null,timeZone:tz,count:30},{subjectRef:'subject_a1',timeZone:tz,count:20}];
const plan=(g,actual)=>({...g,date:day,target:g.count,actual,remaining:actual===null?null:Math.max(0,g.count-actual),difference:actual===null?null:actual-g.count});
const dueStats=(today,backlog,forecast,extra={})=>({unit:'question',timeZone:tz,date:day,today,backlog,forecast:days(day,forecast),...extra});
const reviewStats=(today,streak,points,extra={})=>({timeZone:tz,date:day,today,uniqueItems:today?today-3:0,streak,points:days('2026-11-01',points).filter(p=>p.value!==null),...extra});
// Methods are StudyHub 4.6.0's own English strings, as the source writes them.
const RATIO_METHOD='StudyHub 4.6.0 lib/sm2.js FSRS-6 R>=0.9; exact course membership; active cards (including new, excluding suspended/archived/system); new has no recall estimate; parked courses included; local calendar days in Asia/Singapore; decay=-0.1542; SM-2 memoryState migration; 8-digit rounding';
const LEVEL_METHOD='StudyHub 4.6.0 focusProgress: round(100 × mean(level weight)); new=0, weak=.15, learning=.45, familiar=.75, mastered=1; range 0–100; topics may overlap';
const ratio=(subjectRef,ref,name,value,weak,cards=[null,null])=>({sourceId:'hub',subjectRef,sourceSubjectRef:ref,sourceSubjectName:name,scale:'ratio',method:RATIO_METHOD,summary:{asOf:'2026-11-13T00:40:00+08:00',topicRef:null,value,scale:'ratio',numerator:cards[0],denominator:cards[1],method:RATIO_METHOD},topics:weak.map(([topicRef,v])=>({topicRef,value:v})),weakTopics:weak.filter(w=>w[1]!==null).map(([topicRef,v])=>({topicRef,value:v})),trend:[{asOf:'2026-11-13T00:40:00+08:00',topicRef:null,value}]});
// StudyHub gives levels per topic only: the subject summary is null.
const level=(subjectRef,ref,name)=>({sourceId:'hub',subjectRef,sourceSubjectRef:ref,sourceSubjectName:name,scale:'weighted-level',method:LEVEL_METHOD,summary:null,topics:[{topicRef:'循环调节',value:38},{topicRef:'呼吸交换',value:65}],weakTopics:[{topicRef:'循环调节',value:38},{topicRef:'呼吸交换',value:65}],trend:[{asOf:'2026-11-13T00:40:00+08:00',topicRef:'循环调节',value:38},{asOf:'2026-11-13T00:40:00+08:00',topicRef:'呼吸交换',value:65}]});
const catalog={subjects:subjectOptions.filter(o=>o.origin==='local').map(({id,name})=>({id,name})),subjectOptions,mappingRows,
 mappings:mappingRows.filter(r=>r.origin==='local').map(({sourceId,sourceSubjectRef,subjectRef,sourceSubjectName})=>({sourceId,sourceSubjectRef,subjectRef,sourceSubjectName})),
 unmapped:mappingRows.filter(r=>r.origin==='unmapped').map(({sourceId,sourceSubjectRef,sourceSubjectName})=>({sourceId,sourceSubjectRef,sourceSubjectName})),
 localExams,goals,pairs,pairDetails,allExams:Object.values(exams),sources:sourceMeta};
const a1Heat=[0,8,12,null,9,14,null,0,null,6,10,8,12];
export function summary(filter={mode:'all'}){
 if(filter.mode==='unmapped')return {...catalog,filter,due:null,reviews:null,
  mastery:[ratio(null,'course-c','实验方法',null,[['误差分析',null]])],exams:[exams.lab],plans:[],candidates:[]};
 if(filter.mode==='subject'){
  if(filter.subjectRef!=='subject_a1')return {...catalog,filter,due:null,reviews:null,mastery:null,exams:null,plans:[],candidates:[]};
  return {...catalog,filter,
   due:{totals:[dueStats(18,7,[18,12,8,15,21,9,6,14,18,11,7,5,13,8])],subjects:[dueStats(18,7,[18,12,8,15,21,9,6,14,18,11,7,5,13,8],{subjectRef:'subject_a1'})]},
   reviews:{totals:[reviewStats(12,4,a1Heat)],subjects:[reviewStats(12,4,a1Heat,{subjectRef:'subject_a1'})]},
   mastery:[ratio('subject_a1','course-a','基础生理 · 秋季班',.72,[['循环调节',.38],['呼吸交换',.46]],[72,100]),level('subject_a1','course-a','基础生理 · 秋季班')],
   exams:[exams.hub,exams.oral],plans:[plan(goals[1],12)],candidates:[]};
 }
 return {...catalog,filter:{mode:'all'},
  due:{totals:[dueStats(26,7,[26,18,12,22,30,14,9,22,24,15,10,7,19,12])],subjects:[dueStats(18,7,[18,12,8,15,21,9,6,14,18,11,7,5,13,8],{subjectRef:'subject_a1'}),dueStats(8,0,[8,6,4,7,9,5,3,8,6,4,3,2,6,4],{subjectRef:'subject_b2'})]},
  reviews:{totals:[reviewStats(18,4,[0,12,15,null,15,22,null,0,null,8,10,12,18])],subjects:[reviewStats(12,4,a1Heat,{subjectRef:'subject_a1'}),reviewStats(6,2,[0,4,3,null,6,8,null,0,null,2,null,4,6],{subjectRef:'subject_b2'})]},
  mastery:[ratio('subject_a1','course-a','基础生理 · 秋季班',.72,[['循环调节',.38],['呼吸交换',.46]],[72,100]),level('subject_a1','course-a','基础生理 · 秋季班'),ratio('subject_b2','course-b','药理基础',0,[['药物代谢',0]],[0,5]),ratio(null,'course-c','实验方法',null,[])],
  exams:[exams.lab,exams.oral,exams.hub,exams.pharm],plans:[plan(goals[0],18),plan(goals[1],12)],
  candidates:[{ids:[exams.lab.id,'["cal","u9"]'].sort(),exams:[exams.lab,{...exams.lab,id:'["cal","u9"]',sourceId:'cal',subjectRef:null}]}]};
}
const runtime=(status,extra={})=>({status,lastSuccessAt:null,lastAttemptAt:null,recordCount:0,warnings:[],error:null,...extra});
export function settings(overrides={}){
 return {revision:7,origin:'workbench',reloadRequired:false,retainedCacheCount:2,entries:[
  {entryId:'legacy:sh_9f2a',sourceId:'sh_9f2a',kind:'studyhub',title:'我的学习库',enabled:true,schedule:{mode:'manual'},location:{type:'library',path:'D:/DemoLearning/.study'},advancedInherited:true,
   runtime:runtime('ready',{lastSuccessAt:'2026-11-13T00:40:00Z',lastAttemptAt:'2026-11-13T00:40:00Z',recordCount:386,warnings:[{code:'SHARD_VERSION',message:'分片版本未适配，部分复习明细不可用'}]})},
  {entryId:'source_11111111-2222-4333-8444-555555555555',sourceId:'ics_local1',kind:'ics',title:'课程日历',enabled:true,schedule:{mode:'interval',intervalMs:3600000},location:{type:'file',path:'D:/DemoCalendar/term.ics'},timeZone:tz,advancedInherited:false,runtime:runtime('idle')},
  {entryId:'legacy:ics_remote',sourceId:'ics_remote',kind:'ics',title:'订阅日历',enabled:true,schedule:{mode:'interval',intervalMs:2700000},location:{type:'url',configured:true},advancedInherited:true,
   runtime:runtime('error',{lastSuccessAt:'2026-11-12T08:00:00Z',lastAttemptAt:'2026-11-13T08:00:00Z',recordCount:6,error:{code:'sync-failed',message:'同步或保存失败，上次成功数据已保留'}})},
  {entryId:'source_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',sourceId:'ics_off',kind:'ics',title:'停用的日历',enabled:false,schedule:{mode:'manual'},location:{type:'url',configured:true},timeZone:tz,advancedInherited:false,runtime:runtime('disabled',{recordCount:4,lastSuccessAt:'2026-11-01T08:00:00Z'})},
  {entryId:'legacy:sh_dup_7c1e',sourceId:'sh_dup',kind:'studyhub',title:'重复的学习库',enabled:true,schedule:{mode:'manual'},location:{type:'library',path:'D:/DemoLearning/copy'},advancedInherited:false,
   runtime:runtime('invalid',{error:{code:'CONFIG_INVALID',message:'重复已解除，重新保存或启用后生效'}})},
  {entryId:'source_99999999-8888-4777-8666-555555555555',sourceId:'sh_second',kind:'studyhub',title:'第二学习库',enabled:true,schedule:{mode:'interval',intervalMs:86400000},location:{type:'library',path:'D:/Second/.study'},advancedInherited:false,runtime:runtime('syncing',{lastAttemptAt:'2026-11-13T09:00:00Z'})},
 ],...overrides};
}
// A local ICS file that is not there, as source-check and the settings runtime report it.
export const pathNotFound={check:{ok:false,code:'PATH_NOT_FOUND',warnings:[]},error:{code:'PATH_NOT_FOUND',message:'找不到该文件，请确认路径'}};
export function missingFile({lastSuccessAt=null,recordCount=0}={}){
 return {entryId:'source_12121212-3434-4565-8787-909090909090',sourceId:'ics_missing',kind:'ics',title:'缺失的本地日历',enabled:true,schedule:{mode:'manual'},location:{type:'file',path:'D:/DemoCalendar/not-exist.ics'},timeZone:tz,advancedInherited:false,
  runtime:runtime('error',{lastSuccessAt,lastAttemptAt:'2026-11-13T09:30:00Z',recordCount,error:pathNotFound.error})};
}
export const state={domains:[{id:'learning',title:'学习'}],sources,clientModules:[{id:'learning-views',url:'/learning-workbench/client/learning-views.mjs'},{id:'learning-source-settings',url:'/learning-workbench/client/learning-source-settings.mjs'}]};
