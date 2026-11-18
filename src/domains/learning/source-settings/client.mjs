/** Self-contained client for learning-source-settings: host React only; no backend imports.
 * A remote ICS link lives only in the open form's memory: never in storage, the address bar, the console or a draft. */
export default function({React,registerView,invoke}) {
 const h=React.createElement;
 const KINDS={library:'StudyHub 学习库',file:'本地 ICS 文件',url:'远程 ICS 链接'};
 const STATUS={idle:'尚未同步',syncing:'同步中',ready:'已同步',error:'同步失败',disabled:'已停用',invalid:'配置无效'};
 const PRESETS=[['manual','手动'],['900000','每 15 分钟'],['3600000','每 1 小时'],['21600000','每 6 小时'],['86400000','每 24 小时']];
 const scheduleLabel=s=>s.mode==='manual'?'手动刷新':PRESETS.find(([ms])=>Number(ms)===s.intervalMs)?.[1]??'自定义间隔';
 const time=t=>t?new Date(t).toLocaleString('zh-CN'):'尚无';
 const FIELDS={title:'显示名称',location:'位置',path:'路径',value:'私密链接',url:'私密链接',schedule:'刷新方式',intervalMs:'刷新间隔',timeZone:'时区',kind:'来源类型'};
 function failureText(e){
  switch(e?.code){
   case 'BUSY':return '同步/操作进行中，请结束后再保存。';
   case 'REVISION_CONFLICT':return '设置已变化，未覆盖新的设置。';
   case 'DUPLICATE_SOURCE':return '此来源已经接入。';
   case 'NOT_FOUND':return '这个来源已不存在。';
   case 'INVALID_INPUT':return e.field&&FIELDS[e.field]?`${FIELDS[e.field]}填写有误，请检查。`:'输入有误，请检查路径、链接、时区或刷新间隔。';
   case 'STORAGE_FAILED':return '未能确认保存，请重新加载设置。';
   default:return '操作失败，请稍后重试。';
  }
 }
 const REREAD_FAILED='未能读取最新设置，请重新加载设置。';
 // A stale page (changed or removed meanwhile) is re-read before saying so; the words follow what the re-read did.
 const stale=e=>e?.code==='REVISION_CONFLICT'||e?.code==='NOT_FOUND';
 const staleText=(e,reread)=>failureText(e)+(reread?(e.code==='REVISION_CONFLICT'?'已读取最新设置，你的输入尚未保存。':'列表已刷新。'):REREAD_FAILED);
 const btn=(label,onClick,props={})=>h('button',{type:'button',className:'lw-btn '+(props.kind??''),onClick,disabled:props.disabled},label);
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
 // A field's message describes its input; labels are unique within the one open dialog, and an id holds no space.
 const errorId=label=>'lw-error-'+label.replace(/\s/g,'');
 const field=(label,value,set,props={},error)=>h('label',null,label,h('input',{value:value??'','aria-label':label,'aria-invalid':error?'true':undefined,'aria-describedby':error?errorId(label):undefined,onChange:e=>set(e.target.value),...props}),
  error&&h('span',{id:errorId(label),className:'lw-field-error',role:'alert'},error));
 const need=(value,name)=>value.trim()?'':`${name}不能为空`;
 // The backend's two fixed location rules, told before sending: a path absolute by path.isAbsolute on the machine
 // running DSH, a link that URL parses as http: or https:. Either system's absolute form passes here, since only the
 // backend knows its system; it still has the last word.
 const pathError=value=>need(value,'路径')||(/^(?:[\\/]|[A-Za-z]:[\\/])/.test(value.trim())?'':'请填绝对路径：以盘符（如 D:\\）或 / 开头');
 const web=value=>{try{return ['http:','https:'].includes(new URL(value.trim()).protocol);}catch{return false;}};
 const linkError=value=>need(value,'链接')||(web(value)?'':'请填完整链接：以 https:// 或 http:// 开头');
 const zoneError=value=>{try{if(value.trim()){new Intl.DateTimeFormat('en',{timeZone:value.trim()});return '';}}catch{}return '时区请填如 Asia/Shanghai 的名称';};
 // A check names its own reason; a missing local file is told apart from any other unreadable source.
 const CHECKS={PATH_NOT_FOUND:'检查未通过：找不到该文件，请确认路径。',CHECK_FAILED:'检查未通过：无法读取来源。'};
 // The generic runtime codes carry their own cache claim and say "保存"; the card says the cache once, from its last success.
 const RUNTIME={'sync-failed':'同步失败','source-read-failed':'来源读取或数据校验失败'};
 function runtimeText(s){
  const reason=s.error&&(RUNTIME[s.error.code]??s.error.message);
  if(s.status!=='error')return reason;
  return [reason,s.lastSuccessAt?'上次成功的数据仍在使用':'还没有可用数据'].filter(Boolean).join('。')+'。';
 }
 const select=(label,value,set,options,props={})=>h('label',null,label,h('select',{value,'aria-label':label,onChange:e=>set(e.target.value),...props},...options.map(([id,title])=>h('option',{key:id,value:id},title))));
 // New: choose kind; edit: kind fixed, an ICS may move between file and link.
 // The draft belongs to the revision and entry it was opened on; it is never replayed onto a newer revision.
 const LABELS={type:'位置类型',title:'显示名称',path:'路径',schedule:'刷新方式',zone:'日历时区'};
 function SourceDialog({entry,revision,carry,reopened,reread,onClose,onSaved,onReopen,locked}){
  const editing=!!entry,start=entry?.location.type??'library';
  const custom=entry?.schedule.mode==='interval'&&!PRESETS.some(([ms])=>Number(ms)===entry.schedule.intervalMs);
  const base={type:start,title:entry?.title??'',path:entry&&entry.location.type!=='url'?entry.location.path:'',
   schedule:entry?(entry.schedule.mode==='manual'?'manual':custom?'custom':String(entry.schedule.intervalMs)):'manual',zone:entry?entry.timeZone??'':'Asia/Shanghai'};
  const init={...base,...carry};
  const [type,setType]=React.useState(init.type),[title,setTitle]=React.useState(init.title),[path,setPath]=React.useState(init.path);
  const [urlMode,setUrlMode]=React.useState(entry?.location.type==='url'&&entry.location.configured?'keep':'replace'),[url,setUrl]=React.useState('');
  const [schedule,setSchedule]=React.useState(init.schedule),[zone,setZone]=React.useState(init.zone),[confirm,setConfirm]=React.useState(false);
  const [busy,setBusy]=React.useState(''),[error,setError]=React.useState(''),[check,setCheck]=React.useState(null),[conflict,setConflict]=React.useState(false),[tried,setTried]=React.useState(false),[attempt,setAttempt]=React.useState(0);
  const keep=type==='url'&&editing&&start==='url'&&urlMode==='keep';
  const moved=editing&&(type!==start||(type==='url'?!keep:path.trim()!==entry.location.path));
  const kind=type==='library'?'studyhub':'ics';
  const sendsLink=type==='url'&&!keep;
  // Required fields, the location rules and a new ICS zone are checked here, beside the field, once a check or save
  // was tried; each blocked try counts one attempt, which the dialog answers by focusing the first invalid field.
  const problems=()=>({title:need(title,'名称'),place:type==='url'?(sendsLink?linkError(url):''):pathError(path),zone:kind==='ics'&&!editing?zoneError(zone):''});
  const errors=tried?problems():{};
  const valid=()=>{setTried(true);const ok=!Object.values(problems()).some(Boolean);if(!ok)setAttempt(a=>a+1);return ok;};
  function draft(){
   const location=type==='url'?(keep?{type:'url',operation:'keep'}:{type:'url',operation:'replace',value:url.trim()}):{type,path:path.trim()};
   const d={kind,title:title.trim(),location,schedule:schedule==='manual'?{mode:'manual'}:{mode:'interval',intervalMs:schedule==='custom'?entry.schedule.intervalMs:Number(schedule)}};
   // Only a new ICS takes a zone; an existing one sends its own back unchanged, or nothing where it had none.
   if(kind==='ics'&&(editing?entry.timeZone!==undefined:true))d.timeZone=editing?entry.timeZone:zone.trim();
   return d;
  }
  const request=d=>({revision,...(editing?{entryId:entry.entryId}:{}),draft:d});
  // Only the fields the user changed go over to a reopened form; the link never does.
  function changed(){const now={type,title,path,schedule,zone};return Object.fromEntries(Object.keys(base).filter(k=>now[k]!==base[k]).map(k=>[k,now[k]]));}
  async function failed(e){
   if(!stale(e))return failureText(e);
   const ok=await reread();setConflict(ok&&e.code==='REVISION_CONFLICT');return staleText(e,ok);
  }
  const cleared=' 私密链接已从表单清空，保存前请重新粘贴。';
  async function runCheck(){
   if(!valid())return;
   const d=draft();setBusy('check');setCheck(null);setError('');
   // The link leaves the form once submitted, for a check as for a save.
   if(sendsLink)setUrl('');
   try{const r=await invoke('source-check',request(d));setCheck({...r,cleared:sendsLink});}catch(e){setCheck({failed:(await failed(e))+(sendsLink?cleared:'')});}finally{setBusy('');}
  }
  async function save(e){
   // After a conflict this draft is spent: Enter in a field must not send it again.
   e.preventDefault();if(busy||conflict)return;
   if(!valid())return;
   if(moved&&!confirm){setError('请先确认更换位置对缓存和映射的影响。');return;}
   const d=draft();setBusy('save');setError('');
   if(sendsLink)setUrl('');
   let result;
   try{result=await invoke('source-save',request(d));}
   catch(err){setError((await failed(err))+(sendsLink?cleared:''));setBusy('');return;}
   setBusy('');onSaved(result,entry);
  }
  const typeOptions=editing?(kind==='studyhub'?[['library',KINDS.library]]:[['file',KINDS.file],['url',KINDS.url]]):Object.entries(KINDS);
  return h(Dialog,{title:editing?'编辑来源':'添加来源',onClose,locked:!!busy,attempt},h('form',{onSubmit:save,autoComplete:'off',noValidate:true},h('fieldset',{disabled:!!busy},
   reopened&&h('p',{className:'lw-notice',role:'status'},'已按最新设置重新打开'+(reopened.length?`，保留了你改过的：${reopened.map(k=>LABELS[k]).join('、')}`:'')+'。请核对后再保存。'),
   select(editing?'位置类型':'来源类型',type,t=>{setType(t);setCheck(null);},typeOptions,{disabled:editing&&kind==='studyhub'}),
   field('显示名称',title,setTitle,{required:true},errors.title),
   type==='url'&&editing&&start==='url'&&entry.location.configured&&select('私密链接',urlMode,m=>{setUrlMode(m);setUrl('');},[['keep','保留已配置链接'],['replace','替换为新链接']]),
   type==='url'?(!keep&&field('新私密 ICS 链接',url,setUrl,{type:'password',required:true,autoComplete:'off',spellCheck:false},errors.place)):field(type==='library'?'学习库绝对路径':'ICS 文件绝对路径',path,setPath,{required:true,spellCheck:false},errors.place),
   h('p',{className:'lw-legend'},type==='url'?'链接只保存在工作台后端，列表中只显示“已配置”。':'填写运行 DSH 的电脑上的绝对路径；不会打开目录选择器。'+(type==='file'?'静态导出需自行更新文件。':'')),
   kind==='ics'&&(editing?h('p',{className:'lw-muted'},`日历时区：${entry.timeZone??'使用日历内时区'}（只读）`):field('时区（如 Asia/Shanghai）',zone,setZone,{required:true},errors.zone)),
   editing&&entry.advancedInherited&&h('p',{className:'lw-legend'},'继承的高级规则（学科对照、分类规则）只读保留，不在这里修改。'),
   select('刷新方式',schedule,setSchedule,[...PRESETS,...(custom?[['custom','自定义（保持原间隔）']]:[])]),
   moved&&h('label',{className:'lw-check'},h('input',{type:'checkbox',checked:confirm,onChange:e=>setConfirm(e.target.checked),'aria-label':'确认更换位置'}),
    h('span',null,`更换位置后，旧缓存与映射保留但不参与统计，旧映射不会套给${kind==='studyhub'?'新库':'新日历'}；回到曾用的同一位置时可复用原缓存与映射。保存不会自动同步。`)),
   h('div',{className:'lw-actions'},btn(busy==='check'?'正在检查…':'检查来源（可选）',runCheck)),
   check&&h('p',{role:'status',className:check.ok?'lw-legend':'lw-notice lw-alert'},check.failed??((check.ok?`检查通过：可读取 ${check.recordCount??'未知数量的'} 条记录；未保存配置，也未写入缓存。`:(CHECKS[check.code]??CHECKS.CHECK_FAILED)+'现在读不到也可以先保存，之后再同步。')+(check.cleared?cleared:'')),
    ...(check.warnings??[]).map((w,i)=>h('span',{key:i,style:{display:'block'}},w.message))),
   error&&h('p',{className:'lw-error',role:'alert'},error),
   conflict&&h('div',{className:'lw-actions'},btn('按最新设置重新编辑',()=>onReopen(changed()),{kind:'lw-primary'})),
   h('footer',null,btn('取消',onClose),h('button',{type:'submit',className:'lw-btn lw-primary',disabled:!!busy||locked||conflict},busy==='save'?'正在保存…':'保存设置')))));
 }
 // A confirmation acts on the revision it was opened on; a stale one is re-read and the user acts again on the new list.
 function ConfirmDialog({title,text,label,danger,action,reread,onDone,onClose}){
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[spent,setSpent]=React.useState(false);
  async function submit(e){
   e.preventDefault();if(busy||spent)return;setBusy(true);setError('');
   try{await action();}
   catch(err){
    if(stale(err)){const ok=await reread();setSpent(true);setError(staleText(err,ok)+(ok?'请关闭后在最新列表上重新操作。':''));}
    else setError(failureText(err));
    setBusy(false);return;
   }
   setBusy(false);onDone();
  }
  return h(Dialog,{title,onClose,locked:busy},h('form',{onSubmit:submit},
   ...text.map((t,i)=>h('p',{key:i,className:i?'lw-muted':undefined,style:{marginBottom:8}},t)),error&&h('p',{className:'lw-error',role:'alert'},error),
   h('footer',null,btn('取消',onClose,{disabled:busy}),h('button',{type:'submit',className:'lw-btn '+(danger?'lw-danger':'lw-primary'),disabled:busy||spent},busy?'正在保存…':label))));
 }
 function Settings({value,refresh,sync}){
  const [open,setOpen]=React.useState(null),[notice,setNotice]=React.useState(''),[cardState,setCardState]=React.useState({});
  const locked=value.reloadRequired;
  const say=(entryId,next)=>setCardState(s=>({...s,[entryId]:next}));
  // Only the latest action's result is shown: a new action clears the banner and every card's last word but a running sync.
  const begin=()=>{setNotice('');setCardState(s=>Object.fromEntries(Object.entries(s).filter(([,v])=>v.syncing)));};
  // A failed re-read is reported, never retried, and never turns a done save or sync into a failure.
  const reread=async()=>{try{await refresh();return true;}catch{return false;}};
  const opened=(type,entry,extra={})=>{begin();setOpen(o=>({type,entry,revision:value.revision,seq:(o?.seq??0)+1,...extra}));};
  async function finish(text){setOpen(null);setNotice(text);if(!await reread())setNotice(text+REREAD_FAILED);}
  function saved(result,entry){finish((entry?`「${entry.title}」`:'新来源')+'设置已保存，尚未同步。'+(result.identityChanged?'位置已更换：旧缓存与映射保留但不参与统计。':''));}
  function reopen(carry){
   const latest=open.entry&&value.entries.find(x=>x.entryId===open.entry.entryId);
   if(open.entry&&!latest){setOpen(null);setNotice('这个来源已不存在。');return;}
   opened(open.type,latest,{carry,reopened:Object.keys(carry)});
  }
  async function after(entryId,state){say(entryId,state);if(!await reread())say(entryId,{...state,stale:REREAD_FAILED});}
  async function syncNow(e){
   begin();say(e.entryId,{syncing:true,text:'同步中…'});
   try{await sync(e.sourceId);}
   catch(err){
    if(err?.code==='BUSY'){await after(e.entryId,{error:'同步/操作进行中，请结束后再试。'});return;}
    // A failure the backend recorded comes back as a newer runtime attempt, whose line says why; a request that never
    // reached it (a network error) leaves the runtime as it was, so the card says this attempt did not complete.
    // The card stays "syncing" until the re-read answers, so neither is claimed before the record is known.
    say(e.entryId,await reread()?{failedSince:e.runtime.lastAttemptAt}:{error:'同步失败。'+REREAD_FAILED});
    return;
   }
   await after(e.entryId,{text:'同步完成。'});
  }
  async function enable(e){
   begin();say(e.entryId,{text:'正在启用…'});
   try{await invoke('source-set-enabled',{revision:value.revision,entryId:e.entryId,enabled:true});}
   catch(err){
    if(stale(err)){const ok=await reread();say(e.entryId,{error:'启用失败：'+staleText(err,ok)});}
    else say(e.entryId,{error:'启用失败：'+failureText(err)});
    return;
   }
   // Enabling registers the same source again with its kept cache, so the statistics use the last synced data at once.
   const since=e.runtime.lastSuccessAt;
   await after(e.entryId,{text:since?`已启用，统计使用上次同步的数据（${time(since)}）；点“立即同步”可更新。`:'已启用，还没有同步成功的数据；点“立即同步”获取。'});
  }
  const card=e=>{
   const s=e.runtime,st=cardState[e.entryId]??{},syncing=st.syncing||s.status==='syncing';
   const canSync=e.enabled&&e.sourceId&&!['invalid','disabled'].includes(s.status)&&!syncing;
   return h('section',{key:e.entryId,className:'lw-card'},
    h('div',{className:'lw-head'},h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}},h('h2',null,e.title),h('span',{className:'lw-badge'},e.enabled?'已启用':'已停用')),
     // A disabled entry says so once, in its badge.
     s.status!=='disabled'&&h('span',{className:s.status==='error'||s.status==='invalid'?'lw-error':'lw-muted'},syncing?'同步中':STATUS[s.status]??s.status)),
    h('p',null,`${KINDS[e.location.type]} · ${scheduleLabel(e.schedule)}${e.timeZone?' · '+e.timeZone:''}`),
    h('p',{className:'lw-muted lw-break'},e.location.type==='url'?(e.location.configured?'私密链接：已配置':'私密链接：未配置'):e.location.path),
    h('p',{className:'lw-legend'},`上次成功 ${time(s.lastSuccessAt)} · 上次尝试 ${time(s.lastAttemptAt)} · ${s.recordCount} 条缓存记录${e.enabled?'':' · 已退出指标计算'}`),
    e.advancedInherited&&h('p',{className:'lw-legend'},'保留继承的高级规则（只读）。'),
    e.location.type==='file'&&h('p',{className:'lw-legend'},'只读取这个路径的文件；静态导出需自行更新，刷新不会向日历服务获取新版本。'),
    ...s.warnings.map((w,i)=>h('p',{key:'w'+i,className:'lw-warn',role:'status'},w.message)),
    (s.error||s.status==='error')&&h('p',{className:'lw-error',role:'alert'},runtimeText(s)),
    h('div',{className:'lw-actions'},
     btn(syncing?'同步中…':'立即同步',()=>syncNow(e),{disabled:!canSync}),
     btn('编辑来源',()=>opened('edit',e),{disabled:syncing||locked}),
     e.enabled?btn('停用',()=>opened('disable',e),{disabled:syncing||locked}):btn('启用',()=>enable(e),{disabled:locked}),
     btn('删除来源',()=>opened('delete',e),{kind:'lw-danger',disabled:syncing||locked})),
    s.status==='invalid'&&h('p',{className:'lw-legend'},e.enabled?'重新保存这个来源即可生效。':'启用后生效。'),
    'failedSince' in st&&!(s.status==='error'&&s.lastAttemptAt!==st.failedSince)&&h('p',{className:'lw-error',role:'alert'},'同步未完成，请稍后重试。'),
    st.text&&h('p',{className:'lw-legend',role:'status'},st.text),st.error&&h('p',{className:'lw-error',role:'alert'},st.error),st.stale&&h('p',{className:'lw-error',role:'alert'},st.stale));
  };
  const close=()=>setOpen(null);
  return h('div',null,
   locked&&h('p',{className:'lw-notice lw-alert',role:'alert'},'未能确认上一次保存是否完成。请重新加载插件后再修改来源设置；在此之前保存类操作已停用。'),
   h('div',{className:'lw-head'},h('p',{className:'lw-muted'},'来源只读。保存设置不会自动同步；同步请在来源卡片上点“立即同步”。'),btn('添加来源',()=>opened('new'),{kind:'lw-primary',disabled:locked})),
   h('p',{className:'lw-legend',style:{marginBottom:12}},`保留缓存 ${value.retainedCacheCount} 个，不参与统计。`,h('br'),
    value.origin==='workbench'?'已使用工作台设置，DSH 配置文件后续修改不会自动导入。':'当前列表继承自 DSH 配置文件；第一次保存后改用工作台设置，DSH 配置文件后续修改不再自动导入。'),
   notice&&h('p',{className:'lw-notice',role:'status'},notice),
   value.entries.length?value.entries.map(card):h('section',{className:'lw-card'},h('h2',null,'尚未连接来源'),h('p',{className:'lw-muted'},'添加 StudyHub 学习库或 ICS 日历，开始查看学习进度。')),
   open&&(open.type==='new'||open.type==='edit')&&h(SourceDialog,{key:open.seq,entry:open.entry,revision:open.revision,carry:open.carry,reopened:open.reopened,reread,onClose:close,onSaved:saved,onReopen:reopen,locked}),
   open?.type==='disable'&&h(ConfirmDialog,{key:open.seq,title:'停用来源',label:'确认停用',reread,onClose:close,
    text:[`停用「${open.entry.title}」后，数据保留但不参与统计。`,'缓存和学科映射仍保留，再次启用可复用原缓存。'],
    action:()=>invoke('source-set-enabled',{revision:open.revision,entryId:open.entry.entryId,enabled:false}),onDone:()=>finish(`「${open.entry.title}」已停用，数据保留但不参与统计。`)}),
   open?.type==='delete'&&h(ConfirmDialog,{key:open.seq,title:'删除来源',label:'确认删除',danger:true,reread,onClose:close,
    text:[`删除「${open.entry.title}」的接入设置：数据保留但不参与统计，删除后不会从 DSH 配置文件自动恢复。`,'原始学习库或 ICS 文件不会删除；本地学科、每日目标和手工考试保留。'],
    action:()=>invoke('source-delete',{revision:open.revision,entryId:open.entry.entryId}),onDone:()=>finish(`「${open.entry.title}」已删除，缓存保留但不参与统计。`)}));
 }
 return registerView({id:'learning-source-settings',domain:'learning',title:'来源设置',metric:'learning-source-settings',manageSources:true,
  subtitle:'连接学习记录与日历；不受学科筛选影响。',Component:Settings,
  metricError:e=>e?.code==='INVALID_INPUT'?'来源设置的保存格式无法识别，未当作空列表处理。请确认插件版本，或重新加载插件。':`来源设置读取失败（${e?.status??'未知'}）。`});
}
