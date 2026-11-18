import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const bytes=await readFile(process.argv[2]);
createServer((req,res)=>{if(req.url!=='/fixture.ics'){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/calendar'}).end(bytes);}).listen(3111,'127.0.0.1');
