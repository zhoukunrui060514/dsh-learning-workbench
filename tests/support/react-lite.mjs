// Test-only stand-in for the host React: function components, hooks and re-render on state change.
export const Fragment=Symbol('Fragment');
export function createElement(type,props,...children){return {type,props:props??{},children};}
let current=null;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
function slot(init){const c=current,i=c.index++;if(!(i in c.inst.hooks))c.inst.hooks[i]=init();return c.inst.hooks[i];}
export function useState(init){
 const s=slot(()=>({value:typeof init==='function'?init():init})),root=current.root;
 s.set??=next=>{const value=typeof next==='function'?next(s.value):next;if(Object.is(value,s.value))return;s.value=value;root.schedule();};
 return [s.value,s.set];
}
export function useEffect(fn,deps){const s=slot(()=>({})),c=current;if(!deps||!same(s.deps,deps)){s.deps=deps;c.effects.push(()=>{s.cleanup?.();s.cleanup=fn()||undefined;});}c.inst.cleanups.add(s);}
export function useRef(init){return slot(()=>({current:init}));}
export function useMemo(fn,deps){const s=slot(()=>({}));if(!s.deps||!same(s.deps,deps)){s.deps=deps;s.value=fn();}return s.value;}
export function useCallback(fn,deps){return useMemo(()=>fn,deps);}
// A stand-in DOM node per host element, kept by position across redraws as a browser keeps it, so focus survives a redraw.
// Selectors: comma-separated tags and [attr] / [attr="value"] tests, and ':disabled' for matches().
const FOCUSABLE_TAGS=['button','input','select','textarea'];
class El{
 get tag(){return typeof this.vnode.type==='string'?this.vnode.type:'';}
 get tabIndex(){const t=this.vnode.props.tabIndex;return t!==undefined?Number(t):FOCUSABLE_TAGS.includes(this.tag)||this.tag==='a'&&this.vnode.props.href!==undefined?0:-1;}
 getAttribute(name){const v=this.vnode.props[name==='tabindex'?'tabIndex':name==='class'?'className':name];return v===undefined||v===null||v===false?null:String(v);}
 get isConnected(){return document.live.has(this);}
 contains(el){for(let x=el;x;x=x.parent)if(x===this)return true;return false;}
 matches(selector){
  if(selector===':disabled'){if(!FOCUSABLE_TAGS.includes(this.tag))return false;for(let x=this;x&&x.vnode;x=x.parent)if((x===this||x.tag==='fieldset')&&x.vnode.props.disabled)return true;return false;}
  return selector.split(',').some(part=>{const m=/^([a-z]*)((?:\[[^\]]+\])*)$/.exec(part.trim());if(!m)throw Error('unsupported selector '+part);
   return (!m[1]||m[1]===this.tag)&&[...m[2].matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([,name,value])=>{const v=this.getAttribute(name);return value===undefined?v!==null:v===value;});});
 }
 querySelectorAll(selector){const out=[],walk=el=>{for(const k of el.kids){if(k.matches(selector))out.push(k);walk(k);}};walk(this);return out;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 scrollIntoView(options){document.scrolled={el:this,options};}
 focus(){if(this.isConnected&&!this.matches(':disabled')&&(this.tabIndex>=0||this.vnode.props.tabIndex!==undefined))document.activeElement=this;}
}
const body=Object.assign(new El(),{vnode:{type:'body',props:{}},kids:[],focus(){document.activeElement=body;}});
// One document per test file: each render() starts it afresh, so listeners of an earlier, never-unmounted render are gone.
export const document={body,activeElement:body,live:new Set(),listeners:[],
 addEventListener(type,fn){this.listeners.push({type,fn});},removeEventListener(type,fn){this.listeners=this.listeners.filter(l=>l.type!==type||l.fn!==fn);},
 reset(){this.activeElement=body;this.scrolled=null;this.listeners=[];this.live=new Set();body.kids=[];}};
globalThis.document=document;
const flat=list=>list.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false&&x!==true);
export function render(element){
 const instances=new Map(),hosts=new Map();let dirty=false,tree=null,drawing=false,live=new Set();
 document.reset();
 // An update outside a render redraws at once, as a browser event would before the next one.
 const root={schedule(){dirty=true;if(!drawing)flush();}};
 function flush(){for(let i=0;dirty;i++){if(i>50)throw Error('render loop');draw();}}
 function node(n,path,visited,effects){
  if(n===null||n===undefined||n===false||n===true)return null;
  if(typeof n!=='object')return n;
  if(typeof n.type==='function'){
   const id=`${path}:${n.type.name||'f'}${n.props.key!==undefined?'#'+n.props.key:''}`;visited.add(id);
   let inst=instances.get(id);if(!inst){inst={hooks:[],cleanups:new Set()};instances.set(id,inst);}
   const children=n.children.length?(n.children.length===1?n.children[0]:n.children):n.props.children;
   const prev=current;current={inst,index:0,root,effects};
   let out;try{out=n.type({...n.props,...(children===undefined?{}:{children})});}finally{current=prev;}
   return node(out,id,visited,effects);
  }
  const kids=flat([n.children.length?n.children:(n.props.children??[])]);
  const out={type:n.type,props:n.props,children:flat(kids.map((c,i)=>node(c,`${path}/${c?.props?.key??i}`,visited,effects)))};
  let el=hosts.get(path);if(!el){el=new El();hosts.set(path,el);}
  el.vnode=out;el.kids=out.children.filter(c=>typeof c==='object').map(c=>{c.el.parent=el;return c.el;});live.add(el);
  Object.defineProperty(out,'el',{value:el});
  const ref=n.props.ref;if(typeof ref==='function')ref(el);else if(ref)ref.current=el;
  return out;
 }
 function draw(){
  dirty=false;drawing=true;
  try{const visited=new Set(),effects=[];live=new Set();
   tree=node(element,'r',visited,effects);
   for(const [path,el] of hosts)if(!live.has(el))hosts.delete(path);
   document.body.kids=tree?.el?[tree.el]:[];if(tree?.el)tree.el.parent=document.body;
   document.live=live;if(!live.has(document.activeElement))document.activeElement=document.body;
   for(const [id,inst] of instances)if(!visited.has(id)){for(const s of inst.cleanups)s.cleanup?.();instances.delete(id);}
   for(const run of effects)run();
  }finally{drawing=false;}
 }
 dirty=true;flush();
 return {
  get tree(){return tree;},
  async settle(){for(let i=0;i<40;i++){await new Promise(r=>setImmediate(r));flush();}},
  unmount(){for(const inst of instances.values())for(const s of inst.cleanups)s.cleanup?.();instances.clear();},
 };
}
export const React={createElement,Fragment,useState,useEffect,useRef,useMemo,useCallback};
// Queries and events over the rendered tree.
export const text=n=>n===null||n===undefined?'':typeof n==='object'?n.children.map(text).join(' '):String(n);
export function findAll(n,match){if(!n||typeof n!=='object')return [];return [...(match(n)?[n]:[]),...n.children.flatMap(c=>findAll(c,match))];}
export const byText=(tree,type,pattern)=>findAll(tree,n=>n.type===type&&(pattern instanceof RegExp?pattern.test(text(n)):text(n).includes(pattern)));
export function one(tree,type,pattern){const found=byText(tree,type,pattern);if(!found.length)throw Error(`no <${type}> matching ${pattern}`);return found[0];}
export const label=(tree,name)=>{const found=findAll(tree,n=>['input','select','textarea'].includes(n.type)&&(n.props['aria-label']===name||n.props.name===name));if(!found.length)throw Error(`no field ${name}`);return found[0];};
export const click=n=>n.props.onClick({preventDefault(){},stopPropagation(){},currentTarget:n});
export const change=(n,value)=>n.props.onChange({target:{value,checked:value},currentTarget:{value,checked:value}});
export const submit=form=>form.props.onSubmit({preventDefault(){},currentTarget:form});
// Keyboard: listeners first; an unprevented Tab then moves focus to the next focusable node, as the browser does.
export function press(key,{shiftKey=false,isComposing=false}={}){
 let prevented=false;const event={key,shiftKey,isComposing,preventDefault(){prevented=true;}};
 for(const l of [...document.listeners])if(l.type==='keydown')l.fn(event);
 if(key==='Tab'&&!prevented){
  const order=[];const walk=el=>{for(const k of el.kids){if(k.tabIndex>=0&&!k.matches(':disabled'))order.push(k);walk(k);}};walk(document.body);
  const at=order.indexOf(document.activeElement),next=order[shiftKey?(at<0?order.length-1:at-1):at+1];
  document.activeElement=next??document.body;
 }
 return prevented;
}
export const focused=()=>document.activeElement.vnode;
