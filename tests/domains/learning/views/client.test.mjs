import test from 'node:test';import assert from 'node:assert/strict';
import client from '../../../../src/domains/learning/views/client.mjs';
import {computeLearning} from '../../../../src/domains/learning/metrics/compute.mjs';
import {createCharts} from '../../../../src/ui/charts.mjs';
import {React,render,text,one,byText,findAll,click,change,submit,label,press,focused,document} from '../../../support/react-lite.mjs';
import {summary} from '../../../fixtures/learning-v02.mjs';
const h=React.createElement;
function mount(invoke=async()=>({saved:true})){const views=[];let removed=0;const off=client({React,charts:createCharts(React),registerView:v=>{views.push(v);return ()=>removed++;},invoke});return {views,off,removed:()=>removed,get:id=>views.find(v=>v.id===id)};}
function show(view,value){const state={refreshed:0};const r=render(h(view.Component,{value,refresh:async()=>{state.refreshed++;}}));return Object.assign(r,{state});}
const out=(view,value)=>text(show(view,value).tree);
const now='2026-11-13T00:00:00Z';
// Backend B counts only registered sources; the old compute ignores this argument.
const sources=[{id:'fixture',domain:'learning',title:'虚构来源',status:'ready',registered:true,records:[]}];
const compute=input=>computeLearning({sources,...input});
const record=(kind,id,data)=>({kind,externalId:id,data,subjectRef:'bio',sourceId:'fixture',observedAt:now});
const records=[record('due-item','d',{due:{date:'2026-11-13',timeZone:'Asia/Shanghai'},count:7,unit:'question',itemRef:null}),record('review-event','r',{occurredAt:now,localDate:'2026-11-13',timeZone:'Asia/Shanghai',itemRef:'q1',correct:true,durationSeconds:20}),record('mastery-snapshot','m',{asOf:now,topicRef:null,value:.75,scale:'ratio',numerator:3,denominator:4,method:'test recall'}),record('mastery-snapshot','w',{asOf:now,topicRef:null,value:3,scale:'weighted-level',numerator:null,denominator:null,method:'level 0–5'}),record('deadline','e',{title:'模拟期末',type:'exam',due:{date:'2026-11-15',timeZone:'Asia/Shanghai'}})];
const SUBJECT_VIEWS=['learning-overview','learning-progress','learning-mastery','learning-planning'];

test('four learning views declare the shared subject filter; mapping view does not',()=>{
 const m=mount();assert.deepEqual(m.views.filter(v=>v.filter==='learning-subject').map(v=>v.id),SUBJECT_VIEWS);
 assert.equal(m.get('learning-mapping').filter,undefined);assert.ok(m.views.every(v=>v.metric==='learning-summary'));m.off();assert.equal(m.removed(),5);
});
test('all four views render real chart components and hand-checked metric values',()=>{
 const value=compute({records,now,local:{goals:[{subjectRef:'bio',timeZone:'Asia/Shanghai',count:5},{subjectRef:null,timeZone:'Asia/Shanghai',count:5}],examRanges:[{examId:'["fixture","e"]',remaining:9,unit:'question'}]}});
 const m=mount();const output=SUBJECT_VIEWS.map(id=>out(m.get(id),value));
 assert.match(output[0],/今日到期\s+7\s+题/);assert.match(output[0],/今日已复习\s+1\s+次/);assert.match(output[1],/欠账：0/);assert.match(output[1],/2026-11-26/);assert.match(output[2],/75.0%/);assert.match(output[2],/加权等级：3/);assert.doesNotMatch(output[2],/300/);assert.match(output[3],/每日需要：5/);assert.match(output[3],/计划：5.*实际：1.*还需：4/);
});
test('empty records render unavailable instead of zero metrics',()=>{
 const value=compute({records:[],now});for(const id of SUBJECT_VIEWS){const output=out(mount().get(id),value);assert.match(output,/不可用|未知/);assert.doesNotMatch(output,/今日到期\s+0|已复习\s+0|连续学习\s+0|今日到期：0/);}
});
test('overview excludes a just-expired instant but retains a future instant and date-only today',()=>{
 const exams=[
  record('deadline','past',{title:'刚过期考试',type:'exam',due:{at:'2026-11-13T08:00:00+08:00',timeZone:'Asia/Shanghai'}}),
  record('deadline','future',{title:'一小时后考试',type:'exam',due:{at:'2026-11-13T10:00:00+08:00',timeZone:'Asia/Shanghai'}}),
  record('deadline','today',{title:'日期型今日考试',type:'exam',due:{date:'2026-11-13',timeZone:'Asia/Shanghai'}}),
 ];
 const output=out(mount().get('learning-overview'),compute({records:exams,now:'2026-11-13T01:00:00Z'}));
 assert.doesNotMatch(output,/刚过期考试/);assert.match(output,/一小时后考试/);assert.match(output,/日期型今日考试/);assert.match(output,/今天/);
});
test('course names display with legacy ID fallback and explicit local names take priority',()=>{
 const row={...records[2],subjectRef:null,sourceSubjectRef:'course-id',sourceSubjectName:'来源课程名'};
 const all=(rows,local={})=>{const m=mount();const value=compute({records:rows,now,local});return SUBJECT_VIEWS.map(id=>out(m.get(id),value)).join(' ');};
 assert.match(all([row]),/来源课程名/);
 const legacy={...row};delete legacy.sourceSubjectName;assert.match(all([legacy]),/course-id/);
 const v=compute({records:[row],now,local:{subjects:[{id:'bio',name:'本地学科名'}],mappings:[{sourceId:'fixture',sourceSubjectRef:'course-id',subjectRef:'bio'}]}});
 assert.equal(v.mappings[0].sourceSubjectName,'来源课程名');
 const headings=findAll(show(mount().get('learning-mastery'),v).tree,n=>n.type==='h2').map(text);
 assert.ok(headings.includes('本地学科名'));assert.ok(!headings.includes('来源课程名'));
});

// --- 0.2 DTO: filters ---
test('all, subject and unmapped filters render what the backend returned for each scope',()=>{
 const m=mount(),overview=m.get('learning-overview'),planning=m.get('learning-planning');
 const all=out(overview,summary({mode:'all'}));
 assert.match(all,/今日到期\s+26\s+题/);assert.match(all,/每日目标 · 全部学科/);assert.match(all,/18\s+\/ 30 次 · 全局目标/);assert.doesNotMatch(all,/12\s+\/ 20/);
 const subject=out(overview,summary({mode:'subject',subjectRef:'subject_a1'}));
 assert.match(subject,/今日到期\s+18\s+题/);assert.match(subject,/每日目标 · 基础生理/);assert.match(subject,/12\s+\/ 20 次 · 基础生理/);assert.doesNotMatch(subject,/全局目标/);
 const unmapped=out(overview,summary({mode:'unmapped'}));
 assert.match(unmapped,/今日到期\s+未知/);assert.match(unmapped,/未映射学科没有专属目标/);assert.doesNotMatch(unmapped,/设置目标/);assert.doesNotMatch(unmapped,/今日到期\s+0/);
 const tree=show(planning,summary({mode:'unmapped'})).tree,plan=text(tree),timeline=text(byText(tree,'section',/^\s*考试时间线/)[0]);
 assert.match(timeline,/实验方法检查/);assert.doesNotMatch(timeline,/基础生理阶段测验|旧口试/);assert.match(plan,/全部手工考试（2）/);assert.match(plan,/旧口试/);
 assert.match(out(m.get('learning-mastery'),summary({mode:'unmapped'})),/实验方法[\s\S]*未知/);
});
test('progress keeps text values beside charts and unknown stays unknown',()=>{
 const m=mount(),output=out(m.get('learning-progress'),summary({mode:'subject',subjectRef:'subject_a1'}));
 assert.match(output,/查看每天的数量/);assert.match(output,/2026-11-26/);assert.match(output,/—/);
 assert.match(out(m.get('learning-progress'),summary({mode:'unmapped'})),/复习记录：不可用/);
});
test('pair details show missing sides as unavailable, never a raw ID',()=>{
 const output=out(mount().get('learning-planning'),summary());
 assert.match(output,/来源不可用（保留确认） ↔ 手工录入「实验方法检查」2026-11-13/);assert.match(output,/不参与当前统计/);assert.doesNotMatch(output,/\["gone"/);
});

// --- 0.2 DTO: ID-free forms ---
async function openDialog(r,button){click(one(r.tree,'button',button));await r.settle();return findAll(r.tree,n=>n.props.role==='dialog')[0];}
test('mapping to an existing subject and creating one by name send no client ID',async()=>{
 const calls=[],m=mount(async(name,input)=>{calls.push({name,input});return {saved:true};});
 const r=show(m.get('learning-mapping'),summary());
 const unmappedRow=byText(r.tree,'div',/实验方法/).filter(n=>n.props.className==='lw-row')[0];
 click(one(unmappedRow,'button','选择学科'));await r.settle();
 assert.equal(label(r.tree,'映射到').props.value,'create');change(label(r.tree,'新学科名称'),' 实验方法 ');
 submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls.at(-1),{name:'mapping-set',input:{sourceId:'hub',sourceSubjectRef:'course-c',target:{create:{name:'实验方法'}}}});
 assert.equal(r.state.refreshed,1);assert.equal(findAll(r.tree,n=>n.props.role==='dialog').length,0);
 const mapped=byText(r.tree,'div',/基础生理 · 秋季班/).filter(n=>n.props.className==='lw-row')[0];
 click(one(mapped,'button','修改映射'));await r.settle();
 const options=findAll(label(r.tree,'映射到'),n=>n.type==='option').map(text);
 assert.ok(options.includes('药理基础（同名 2）'));assert.ok(options.includes('cal-pharm（来源指定）'));
 change(label(r.tree,'映射到'),'id:subject_b2');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls.at(-1).input.target,{existingId:'subject_b2'});
 assert.ok(calls.every(c=>!['save-mapping','save-exam'].includes(c.name)));
});
test('source-given mappings are read-only; inactive mappings stay listed read-only; local ones can be removed',async()=>{
 const calls=[],r=show(mount(async(name,input)=>{calls.push({name,input});return {saved:true};}).get('learning-mapping'),summary());
 const source=byText(r.tree,'div',/来源已指定，只读/).filter(n=>n.props.className==='lw-row')[0];
 assert.equal(byText(source,'button',/./).length,0);
 assert.match(text(r.tree),/不参与当前统计的映射（1）/);
 const old=byText(r.tree,'div',/旧课程/).filter(n=>n.props.className==='lw-row')[0];assert.equal(byText(old,'button',/./).length,0);
 const mapped=byText(r.tree,'div',/基础生理 · 秋季班/).filter(n=>n.props.className==='lw-row')[0];
 click(one(mapped,'button','取消映射'));await r.settle();submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls,[{name:'mapping-remove',input:{sourceId:'hub',sourceSubjectRef:'course-a'}}]);
});
test('subject rename and create carry only names, rename returns the existing ID',async()=>{
 const calls=[],r=show(mount(async(name,input)=>{calls.push({name,input});return {saved:true};}).get('learning-mapping'),summary());
 click(byText(r.tree,'button','改名')[0]);await r.settle();change(label(r.tree,'学科名称'),'生理学');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 click(one(r.tree,'button','新建学科'));await r.settle();change(label(r.tree,'学科名称'),'病理');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls,[{name:'subject-rename',input:{subjectId:'subject_a1',name:'生理学'}},{name:'subject-create',input:{name:'病理'}}]);
});
test('exam create has no ID field; update returns the ID untouched and keeps a legacy instant as at',async()=>{
 const calls=[],r=show(mount(async(name,input)=>{calls.push({name,input});return {saved:true};}).get('learning-planning'),summary({mode:'subject',subjectRef:'subject_a1'}));
 const dialog=await openDialog(r,'添加考试');
 assert.ok(!/ID|编号输入/.test(findAll(dialog,n=>n.type==='label').map(text).join()));
 assert.equal(label(r.tree,'学科').props.value,'subject_a1');
 change(label(r.tree,'考试名称'),'期中考试');change(label(r.tree,'考试日期'),'2026-11-30');change(label(r.tree,'学科'),'');
 submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls[0],{name:'exam-create',input:{title:'期中考试',subjectRef:null,due:{date:'2026-11-30',timeZone:'Asia/Shanghai'}}});
 const row=byText(r.tree,'div',/旧口试/).filter(n=>n.props.className==='lw-row')[0];
 click(one(row,'button','编辑'));await r.settle();
 assert.equal(label(r.tree,'考试时间（带时区偏移）').props.value,'2026-11-18T09:00:00+08:00');
 change(label(r.tree,'考试名称'),'口试（改）');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls[1],{name:'exam-update',input:{id:'legacy-oral',title:'口试（改）',subjectRef:'subject_a1',due:{at:'2026-11-18T09:00:00+08:00',timeZone:'Asia/Shanghai'}}});
});
test('goal dialog targets the scope in view and sends a numeric count',async()=>{
 const calls=[],m=mount(async(name,input)=>{calls.push({name,input});return {saved:true};});
 const r=show(m.get('learning-planning'),summary({mode:'subject',subjectRef:'subject_a1'}));
 await openDialog(r,'设置目标');assert.equal(label(r.tree,'每日复习次数').props.value,'20');
 change(label(r.tree,'每日复习次数'),'24');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls,[{name:'save-goal',input:{subjectRef:'subject_a1',count:24,timeZone:'Asia/Shanghai'}}]);assert.equal(r.state.refreshed,1);
 const all=show(m.get('learning-planning'),compute({records,now}));await openDialog(all,'设置目标');
 change(label(all.tree,'每日复习次数'),'12');submit(findAll(all.tree,n=>n.type==='form')[0]);await all.settle();
 assert.deepEqual(calls[1],{name:'save-goal',input:{subjectRef:null,count:12,timeZone:'Asia/Shanghai'}});
});
test('failed actions keep the form, say why by code, do not refresh and are not resent',async()=>{
 const cases=[[Object.assign(Error('x'),{code:'BUSY'}),/操作进行中/],[Error('disk'),/^未能保存，请检查填写内容后再试，表单已保留。$/],[Object.assign(Error('x'),{code:'STORAGE_FAILED'}),/未能确认保存/],[Object.assign(Error('x'),{code:'INVALID_INPUT',field:'name'}),/名称填写有误/]];
 for(const [error,message] of cases){
  let calls=0;const r=show(mount(async()=>{calls++;throw error;}).get('learning-planning'),summary());
  await openDialog(r,'添加考试');change(label(r.tree,'考试名称'),'保留的名称');change(label(r.tree,'考试日期'),'2026-12-01');
  submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
  assert.match(text(findAll(r.tree,n=>n.props.role==='alert')[0]),message);assert.equal(label(r.tree,'考试名称').props.value,'保留的名称');
  assert.equal(r.state.refreshed,0);assert.equal(calls,1);assert.doesNotMatch(text(r.tree),/已保存/);
 }
 const r=show(mount(async()=>{throw Object.assign(Error('x'),{code:'NOT_FOUND'});}).get('learning-planning'),summary());
 await openDialog(r,'添加考试');change(label(r.tree,'考试名称'),'x');change(label(r.tree,'考试日期'),'2026-12-01');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.match(text(r.tree),/已不存在。列表已刷新/);assert.equal(r.state.refreshed,1);assert.equal(label(r.tree,'考试名称').props.value,'x');
});
test('a pending save disables the form so a second click sends nothing',async()=>{
 let release,calls=0;const r=show(mount(()=>{calls++;return new Promise(ok=>{release=ok;});}).get('learning-planning'),summary());
 await openDialog(r,'添加考试');change(label(r.tree,'考试名称'),'a');change(label(r.tree,'考试日期'),'2026-12-01');
 const form=findAll(r.tree,n=>n.type==='form')[0];submit(form);await r.settle();
 assert.equal(findAll(r.tree,n=>n.type==='fieldset')[0].props.disabled,true);submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();assert.equal(calls,1);
 release({saved:true});await r.settle();assert.equal(r.state.refreshed,1);
});
test('pair confirmation and range use the backend IDs as handed over',async()=>{
 const calls=[],r=show(mount(async(name,input)=>{calls.push({name,input});return {saved:true};}).get('learning-planning'),summary());
 click(one(r.tree,'button','是同一场'));await r.settle();submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 const row=byText(r.tree,'div',/实验方法检查/).filter(n=>n.props.className==='lw-row')[0];click(one(row,'button','设置剩余量'));await r.settle();
 change(label(r.tree,'尚未完成的数量'),'8');change(label(r.tree,'单位'),'card');submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls,[{name:'confirm-pair',input:{ids:['["cal","u9"]','["local","exam_1"]'],same:true}},{name:'save-range',input:{examId:'["local","exam_1"]',remaining:8,unit:'card'}}]);
});

// --- legacy IDs and re-reads ---
test('a legacy subject whose ID is "new" maps as an existing subject, not as "create"',async()=>{
 const calls=[],base=summary(),legacy={id:'new',name:'旧学科',origin:'local'};
 const value={...base,subjects:[...base.subjects,{id:'new',name:'旧学科'}],subjectOptions:[...base.subjectOptions,legacy]};
 const r=show(mount(async(name,input)=>{calls.push({name,input});return {saved:true};}).get('learning-mapping'),value);
 const row=byText(r.tree,'div',/实验方法/).filter(n=>n.props.className==='lw-row')[0];
 click(one(row,'button','选择学科'));await r.settle();
 const option=findAll(label(r.tree,'映射到'),n=>n.type==='option').find(o=>text(o)==='旧学科');
 change(label(r.tree,'映射到'),option.props.value);submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.deepEqual(calls,[{name:'mapping-set',input:{sourceId:'hub',sourceSubjectRef:'course-c',target:{existingId:'new'}}}]);
});
test('a subject kept only by a manual exam offers no rename the backend would refuse',()=>{
 const base=summary();
 const value={...base,subjects:[],mappingRows:[],subjectOptions:[{id:'canonical',name:'canonical',origin:'local'},{id:'cal-pharm',name:'cal-pharm',origin:'source'}],
  localExams:[{id:'exam_9',title:'保留考试',subjectRef:'canonical',due:{date:'2026-11-30',timeZone:'Asia/Shanghai'}}]};
 const tree=show(mount().get('learning-mapping'),value).tree;
 const kept=byText(tree,'div',/^\s*canonical/).filter(n=>n.props.className==='lw-row')[0];
 assert.equal(byText(kept,'button',/./).length,0);assert.match(text(kept),/暂不能改名/);
 const source=byText(tree,'div',/cal-pharm（来源指定）/).filter(n=>n.props.className==='lw-row')[0];one(source,'button','补充名称');
 const local=show(mount().get('learning-mapping'),summary()).tree;
 const subjects=byText(local,'section',/^\s*本地学科/)[0];one(byText(subjects,'div',/^\s*基础生理/).filter(n=>n.props.className==='lw-row')[0],'button','改名');
});
test('a done save whose re-read fails says saved and that the data could not be read; NOT_FOUND re-reads first',async()=>{
 const views=mount(async()=>({saved:true}));
 const r=render(h(views.get('learning-planning').Component,{value:summary(),refresh:async()=>{throw Error('read failed');}}));
 click(one(r.tree,'button','添加考试'));change(label(r.tree,'考试名称'),'a');change(label(r.tree,'考试日期'),'2026-12-01');
 submit(findAll(r.tree,n=>n.type==='form')[0]);await r.settle();
 assert.equal(findAll(r.tree,n=>n.props.role==='dialog').length,0);assert.match(text(findAll(r.tree,n=>n.props.role==='alert')[0]),/已保存。未能读取最新数据/);
 const gone=render(h(mount(async()=>{throw Object.assign(Error('x'),{code:'NOT_FOUND'});}).get('learning-planning').Component,{value:summary(),refresh:async()=>{throw Error('read failed');}}));
 click(one(gone.tree,'button','添加考试'));change(label(gone.tree,'考试名称'),'b');change(label(gone.tree,'考试日期'),'2026-12-01');
 submit(findAll(gone.tree,n=>n.type==='form')[0]);await gone.settle();
 assert.match(text(gone.tree),/该条目已不存在。未能读取最新数据/);assert.doesNotMatch(text(gone.tree),/列表已刷新/);assert.equal(label(gone.tree,'考试名称').props.value,'b');
});

// --- wording and display ---
test('mastery cards explain each scale in words and keep the source method in the collapsed details',()=>{
 const tree=show(mount().get('learning-mastery'),summary()).tree;
 const cardOf=name=>findAll(tree,n=>n.type==='section'&&n.props.className==='lw-card'&&findAll(n,c=>c.type==='h2'&&text(c)===name).length)[0];
 const a1=cardOf('基础生理'),details=findAll(a1,n=>n.type==='details')[0];
 const outside=text({...a1,children:a1.children.filter(c=>c!==details)});
 assert.doesNotMatch(outside,/StudyHub 4\.6\.0|focusProgress|Asia\/Singapore|R>=0\.9/);
 assert.match(outside,/达到可提取率阈值（R≥0\.9）的卡片占全部卡片的比例/);assert.match(outside,/72 \/ 100 张卡片达到阈值/);
 assert.match(outside,/来源未提供学科汇总，各主题等级见下方/);assert.doesNotMatch(outside,/重点主题等级\s+未知/);
 assert.equal(details.props.open,undefined);assert.match(text(details),/口径详情与测量记录/);
 assert.match(text(details),/来源口径原文：StudyHub 4\.6\.0 lib\/sm2\.js/);assert.match(text(details),/focusProgress/);
 assert.match(text(details),/调度时区：Asia\/Singapore（StudyHub 调度器所在机器的本地时区/);
 const b2=text(cardOf('药理基础'));assert.match(b2,/记忆比例\s+0\.0%/);assert.match(b2,/0 \/ 5 张卡片达到阈值/);assert.doesNotMatch(b2,/记忆比例\s+未知/);
});
test('under all subjects, subject goals without a global goal are counted, not summed',()=>{
 const v=summary(),value={...v,plans:v.plans.filter(p=>p.subjectRef!==null)};
 for(const id of ['learning-overview','learning-planning']){const output=out(mount().get(id),value);assert.match(output,/未设总目标，已有 1 个学科目标/);assert.doesNotMatch(output,/尚未设置目标/);}
 assert.match(out(mount().get('learning-overview'),{...v,plans:[]}),/尚未设置目标/);
});
test('manual exams without a subject say so; source exams without one stay unmapped',()=>{
 const v=summary(),value={...v,exams:[...v.exams,{...v.exams[2],id:'["cal","u7"]',sourceId:'cal',subjectRef:null,title:'来源未分学科考试'}]};
 const tree=show(mount().get('learning-planning'),value).tree;
 assert.match(text(byText(tree,'div',/^\s*实验方法检查/).filter(n=>n.props.className==='lw-row')[0]),/未指定学科 · 2026-11-13/);
 assert.match(text(byText(tree,'div',/^\s*来源未分学科考试/).filter(n=>n.props.className==='lw-row')[0]),/未映射学科 · 2026-11-20/);
 const all=text(byText(tree,'section',/全部手工考试/)[0]);assert.match(all,/实验方法检查\s+未指定学科/);assert.doesNotMatch(all,/未映射学科/);
});
test('confirmed pairs show instants as everywhere else; plan line and delete confirmations are tidy',async()=>{
 const v=summary(),oral={id:'["local","legacy-oral"]',title:'旧口试',due:{at:'2026-11-18T09:00:00+08:00',timeZone:'Asia/Shanghai'}};
 const r=show(mount().get('learning-planning'),{...v,pairDetails:[{ids:['a','b'],same:false,active:true,exams:[oral,v.pairDetails[0].exams[1]]}]});
 const pairs=text(byText(r.tree,'details',/已确认/)[0]);
 assert.match(pairs,/手工录入「旧口试」2026-11-18 09:00（\+08:00）/);assert.doesNotMatch(pairs,/T09:00/);
 assert.match(text(r.tree),/计划：30 次；实际：18；还需：12/);assert.doesNotMatch(text(r.tree),/实际−计划/);
 click(byText(r.tree,'button','删除').filter(b=>text(b)==='删除')[0]);await r.settle();
 assert.equal(one(findAll(r.tree,n=>n.props.role==='dialog')[0],'button','确认删除').props.className,'lw-btn lw-danger');
});
test('time zone fields default to Asia/Shanghai and suggest common zones while staying free text',async()=>{
 const r=show(mount().get('learning-planning'),summary());
 click(one(r.tree,'button','添加考试'));await r.settle();
 const zone=label(r.tree,'时区');assert.equal(zone.props.value,'Asia/Shanghai');assert.equal(zone.props.list,'lw-zones');
 const list=findAll(r.tree,n=>n.type==='datalist'&&n.props.id==='lw-zones')[0];assert.ok(findAll(list,n=>n.type==='option').some(o=>o.props.value==='Asia/Tokyo'));
 change(zone,'Pacific/Auckland');assert.equal(label(r.tree,'时区').props.value,'Pacific/Auckland');
});

// --- field checks and confirmations ---
const formOf=r=>findAll(r.tree,n=>n.type==='form')[0];
const fieldErrors=r=>findAll(formOf(r),n=>n.props.className==='lw-field-error').map(text);
test('every form names its wrong field before sending, and the message follows the field as it is fixed',async()=>{
 const calls=[],m=mount(async(name,input)=>{calls.push({name,input});return {saved:true};});
 const map=show(m.get('learning-mapping'),summary());
 click(one(byText(map.tree,'div',/基础生理/).filter(n=>n.props.className==='lw-row').at(-1),'button','改名'));await map.settle();
 change(label(map.tree,'学科名称'),'  ');submit(formOf(map));await map.settle();
 assert.deepEqual(fieldErrors(map),['名称不能为空']);assert.equal(label(map.tree,'学科名称').props['aria-invalid'],'true');
 change(label(map.tree,'学科名称'),'生理学');assert.deepEqual(fieldErrors(map),[]);map.unmount();
 const create=show(m.get('learning-mapping'),summary());
 click(one(byText(create.tree,'div',/实验方法/).filter(n=>n.props.className==='lw-row')[0],'button','选择学科'));await create.settle();
 change(label(create.tree,'映射到'),'create');change(label(create.tree,'新学科名称'),'');submit(formOf(create));await create.settle();
 assert.deepEqual(fieldErrors(create),['名称不能为空']);create.unmount();
 const plan=show(m.get('learning-planning'),summary());
 await openDialog(plan,'添加考试');change(label(plan.tree,'时区'),'Shanghai');submit(formOf(plan));await plan.settle();
 assert.deepEqual(fieldErrors(plan),['名称不能为空','日期不能为空','时区请填如 Asia/Shanghai 的名称']);
 change(label(plan.tree,'考试名称'),'期中');change(label(plan.tree,'考试日期'),'2026-12-01');change(label(plan.tree,'时区'),'Asia/Tokyo ');
 assert.deepEqual(fieldErrors(plan),[]);submit(formOf(plan));await plan.settle();
 assert.deepEqual(calls.at(-1),{name:'exam-create',input:{title:'期中',subjectRef:null,due:{date:'2026-12-01',timeZone:'Asia/Tokyo'}}});plan.unmount();
 const oral=show(m.get('learning-planning'),summary());
 click(one(byText(oral.tree,'div',/旧口试/).filter(n=>n.props.className==='lw-row').at(-1),'button','编辑'));await oral.settle();
 change(label(oral.tree,'考试时间（带时区偏移）'),'2026-11-18 09:00');submit(formOf(oral));await oral.settle();
 assert.deepEqual(fieldErrors(oral),['时间请填如 2026-12-01T09:00:00+08:00 的格式']);oral.unmount();
 const goal=show(m.get('learning-planning'),summary());
 click(one(goal.tree,'button','设置目标'));await goal.settle();change(label(goal.tree,'每日复习次数'),'');change(label(goal.tree,'学习日时区'),'');submit(formOf(goal));await goal.settle();
 assert.deepEqual(fieldErrors(goal),['次数不能为空','时区请填如 Asia/Shanghai 的名称']);
 change(label(goal.tree,'每日复习次数'),'1.5');assert.deepEqual(fieldErrors(goal).slice(0,1),['次数请填 0 或正整数']);goal.unmount();
 const range=show(m.get('learning-planning'),summary());
 click(one(byText(range.tree,'div',/实验方法检查/).filter(n=>n.props.className==='lw-row')[0],'button','设置剩余量'));await range.settle();
 change(label(range.tree,'尚未完成的数量'),'-2');submit(formOf(range));await range.settle();
 assert.deepEqual(fieldErrors(range),['数量请填 0 或正整数']);
 assert.equal(calls.length,1);
});
test('confirm dialogs say what each button does and what the result will be',async()=>{
 const map=show(mount().get('learning-mapping'),summary());
 click(byText(map.tree,'button','取消映射')[0]);await map.settle();
 const dialog=findAll(map.tree,n=>n.props.role==='dialog')[0];
 assert.deepEqual(findAll(dialog,n=>n.type==='footer')[0].children.map(text),['保留映射','取消映射']);
 const plan=show(mount().get('learning-planning'),summary());
 click(one(byText(plan.tree,'div',/实验方法检查/).filter(n=>n.props.className==='lw-row')[0],'button','设置剩余量'));await plan.settle();
 assert.equal(findAll(plan.tree,n=>n.props.role==='dialog')[0].props['aria-label'],'设置剩余量');one(formOf(plan),'button','保存剩余量');
 click(one(plan.tree,'button','×'));await plan.settle();
 click(one(plan.tree,'button','是同一场'));await plan.settle();assert.match(text(formOf(plan)),/考试时间线把这两场合并为一场显示/);
 click(one(plan.tree,'button','×'));await plan.settle();
 click(one(plan.tree,'button','保留为两场'));await plan.settle();assert.match(text(formOf(plan)),/两场都保留在考试时间线上/);
});
test('confirmed pairs name both sources and follow the subject filter as candidates do',()=>{
 const listed=filter=>{const r=show(mount().get('learning-planning'),summary(filter)),d=byText(r.tree,'details',/已确认/)[0];return d?findAll(d,n=>n.type==='p').map(text):[];};
 assert.deepEqual(listed({mode:'all'}),['课程日历「基础生理阶段测验」2026-11-20 ↔ 我的学习库「基础生理阶段测验」2026-11-20','来源不可用（保留确认） ↔ 手工录入「实验方法检查」2026-11-13']);
 assert.deepEqual(listed({mode:'subject',subjectRef:'subject_a1'}),['课程日历「基础生理阶段测验」2026-11-20 ↔ 我的学习库「基础生理阶段测验」2026-11-20']);
 assert.deepEqual(listed({mode:'unmapped'}),['来源不可用（保留确认） ↔ 手工录入「实验方法检查」2026-11-13']);
 assert.deepEqual(listed({mode:'subject',subjectRef:'subject_b2'}),[]);
});

// --- keyboard and time display ---
const dialogOf=r=>findAll(r.tree,n=>n.props.role==='dialog')[0];
const inDialog=r=>dialogOf(r).el.contains(document.activeElement);
test('a dialog takes the keyboard: focus goes in, Tab cycles inside, Esc cancels and focus returns to the opener',async()=>{
 const map=show(mount().get('learning-mapping'),summary());
 const opener=byText(map.tree,'button','取消映射')[0];opener.el.focus();click(opener);await map.settle();
 assert.equal(text(focused()),'保留映射');
 // Tabbing round twice, either way, never reaches the background, whose "选择学科" would open another dialog.
 const seen=new Set();
 for(let i=0;i<6;i++){press('Tab');assert.ok(inDialog(map));seen.add(text(focused()));}
 assert.deepEqual([...seen].sort(),['×','保留映射','取消映射'].sort());
 for(let i=0;i<6;i++){press('Tab',{shiftKey:true});assert.ok(inDialog(map));}
 one(dialogOf(map),'button','×').el.focus();press('Tab',{shiftKey:true});assert.equal(text(focused()),'取消映射');
 // Focus that left the dialog (a click on the backdrop) comes back in on the next Tab.
 document.body.focus();press('Tab');assert.equal(text(focused()),'×');
 press('Escape');await map.settle();
 assert.equal(dialogOf(map),undefined);assert.equal(focused(),byText(map.tree,'button','取消映射')[0]);
});
test('Esc does nothing while a submit runs with cancel locked, nor while an input method composes',async()=>{
 let release;const r=show(mount(()=>new Promise(ok=>{release=ok;})).get('learning-planning'),summary());
 click(one(r.tree,'button','添加考试'));await r.settle();
 change(label(r.tree,'考试名称'),'期中');press('Escape',{isComposing:true});assert.ok(dialogOf(r));
 change(label(r.tree,'考试日期'),'2026-12-01');submit(formOf(r));await r.settle();
 assert.equal(one(formOf(r),'button','取消').props.disabled,undefined);assert.equal(findAll(formOf(r),n=>n.type==='fieldset')[0].props.disabled,true);
 press('Escape');assert.ok(dialogOf(r));
 release({saved:true});await r.settle();assert.equal(dialogOf(r),undefined);
});
test('a blocked submit focuses the first wrong field, whose message describes it',async()=>{
 const r=show(mount().get('learning-planning'),summary());
 click(one(r.tree,'button','添加考试'));await r.settle();assert.equal(focused(),label(r.tree,'考试名称'));
 one(formOf(r),'button','添加考试').el.focus();submit(formOf(r));await r.settle();
 const name=label(r.tree,'考试名称');assert.equal(focused(),name);assert.equal(name.props['aria-invalid'],'true');
 const message=findAll(formOf(r),n=>n.props.id===name.props['aria-describedby'])[0];assert.equal(text(message),'名称不能为空');
 change(name,'期中');assert.equal(label(r.tree,'考试名称').props['aria-describedby'],undefined);
 submit(formOf(r));await r.settle();assert.equal(focused(),label(r.tree,'考试日期'));
});
test('the exam form and the timeline name a manual exam without a subject alike',async()=>{
 const r=show(mount().get('learning-planning'),summary());
 click(one(r.tree,'button','添加考试'));await r.settle();
 assert.equal(text(findAll(label(r.tree,'学科'),n=>n.type==='option'&&n.props.value==='')[0]),'未指定学科');
 assert.match(text(r.tree),/实验方法检查\s+未指定学科/);
});
test('measurement times show in the page display zone and format, to the second',()=>{
 const asOf='2026-11-16T00:49:45.252Z',v=summary(),value={...v,mastery:v.mastery.map(m=>({...m,trend:m.trend.map(t=>({...t,asOf}))}))};
 const details=text(findAll(show(mount().get('learning-mastery'),value).tree,n=>n.type==='details')[0]);
 assert.ok(details.includes(new Date(asOf).toLocaleString('zh-CN')));assert.doesNotMatch(details,/\.252|（UTC）|T00:49/);
 assert.match(details,/来源口径原文：StudyHub 4\.6\.0/);
});

// --- mastery overview ---
const compareOf=tree=>findAll(tree,n=>n.type==='section'&&/\blw-compare\b/.test(n.props.className))[0];
test('mastery overview puts every group in one table, the two scales in their own columns',()=>{
 const tree=show(mount().get('learning-mastery'),summary()).tree,table=compareOf(tree);
 const rows=findAll(table,n=>n.type==='tr').slice(1),cells=rows.map(r=>r.children.map(c=>text(c).replace(/\s+/g,' ')));
 assert.deepEqual(findAll(table,n=>n.type==='th'&&n.props.scope==='col').map(text),['学科','记忆比例','重点主题等级']);
 assert.equal(rows.length,3);
 const [a1,b2,lab]=cells;
 assert.deepEqual(a1,['基础生理 我的学习库','72.0% 72 / 100 张 最弱主题：循环调节 · 38.0%','来源未提供学科汇总 最弱主题：循环调节 · 38']);
 assert.deepEqual(b2.slice(0,2),['药理基础 我的学习库','0.0% 0 / 5 张 最弱主题：药物代谢 · 0.0%']);
 // A missing scale is a dash with words for screen readers, never 未知.
 assert.equal(b2[2],'— 无此口径');assert.equal(findAll(rows[1].children[2],n=>n.props?.['aria-hidden']==='true').map(text)[0],'—');
 assert.equal(findAll(rows[1].children[2],n=>n.props?.className==='lw-sr').map(text)[0],'无此口径');
 // An unmapped course keeps its source name and mark; a scale with no value says 未知, not 0 and no card count.
 assert.deepEqual(lab,['实验方法 我的学习库 · 未映射','未知 薄弱主题：不可用','— 无此口径']);
 assert.equal(findAll(rows[2].children[1],n=>/lw-track/.test(n.props?.className)).length,0);
 assert.match(text(table),/“—”表示该来源没有这个口径；“未知”表示有这个口径但来源没有给出数值/);assert.doesNotMatch(text(table),/总分|综合/);
});
test('mastery overview rows follow the detail cards and each jumps to its own card',()=>{
 const r=show(mount().get('learning-mastery'),summary()),table=compareOf(r.tree);
 const cards=findAll(r.tree,n=>n.type==='section'&&n.props.className==='lw-card'&&n.props.id);
 const buttons=findAll(table,n=>n.type==='button');
 assert.deepEqual(cards.map(c=>text(findAll(c,n=>n.type==='h2')[0]).replace('映射学科','')),buttons.map(text));
 assert.deepEqual(buttons.map(b=>b.props['aria-controls']),cards.map(c=>c.props.id));
 assert.equal(new Set(cards.map(c=>c.props.id)).size,3);assert.ok(cards.every(c=>c.props.tabIndex===-1));
 assert.equal(buttons[2].props['aria-label'],'实验方法：查看详情');
 buttons.forEach((b,i)=>{click(findAll(compareOf(r.tree),n=>n.type==='button')[i]);
  assert.equal(focused().props.id,cards[i].props.id);assert.equal(document.scrolled.el.vnode.props.id,cards[i].props.id);assert.deepEqual(document.scrolled.options,{block:'start'});});
});
test('mastery overview is left out when the scope has a single group or none',()=>{
 for(const value of [summary({mode:'subject',subjectRef:'subject_a1'}),summary({mode:'unmapped'}),summary({mode:'subject',subjectRef:'gone'})]){
  const tree=show(mount().get('learning-mastery'),value).tree;assert.equal(compareOf(tree),undefined);assert.doesNotMatch(text(tree),/各学科一览/);
 }
});
test('while a submit runs, × is locked like Esc and cancel: focus stays in the dialog and a later failure is still shown',async()=>{
 let fail;const r=show(mount(()=>new Promise((ok,no)=>{fail=no;})).get('learning-planning'),summary());
 one(r.tree,'button','添加考试').el.focus();click(one(r.tree,'button','添加考试'));await r.settle();
 change(label(r.tree,'考试名称'),'期中');change(label(r.tree,'考试日期'),'2026-12-01');
 one(formOf(r),'button','添加考试').el.focus();submit(formOf(r));await r.settle();
 // The submit button went disabled under the focus; the dialog holds it, and Tab finds only the locked ×.
 assert.equal(focused(),dialogOf(r));
 press('Tab');const x=focused();assert.equal(text(x),'×');assert.equal(x.props['aria-disabled'],'true');
 for(let i=0;i<3;i++){press('Tab');assert.equal(focused(),x);press('Tab',{shiftKey:true});assert.equal(focused(),x);}
 click(x);press('Escape');await r.settle();assert.ok(dialogOf(r));
 fail(Object.assign(Error('x'),{code:'STORAGE_FAILED'}));await r.settle();
 assert.match(text(dialogOf(r)),/未能确认保存，请重新加载后查看/);assert.equal(label(r.tree,'考试名称').props.value,'期中');
 const open=one(dialogOf(r),'button','×');assert.equal(open.props['aria-disabled'],undefined);
 click(open);await r.settle();assert.equal(dialogOf(r),undefined);assert.equal(focused(),one(r.tree,'button','添加考试'));
});
