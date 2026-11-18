import assert from 'node:assert/strict';
export const base=process.env.WORKBENCH_ORIGIN??'http://127.0.0.1:3110';
export async function get(path){const r=await fetch(base+'/learning-workbench/'+path);assert.equal(r.status,200,path);return r.json();}
export async function post(path,input){const r=await fetch(base+'/learning-workbench/'+path,{method:'POST',headers:{'x-learning-workbench':'1','Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});assert.equal(r.status,200,path);return r.json();}
export const action=(name,input,module='learning-views')=>post(`action?module=${module}&name=${name}`,input);
export const metric=()=>get('metric?id=learning-summary');
