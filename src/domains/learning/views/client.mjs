/** Self-contained client: host React/charts only; no backend imports. Values arrive computed and filtered by learning-summary. */
export default function({React,charts,registerView,invoke}) {
 const h=React.createElement,n=value=>value===null||value===undefined?'未知':String(value);
 const unit=value=>({question:'题',card:'卡片'})[value]??'未知单位';
 const local=e=>e.sourceId==='local';
 const subjectName=(v,id)=>id===null||id===undefined?'未映射学科':v.subjectOptions?.find(s=>s.id===id)?.name??v.subjects?.find(s=>s.id===id)?.name??id;
 const scopeLabel=v=>v.filter?.mode==='unmapped'?'未映射学科':v.filter?.mode==='subject'?subjectName(v,v.filter.subjectRef):'全部学科';
 // A manual exam saved without a subject has none by choice; only source subjects can be unmapped.
 const examSubject=(v,e,manual=local(e))=>manual&&e.subjectRef===null?'未指定学科':subjectName(v,e.subjectRef);
 const sourceTitle=(v,id)=>id==='local'?'手工录入':v.sources?.find(s=>s.id===id)?.title??id;
 // An instant is shown as written, only spaced for reading: no zone conversion in the browser.
 const atText=at=>at.replace(/^(\d{4}-\d\d-\d\d)T([\d:.]+?)(?::00)?([+-]\d\d:\d\d|Z)$/,'$1 $2（$3）').replace('（Z）','（UTC）');
 const dayText=due=>due.date??atText(due.at),whenText=due=>`${dayText(due)} · ${due.timeZone}`;
 const countdown=e=>e.expired?'已结束':e.days===0?'今天':`${e.days} 天`;
 const card=(props,...children)=>h('section',{className:'lw-card',...props},...children);
 const head=(title,...extra)=>h('div',{className:'lw-head'},h('h2',null,title),...extra);
 const unavailable=label=>h('p',{className:'lw-muted'},`${label}：不可用`);
 const btn=(label,onClick,kind='')=>h('button',{type:'button',className:'lw-btn '+kind,onClick},label);
 const track=(value,max)=>value===null||!max?null:h('div',{className:'lw-track','aria-hidden':'true'},h('span',{style:{width:`${Math.min(100,Math.max(0,value/max*100))}%`}}));
 // Same names get a running number; source-given subjects are marked, so nobody has to read an ID.
 const choices=v=>{const seen=new Map();return (v.subjectOptions??v.subjects?.map(s=>({...s,origin:'local'}))??[]).map(o=>{const c=(seen.get(o.name)??0)+1;seen.set(o.name,c);return [o.id,o.name+(c>1?`（同名 ${c}）`:'')+(o.origin==='source'?'（来源指定）':'')];});};
 const FIELDS={name:'名称',title:'名称',date:'日期',at:'时间',timeZone:'时区',count:'数量',remaining:'剩余量'};
 function failureText(e){
  switch(e?.code){
   case 'BUSY':return '同步/操作进行中，请结束后再保存。表单已保留。';
   case 'REVISION_CONFLICT':return '设置已变化，请重新打开编辑。';
   case 'NOT_FOUND':return '该条目已不存在。';
   case 'INVALID_INPUT':return e.field&&FIELDS[e.field]?`${FIELDS[e.field]}填写有误，请检查后再保存。`:'输入有误，请检查后再保存。';
   case 'STORAGE_FAILED':return '未能确认保存，请重新加载后查看。';
   case 'DUPLICATE_SOURCE':return '此来源已经接入。';
   default:return '未能保存，请检查填写内容后再试，表单已保留。';
  }
 }
 // A modal owns the keyboard while open: focus goes in, Tab cycles inside, Esc and × act as its cancel (neither while
 // cancel is locked by a running submit; × then stays focusable as aria-disabled, so Tab always has a stop), and focus
 // goes back to the opener on close. Each blocked submit (attempt) focuses the first invalid field. Esc while an input method is composing only ends the composition.
 const FOCUSABLE='button,input,select,textarea,a[href],[tabindex]';
 const stops=el=>[...el.querySelectorAll(FOCUSABLE)].filter(x=>x.tabIndex>=0&&!x.matches(':disabled'));
 function Dialog({title,onClose,locked=false,attempt=0,children}){
  const box=React.useRef(null),body=React.useRef(null),latest=React.useRef(null);latest.current={onClose,locked};
  React.useEffect(()=>{
   const opener=document.activeElement;stops(body.current)[0].focus();
   function key(e){
    if(e.isComposing)return;
    if(e.key==='Escape'){if(!latest.current.locked){e.preventDefault();latest.current.onClose();}return;}
    if(e.key!=='Tab')return;
    // From outside the stops (the dialog itself while a submit runs, or the page) Tab enters at an end; at an end it wraps.
    const list=stops(box.current),i=list.indexOf(document.activeElement);
    if(i<0||i===(e.shiftKey?0:list.length-1)){e.preventDefault();list[e.shiftKey?list.length-1:0].focus();}
   }
   document.addEventListener('keydown',key);
   return ()=>{document.removeEventListener('keydown',key);opener.focus();};
  },[]);
  React.useEffect(()=>{if(attempt)box.current.querySelector('[aria-invalid="true"]').focus();},[attempt]);
  // A running submit disables the control under the focus; the dialog itself then holds it, so it stays in the modal.
  React.useEffect(()=>{if(locked&&!stops(box.current).includes(document.activeElement))box.current.focus();},[locked]);
  return h('div',{className:'lw-backdrop'},h('div',{ref:box,tabIndex:-1,className:'lw-dialog',role:'dialog','aria-modal':'true','aria-label':title},
   h('div',{className:'lw-dialog-head'},h('h2',null,title),h('button',{type:'button',className:'lw-btn','aria-label':'关闭','aria-disabled':locked?'true':undefined,onClick:()=>{if(!locked)onClose();}},'×')),
   h('div',{ref:body,className:'lw-dialog-body'},children)));
 }
 // One submit per click: busy disables the form, failure keeps every field, nothing is resent by itself.
 // A failed re-read is said, never retried, and never turns a done save into a failure.
 const REREAD_FAILED='未能读取最新数据，请重新加载工作台。';
 const reread=async refresh=>{try{await refresh();return true;}catch{return false;}};
 function useSubmit(refresh,onDone,onStale){
  const [state,setState]=React.useState({busy:false,error:''});
  async function run(name,input){
   setState({busy:true,error:''});
   try{await invoke(name,input);}
   catch(e){
    const text=failureText(e);
    setState({busy:false,error:e?.code==='NOT_FOUND'?text+(await reread(refresh)?'列表已刷新。':REREAD_FAILED):text});
    return false;
   }
   setState({busy:false,error:''});onDone?.();
   if(!await reread(refresh))onStale?.();
   return true;
  }
  return [state,run];
 }
 const footer=(state,onClose,label,kind='lw-primary',cancel='取消')=>[state.error&&h('p',{key:'e',className:'lw-error',role:'alert'},state.error),
  h('footer',{key:'f'},h('button',{type:'button',className:'lw-btn',onClick:onClose},cancel),h('button',{type:'submit',className:'lw-btn '+kind,disabled:state.busy},state.busy?'正在保存…':label))];
 // Common zones as suggestions only: any IANA name can still be typed.
 const ZONES=['Asia/Shanghai','Asia/Hong_Kong','Asia/Taipei','Asia/Tokyo','Asia/Seoul','Asia/Singapore','Europe/London','Europe/Berlin','America/New_York','America/Los_Angeles','Australia/Sydney','UTC'];
 const zoneInput=(label,value,set,error)=>h(React.Fragment,null,input(label,value,set,{required:true,list:'lw-zones'},error),h('datalist',{id:'lw-zones'},...ZONES.map(z=>h('option',{key:z,value:z}))));
 // A field's message describes its input; labels are unique within the one open dialog, and an id holds no space.
 const errorId=label=>'lw-error-'+label.replace(/\s/g,'');
 const input=(label,value,set,props={},error)=>h('label',null,label,h('input',{value:value??'',onChange:e=>set(e.target.value),'aria-label':label,'aria-invalid':error?'true':undefined,'aria-describedby':error?errorId(label):undefined,...props}),
  error&&h('span',{id:errorId(label),className:'lw-field-error',role:'alert'},error));
 // The backend answers a learning-view action with a bare 422, so each form names its wrong field before sending.
 const need=(value,name)=>value.trim()?'':`${name}不能为空`;
 const zoneError=value=>{try{if(value.trim()){new Intl.DateTimeFormat('en',{timeZone:value.trim()});return '';}}catch{}return '时区请填如 Asia/Shanghai 的名称';};
 const countError=(value,name)=>need(value,name)||(Number.isSafeInteger(Number(value))&&Number(value)>=0?'':`${name}请填 0 或正整数`);
 const instantError=value=>need(value,'时间')||(/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value.trim())&&Number.isFinite(Date.parse(value.trim()))?'':'时间请填如 2026-12-01T09:00:00+08:00 的格式');
 // Messages appear on the first submit, then follow the fields as they are edited; nothing is sent while one stands.
 // Each blocked submit counts one attempt, which the dialog answers by focusing the first invalid field.
 function useChecks(compute){
  const [tried,setTried]=React.useState(false),[attempt,setAttempt]=React.useState(0);
  return [tried?compute():{},()=>{setTried(true);const ok=!Object.values(compute()).some(Boolean);if(!ok)setAttempt(a=>a+1);return ok;},attempt];
 }
 const select=(label,value,set,options,props={})=>h('label',null,label,h('select',{value,onChange:e=>set(e.target.value),'aria-label':label,...props},...options.map(([id,title])=>h('option',{key:id,value:id},title))));
 function ActionDialog({title,name,payload,label='确认',cancel,danger=false,check=()=>true,attempt,refresh,onClose,onStale,children}){
  const [state,run]=useSubmit(refresh,onClose,onStale);
  return h(Dialog,{title,onClose,locked:state.busy,attempt},h('form',{noValidate:true,onSubmit:async e=>{e.preventDefault();if(!state.busy&&check())await run(name,payload());}},h('fieldset',{disabled:state.busy},children,...footer(state,onClose,label,danger?'lw-danger':'lw-primary',cancel))));
 }
 function GoalDialog({v,refresh,onClose,onStale}){
  const fixed=v.filter?.mode==='subject'?v.filter.subjectRef:undefined;
  const [subject,setSubject]=React.useState(fixed??''),[count,setCount]=React.useState(''),[zone,setZone]=React.useState('Asia/Shanghai');
  const subjectRef=fixed??(subject||null);
  React.useEffect(()=>{const goal=v.goals?.find(g=>g.subjectRef===subjectRef);setCount(goal?String(goal.count):'');if(goal)setZone(goal.timeZone);},[subjectRef]);
  const [errors,check,attempt]=useChecks(()=>({count:countError(count,'次数'),zone:zoneError(zone)}));
  return h(ActionDialog,{title:'每日复习目标',name:'save-goal',label:'保存每日目标',check,attempt,refresh,onClose,onStale,payload:()=>({subjectRef,count:Number(count),timeZone:zone.trim()})},
   fixed===undefined?select('目标学科',subject,setSubject,[['','全局（全部学科）'],...choices(v)]):h('p',{className:'lw-muted'},`目标学科：${subjectName(v,fixed)}`),
   input('每日复习次数',count,setCount,{type:'number',min:0,step:1,required:true},errors.count),zoneInput('学习日时区',zone,setZone,errors.zone),
   h('p',{className:'lw-legend'},'目标按复习次数计，与到期题数分开统计。'));
 }
 function RangeDialog({exam,refresh,onClose,onStale}){
  const [remaining,setRemaining]=React.useState(exam.remaining===null?'':String(exam.remaining)),[u,setU]=React.useState(exam.unit??'question');
  const [errors,check,attempt]=useChecks(()=>({remaining:countError(remaining,'数量')}));
  return h(ActionDialog,{title:'设置剩余量',name:'save-range',label:'保存剩余量',check,attempt,refresh,onClose,onStale,payload:()=>({examId:exam.id,remaining:Number(remaining),unit:u})},
   h('p',{className:'lw-muted'},exam.title),input('尚未完成的数量',remaining,setRemaining,{type:'number',min:0,step:1,required:true},errors.remaining),select('单位',u,setU,[['question','题'],['card','卡片']]));
 }
 // Manual exams: name, subject or none, date and zone. A legacy instant (`at`) exam keeps editing its instant.
 function ExamDialog({v,exam,refresh,onClose,onStale}){
  const preset=v.filter?.mode==='subject'?v.filter.subjectRef:'';
  const [title,setTitle]=React.useState(exam?.title??''),[subject,setSubject]=React.useState(exam?(exam.subjectRef??''):preset);
  const instant=!!exam?.due.at;
  const [moment,setMoment]=React.useState(exam?(exam.due.at??exam.due.date):''),[zone,setZone]=React.useState(exam?.due.timeZone??'Asia/Shanghai');
  const due=()=>instant?{at:moment.trim(),timeZone:zone.trim()}:{date:moment,timeZone:zone.trim()};
  const [errors,check,attempt]=useChecks(()=>({title:need(title,'名称'),moment:instant?instantError(moment):need(moment,'日期'),zone:zoneError(zone)}));
  return h(ActionDialog,{title:exam?'编辑手工考试':'添加手工考试',name:exam?'exam-update':'exam-create',label:exam?'保存考试':'添加考试',check,attempt,refresh,onClose,onStale,
   payload:()=>({...(exam?{id:exam.id}:{}),title:title.trim(),subjectRef:subject||null,due:due()})},
   input('考试名称',title,setTitle,{required:true},errors.title),select('学科',subject,setSubject,[['','未指定学科'],...choices(v)]),
   instant?input('考试时间（带时区偏移）',moment,setMoment,{required:true,placeholder:'2026-12-01T09:00:00+08:00'},errors.moment):input('考试日期',moment,setMoment,{type:'date',required:true},errors.moment),
   zoneInput('时区',zone,setZone,errors.zone),
   h('p',{className:'lw-legend'},instant?'这场考试按具体时刻保存，保留原来的时刻格式。':'日期按所填时区计算，当天倒计时为“今天”。编号由工作台生成。'));
 }
 function MappingDialog({v,row,refresh,onClose,onStale}){
  // Existing subjects are 'id:'-prefixed so a legacy subject ID such as 'new' can never read as "create".
  const [target,setTarget]=React.useState(row.origin==='local'&&row.subjectRef?'id:'+row.subjectRef:'create'),[name,setName]=React.useState(row.sourceSubjectName??'');
  const creating=target==='create';
  const [errors,check,attempt]=useChecks(()=>({name:creating?need(name,'名称'):''}));
  return h(ActionDialog,{title:'选择本地学科',name:'mapping-set',label:'保存映射',check,attempt,refresh,onClose,onStale,
   payload:()=>({sourceId:row.sourceId,sourceSubjectRef:row.sourceSubjectRef,target:creating?{create:{name:name.trim()}}:{existingId:target.slice(3)}})},
   h('p',{className:'lw-muted'},`来源学科：${row.sourceTitle} · ${row.sourceSubjectName??row.sourceSubjectRef}`),
   select('映射到',target,setTarget,[...choices(v).map(([id,label])=>['id:'+id,label]),['create','＋ 按名称新建学科']]),
   creating&&input('新学科名称',name,setName,{required:true},errors.name),
   creating&&h('p',{className:'lw-legend'},'同名新建仍是独立学科，不会自动并入已有学科。'),
   h('p',{className:'lw-legend'},'保存即确认合并显示到所选学科，不会修改来源。'));
 }
 function NameDialog({subject,refresh,onClose,onStale}){
  const [name,setName]=React.useState(subject?.name??'');
  const [errors,check,attempt]=useChecks(()=>({name:need(name,'名称')}));
  return h(ActionDialog,{title:subject?'学科改名':'新建学科',name:subject?'subject-rename':'subject-create',label:'保存名称',check,attempt,refresh,onClose,onStale,
   payload:()=>subject?{subjectId:subject.id,name:name.trim()}:{name:name.trim()}},
   input('学科名称',name,setName,{required:true},errors.name),h('p',{className:'lw-legend'},subject?'只改显示名称，已有映射、目标和考试不变。':'同名也会建立独立学科。'));
 }
 // A view keeps one open dialog at a time; its form state lives in the dialog and goes when it closes.
 function useDialog(){
  const [open,setOpen]=React.useState(null),[stale,setStale]=React.useState(false);
  const notice=stale&&h('p',{className:'lw-notice lw-alert',role:'alert'},'已保存。'+REREAD_FAILED);
  return [open,o=>{setStale(false);setOpen(o);},()=>setOpen(null),notice,()=>setStale(true)];
 }
 function dueStats(v){
  if(!v.due)return [h('div',{key:'d',className:'lw-stat'},h('p',{className:'lw-muted'},'今日到期'),h('strong',null,'未知'),h('small',null,'到期量不可用'))];
  return v.due.totals.flatMap(d=>[
   h('div',{key:'t'+d.unit+d.timeZone,className:'lw-stat'},h('p',{className:'lw-muted'},'今日到期'),h('strong',null,d.today,h('em',null,unit(d.unit))),h('small',null,`${d.date} · ${d.timeZone}`)),
   h('div',{key:'b'+d.unit+d.timeZone,className:'lw-stat'},h('p',{className:'lw-muted'},'欠账'),h('strong',null,d.backlog,h('em',null,unit(d.unit))),h('small',null,'今天之前已到期'))]);
 }
 function reviewStats(v){
  if(!v.reviews)return [h('div',{key:'r',className:'lw-stat'},h('p',{className:'lw-muted'},'今日已复习'),h('strong',null,'未知'),h('small',null,'复习记录不可用'))];
  return v.reviews.totals.flatMap(r=>[
   h('div',{key:'r'+r.timeZone,className:'lw-stat'},h('p',{className:'lw-muted'},'今日已复习'),h('strong',null,r.today,h('em',null,'次')),h('small',null,`唯一题／卡：${n(r.uniqueItems)}`)),
   h('div',{key:'s'+r.timeZone,className:'lw-stat'},h('p',{className:'lw-muted'},'连续学习'),h('strong',null,r.streak,h('em',null,'天')),h('small',null,r.timeZone))]);
 }
 const stats=v=>h('div',{className:'lw-stats'},...dueStats(v),...reviewStats(v));
 function planLine(v,p){
  return h('div',{key:JSON.stringify([p.subjectRef,p.timeZone])},
   h('p',null,h('strong',{className:'lw-number'},n(p.actual)),` / ${p.target} 次 · ${p.subjectRef===null?'全局目标':subjectName(v,p.subjectRef)} · ${p.timeZone}`),track(p.actual,p.target),
   h('p',null,`计划：${p.target} 次；实际：${n(p.actual)}；还需：${n(p.remaining)}`));
 }
 // Goals for the scope in view: under all the global goal, under a subject that subject's; none of its own under unmapped.
 const scopedPlans=v=>v.filter?.mode==='unmapped'?[]:v.plans.filter(p=>v.filter?.mode==='subject'?p.subjectRef===v.filter.subjectRef:p.subjectRef===null);
 function examRow(v,e,{compact=false,open}={}){
  const localExam=local(e)&&v.localExams?.find(x=>JSON.stringify(['local',x.id])===e.id);
  return h('div',{key:e.id,className:'lw-row'},
   h('div',null,h('h3',null,e.title),h('p',{className:'lw-muted'},`${examSubject(v,e)} · ${whenText(e.due)} · ${sourceTitle(v,e.sourceId)}`),
    !compact&&h('p',null,`剩余量：${n(e.remaining)}${e.remaining===null?'':' '+unit(e.unit)} · 每日需要：${n(e.dailyNeeded)}${e.dailyNeeded===null?'':' '+unit(e.unit)+'/天'}`)),
   h('strong',{className:'lw-number'},countdown(e)),
   !compact&&h('div',{className:'lw-actions'},btn('设置剩余量',()=>open({type:'range',exam:e})),
    localExam&&btn('编辑',()=>open({type:'exam',exam:localExam})),localExam&&btn('删除',()=>open({type:'remove-exam',exam:localExam}),'lw-danger')));
 }
 // Under all, subject goals are counted, never summed into a global target.
 const subjectGoals=v=>v.filter?.mode==='subject'?0:v.plans.filter(p=>p.subjectRef!==null).length;
 function goalCard(v,open,heading,removable=false){
  const plans=scopedPlans(v),unmapped=v.filter?.mode==='unmapped';
  const line=p=>removable?h('div',{key:JSON.stringify([p.subjectRef,p.timeZone]),className:'lw-row'},h('div',null,planLine(v,p)),btn('删除目标',()=>open({type:'remove-goal',plan:p}),'lw-danger')):planLine(v,p);
  return card(null,head(heading,!unmapped&&btn('设置目标',()=>open({type:'goal'}))),
   h('p',{className:'lw-muted'},`每日目标 · ${scopeLabel(v)}`),
   unmapped?h('p',null,'未映射学科没有专属目标；全局目标在“全部学科”下查看。'):plans.length?plans.map(line):h('p',null,subjectGoals(v)?`未设总目标，已有 ${subjectGoals(v)} 个学科目标。`:'尚未设置目标。'),
   h('p',{className:'lw-legend'},'题数与复习次数分开统计，不直接相减。'));
 }
 function dialogs(v,refresh,open,close,onStale){
  if(!open)return null;
  const p={v,refresh,onClose:close,onStale};
  switch(open.type){
   case 'goal':return h(GoalDialog,p);
   case 'range':return h(RangeDialog,{...p,exam:open.exam});
   case 'exam':return h(ExamDialog,{...p,exam:open.exam});
   case 'mapping':return h(MappingDialog,{...p,row:open.row});
   case 'name':return h(NameDialog,{...p,subject:open.subject});
   case 'remove-exam':return h(ActionDialog,{...p,title:'删除手工考试',name:'remove-exam',label:'确认删除',danger:true,payload:()=>({id:open.exam.id})},h('p',null,`删除「${open.exam.title}」及其剩余量设置和去重确认？`));
   case 'remove-goal':return h(ActionDialog,{...p,title:'删除每日目标',name:'remove-goal',label:'确认删除',danger:true,payload:()=>({subjectRef:open.plan.subjectRef,timeZone:open.plan.timeZone})},h('p',null,`删除「${open.plan.subjectRef===null?'全局目标':subjectName(v,open.plan.subjectRef)}」的每日目标？`));
   case 'remove-mapping':return h(ActionDialog,{...p,title:'取消映射',name:'mapping-remove',label:'取消映射',cancel:'保留映射',danger:true,payload:()=>({sourceId:open.row.sourceId,sourceSubjectRef:open.row.sourceSubjectRef})},h('p',null,`「${open.row.sourceSubjectName??open.row.sourceSubjectRef}」将回到未映射；本地学科和来源数据都保留。`));
   case 'pair':return h(ActionDialog,{...p,title:open.same?'确认是同一场考试':'保留为两场考试',name:'confirm-pair',label:'确认',payload:()=>({ids:open.ids,same:open.same})},h('p',null,open.text),
    h('p',{className:'lw-muted'},open.same?'确认后，考试时间线把这两场合并为一场显示。':'确认后，两场都保留在考试时间线上，不再提示为疑似同一场。'));
   case 'remove-pair':return h(ActionDialog,{...p,title:'撤销确认',name:'remove-pair',label:'撤销',payload:()=>({ids:open.ids})},h('p',null,'撤销后，这两场考试重新作为疑似重复项等待确认。'));
  }
 }
 function Overview({value:v,refresh}){
  const [open,setOpen,close,notice,onStale]=useDialog();
  const upcoming=v.exams?.filter(e=>!e.expired).slice(0,3);
  return h('div',null,notice,stats(v),
   h('div',{className:'lw-grid'},goalCard(v,setOpen,'今天的复习安排'),
    card(null,head('最近考试'),upcoming===undefined?unavailable('考试'):upcoming.length?upcoming.map(e=>examRow(v,e,{compact:true})):h('p',{className:'lw-muted'},'暂无已知的未来考试。'))),
   card(null,head('未来 14 天到期量',h('span',{className:'lw-muted'},scopeLabel(v))),
    ...(v.due?.totals.map(d=>h(charts.DayBars,{key:d.unit+d.timeZone,points:d.forecast,title:`到期预测（${unit(d.unit)}，${d.timeZone}，包含今天）`}))??[unavailable('到期预测')]),
    h('p',{className:'lw-legend'},'仅反映当前快照；未提供到期记录的学科不计入已知合计。')),
   dialogs(v,refresh,open,close,onStale));
 }
 function Progress({value:v}){
  return h('div',null,stats(v),
   h('div',{className:'lw-grid'},
    card(null,head('每日复习'),...(v.reviews?.totals.map(r=>h('div',{key:r.timeZone},...Array.from(new Set([...r.points.map(p=>p.date.slice(0,7)),r.date.slice(0,7)])).sort().map(month=>h(charts.HeatCalendar,{key:month,month,points:r.points,today:r.date,title:`每日复习次数（${r.timeZone}）`}))))??[unavailable('复习记录')]),
     h('p',{className:'lw-legend'},'“—”表示无记录，0 表示已知零次；虚线空格是尚未到来的日期。')),
    card(null,head(`未来 14 天 · ${scopeLabel(v)}`),...(v.due?.totals.map(d=>h('div',{key:d.unit+d.timeZone},h('p',null,`欠账：${d.backlog} ${unit(d.unit)}（不含在预测中）`),h(charts.DayBars,{points:d.forecast,title:`到期预测（${unit(d.unit)}，${d.timeZone}）`})))??[unavailable('到期预测')]))),
   h('h2',{style:{margin:'8px 0 12px'}},'分学科'),
   h('div',{className:'lw-grid'},
    ...(v.due?.subjects.map(d=>card({key:'d'+JSON.stringify([d.subjectRef,d.unit,d.timeZone])},h('h3',null,subjectName(v,d.subjectRef)),h('p',{className:'lw-muted'},`今日到期：${d.today} · 欠账：${d.backlog} ${unit(d.unit)} · ${d.timeZone}`),h(charts.DayBars,{points:d.forecast,title:`${subjectName(v,d.subjectRef)}（${unit(d.unit)}）`})))??[]),
    ...(v.reviews?.subjects.map(r=>card({key:'r'+JSON.stringify([r.subjectRef,r.timeZone])},h('h3',null,subjectName(v,r.subjectRef)),h('p',{className:'lw-muted'},`已复习：${r.today} 次；连续：${r.streak} 天 · ${r.timeZone}`),h(charts.HeatCalendar,{month:r.date.slice(0,7),points:r.points,today:r.date,title:`${subjectName(v,r.subjectRef)} 每日复习次数`})))??[])),
   !v.due&&!v.reviews&&card(null,unavailable('学科到期量'),unavailable('学科复习记录')));
 }
 // A measurement time is shown like every other recorded time on the page: the browser's zone, to the second.
 const measured=at=>new Date(at).toLocaleString('zh-CN');
 const masteryValue=(m,value)=>value===null||value===undefined?'未知':m.scale==='ratio'?`${(value*100).toFixed(1)}%`:`加权等级：${value}`;
 const SCALES={
  ratio:{label:'记忆比例',topics:'比例',text:'达到可提取率阈值（R≥0.9）的卡片占全部卡片的比例；新卡计入分母、不计分子，所以 0.0% 也可能是真实值。'},
  'weighted-level':{label:'重点主题等级',topics:'等级',text:'按主题内各题的熟练程度加权平均，数值越高越熟练；主题之间可能重叠。'},
 };
 const scaleKey=m=>m.scale==='ratio'?'ratio':'weighted-level',scaleOf=m=>SCALES[scaleKey(m)];
 // StudyHub writes its scheduler's local zone into the method; it decides review days, not the dates shown here.
 const schedulerZone=method=>/local calendar days in ([^;]+)/.exec(method)?.[1];
 function masteryFigure(m){
  const s=m.summary,scale=scaleOf(m);
  if(s===null&&m.topics.length)return [h('p',{key:'v'},`来源未提供学科汇总，各主题${scale.topics}见下方。`)];
  return [h('strong',{key:'v',className:'lw-number'},masteryValue(m,s?.value)),
   m.scale==='ratio'&&track(s?.value??null,1),
   m.scale==='ratio'&&s?.numerator!==null&&s?.numerator!==undefined&&s.denominator!==null&&s.denominator!==undefined&&h('p',{key:'c',className:'lw-muted'},`${s.numerator} / ${s.denominator} 张卡片达到阈值`)];
 }
 // One group per source course: the overview rows and the detail cards below share this order and these titles.
 const masteryGroups=v=>{const groups=new Map();for(const m of v.mastery??[]){const k=JSON.stringify([m.sourceId,m.subjectRef,m.sourceSubjectRef]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(m);}return [...groups.values()];};
 const groupTitle=(v,m0)=>m0.subjectRef===null?(m0.sourceSubjectName??m0.sourceSubjectRef??'未映射学科'):subjectName(v,m0.subjectRef);
 const groupSource=(v,m0)=>`${sourceTitle(v,m0.sourceId)}${m0.subjectRef===null?' · 未映射':''}`;
 const cardId=i=>`lw-mastery-${i}`;
 // The column header names the scale, so a level is shown bare here.
 const bare=(m,value)=>m.scale==='ratio'?masteryValue(m,value):n(value);
 function compareCell(m){
  const s=m.summary,weak=m.weakTopics[0];
  return h('div',{key:m.method},
   s===null&&m.topics.length?h('p',null,'来源未提供学科汇总'):h('strong',{className:'lw-number'},bare(m,s?.value)),
   m.scale==='ratio'&&track(s?.value??null,1),
   m.scale==='ratio'&&s?.numerator!==null&&s?.numerator!==undefined&&s.denominator!==null&&s.denominator!==undefined&&h('p',{className:'lw-muted'},`${s.numerator} / ${s.denominator} 张`),
   h('p',{className:'lw-legend'},weak?`最弱主题：${weak.topicRef} · ${bare(m,weak.value)}`:'薄弱主题：不可用'));
 }
 function MasteryCompare({v,groups,jump}){
  const scales=['ratio','weighted-level'];
  return card({className:'lw-card lw-compare'},h('h2',null,'各学科一览'),
   h('table',null,
    h('thead',null,h('tr',null,h('th',{scope:'col'},'学科'),...scales.map(sc=>h('th',{key:sc,scope:'col'},SCALES[sc].label)))),
    h('tbody',null,...groups.map((list,i)=>{const m0=list[0],title=groupTitle(v,m0);
     return h('tr',{key:i},
      h('th',{scope:'row'},h('button',{type:'button',className:'lw-link','aria-controls':cardId(i),'aria-label':`${title}：查看详情`,onClick:()=>jump(i)},title),h('p',{className:'lw-legend'},groupSource(v,m0))),
      ...scales.map(sc=>{const own=list.filter(m=>scaleKey(m)===sc);
       return h('td',{key:sc,'data-label':SCALES[sc].label},...(own.length?own.map(compareCell):[h('span',{key:'none','aria-hidden':'true',className:'lw-muted'},'—'),h('span',{key:'sr',className:'lw-sr'},'无此口径')]));}));}))),
   h('p',{className:'lw-legend'},'“—”表示该来源没有这个口径；“未知”表示有这个口径但来源没有给出数值。'));
 }
 function Mastery({value:v,refresh}){
  const [open,setOpen,close,notice,onStale]=useDialog();
  const groups=masteryGroups(v),cards=React.useRef([]);
  function jump(i){const el=cards.current[i];el.scrollIntoView({block:'start'});el.focus({preventScroll:true});}
  return h('div',null,notice,h('p',{className:'lw-notice'},'记忆比例与重点主题加权等级来自不同口径，分别展示，不合成总分。'),
   !v.mastery&&card(null,h('h2',null,'掌握度不可用'),h('p',{className:'lw-muted'},'当前学科没有可用的掌握度记录。')),
   groups.length>1&&h(MasteryCompare,{v,groups,jump}),
   ...groups.map((list,i)=>{
    const m0=list[0],row=m0.subjectRef===null&&v.mappingRows?.find(r=>r.sourceId===m0.sourceId&&r.sourceSubjectRef===m0.sourceSubjectRef&&r.editable);
    return card({key:JSON.stringify([m0.sourceId,m0.subjectRef,m0.sourceSubjectRef]),id:cardId(i),tabIndex:-1,ref:el=>{cards.current[i]=el;}},
     head(groupTitle(v,m0),row&&btn('映射学科',()=>setOpen({type:'mapping',row}))),
     h('p',{className:'lw-muted'},groupSource(v,m0)),
     h('div',{className:'lw-split'},...list.map(m=>h('div',{key:m.scale+m.method},h('p',{className:'lw-muted'},scaleOf(m).label),
      ...masteryFigure(m),h('p',{className:'lw-legend'},scaleOf(m).text)))),
     ...list.map(m=>h('div',{key:'w'+m.scale+m.method},h('h3',null,`薄弱主题 · ${m.scale==='ratio'?'记忆比例':'加权等级'}（同口径由低到高）`),
      m.weakTopics.length?m.weakTopics.map(t=>h('div',{key:t.topicRef,className:'lw-row'},h('span',null,t.topicRef),h('span',null,masteryValue(m,t.value)))):unavailable('薄弱主题'),
      ...m.topics.filter(t=>t.value===null).map(t=>h('p',{key:t.topicRef,className:'lw-muted'},`${t.topicRef}：未知`)))),
     h('details',null,h('summary',null,'口径详情与测量记录'),...list.map(m=>h('div',{key:'t'+m.scale+m.method},
      h('h4',{style:{marginTop:12}},scaleOf(m).label),
      h('p',{className:'lw-legend lw-break'},`来源口径原文：${m.method}`),
      schedulerZone(m.method)&&h('p',{className:'lw-legend'},`调度时区：${schedulerZone(m.method)}（StudyHub 调度器所在机器的本地时区，用于划分复习日，不是本页日期的显示时区）`),
      h('table',null,h('thead',null,h('tr',null,...['测量时间','主题','数值'].map(x=>h('th',{key:x},x)))),h('tbody',null,...m.trend.map((t,i)=>h('tr',{key:i},h('td',null,measured(t.asOf)),h('td',null,t.topicRef??'学科汇总'),h('td',null,masteryValue(m,t.value))))))))));
   }),dialogs(v,refresh,open,close,onStale));
 }
 // pairDetails sides carry no source: it is looked up in allExams, the full catalogue, by id.
 const examOf=(v,id)=>v.allExams?.find(e=>e.id===id);
 function pairText(v,p){return p.exams.map(e=>e?`${sourceTitle(v,examOf(v,e.id)?.sourceId)}「${e.title}」${dayText(e.due)}`:'来源不可用（保留确认）').join(' ↔ ');}
 // Under a subject or unmapped, a confirmed pair is listed when either side is in that scope (design §7.1).
 const scopedPairs=v=>{
  const mode=v.filter?.mode??'all',inScope=id=>{const e=examOf(v,id);return !!e&&(mode==='unmapped'?e.subjectRef===null:e.subjectRef===v.filter.subjectRef);};
  return (v.pairDetails??[]).filter(p=>mode==='all'||p.ids.some(inScope));
 };
 function Planning({value:v,refresh}){
  const [open,setOpen,close,notice,onStale]=useDialog();
  const scope=v.filter?.mode??'all';
  return h('div',null,notice,
   goalCard(v,setOpen,'每日目标与实际',true),
   scope==='all'&&v.plans.some(p=>p.subjectRef!==null)&&card(null,head('各学科目标'),...v.plans.filter(p=>p.subjectRef!==null).map(p=>h('div',{key:JSON.stringify([p.subjectRef,p.timeZone]),className:'lw-row'},h('div',null,planLine(v,p)),btn('删除目标',()=>setOpen({type:'remove-goal',plan:p}),'lw-danger')))),
   card(null,head('考试时间线',btn('添加考试',()=>setOpen({type:'exam'}),'lw-primary')),
    v.exams===null?unavailable('考试'):v.exams.length?v.exams.map(e=>examRow(v,e,{open:setOpen})):h('p',{className:'lw-muted'},'当前筛选下没有已知考试。可添加手工考试。'),
    h('details',null,h('summary',null,'每日需要量怎么算'),h('p',{className:'lw-legend'},'剩余量除以剩余天数并向上取整；当天按 1 天分配。未填写剩余量或考试已结束时显示未知。计划仅为建议，不从截止时间或掌握度猜题量。'))),
   card(null,head('疑似同一场考试'),h('p',{className:'lw-muted'},'同名或同学科、同日的不同来源考试需要你确认，不会自动合并。'),
    v.candidates.length?v.candidates.map(c=>{const text=c.exams.map(e=>`${sourceTitle(v,e.sourceId)}「${e.title}」${dayText(e.due)}`).join(' ↔ ');
     return h('div',{key:JSON.stringify(c.ids),className:'lw-row'},h('p',null,text),h('div',{className:'lw-actions'},btn('是同一场',()=>setOpen({type:'pair',ids:c.ids,same:true,text})),btn('保留为两场',()=>setOpen({type:'pair',ids:c.ids,same:false,text}))));}):h('p',null,'暂无待确认项'),
    scopedPairs(v).length>0&&h('details',{open:true},h('summary',null,`已确认（${scopedPairs(v).length}）`),...scopedPairs(v).map(p=>h('div',{key:JSON.stringify(p.ids),className:'lw-row'},
     h('div',null,h('p',null,pairText(v,p)),h('small',null,(p.same?'已确认同一场':'已确认不同')+(p.active?'':' · 不参与当前统计'))),btn('撤销确认',()=>setOpen({type:'remove-pair',ids:p.ids})))))),
   card(null,head(`全部手工考试（${v.localExams.length}）`),h('p',{className:'lw-muted'},'不受学科筛选影响，可在这里编辑或删除。'),
    v.localExams.length?v.localExams.map(e=>h('div',{key:e.id,className:'lw-row'},h('div',null,h('h3',null,e.title),h('p',{className:'lw-muted'},`${examSubject(v,e,true)} · ${whenText(e.due)}`)),
     h('div',{className:'lw-actions'},btn('编辑',()=>setOpen({type:'exam',exam:e})),btn('删除',()=>setOpen({type:'remove-exam',exam:e}),'lw-danger')))):h('p',{className:'lw-muted'},'还没有手工考试。')),
   dialogs(v,refresh,open,close,onStale));
 }
 function Mapping({value:v,refresh}){
  const [open,setOpen,close,notice,onStale]=useDialog();
  const rows=v.mappingRows??[],active=rows.filter(r=>r.active),inactive=rows.filter(r=>!r.active);
  const row=r=>h('div',{key:JSON.stringify([r.sourceId,r.sourceSubjectRef]),className:'lw-row'},
   h('div',null,h('h3',null,r.sourceSubjectName??r.sourceSubjectRef),h('p',{className:'lw-muted'},`${r.sourceTitle} → ${r.subjectRef===null?'尚未映射':subjectName(v,r.subjectRef)}`),
    r.origin==='source'&&h('small',null,'来源已指定，只读；工作台映射不会覆盖来源指定值。'),!r.active&&h('small',null,'来源当前不参与统计，映射只读保留。')),
   r.editable&&r.origin!=='source'&&r.active&&h('div',{className:'lw-actions'},btn(r.subjectRef===null?'选择学科':'修改映射',()=>setOpen({type:'mapping',row:r})),r.origin==='local'&&btn('取消映射',()=>setOpen({type:'remove-mapping',row:r}),'lw-danger')),
   r.origin==='source'&&h('span',{className:'lw-badge'},'来源指定'));
  return h('div',null,notice,
   card(null,head('把来源中的学科对到本地名称'),h('p',{className:'lw-muted'},'同名只是建议，确认后才合并显示。内部编号由工作台管理。'),
    active.length?active.map(row):h('p',{className:'lw-muted'},'尚无可映射学科，请先在来源设置中启用并同步学习库。'),
    inactive.length>0&&h('details',null,h('summary',null,`不参与当前统计的映射（${inactive.length}）`),...inactive.map(row))),
   card(null,head('本地学科',btn('新建学科',()=>setOpen({type:'name'}))),
    (v.subjectOptions??[]).length?choices(v).map(([id,label],i)=>{
     // origin 'local' alone does not mean local.subjects: a manual exam may keep a canonical ID whose source is gone, which cannot be named.
     const o=v.subjectOptions[i],named=(v.subjects??[]).some(s=>s.id===id);
     return h('div',{key:id,className:'lw-row'},h('span',null,label),named||o.origin==='source'?btn(named?'改名':'补充名称',()=>setOpen({type:'name',subject:{id,name:o.name}})):h('small',null,'手工考试仍引用；来源当前不可用，暂不能改名。'));
    }):h('p',{className:'lw-muted'},'还没有本地学科。')),
   dialogs(v,refresh,open,close,onStale));
 }
 const filter='learning-subject';
 const off=[['overview','总览',Overview],['progress','复习进度',Progress],['mastery','学科掌握度',Mastery],['planning','考试与计划',Planning]]
  .map(([id,title,Component])=>registerView({id:`learning-${id}`,domain:'learning',title,metric:'learning-summary',filter,Component}));
 off.push(registerView({id:'learning-mapping',domain:'learning',title:'学科对照',metric:'learning-summary',subtitle:'按名称整理学科；不受学科筛选影响。',Component:Mapping}));
 return ()=>off.forEach(fn=>fn());
}
