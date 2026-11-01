import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('.',import.meta.url));
const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/features.js':'features.js','/features.css':'features.css'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const port=Number(process.env.PROTOTYPE_PORT||4180);
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const filename=allowed[pathname];
  if(!filename){res.writeHead(404);res.end('Not found');return;}
  try{const content=await readFile(path.join(root,filename));res.writeHead(200,{'Content-Type':types[path.extname(filename)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(content);}
  catch{res.writeHead(500);res.end('Unable to read prototype file');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Zhixing frontend prototype: http://127.0.0.1:${port}`));
