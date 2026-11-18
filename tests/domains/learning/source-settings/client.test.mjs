import test from 'node:test';import assert from 'node:assert/strict';
import client from '../../../../src/domains/learning/source-settings/client.mjs';
import {React,render,text,one,byText,findAll,click,change,submit,label,press,focused,document} from '../../../support/react-lite.mjs';
import {settings,pathNotFound,missingFile} from '../../../fixtures/learning-v02.mjs';
const h=React.createElement;
const coded=(code,field)=>Object.assign(Error('fixed'),{code,...(field?{field}:{})});
function mount({invoke=async()=>({saved:true,revision:8,entryId:'x',sourceId:'y',identityChanged:false}),sync=async()=>({}),value=settings()}={}){
 const views=[],calls=[],syncs=[];
 client({React,registerView:v=>{views.push(v);return ()=>{};},invoke:async(name,input)=>{calls.push({name,input:structuredClone(input)});return invoke(name,input);}});
 const state={refreshed:0};
 const r=render(h(views[0].Component,{value,refresh:async()=>{state.refreshed++;},sync:async id=>{syncs.push(id);return sync(id);}}));
 return Object.assign(r,{view:views[0],calls,syncs,state});
}
const cardOf=(r,title)=>findAll(r.tree,n=>n.type==='section'&&text(findAll(n,x=>x.type==='h2')[0])===title)[0];
const form=r=>findAll(r.tree,n=>n.type==='form')[0];
const dialogText=r=>text(findAll(r.tree,n=>n.props.role==='dialog')[0]);

test('registers one unfiltered management view on the settings metric',()=>{
 const r=mount();assert.equal(r.view.id,'learning-source-settings');assert.equal(r.view.metric,'learning-source-settings');assert.equal(r.view.filter,undefined);assert.equal(r.view.manageSources,true);
 assert.match(r.view.metricError(coded('INVALID_INPUT')),/无法识别，未当作空列表/);
});
test('every runtime status renders its own label and facts',()=>{
 const r=mount(),all=text(r.tree);
 assert.match(text(cardOf(r,'我的学习库')),/已同步[\s\S]*StudyHub 学习库 · 手动刷新[\s\S]*D:\/DemoLearning\/\.study[\s\S]*386 条缓存记录[\s\S]*分片版本未适配/);
 assert.match(text(cardOf(r,'课程日历')),/尚未同步[\s\S]*本地 ICS 文件 · 每 1 小时 · Asia\/Shanghai/);
 const remote=text(cardOf(r,'订阅日历'));assert.match(remote,/同步失败/);assert.match(remote,/自定义间隔/);assert.match(remote,/私密链接：已配置/);assert.match(remote,/同步失败。上次成功的数据仍在使用。/);assert.doesNotMatch(remote,/保存失败|已保留|尚无可用缓存/);
 const off=cardOf(r,'停用的日历');assert.match(text(off),/已停用[\s\S]*已退出指标计算/);assert.equal(text(off).match(/已停用/g).length,1);assert.equal(one(off,'button','立即同步').props.disabled,true);one(off,'button','启用');
 const bad=cardOf(r,'重复的学习库');assert.match(text(bad),/配置无效[\s\S]*重复已解除，重新保存或启用后生效/);assert.equal(one(bad,'button','立即同步').props.disabled,true);assert.equal(one(bad,'button','编辑来源').props.disabled,false);
 const busy=cardOf(r,'第二学习库');assert.match(text(busy),/同步中/);assert.equal(one(busy,'button','同步中…').props.disabled,true);
 assert.match(all,/保留缓存 2 个，不参与统计/);assert.match(all,/DSH 配置文件后续修改不会自动导入/);assert.doesNotMatch(all,/profile|IANA/);assert.doesNotMatch(all,/legacy:|source_[0-9a-f]{8}/);
});
test('profile origin and reloadRequired are explained; reloadRequired turns off writes',()=>{
 assert.match(text(mount({value:settings({origin:'profile',revision:0})}).tree),/继承自 DSH 配置文件/);
 const r=mount({value:settings({reloadRequired:true})});
 assert.match(text(findAll(r.tree,n=>n.props.role==='alert')[0]),/重新加载插件/);
 assert.equal(one(r.tree,'button','添加来源').props.disabled,true);assert.equal(one(cardOf(r,'我的学习库'),'button','编辑来源').props.disabled,true);assert.equal(one(cardOf(r,'停用的日历'),'button','启用').props.disabled,true);
});
test('new source: check and save are separate, saving says not yet synced and never "connected"',async()=>{
 const r=mount({invoke:async name=>name==='source-check'?{ok:true,code:'CHECK_OK',recordCount:6,warnings:[]}:{saved:true,revision:8,entryId:'e',sourceId:'s',identityChanged:false}});
 click(one(r.tree,'button','添加来源'));change(label(r.tree,'来源类型'),'file');change(label(r.tree,'显示名称'),'学期课表');change(label(r.tree,'ICS 文件绝对路径'),'D:/Demo/term.ics');
 assert.equal(label(r.tree,'时区（如 Asia/Shanghai）').props.value,'Asia/Shanghai');assert.equal(label(r.tree,'刷新方式').props.value,'manual');
 click(one(r.tree,'button','检查来源'));await r.settle();
 assert.match(dialogText(r),/检查通过：可读取 6 条记录；未保存配置/);assert.equal(r.syncs.length,0);
 submit(form(r));await r.settle();
 const draft={kind:'ics',title:'学期课表',location:{type:'file',path:'D:/Demo/term.ics'},schedule:{mode:'manual'},timeZone:'Asia/Shanghai'};
 assert.deepEqual(r.calls,[{name:'source-check',input:{revision:7,draft}},{name:'source-save',input:{revision:7,draft}}]);
 assert.match(text(r.tree),/新来源设置已保存，尚未同步/);assert.doesNotMatch(text(r.tree),/连接成功/);assert.equal(r.syncs.length,0);assert.equal(r.state.refreshed,1);
});
test('a failed check does not block saving a valid offline source',async()=>{
 const r=mount({invoke:async name=>name==='source-check'?{ok:false,code:'CHECK_FAILED',warnings:[]}:{saved:true,revision:8,entryId:'e',sourceId:'s',identityChanged:false}});
 click(one(r.tree,'button','添加来源'));change(label(r.tree,'显示名称'),'离线库');change(label(r.tree,'学习库绝对路径'),'E:/Offline/.study');
 click(one(r.tree,'button','检查来源'));await r.settle();assert.match(dialogText(r),/检查未通过[\s\S]*也可以先保存/);
 submit(form(r));await r.settle();assert.equal(r.calls[1].name,'source-save');assert.deepEqual(r.calls[1].input.draft,{kind:'studyhub',title:'离线库',location:{type:'library',path:'E:/Offline/.study'},schedule:{mode:'manual'}});
});
test('remote link: keep by default, replace only on request, cleared after submit and absent from storage',async()=>{
 const stored=[];globalThis.localStorage={setItem:(...a)=>stored.push(a)};
 const logged=[];const log=console.log;console.log=(...a)=>logged.push(a);
 try{
  const r=mount({invoke:async name=>{if(name==='source-save')throw coded('BUSY');return {};}});
  click(one(cardOf(r,'订阅日历'),'button','编辑来源'));
  assert.equal(label(r.tree,'私密链接').props.value,'keep');assert.throws(()=>label(r.tree,'新私密 ICS 链接'));
  assert.match(dialogText(r),/日历时区：使用日历内时区（只读）/);assert.equal(label(r.tree,'刷新方式').props.value,'custom');
  submit(form(r));await r.settle();
  assert.deepEqual(r.calls[0].input,{revision:7,entryId:'legacy:ics_remote',draft:{kind:'ics',title:'订阅日历',location:{type:'url',operation:'keep'},schedule:{mode:'interval',intervalMs:2700000}}});
  assert.match(dialogText(r),/操作进行中/);
  change(label(r.tree,'私密链接'),'replace');const secret='https://cal.example.test/feed.ics?token=fictional-secret';
  change(label(r.tree,'新私密 ICS 链接'),secret);assert.equal(label(r.tree,'新私密 ICS 链接').props.type,'password');
  assert.match(dialogText(r),/旧映射不会套给新日历/);change(label(r.tree,'确认更换位置'),true);
  submit(form(r));await r.settle();
  assert.deepEqual(r.calls[1].input.draft.location,{type:'url',operation:'replace',value:secret});assert.equal(r.calls.length,2);
  assert.equal(label(r.tree,'新私密 ICS 链接').props.value,'');assert.match(dialogText(r),/私密链接已从表单清空/);
  assert.equal(label(r.tree,'显示名称').props.value,'订阅日历');
  assert.ok(!JSON.stringify(r.tree,(k,v)=>typeof v==='function'||k==='ref'?undefined:v).includes('fictional-secret'));
  assert.equal(stored.length,0);assert.equal(logged.length,0);
 }finally{console.log=log;delete globalThis.localStorage;}
});
test('switching an ICS file to a link needs replace and the location-change confirmation',async()=>{
 const r=mount();click(one(cardOf(r,'课程日历'),'button','编辑来源'));
 assert.match(dialogText(r),/日历时区：Asia\/Shanghai（只读）/);
 change(label(r.tree,'位置类型'),'url');assert.throws(()=>label(r.tree,'私密链接'));change(label(r.tree,'新私密 ICS 链接'),'https://example.test/a.ics');
 submit(form(r));await r.settle();assert.equal(r.calls.length,0);assert.match(dialogText(r),/请先确认更换位置/);
 change(label(r.tree,'确认更换位置'),true);submit(form(r));await r.settle();
 assert.deepEqual(r.calls[0].input,{revision:7,entryId:'source_11111111-2222-4333-8444-555555555555',draft:{kind:'ics',title:'课程日历',location:{type:'url',operation:'replace',value:'https://example.test/a.ics'},schedule:{mode:'interval',intervalMs:3600000},timeZone:'Asia/Shanghai'}});
});
test('each structured error code has its own feedback and the form stays open, never resent',async()=>{
 const cases=[['BUSY',/同步\/操作进行中，请结束后再保存/],['REVISION_CONFLICT',/设置已变化，未覆盖新的设置。已读取最新设置/],['DUPLICATE_SOURCE',/此来源已经接入/],['NOT_FOUND',/已不存在。列表已刷新/],['INVALID_INPUT',/路径填写有误/,'path'],['STORAGE_FAILED',/未能确认保存，请重新加载设置/],[undefined,/操作失败/]];
 for(const [code,message,field] of cases){
  const r=mount({invoke:async()=>{throw code?coded(code,field):Error('Error: secret path');}});
  click(one(cardOf(r,'我的学习库'),'button','编辑来源'));change(label(r.tree,'显示名称'),'改过的名称');
  submit(form(r));await r.settle();
  assert.match(dialogText(r),message,code);assert.equal(label(r.tree,'显示名称').props.value,'改过的名称');
  assert.equal(r.calls.length,1);assert.doesNotMatch(text(r.tree),/设置已保存|secret path/);
  assert.equal(r.state.refreshed,['NOT_FOUND','REVISION_CONFLICT'].includes(code)?1:0);
 }
});
test('disable and delete confirm first that data is kept but leaves the statistics',async()=>{
 const r=mount();
 click(one(cardOf(r,'我的学习库'),'button','停用'));assert.equal(r.calls.length,0);assert.match(dialogText(r),/数据保留但不参与统计/);
 submit(form(r));await r.settle();
 click(one(cardOf(r,'课程日历'),'button','删除来源'));assert.match(dialogText(r),/数据保留但不参与统计[\s\S]*不会从 DSH 配置文件自动恢复/);
 submit(form(r));await r.settle();
 click(one(cardOf(r,'停用的日历'),'button','启用'));await r.settle();
 assert.deepEqual(r.calls.map(c=>[c.name,c.input]),[['source-set-enabled',{revision:7,entryId:'legacy:sh_9f2a',enabled:false}],['source-delete',{revision:7,entryId:'source_11111111-2222-4333-8444-555555555555'}],['source-set-enabled',{revision:7,entryId:'source_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',enabled:true}]]);
 assert.match(text(cardOf(r,'停用的日历')),/已启用，统计使用上次同步的数据（[^）]+）；点“立即同步”可更新。/);
});
test('a failed enable keeps the source off and says so on its card',async()=>{
 const r=mount({invoke:async()=>{throw coded('STORAGE_FAILED');}});
 click(one(cardOf(r,'停用的日历'),'button','启用'));await r.settle();
 assert.match(text(cardOf(r,'停用的日历')),/启用失败：未能确认保存[\s\S]*/);assert.equal(r.state.refreshed,0);
});
test('sync now is its own step with its own progress, success and failure',async()=>{
 let release;const r=mount({sync:()=>new Promise((ok,no)=>{release={ok,no};})});
 click(one(cardOf(r,'我的学习库'),'button','立即同步'));await r.settle();
 assert.deepEqual(r.syncs,['sh_9f2a']);assert.equal(one(cardOf(r,'我的学习库'),'button','同步中…').props.disabled,true);
 release.ok({});await r.settle();assert.match(text(cardOf(r,'我的学习库')),/同步完成/);assert.equal(r.state.refreshed,1);
 const busy=mount({sync:async()=>{throw coded('BUSY');}});click(one(cardOf(busy,'课程日历'),'button','立即同步'));await busy.settle();
 assert.match(text(cardOf(busy,'课程日历')),/操作进行中/);
 // A failure the backend recorded is said once, by the re-read card's runtime line, never as a save failure.
 const recorded=settings({entries:settings().entries.map(x=>x.sourceId==='ics_remote'?{...x,runtime:{...x.runtime,lastAttemptAt:'2026-11-13T09:45:00Z'}}:x)});
 const failed=host({sync:async()=>{throw Error('502');},refresh:async set=>set(recorded)});click(one(cardOf(failed,'订阅日历'),'button','立即同步'));await failed.settle();
 const card=cardOf(failed,'订阅日历');assert.equal(failed.state.refreshed,1);
 assert.deepEqual(findAll(card,n=>n.props.role==='alert').map(text),['同步失败。上次成功的数据仍在使用。']);assert.doesNotMatch(text(card),/保存失败|现有缓存不变|同步未完成/);
});

// --- revisions, stale pages and re-reads ---
// A parent that hands Settings new props, as the shell does after a refresh.
function host({invoke,refresh,sync=async()=>({})}={}){
 const views=[],calls=[];let setValue;
 client({React,registerView:v=>{views.push(v);return ()=>{};},invoke:async(name,input)=>{calls.push({name,input:structuredClone(input)});return invoke(name,input);}});
 const state={refreshed:0};
 function Parent(){const [value,set]=React.useState(settings());setValue=set;
  return h(views[0].Component,{value,sync,refresh:async()=>{state.refreshed++;await refresh?.(set);}});}
 const r=render(h(Parent));
 return Object.assign(r,{calls,state,setValue:v=>setValue(v)});
}
const moved=v=>settings({revision:8,entries:settings().entries.map(e=>e.entryId==='legacy:sh_9f2a'?{...e,location:{type:'library',path:'D:/OtherLibrary/.study'}}:e)});
test('an open edit keeps the revision it was opened on when the list refreshes underneath',async()=>{
 const r=host({invoke:async()=>{throw coded('REVISION_CONFLICT');},refresh:async set=>set(moved())});
 click(one(cardOf(r,'我的学习库'),'button','编辑来源'));change(label(r.tree,'显示名称'),'改名后的库');
 r.setValue(moved());
 submit(form(r));await r.settle();
 assert.equal(r.calls[0].input.revision,7);assert.equal(r.calls[0].input.draft.location.path,'D:/DemoLearning/.study');
 assert.equal(r.state.refreshed,1);assert.match(dialogText(r),/已读取最新设置，你的输入尚未保存/);
 assert.equal(one(findAll(r.tree,n=>n.props.role==='dialog')[0],'button','保存设置').props.disabled,true);
 submit(form(r));await r.settle();assert.equal(r.calls.length,1);
});
test('after a conflict the form reopens on the latest settings, keeping only what the user changed',async()=>{
 let fail=true;
 const r=host({invoke:async()=>{if(fail)throw coded('REVISION_CONFLICT');return {saved:true,revision:9,entryId:'legacy:sh_9f2a',sourceId:'sh_9f2a',identityChanged:false};},refresh:async set=>set(moved())});
 click(one(cardOf(r,'我的学习库'),'button','编辑来源'));change(label(r.tree,'显示名称'),'改名后的库');
 submit(form(r));await r.settle();
 click(one(r.tree,'button','按最新设置重新编辑'));await r.settle();
 assert.equal(r.calls.length,1);assert.match(dialogText(r),/已按最新设置重新打开，保留了你改过的：显示名称/);
 assert.equal(label(r.tree,'显示名称').props.value,'改名后的库');assert.equal(label(r.tree,'学习库绝对路径').props.value,'D:/OtherLibrary/.study');
 fail=false;submit(form(r));await r.settle();
 assert.equal(r.calls[1].input.revision,8);assert.deepEqual(r.calls[1].input.draft.location,{type:'library',path:'D:/OtherLibrary/.study'});assert.equal(r.calls[1].input.draft.title,'改名后的库');
});
test('closing after a conflict and reopening uses the re-read revision',async()=>{
 const r=host({invoke:async()=>{throw coded('REVISION_CONFLICT');},refresh:async set=>set(moved())});
 click(one(cardOf(r,'我的学习库'),'button','编辑来源'));submit(form(r));await r.settle();
 click(one(r.tree,'button','取消'));click(one(cardOf(r,'我的学习库'),'button','编辑来源'));submit(form(r));await r.settle();
 assert.deepEqual(r.calls.map(c=>c.input.revision),[7,8]);
});
test('a disable confirmation keeps its revision and a stale one is re-read, not resent',async()=>{
 const r=host({invoke:async()=>{throw coded('REVISION_CONFLICT');},refresh:async set=>set(moved())});
 click(one(cardOf(r,'我的学习库'),'button','停用'));r.setValue(moved());
 submit(form(r));await r.settle();
 assert.equal(r.calls[0].input.revision,7);assert.equal(r.state.refreshed,1);assert.match(dialogText(r),/已读取最新设置[\s\S]*请关闭后在最新列表上重新操作/);
 submit(form(r));await r.settle();assert.equal(r.calls.length,1);
});
test('a check clears a submitted link and says it must be pasted again',async()=>{
 for(const answer of [async()=>({ok:false,code:'CHECK_FAILED',warnings:[]}),async()=>({ok:true,code:'CHECK_OK',recordCount:3,warnings:[]}),async()=>{throw coded('BUSY');}]){
  const r=mount({invoke:answer});
  click(one(r.tree,'button','添加来源'));change(label(r.tree,'来源类型'),'url');change(label(r.tree,'显示名称'),'订阅');
  change(label(r.tree,'新私密 ICS 链接'),'https://example.test/calendar?token=fictional-check-secret');
  click(one(r.tree,'button','检查来源'));await r.settle();
  assert.equal(r.calls[0].input.draft.location.value,'https://example.test/calendar?token=fictional-check-secret');
  assert.equal(label(r.tree,'新私密 ICS 链接').props.value,'');assert.equal(label(r.tree,'显示名称').props.value,'订阅');
  assert.match(dialogText(r),/私密链接已从表单清空，保存前请重新粘贴/);assert.doesNotMatch(dialogText(r),/fictional/);
 }
});
test('NOT_FOUND re-reads the list for real, and a failed re-read is said, not claimed done',async()=>{
 const gone=host({invoke:async()=>{throw coded('NOT_FOUND');}});
 click(one(cardOf(gone,'课程日历'),'button','删除来源'));submit(form(gone));await gone.settle();
 assert.equal(gone.state.refreshed,1);assert.match(dialogText(gone),/这个来源已不存在。列表已刷新/);
 const broken=host({invoke:async()=>{throw coded('NOT_FOUND');},refresh:async()=>{throw Error('read failed');}});
 click(one(cardOf(broken,'我的学习库'),'button','编辑来源'));change(label(broken.tree,'显示名称'),'保留的名称');submit(form(broken));await broken.settle();
 assert.match(dialogText(broken),/这个来源已不存在。未能读取最新设置，请重新加载设置/);assert.doesNotMatch(dialogText(broken),/列表已刷新/);
 assert.equal(label(broken.tree,'显示名称').props.value,'保留的名称');
 click(one(broken.tree,'button','取消'));click(one(cardOf(broken,'课程日历'),'button','停用'));submit(form(broken));await broken.settle();
 assert.match(dialogText(broken),/未能读取最新设置/);assert.doesNotMatch(dialogText(broken),/列表已刷新/);
});
test('a done sync, enable or save stays reported as done when the re-read fails',async()=>{
 const r=host({invoke:async name=>name==='source-save'?{saved:true,revision:8,entryId:'e',sourceId:'s',identityChanged:false}:{saved:true,revision:8},refresh:async()=>{throw Error('read failed');}});
 click(one(cardOf(r,'我的学习库'),'button','立即同步'));await r.settle();
 assert.match(text(cardOf(r,'我的学习库')),/同步完成。[\s\S]*未能读取最新设置，请重新加载设置/);
 click(one(cardOf(r,'停用的日历'),'button','启用'));await r.settle();
 assert.match(text(cardOf(r,'停用的日历')),/已启用，统计使用上次同步的数据[\s\S]*未能读取最新设置/);assert.doesNotMatch(text(cardOf(r,'停用的日历')),/启用失败/);
 click(one(cardOf(r,'课程日历'),'button','编辑来源'));submit(form(r));await r.settle();
 assert.match(text(r.tree),/「课程日历」设置已保存，尚未同步。未能读取最新设置/);
});

// --- field checks and status wording ---
test('empty required fields and an unknown zone are named beside the field and nothing is sent',async()=>{
 const r=mount();click(one(r.tree,'button','添加来源'));change(label(r.tree,'来源类型'),'file');change(label(r.tree,'时区（如 Asia/Shanghai）'),'Shanghai');
 submit(form(r));await r.settle();
 const errors=()=>findAll(form(r),n=>n.props.className==='lw-field-error').map(text);
 assert.deepEqual(errors(),['名称不能为空','路径不能为空','时区请填如 Asia/Shanghai 的名称']);assert.equal(r.calls.length,0);
 assert.equal(label(r.tree,'显示名称').props['aria-invalid'],'true');
 click(one(r.tree,'button','检查来源'));await r.settle();assert.equal(r.calls.length,0);
 change(label(r.tree,'显示名称'),'学期课表');change(label(r.tree,'ICS 文件绝对路径'),'D:/Demo/term.ics');change(label(r.tree,'时区（如 Asia/Shanghai）'),' Asia/Tokyo ');
 assert.deepEqual(errors(),[]);
 submit(form(r));await r.settle();assert.equal(r.calls.length,1);assert.equal(r.calls[0].input.draft.timeZone,'Asia/Tokyo');
});
test('a missing local file is told apart in the check, and an unreadable source no longer reads as temporary',async()=>{
 for(const [answer,message] of [[pathNotFound.check,'检查未通过：找不到该文件，请确认路径。现在读不到也可以先保存，之后再同步。'],[{ok:false,code:'CHECK_FAILED',warnings:[]},'检查未通过：无法读取来源。现在读不到也可以先保存，之后再同步。']]){
  const r=mount({invoke:async()=>answer});click(one(r.tree,'button','添加来源'));change(label(r.tree,'显示名称'),'课表');change(label(r.tree,'学习库绝对路径'),'D:/x');
  click(one(r.tree,'button','检查来源'));await r.settle();
  // Body text colour on a bordered notice: the host's warn orange fell under 4.5:1.
  const result=findAll(form(r),n=>n.props.role==='status'&&/检查未通过/.test(text(n)))[0];
  assert.equal(text(result),message);assert.equal(result.props.className,'lw-notice lw-alert');assert.doesNotMatch(dialogText(r),/暂时/);
 }
});
test('a failed sync says its reason and the data in use in one line, never as a save failure',()=>{
 for(const [entry,line] of [[missingFile(),'找不到该文件，请确认路径。还没有可用数据。'],[missingFile({lastSuccessAt:'2026-11-12T08:00:00Z',recordCount:3}),'找不到该文件，请确认路径。上次成功的数据仍在使用。']]){
  const r=mount({value:settings({entries:[entry]})}),card=cardOf(r,'缺失的本地日历');
  assert.deepEqual(findAll(card,n=>n.props.role==='alert').map(text),[line]);assert.doesNotMatch(text(card),/保存失败|已保留|尚无可用缓存/);
 }
});
test('the banner holds only the latest action and clears when the next one starts',async()=>{
 const r=mount({sync:async()=>{throw Error('502');}});
 click(one(cardOf(r,'我的学习库'),'button','编辑来源'));submit(form(r));await r.settle();
 assert.match(text(r.tree),/「我的学习库」设置已保存，尚未同步/);
 click(one(cardOf(r,'我的学习库'),'button','立即同步'));await r.settle();
 assert.doesNotMatch(text(r.tree),/已保存，尚未同步/);
 click(one(cardOf(r,'课程日历'),'button','停用'));submit(form(r));await r.settle();
 assert.match(text(r.tree),/「课程日历」已停用/);
 click(one(cardOf(r,'停用的日历'),'button','启用'));await r.settle();
 assert.doesNotMatch(text(r.tree),/「课程日历」已停用/);assert.match(text(cardOf(r,'停用的日历')),/已启用，统计使用上次同步的数据/);
 click(one(cardOf(r,'我的学习库'),'button','编辑来源'));
 assert.doesNotMatch(text(r.tree),/已启用，统计使用/);
});

// --- keyboard, location checks and sync wording ---
const dialogOf=r=>findAll(r.tree,n=>n.props.role==='dialog')[0];
test('the source dialog takes the keyboard and gives it back to its opener',async()=>{
 const r=mount();const opener=one(r.tree,'button','添加来源');opener.el.focus();click(opener);
 assert.equal(focused(),label(r.tree,'来源类型'));
 // From "保存设置" Tab goes round to the dialog's first control, not on to the host's sidebar button.
 one(form(r),'button','保存设置').el.focus();press('Tab');assert.equal(text(focused()),'×');
 for(let i=0;i<12;i++){press('Tab');assert.ok(dialogOf(r).el.contains(document.activeElement));}
 press('Escape');assert.equal(dialogOf(r),undefined);assert.equal(focused(),one(r.tree,'button','添加来源'));
 const off=one(cardOf(r,'我的学习库'),'button','停用');off.el.focus();click(off);assert.equal(text(focused()),'取消');
 press('Escape');assert.equal(dialogOf(r),undefined);assert.equal(r.calls.length,0);assert.equal(focused(),one(cardOf(r,'我的学习库'),'button','停用'));
});
test('Esc leaves a saving source dialog open, as its locked cancel does',async()=>{
 let release;const r=mount({invoke:()=>new Promise(ok=>{release=ok;})});
 click(one(cardOf(r,'课程日历'),'button','编辑来源'));submit(form(r));
 press('Escape');assert.ok(dialogOf(r));
 release({saved:true,revision:8,entryId:'e',sourceId:'s',identityChanged:false});await r.settle();assert.equal(dialogOf(r),undefined);
});
test('a blocked save focuses the first wrong field, whose message describes it',async()=>{
 const r=mount();click(one(r.tree,'button','添加来源'));change(label(r.tree,'来源类型'),'file');change(label(r.tree,'显示名称'),'课表');
 submit(form(r));
 const path=label(r.tree,'ICS 文件绝对路径');assert.equal(focused(),path);assert.equal(path.props['aria-invalid'],'true');
 assert.equal(text(findAll(form(r),n=>n.props.id===path.props['aria-describedby'])[0]),'路径不能为空');
 change(label(r.tree,'显示名称'),' ');click(one(r.tree,'button','检查来源'));assert.equal(focused(),label(r.tree,'显示名称'));
 assert.equal(r.calls.length,0);
});
test('a location the backend would refuse for its fixed rules is named beside the field, and the link stays',async()=>{
 const r=mount();click(one(r.tree,'button','添加来源'));change(label(r.tree,'来源类型'),'file');change(label(r.tree,'显示名称'),'课表');
 const errors=()=>findAll(form(r),n=>n.props.className==='lw-field-error').map(text);
 for(const bad of ['data/x.ics','D:x.ics','~/x.ics']){change(label(r.tree,'ICS 文件绝对路径'),bad);submit(form(r));assert.deepEqual(errors(),['请填绝对路径：以盘符（如 D:\\）或 / 开头'],bad);}
 // Absolute on Windows or POSIX: path.isAbsolute on either system accepts these.
 for(const good of ['D:\\Study\\term.ics','d:/Study/term.ics','/home/me/term.ics','\\\\server\\share\\term.ics',' D:/x.ics ']){change(label(r.tree,'ICS 文件绝对路径'),good);assert.deepEqual(errors(),[],good);}
 assert.equal(r.calls.length,0);
 change(label(r.tree,'来源类型'),'url');
 for(const bad of ['calendar.ics','ftp://cal.example.test/a.ics','webcal://cal.example.test/a.ics']){change(label(r.tree,'新私密 ICS 链接'),bad);click(one(r.tree,'button','检查来源'));
  assert.deepEqual(errors(),['请填完整链接：以 https:// 或 http:// 开头'],bad);assert.equal(label(r.tree,'新私密 ICS 链接').props.value,bad);}
 assert.equal(r.calls.length,0);
 change(label(r.tree,'新私密 ICS 链接'),' https://cal.example.test/feed.ics ');assert.deepEqual(errors(),[]);
 submit(form(r));await r.settle();assert.deepEqual(r.calls[0].input.draft.location,{type:'url',operation:'replace',value:'https://cal.example.test/feed.ics'});
});
test('a failed sync claims nothing until the re-read answers, then says the recorded reason alone',async()=>{
 let answer;const recorded=settings({entries:[missingFile({lastSuccessAt:null,recordCount:0})].map(x=>({...x,runtime:{...x.runtime,lastAttemptAt:'2026-11-16T12:07:29Z'}}))});
 const before=settings({entries:[{...missingFile(),runtime:{...missingFile().runtime,status:'idle',error:null,lastAttemptAt:null}}]});
 const views=[];client({React,registerView:v=>{views.push(v);return ()=>{};},invoke:async()=>({})});
 function Parent(){const [value,set]=React.useState(before);
  return h(views[0].Component,{value,sync:async()=>{throw Error('502');},refresh:()=>new Promise(ok=>{answer=()=>{set(recorded);ok();};})});}
 const r=render(h(Parent));
 click(one(cardOf(r,'缺失的本地日历'),'button','立即同步'));await r.settle();
 const card=()=>cardOf(r,'缺失的本地日历');
 assert.doesNotMatch(text(card()),/同步未完成/);assert.equal(one(card(),'button','同步中…').props.disabled,true);
 answer();await r.settle();
 assert.deepEqual(findAll(card(),n=>n.props.role==='alert').map(text),['找不到该文件，请确认路径。还没有可用数据。']);
});
test('enabling says what the statistics now use, as the status beside it does',async()=>{
 const r=mount();click(one(cardOf(r,'停用的日历'),'button','启用'));await r.settle();
 const since=settings().entries.find(e=>e.title==='停用的日历').runtime.lastSuccessAt;
 assert.match(text(cardOf(r,'停用的日历')),new RegExp(`已启用，统计使用上次同步的数据（${new Date(since).toLocaleString('zh-CN').replace(/[/]/g,'\\/')}）；点“立即同步”可更新。`));
 const never=mount({value:settings({entries:settings().entries.map(e=>e.title==='停用的日历'?{...e,runtime:{...e.runtime,lastSuccessAt:null,recordCount:0}}:e)})});
 click(one(cardOf(never,'停用的日历'),'button','启用'));await never.settle();
 assert.match(text(cardOf(never,'停用的日历')),/已启用，还没有同步成功的数据；点“立即同步”获取。/);assert.doesNotMatch(text(cardOf(never,'停用的日历')),/上次同步的数据/);
});
test('while a save runs, × is locked like Esc and cancel: the draft and a later failure stay in the dialog',async()=>{
 let fail;const r=mount({invoke:()=>new Promise((ok,no)=>{fail=no;})});
 click(one(cardOf(r,'我的学习库'),'button','编辑来源'));change(label(r.tree,'显示名称'),'改名后的库');
 one(form(r),'button','保存设置').el.focus();submit(form(r));await r.settle();
 assert.equal(focused(),dialogOf(r));
 press('Tab');const x=focused();assert.equal(text(x),'×');assert.equal(x.props['aria-disabled'],'true');
 press('Tab',{shiftKey:true});assert.equal(focused(),x);
 click(x);press('Escape');await r.settle();assert.ok(dialogOf(r));
 fail(coded('STORAGE_FAILED'));await r.settle();
 assert.match(dialogText(r),/未能确认保存，请重新加载设置/);assert.equal(label(r.tree,'显示名称').props.value,'改名后的库');
 // Afterwards the form can be corrected and sent again, or closed.
 assert.equal(one(form(r),'button','保存设置').props.disabled,false);assert.equal(one(dialogOf(r),'button','×').props['aria-disabled'],undefined);
 click(one(dialogOf(r),'button','×'));assert.equal(dialogOf(r),undefined);
});
test('a running disable or delete cannot be cancelled: a failure stays shown and a late success closes only its own dialog',async()=>{
 let settle;const r=mount({invoke:()=>new Promise((ok,no)=>{settle={ok,no};})});
 click(one(cardOf(r,'我的学习库'),'button','停用'));submit(form(r));await r.settle();
 assert.equal(focused(),dialogOf(r));assert.equal(one(dialogOf(r),'button','取消').props.disabled,true);
 click(one(dialogOf(r),'button','×'));press('Escape');await r.settle();assert.ok(dialogOf(r));
 settle.no(coded('STORAGE_FAILED'));await r.settle();assert.match(dialogText(r),/未能确认保存，请重新加载设置/);
 click(one(dialogOf(r),'button','取消'));assert.equal(dialogOf(r),undefined);
 // The old timing: cancel during the request, open another form, then the request succeeds and closes that form.
 click(one(cardOf(r,'课程日历'),'button','删除来源'));submit(form(r));await r.settle();
 click(one(dialogOf(r),'button','×'));press('Escape');await r.settle();assert.match(dialogText(r),/删除「课程日历」/);
 settle.ok({saved:true});await r.settle();assert.equal(dialogOf(r),undefined);assert.match(text(r.tree),/「课程日历」已删除/);
});
test('Esc on a form reopened after a conflict gives the focus back to the card button that opened the first one',async()=>{
 const r=host({invoke:async()=>{throw coded('REVISION_CONFLICT');},refresh:async set=>set(moved())});
 const edit=()=>one(cardOf(r,'我的学习库'),'button','编辑来源');
 edit().el.focus();click(edit());submit(form(r));await r.settle();
 click(one(r.tree,'button','按最新设置重新编辑'));await r.settle();assert.match(dialogText(r),/已按最新设置重新打开/);
 press('Escape');await r.settle();assert.equal(dialogOf(r),undefined);assert.equal(focused(),edit());
});
