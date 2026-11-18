window.__ModuleLoader__.load({id:'dsh-learning-workbench',factory:require=>{
  const React=require('react'),h=React.createElement;
  // Colours and type come from DSH theme variables, so light/dark follow the host; fallbacks are system colours.
  // Failure text mixes the host's error red with its label colour: the red alone reads 4.77:1 on the dark theme.
  // Layout containment makes .lw-root the containing block of the fixed dialog backdrop, whatever the host's ancestors are;
  // it never scrolls itself, .lw-scroll does, so the backdrop covers the whole panel however far the page is scrolled.
  const CSS=`.lw-root{--lw-canvas:var(--dsw-alias-bg-base,Canvas);--lw-panel:var(--dsw-alias-bg-layer-1,Canvas);--lw-soft:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));--lw-ink:var(--dsw-alias-label-primary,CanvasText);--lw-muted:var(--dsw-alias-label-secondary,GrayText);--lw-line:var(--dsw-alias-border-l2,rgba(127,127,127,.35));--lw-accent:var(--dsw-alias-brand-primary,#356c7c);--lw-on-accent:var(--dsw-alias-label-primary-inverted,#fff);--lw-danger:var(--dsw-alias-state-error-primary,#a33b3b);--lw-warn:var(--dsw-alias-state-warn-primary,#8b5525);--lw-chart:var(--dsw-alias-brand-primary,#729eaf);container-type:inline-size;contain:layout;height:100%;width:100%;overflow:hidden;box-sizing:border-box;background:var(--lw-canvas);color:var(--lw-ink);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:14px;line-height:1.6}
.lw-scroll{height:100%;overflow-y:auto}.lw-root *{box-sizing:border-box}.lw-root button,.lw-root input,.lw-root select{font:inherit;color:inherit}.lw-root h1,.lw-root h2,.lw-root h3,.lw-root h4,.lw-root p,.lw-root figure{margin:0}.lw-root h1{font-size:26px;line-height:1.25;font-weight:650}.lw-root h2{font-size:17px;font-weight:650}.lw-root h3,.lw-root h4{font-size:15px;font-weight:600}
.lw-shell{display:grid;grid-template-columns:200px minmax(0,1fr);min-height:100%;max-width:1440px;margin:auto}.lw-side{padding:24px 14px;border-right:1px solid var(--lw-line);background:var(--lw-panel)}.lw-brand{font-size:18px;font-weight:650;padding:0 10px 24px}.lw-brand small{display:block;font-size:12px;font-weight:400;color:var(--lw-muted)}.lw-nav{display:flex;flex-direction:column;gap:4px}.lw-nav button{text-align:left;border:0;background:none;padding:10px 12px;border-radius:8px;min-height:40px;color:var(--lw-muted);cursor:pointer}.lw-nav button:hover{background:var(--lw-soft)}.lw-nav button[aria-current=page]{background:var(--lw-soft);color:var(--lw-ink);font-weight:600;box-shadow:inset 3px 0 0 var(--lw-accent)}.lw-nav .lw-sep{margin-top:16px;border-top:1px solid var(--lw-line);padding-top:12px}
.lw-main{padding:28px 32px;min-width:0}.lw-top{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:20px}.lw-eyebrow{font-size:12px;color:var(--lw-muted);letter-spacing:1px;margin-bottom:6px}.lw-sub{color:var(--lw-muted);margin-top:8px}
.lw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;border:1px solid var(--lw-line);background:var(--lw-panel);padding:6px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}.lw-btn:hover{background:var(--lw-soft)}.lw-btn:disabled,.lw-btn[aria-disabled="true"]{opacity:.55;cursor:not-allowed}.lw-btn.lw-primary{background:var(--lw-accent);border-color:var(--lw-accent);color:var(--lw-on-accent)}.lw-btn.lw-danger{color:var(--lw-danger)}.lw-root :focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px 16px;flex-wrap:wrap;border-block:1px solid var(--lw-line);padding:12px 0;margin-bottom:20px}.lw-toolbar label{display:flex;align-items:center;gap:10px}.lw-summary{color:var(--lw-muted);font-size:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}.lw-link{border:0;background:none;padding:0;color:var(--lw-accent);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-size:inherit}
.lw-root select,.lw-root input:not([type=checkbox]){background:var(--lw-panel);border:1px solid var(--lw-line);border-radius:6px;padding:7px 10px;max-width:100%;min-width:0}.lw-root select{min-width:140px}
.lw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.lw-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}.lw-stat{background:var(--lw-panel);border:1px solid var(--lw-line);border-radius:12px;padding:16px 18px;min-width:0}.lw-stat strong{display:block;font-size:28px;font-weight:650;line-height:1.35;font-variant-numeric:tabular-nums}.lw-stat strong em{font-size:13px;font-style:normal;font-weight:400;margin-left:6px}
.lw-card{background:var(--lw-panel);border:1px solid var(--lw-line);border-radius:12px;padding:20px 22px;min-width:0;margin-bottom:16px}.lw-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}.lw-row{display:flex;justify-content:space-between;gap:12px 16px;align-items:center;padding:12px 0;border-bottom:1px solid var(--lw-line);flex-wrap:wrap}.lw-row:last-child{border-bottom:0}.lw-row>div{min-width:0}.lw-row>div:first-child{flex:1 1 240px}.lw-row>.lw-number{flex:none}.lw-actions{display:flex;gap:8px;flex-wrap:wrap}.lw-badge{font-size:12px;border:1px solid var(--lw-line);border-radius:4px;padding:1px 7px;white-space:nowrap;color:var(--lw-muted)}.lw-number{font-size:22px;font-weight:650;color:var(--lw-accent);font-variant-numeric:tabular-nums}
.lw-muted,.lw-root small,.lw-legend{color:var(--lw-muted)}.lw-root small,.lw-legend{font-size:12px}.lw-break{overflow-wrap:anywhere}.lw-error,.lw-field-error{color:color-mix(in srgb,var(--lw-danger) 55%,var(--lw-ink))}.lw-field-error{font-size:12px}.lw-warn{color:var(--lw-warn)}.lw-notice{padding:12px 16px;border:1px solid var(--lw-line);border-left:3px solid var(--lw-accent);border-radius:8px;margin-bottom:16px;background:var(--lw-panel)}.lw-notice.lw-alert{border-left-color:var(--lw-danger)}
.lw-track{height:8px;background:var(--lw-soft);border-radius:4px;overflow:hidden;margin:10px 0}.lw-track span{display:block;height:100%;background:var(--lw-accent)}.lw-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin:14px 0}
.lw-bars{container:lw-bars/inline-size}@container lw-bars (max-width:280px){.lw-bar-value{display:none}}.lw-root details{margin-top:12px}.lw-root summary{cursor:pointer;color:var(--lw-muted)}.lw-root table{border-collapse:collapse;font-size:12px;margin-top:8px;font-variant-numeric:tabular-nums}.lw-root th,.lw-root td{text-align:left;padding:2px 12px 2px 0;font-weight:400}.lw-root figcaption{font-size:12px;color:var(--lw-muted);margin-bottom:6px}
/* Mastery overview: a comparison table that stacks into labelled blocks when its card is narrow. */
.lw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.lw-link{background:none;border:0;padding:2px 0;font:inherit;font-weight:650;color:var(--lw-accent);text-align:left;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.lw-card:focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-compare{container:lw-compare/inline-size}.lw-root .lw-compare table{width:100%;table-layout:fixed;font-size:inherit;margin-top:0}.lw-root .lw-compare th,.lw-root .lw-compare td{padding:12px 16px 12px 0;vertical-align:top;border-bottom:1px solid var(--lw-line);overflow-wrap:anywhere}.lw-root .lw-compare thead th{font-size:12px;color:var(--lw-muted);padding-top:0}.lw-compare tbody tr:last-child>*{border-bottom:0}.lw-compare .lw-number{font-size:18px}.lw-compare .lw-track{max-width:180px;margin:6px 0}
@container lw-compare (max-width:520px){.lw-compare thead{display:none}.lw-compare tr,.lw-root .lw-compare th,.lw-root .lw-compare td{display:block}.lw-root .lw-compare th,.lw-root .lw-compare td{border-bottom:0;padding:4px 0}.lw-compare tbody tr{padding:10px 0;border-bottom:1px solid var(--lw-line)}.lw-compare tbody tr:last-child{border-bottom:0}.lw-compare td::before{content:attr(data-label);display:block;font-size:12px;color:var(--lw-muted)}.lw-compare .lw-track{max-width:none}}
.lw-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}.lw-dialog{background:var(--lw-panel);color:var(--lw-ink);border:1px solid var(--lw-line);border-radius:12px;width:min(520px,100%);max-height:90vh;overflow-y:auto}.lw-dialog-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--lw-line)}.lw-dialog-body{padding:20px}.lw-dialog label{display:flex;flex-direction:column;gap:4px;margin-bottom:14px}.lw-dialog label.lw-check{flex-direction:row;align-items:start;gap:8px}.lw-dialog input:not([type=checkbox]),.lw-dialog select{width:100%}.lw-dialog footer{display:flex;justify-content:end;gap:8px;margin-top:18px;flex-wrap:wrap}.lw-dialog fieldset{border:0;padding:0;margin:0}.lw-dialog-body p{margin-bottom:12px}.lw-card>.lw-actions{margin-top:12px}.lw-card>p+p{margin-top:2px}
@container (max-width:800px){.lw-shell{display:block}.lw-side{padding:12px 14px;border-right:0;border-bottom:1px solid var(--lw-line)}.lw-brand{padding:0 0 8px;font-size:16px}.lw-brand small{display:none}.lw-nav{flex-direction:row;flex-wrap:wrap}.lw-nav button{padding:6px 10px;min-height:36px;font-size:13px}.lw-nav button[aria-current=page]{box-shadow:inset 0 -2px 0 var(--lw-accent)}.lw-nav .lw-sep{margin:0;border:0;padding-top:0}.lw-main{padding:20px 14px}.lw-top{flex-wrap:wrap}.lw-root h1{font-size:22px}.lw-grid{grid-template-columns:1fr}.lw-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lw-stat{padding:12px}.lw-stat strong{font-size:24px}.lw-card{padding:16px}.lw-btn{min-height:40px}.lw-toolbar label{width:100%}.lw-toolbar select{flex:1}}`;
  return {inject:['slots','layout'],apply(ctx){
    const panel='learning-workbench',views=new Map(),listeners=new Set(),disposers=[];
    const changed=()=>listeners.forEach(fn=>fn());
    function registerView(view){
      if(views.has(view.id))throw Error('duplicate view');
      views.set(view.id,view);changed();
      return ()=>{views.delete(view.id);changed();};
    }
    ctx.provide('learningWorkbenchViews',{register:registerView});
    // Structured errors carry {code,message,field?}; the legacy shape is {error:string}.
    async function failure(response,fallback){
      let body=null;try{body=await response.json();}catch{}
      const e=body?.error,error=Error(e&&typeof e==='object'?(e.message||fallback):(typeof e==='string'&&e?e:fallback));
      if(e&&typeof e==='object'){error.code=e.code;if(e.field)error.field=e.field;}
      error.status=response.status;return error;
    }
    async function get(path){const r=await fetch('/learning-workbench/'+path);if(!r.ok)throw await failure(r,`读取失败 (${r.status})`);return r.json();}
    async function post(path,init){const r=await fetch('/learning-workbench/'+path,{method:'POST',...init,headers:{'x-learning-workbench':'1',...init?.headers}});if(!r.ok)throw await failure(r,`操作失败 (${r.status})`);return r.json();}
    const sync=id=>post('sync?source='+encodeURIComponent(id));
    const ALL={mode:'all'};
    const subjectParam=filter=>'&subject='+encodeURIComponent(JSON.stringify(filter));
    const filterKey=filter=>filter.mode==='subject'?'subject:'+filter.subjectRef:filter.mode;
    let loaded;
    const loadViews=()=>loaded ||= (async()=>{
      const {createCharts}=await import('/learning-workbench/charts.mjs');
      const state=await get('state');
      for(const module of state.clientModules){const code=await import(module.url);disposers.push(code.default({React,charts:createCharts(React),registerView,
        invoke:(name,input)=>post('action?module='+encodeURIComponent(module.id)+'&name='+encodeURIComponent(name),{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})}));}
    })();
    let disposed=false;
    ctx.effect(()=>()=>{disposed=true;for(const dispose of disposers)dispose?.();});
    // Same names get a running number so two subjects called alike stay distinguishable.
    function subjectChoices(options){
      const seen=new Map();
      return (options??[]).map(o=>{const n=(seen.get(o.name)??0)+1;seen.set(o.name,n);return {...o,label:o.name+(n>1?`（同名 ${n}）`:'')+(o.origin==='source'?'（来源指定）':'')};});
    }
    const labels={idle:'尚未同步',ready:'已同步',error:'同步失败',unavailable:'来源未加载',syncing:'同步中'};
    function Panel(){
      const [state,setState]=React.useState(null),[error,setError]=React.useState(''),[selected,setSelected]=React.useState(''),[busy,setBusy]=React.useState(''),[value,setValue]=React.useState(null);
      const [filter,setFilter]=React.useState(ALL),[options,setOptions]=React.useState([]),[notice,setNotice]=React.useState(''),[metricError,setMetricError]=React.useState('');
      const [,setRevision]=React.useState(0);
      React.useEffect(()=>{const update=()=>setRevision(n=>n+1);listeners.add(update);return ()=>listeners.delete(update);},[]);
      React.useEffect(()=>{loadViews().then(()=>{if(!disposed)return refresh();}).catch(e=>setError(e.message));},[]);
      // Filtered views come first, so the default is the first of them whichever module registered earlier.
      const known=[...views.values()].filter(v=>state?.domains.some(d=>d.id===v.domain)),nav=[...known.filter(v=>v.filter),...known.filter(v=>!v.filter)];
      const view=views.get(selected)??(selected?undefined:nav[0]);
      const filtered=view?.filter==='learning-subject';
      const key=filtered?filterKey(filter):'',token=view?view.id+'|'+key:'';
      const metricPath=()=>'metric?id='+encodeURIComponent(view.metric)+(filtered?subjectParam(filter):'');
      // A chosen subject gone from the options falls back to all instead of showing an empty scope.
      function show(v,at){
        setMetricError('');
        if(filtered){
          setOptions(v.subjectOptions??[]);
          if(filter.mode==='subject'&&!(v.subjectOptions??[]).some(o=>o.id===filter.subjectRef)){setFilter(ALL);setNotice('所选学科已不在当前数据中，已切换到全部学科。');return;}
        }
        setValue({token:at,data:v});
      }
      const latest=React.useRef(null);latest.current={view,token,metricPath,show};
      // Resolves once the state and the open view's value are both read again, so a caller sees the latest value;
      // a failed read rejects for the caller to report, and the value already shown stays.
      async function refresh(){
        const next=await get('state');setState(next);
        const c=latest.current;if(!c.view)return;
        const v=await get(c.metricPath());
        // An answer arriving after the user moved to another view or filter is dropped: that view reads its own.
        if(latest.current.token===c.token)c.show(v,c.token);
      }
      React.useEffect(()=>{
        let cancelled=false;setMetricError('');
        if(view)get(metricPath()).then(v=>{if(!cancelled)show(v,token);}).catch(e=>{
          if(cancelled)return;
          if(filtered&&filter.mode==='subject'&&e.code==='INVALID_INPUT'){setFilter(ALL);setNotice('所选学科无法识别，已切换到全部学科。');return;}
          setMetricError(view.metricError?.(e)??e.message);
        });
        return ()=>{cancelled=true;};
      },[view,key]);
      // A value only belongs to the view and filter it was read for; anything else is still loading.
      const current=value?.token===token?value.data:null;
      async function action(id,file){
        setBusy(id);setError('');
        try{
          if(file)await post('import?source='+encodeURIComponent(id)+'&name='+encodeURIComponent(file.name),{body:file});else await sync(id);
        }catch(e){setError(e.code==='BUSY'?'同步/操作进行中，请结束后再试。':e.message);}finally{try{await refresh();}catch(e){setError(e.message);}setBusy('');}
      }
      const sources=(state?.sources||[]).filter(s=>(!view||s.domain===view.domain)&&s.registered!==false);
      const synced=sources.filter(s=>s.status==='ready').length,failed=sources.filter(s=>s.status==='error').length;
      const manager=nav.find(v=>v.manageSources&&v.domain===view?.domain);
      const choose=id=>{setSelected(id);setNotice('');setError('');};
      const pick=raw=>{setNotice('');setFilter(raw==='all'?ALL:raw==='unmapped'?{mode:'unmapped'}:{mode:'subject',subjectRef:raw.slice(8)});};
      const navButton=(v,i)=>h('button',{key:v.id,type:'button',onClick:()=>choose(v.id),'aria-current':view===v?'page':undefined,className:!v.filter&&nav[i-1]?.filter?'lw-sep':undefined},v.title);
      // Until the state arrives nothing is drawn that will change: no fallback nav, no title.
      const loading=!state&&!error;
      return h('section',{className:'lw-root'},h('style',null,CSS),h('div',{className:'lw-scroll'},
        h('div',{className:'lw-shell'},
          h('aside',{className:'lw-side'},h('div',{className:'lw-brand'},'学习工作台',h('small',null,'学习内容留在原工具，在这里看进度')),
            h('nav',{className:'lw-nav','aria-label':'工作台视图'},...nav.map(navButton),
              !nav.length&&!loading&&h('button',{type:'button','aria-current':'page'},'来源状态'))),
          h('main',{className:'lw-main'},
            h('header',{className:'lw-top'},h('div',null,h('p',{className:'lw-eyebrow'},'学习工作台'),!loading&&h('h1',null,view?.title??'来源状态'),view?.subtitle&&h('p',{className:'lw-sub'},view.subtitle)),
              h('button',{type:'button',className:'lw-btn',onClick:()=>ctx.layout.selectPanel('conversation')},'返回会话')),
            filtered&&h('div',{className:'lw-toolbar'},
              h('label',null,'学科',h('select',{'aria-label':'学科筛选',value:key,onChange:e=>pick(e.target.value)},
                h('option',{value:'all'},'全部学科'),...subjectChoices(options).map(o=>h('option',{key:o.id,value:'subject:'+o.id},o.label)),h('option',{value:'unmapped'},'未映射学科'))),
              h('div',{className:'lw-summary'},h('span',null,`${synced}/${sources.length} 个来源已同步`),failed>0&&h('span',{className:'lw-error'},`· ${failed} 个同步失败`),
                manager&&h('button',{type:'button',className:'lw-link',onClick:()=>choose(manager.id)},'查看同步详情'))),
            notice&&h('p',{className:'lw-notice',role:'status'},notice),
            error&&h('p',{className:'lw-notice lw-alert',role:'alert'},error),metricError&&h('p',{className:'lw-notice lw-alert',role:'alert'},metricError),loading&&h('p',{className:'lw-muted','aria-busy':'true'},'正在读取…'),
            view&&current===null&&!metricError&&state&&h('p',{className:'lw-muted','aria-busy':'true'},'正在计算…'),
            view&&current!==null&&!metricError&&h(view.Component,{value:current,sources,refresh,sync,filter:filtered?filter:undefined}),
            state&&!manager&&!view?.manageSources&&!filtered&&h('div',null,
              !sources.length&&h('p',null,'尚未接入来源。'),
              ...sources.map(s=>h('article',{key:s.id,className:'lw-card'},
                h('div',{className:'lw-head'},h('h2',null,s.title),h('span',{className:s.status==='error'?'lw-error':'lw-muted'},labels[busy===s.id?'syncing':s.status])),
                s.error&&h('p',{className:'lw-error'},s.error.message),
                ...(s.warnings||[]).map((warning,index)=>h('p',{key:`warning-${index}`,role:'status',className:'lw-warn'},warning.message)),
                h('p',{className:'lw-legend'},'上次成功：',s.lastSuccessAt?new Date(s.lastSuccessAt).toLocaleString('zh-CN'):'尚无','；上次尝试：',s.lastAttemptAt?new Date(s.lastAttemptAt).toLocaleString('zh-CN'):'尚无'),
                h('p',{className:'lw-legend'},`${s.records.length} 条记录 · ${s.capabilities.join('、')}`),
                h('div',{className:'lw-actions'},s.input==='importer'?h('label',null,'选择本地文件 ',h('input',{type:'file',accept:s.accept,disabled:!!busy||s.status==='unavailable',onChange:e=>{const file=e.target.files[0];if(file)action(s.id,file);e.target.value='';}})):
                  h('button',{type:'button',className:'lw-btn',disabled:!!busy||s.status==='unavailable',onClick:()=>action(s.id)},busy===s.id?'同步中…':'立即同步')))))
          ))));
    }
    ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:panel,id:panel,order:80},Panel));
    ctx.slots.inject('sidebar.panellist.actions',()=>ctx.slots.register({name:'sidebar.panellist.actions',id:panel,order:80},()=>h('button',{onClick:()=>ctx.layout.selectPanel(panel)},'学习工作台')));
  }};
}});
