// Dev-only preview of the workbench front end: serves the real client files and the preview page.
// Not part of the package; the fake backend lives in the page (preview.mjs) and uses the test fixtures.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,normalize,extname} from 'node:path';
const root=fileURLToPath(new URL('../..',import.meta.url));
const mapped={
 '/':'scripts/preview/index.html',
 '/learning-workbench/client.js':'src/ui/client.js',
 '/learning-workbench/charts.mjs':'src/ui/charts.mjs',
 '/learning-workbench/client/learning-views.mjs':'src/domains/learning/views/client.mjs',
 '/learning-workbench/client/learning-source-settings.mjs':'src/domains/learning/source-settings/client.mjs',
};
const allowed=['scripts/preview/','tests/fixtures/'];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const port=Number(process.argv[2]??4780);
createServer(async(req,res)=>{
 const path=new URL(req.url,'http://x').pathname;
 const file=mapped[path]??normalize(path.slice(1));
 if(!mapped[path]&&!allowed.some(p=>file.startsWith(p))){res.writeHead(404).end();return;}
 try{const body=await readFile(join(root,file));res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','cache-control':'no-store'}).end(body);}
 catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log(`preview on http://127.0.0.1:${port}/`));
