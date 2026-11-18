import { SafeError, publicError } from './safe-errors.mjs';
import { allowedRequest } from './access.mjs';
const PREFIX='/learning-workbench';
export function makeHandler({workbench,localModules,getOrigin,modules,assets,maxImportBytes=32*1024*1024}) {
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  return async(req,res)=>{
    if(!allowedRequest(req,getOrigin()))return send(res,403,{error:'forbidden'});
    const url=new URL(req.url,getOrigin());
    if(req.method==='GET' && assets.has(url.pathname)) {
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(assets.get(url.pathname));
    }
    if(req.method==='GET' && url.pathname===PREFIX+'/state')return send(res,200,{...workbench.snapshot(),clientModules:modules});
    if(req.method==='GET' && url.pathname===PREFIX+'/metric') {
      try{
        const id=url.searchParams.get('id');let options;
        if(id==='learning-summary'&&url.searchParams.has('subject')) {
          let subject;try{subject=JSON.parse(url.searchParams.get('subject'));}catch{throw new SafeError('INVALID_INPUT','subject');}
          if(!subject||Array.isArray(subject)||!['all','unmapped','subject'].includes(subject.mode)||
            Object.keys(subject).some(k=>!['mode',...(subject.mode==='subject'?['subjectRef']:[])].includes(k))||
            (subject.mode==='subject'&&(typeof subject.subjectRef!=='string'||!subject.subjectRef.trim())))throw new SafeError('INVALID_INPUT','subject');
          options={subject};
        }
        return send(res,200,await workbench.metric(id,options));
      }catch(error){const safe=publicError(error);return safe?send(res,safe.status,safe.body):send(res,500,{error:'指标计算失败'});}
    }
    if(req.method==='POST' && url.pathname===PREFIX+'/action') {
      const chunks=[];let size=0;
      for await(const chunk of req) {
        size+=chunk.length;
        if(size>64*1024)return send(res,413,{error:'本地操作参数超过64KiB'});
        chunks.push(chunk);
      }
      let input;
      try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch{return send(res,400,{error:'invalid JSON'});}
      try{return send(res,200,await localModules.invoke(url.searchParams.get('module'),url.searchParams.get('name'),input));}
      catch(error){const safe=publicError(error);return safe?send(res,safe.status,safe.body):send(res,422,{error:'本地操作未完成，请检查输入或稍后再试'});}
    }
    if(req.method==='POST' && url.pathname===PREFIX+'/sync') {
      try{await workbench.sync(url.searchParams.get('source'));return send(res,200,{ok:true});}
      catch(error){const safe=publicError(error);return safe?send(res,safe.status,safe.body):send(res,502,{error:'同步失败，上次成功数据已保留'});}
    }
    if(req.method==='POST' && url.pathname===PREFIX+'/import') {
      const name=url.searchParams.get('name');
      if(!name)return send(res,400,{error:'missing filename'});
      const chunks=[];let size=0;
      for await(const chunk of req) {
        size+=chunk.length;
        if(size>maxImportBytes)return send(res,413,{error:'文件超过32MiB导入上限'});
        chunks.push(chunk);
      }
      try{await workbench.importFile(url.searchParams.get('source'),{name,bytes:new Uint8Array(Buffer.concat(chunks))});return send(res,200,{ok:true});}
      catch{return send(res,422,{error:'导入失败，检查文件格式或来源状态'});}
    }
    send(res,404,{error:'not found'});
  };
}
