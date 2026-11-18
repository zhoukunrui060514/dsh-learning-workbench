import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as charts from '../../src/ui/charts.mjs';
import * as views from '../../src/domains/learning/views/client.mjs';
import * as settingsClient from '../../src/domains/learning/source-settings/client.mjs';
import {React,render,text,one,findAll,click,change,label} from '../support/react-lite.mjs';
import {summary,settings,state as stateFixture} from '../fixtures/learning-v02.mjs';
const source=readFileSync(new URL('../../src/ui/client.js',import.meta.url),'utf8');
const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
// Loads the shell as the DSH module loader would, with a fake backend behind fetch.
function boot({routes={}}={}){
 const requests=[];let plugin;
 const modules={'/learning-workbench/charts.mjs':charts,[stateFixture.clientModules[0].url]:views,[stateFixture.clientModules[1].url]:settingsClient};
 const window={__ModuleLoader__:{load:({factory})=>{plugin=factory(name=>{assert.equal(name,'react');return React;});}}};
 new Function('window','__import',source.replaceAll('import(','__import('))(window,async url=>modules[url]);
 const slots={};const ctx={provide(){},effect(){},layout:{selectPanel(){}},slots:{inject:(name,fn)=>fn(),register:(opts,Component)=>{slots[opts.name]=Component;}}};
 plugin.apply(ctx);
 globalThis.fetch=async(url,init={})=>{
  requests.push({url,method:init.method??'GET',body:init.body});
  const [path,query]=url.replace('/learning-workbench/','').split('?'),params=new URLSearchParams(query);
  for(const [match,handler] of Object.entries(routes))if(url.includes(match))return handler({url,params,init});
  if(path==='state')return json(stateFixture);
  if(path==='metric'&&params.get('id')==='learning-summary')return json(summary(params.has('subject')?JSON.parse(params.get('subject')):undefined));
  if(path==='metric'&&params.get('id')==='learning-source-settings')return json(settings());
  if(path==='action')return json({saved:true});
  if(path==='sync')return json({});
  return json({error:'no route'},404);
 };
 const r=render(React.createElement(slots.main));
 return Object.assign(r,{requests,metrics:()=>requests.filter(q=>q.url.includes('metric?')).map(q=>q.url)});
}
const navTo=(r,title)=>click(one(findAll(r.tree,n=>n.type==='nav')[0],'button',title));
const heading=r=>text(findAll(r.tree,n=>n.type==='h1')[0]);
test.afterEach(()=>{delete globalThis.fetch;});

test('opens on the overview with the all-subjects filter serialised into the metric query',async()=>{
 const r=boot();await r.settle();
 assert.equal(heading(r),'总览');
 assert.deepEqual(findAll(findAll(r.tree,n=>n.type==='nav')[0],n=>n.type==='button').map(text),['总览','复习进度','学科掌握度','考试与计划','学科对照','来源设置']);
 assert.equal(r.metrics().at(-1),'/learning-workbench/metric?id=learning-summary&subject='+encodeURIComponent('{"mode":"all"}'));
 assert.match(text(r.tree),/今日到期\s+26/);
 const options=findAll(label(r.tree,'学科筛选'),n=>n.type==='option').map(text);
 assert.deepEqual(options,['全部学科','基础生理','药理基础','药理基础（同名 2）','cal-pharm（来源指定）','未映射学科']);
 assert.match(text(r.tree),/1\/2 个来源已同步/);assert.doesNotMatch(text(r.tree),/旧学习库/);
});
test('opens on the overview even when the settings module registers its view first',async()=>{
 const reversed={...stateFixture,clientModules:[...stateFixture.clientModules].reverse()};
 const r=boot({routes:{'/learning-workbench/state':()=>json(reversed)}});await r.settle();
 assert.equal(heading(r),'总览');
 assert.deepEqual(findAll(findAll(r.tree,n=>n.type==='nav')[0],n=>n.type==='button').map(text),['总览','复习进度','学科掌握度','考试与计划','来源设置','学科对照']);
 assert.equal(findAll(r.tree,n=>n.type==='button'&&n.props.className==='lw-sep').map(text)[0],'来源设置');
});
test('a chosen subject is kept across the four views and left out of the settings view',async()=>{
 const r=boot();await r.settle();
 change(label(r.tree,'学科筛选'),'subject:subject_a1');await r.settle();
 const encoded=encodeURIComponent(JSON.stringify({mode:'subject',subjectRef:'subject_a1'}));
 assert.ok(r.metrics().at(-1).endsWith('&subject='+encoded));assert.match(text(r.tree),/今日到期\s+18/);
 navTo(r,'考试与计划');await r.settle();assert.equal(heading(r),'考试与计划');assert.ok(r.metrics().at(-1).endsWith('&subject='+encoded));
 assert.equal(label(r.tree,'学科筛选').props.value,'subject:subject_a1');
 navTo(r,'来源设置');await r.settle();assert.equal(r.metrics().at(-1),'/learning-workbench/metric?id=learning-source-settings');
 assert.throws(()=>label(r.tree,'学科筛选'));assert.match(text(r.tree),/保留缓存 2 个/);
 navTo(r,'学科掌握度');await r.settle();assert.ok(r.metrics().at(-1).endsWith('&subject='+encoded));
 change(label(r.tree,'学科筛选'),'unmapped');await r.settle();
 assert.ok(r.metrics().at(-1).endsWith('&subject='+encodeURIComponent('{"mode":"unmapped"}')));assert.match(text(r.tree),/实验方法/);
 r.unmount();
 const fresh=boot();await fresh.settle();assert.equal(label(fresh.tree,'学科筛选').props.value,'all');
});
test('a chosen subject that vanished from the options resets to all with a notice',async()=>{
 let gone=false;
 const r=boot({routes:{'id=learning-summary':({params})=>{const f=params.has('subject')?JSON.parse(params.get('subject')):undefined;const v=summary(f);return json(gone?{...v,subjectOptions:v.subjectOptions.filter(o=>o.id!=='cal-pharm')}:v);}}});
 await r.settle();change(label(r.tree,'学科筛选'),'subject:cal-pharm');await r.settle();
 gone=true;navTo(r,'复习进度');await r.settle();
 assert.equal(label(r.tree,'学科筛选').props.value,'all');assert.match(text(findAll(r.tree,n=>n.props.role==='status')[0]),/已切换到全部学科/);
 assert.ok(r.metrics().at(-1).endsWith(encodeURIComponent('{"mode":"all"}')));
});
test('a subject the backend rejects as INVALID_INPUT also falls back to all',async()=>{
 const r=boot({routes:{'subject_a1':()=>json({error:{code:'INVALID_INPUT',message:'invalid'}},400)}});
 await r.settle();change(label(r.tree,'学科筛选'),'subject:subject_a1');await r.settle();
 assert.equal(label(r.tree,'学科筛选').props.value,'all');assert.match(text(r.tree),/无法识别，已切换到全部学科/);
});
test('invoke throws coded errors for structured failures and keeps the legacy string shape',async()=>{
 let reply=json({error:{code:'REVISION_CONFLICT',message:'设置已变化',field:'revision'}},409);
 const r=boot({routes:{'action?':()=>reply}});await r.settle();
 navTo(r,'来源设置');await r.settle();
 click(one(findAll(r.tree,n=>n.type==='section'&&/我的学习库/.test(text(n)))[0],'button','停用'));
 r.tree;const form=findAll(r.tree,n=>n.type==='form')[0];form.props.onSubmit({preventDefault(){}});await r.settle();
 assert.match(text(r.tree),/设置已变化，未覆盖新的设置。已读取最新设置/);
 const action=r.requests.find(q=>q.url.includes('action?'));
 assert.equal(action.url,'/learning-workbench/action?module=learning-source-settings&name=source-set-enabled');assert.deepEqual(JSON.parse(action.body),{revision:7,entryId:'legacy:sh_9f2a',enabled:false});
 reply=json({error:'unknown source subject'},422);
 navTo(r,'学科对照');await r.settle();click(findAll(r.tree,n=>n.type==='button'&&text(n)==='新建学科')[0]);
 change(label(r.tree,'学科名称'),'病理');findAll(r.tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await r.settle();
 assert.match(text(r.tree),/未能保存，请检查填写内容后再试/);assert.doesNotMatch(text(r.tree),/本地存储/);assert.equal(label(r.tree,'学科名称').props.value,'病理');
});
test('sync answers 409 BUSY as a coded error the settings card explains',async()=>{
 const r=boot({routes:{'sync?':()=>json({error:{code:'BUSY',message:'busy'}},409)}});await r.settle();
 navTo(r,'来源设置');await r.settle();
 click(one(findAll(r.tree,n=>n.type==='section'&&/课程日历/.test(text(n))&&!/我的学习库/.test(text(n)))[0],'button','立即同步'));await r.settle();
 assert.ok(r.requests.some(q=>q.url==='/learning-workbench/sync?source=ics_local1'&&q.method==='POST'));
 assert.match(text(r.tree),/同步\/操作进行中，请结束后再试/);
});
test('an unreadable settings schema shows a fixed error instead of an empty list',async()=>{
 const r=boot({routes:{'id=learning-source-settings':()=>json({error:{code:'INVALID_INPUT',message:'x'}},400)}});await r.settle();
 navTo(r,'来源设置');await r.settle();
 assert.match(text(findAll(r.tree,n=>n.props.role==='alert')[0]),/无法识别，未当作空列表处理/);assert.doesNotMatch(text(r.tree),/尚未连接来源/);
});
test('views of other domains still get the generic source cards with sync and import',async()=>{
 const r=boot({routes:{'state':()=>json({domains:[{id:'example',title:'示例'}],clientModules:[],sources:[{id:'ex',domain:'example',title:'示例来源',status:'idle',input:'importer',accept:'.csv',capabilities:['sample'],records:[],warnings:[]}]})}});
 await r.settle();assert.match(text(r.tree),/示例来源[\s\S]*尚未同步[\s\S]*选择本地文件/);
});

// --- late answers ---
// A metric answer the test releases by hand, to arrive after the user has moved on.
function held(){let release;const promise=new Promise(r=>{release=r;});return {promise,release};}
test('a late refresh answer for the settings view does not blank the overview opened meanwhile',async()=>{
 let hold=null,settingsReads=0;
 const r=boot({routes:{'id=learning-source-settings':()=>{settingsReads++;if(settingsReads===2){hold=held();return hold.promise;}return json(settings());}}});
 await r.settle();navTo(r,'来源设置');await r.settle();
 click(one(findAll(r.tree,n=>n.type==='section'&&n.props.className==='lw-card'&&/我的学习库/.test(text(n)))[0],'button','立即同步'));await r.settle();
 assert.ok(hold,'refresh is waiting on the settings read');
 navTo(r,'总览');await r.settle();
 assert.equal(heading(r),'总览');assert.match(text(r.tree),/今日到期\s+26/);
 const summaryReads=r.metrics().filter(u=>u.includes('learning-summary')).length;
 hold.release(json(settings()));await r.settle();
 assert.equal(heading(r),'总览');assert.match(text(r.tree),/今日到期\s+26/);assert.doesNotMatch(text(r.tree),/正在计算/);
 assert.equal(r.metrics().filter(u=>u.includes('learning-summary')).length,summaryReads);
});
test('a late refresh answer for the old filter does not replace the subject chosen meanwhile',async()=>{
 let hold=null,armed=false;
 const r=boot({routes:{'id=learning-summary':({params})=>{const f=params.has('subject')?JSON.parse(params.get('subject')):undefined;
  if(armed&&f?.mode==='all'){armed=false;hold=held();return hold.promise.then(()=>json(summary(f)));}return json(summary(f));}}});
 await r.settle();
 armed=true;click(one(r.tree,'button','设置目标'));change(label(r.tree,'每日复习次数'),'31');
 findAll(r.tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await r.settle();
 assert.ok(hold,'refresh is waiting on the all-subjects read');
 change(label(r.tree,'学科筛选'),'subject:subject_a1');await r.settle();
 assert.match(text(r.tree),/今日到期\s+18/);
 hold.release();await r.settle();
 assert.equal(label(r.tree,'学科筛选').props.value,'subject:subject_a1');assert.match(text(r.tree),/今日到期\s+18/);assert.doesNotMatch(text(r.tree),/正在计算/);
 assert.ok(findAll(label(r.tree,'学科筛选'),n=>n.type==='option').some(o=>text(o)==='药理基础（同名 2）'));
});

// --- loading, layout and contrast ---
test('while the state is read nothing that will change is drawn: no fallback nav and no title',async()=>{
 let release;const gate=new Promise(ok=>{release=ok;}),r=boot({routes:{'learning-workbench/state':()=>gate.then(()=>json(stateFixture))}});await r.settle();
 assert.deepEqual(findAll(findAll(r.tree,n=>n.type==='nav')[0],n=>n.type==='button'),[]);
 assert.equal(findAll(r.tree,n=>n.type==='h1').length,0);assert.doesNotMatch(text(r.tree),/来源状态/);
 assert.equal(findAll(r.tree,n=>n.props['aria-busy']==='true').map(text)[0],'正在读取…');
 release();await r.settle();
 assert.equal(heading(r),'总览');assert.equal(findAll(findAll(r.tree,n=>n.type==='nav')[0],n=>n.type==='button').length,6);
});
test('the dialog backdrop covers the whole panel: the container that holds it never scrolls, its child does',async()=>{
 const css=source.match(/const CSS=`([\s\S]*?)`;/)[1],rule=name=>css.match(new RegExp(`\\${name}\\{([^}]*)\\}`))[1];
 // Layout containment makes the root the containing block of the fixed backdrop; scrolling it would carry the backdrop off the visible panel.
 assert.match(rule('.lw-root'),/container-type:inline-size/);assert.match(rule('.lw-root'),/contain:layout/);assert.match(rule('.lw-root'),/overflow:hidden/);assert.match(rule('.lw-scroll'),/overflow-y:auto/);
 const r=boot();await r.settle();
 const root=findAll(r.tree,n=>n.props.className==='lw-root')[0];
 assert.deepEqual(root.children.map(c=>c.props.className??c.type),['style','lw-scroll']);
 navTo(r,'学科对照');await r.settle();click(findAll(r.tree,n=>n.type==='button'&&text(n)==='新建学科')[0]);
 assert.equal(findAll(r.tree,n=>n.props.className==='lw-backdrop').length,1);
});
test('failure text mixes the danger colour with the label colour: about 8:1 on the dark host and above 4.5:1 on the light one',()=>{
 const css=source.match(/const CSS=`([\s\S]*?)`;/)[1];
 const share=Number(css.match(/\.lw-error,\.lw-field-error\{color:color-mix\(in srgb,var\(--lw-danger\) (\d+)%,var\(--lw-ink\)\)\}/)[1])/100;
 assert.match(css,/\.lw-btn\.lw-danger\{color:var\(--lw-danger\)\}/);
 const lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
 const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
 const mix=(a,b)=>a.map((v,i)=>Math.round(v*share+b[i]*(1-share)));
 // Colours read off screenshots of the DSH host: error red, primary label and card background.
 const dark=ratio(mix([242,90,90],[249,250,251]),[35,35,36]),light=ratio(mix([236,19,19],[15,17,21]),[255,255,255]);
 assert.ok(ratio([242,90,90],[35,35,36])<5);assert.ok(dark>=7,`dark ${dark}`);assert.ok(light>=4.5,`light ${light}`);
});
test('a sync request that never reached the backend still says it did not complete after the list reads back unchanged',async()=>{
 let fail=true;const r=boot({routes:{'sync?':async()=>{if(fail)throw TypeError('Failed to fetch');return json({});}}});await r.settle();
 navTo(r,'来源设置');await r.settle();
 const card=()=>findAll(r.tree,n=>n.type==='section'&&/我的学习库/.test(text(n))&&!/课程日历/.test(text(n)))[0];
 click(one(card(),'button','立即同步'));await r.settle();
 assert.ok(r.requests.filter(q=>q.url.includes('metric?id=learning-source-settings')).length>=2);
 assert.deepEqual(findAll(card(),n=>n.props.role==='alert').map(text),['同步未完成，请稍后重试。']);assert.doesNotMatch(text(r.tree),/Failed to fetch/);
 fail=false;click(one(card(),'button','立即同步'));await r.settle();
 assert.deepEqual(findAll(card(),n=>n.props.role==='alert').map(text),[]);assert.match(text(card()),/同步完成/);
});
test('the mastery overview table fits its card and stacks into labelled blocks when the card is narrow',()=>{
 const css=source.match(/const CSS=`([\s\S]*?)`;/)[1];
 assert.match(css,/\.lw-compare\{container:lw-compare\/inline-size\}/);assert.match(css,/\.lw-root \.lw-compare table\{width:100%;table-layout:fixed;/);
 const narrow=css.match(/@container lw-compare \(max-width:(\d+)px\)\{(.*)\}/);
 // 390 wide leaves the card about 300px of content: well inside the stacking width.
 assert.ok(Number(narrow[1])>=390);
 assert.match(narrow[2],/\.lw-compare thead\{display:none\}/);assert.match(narrow[2],/\.lw-compare tr,\.lw-root \.lw-compare th,\.lw-root \.lw-compare td\{display:block\}/);
 assert.match(narrow[2],/\.lw-compare td::before\{content:attr\(data-label\)/);
});
