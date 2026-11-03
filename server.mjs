import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = new URL('./public/', import.meta.url);
const routes = new Set(['index.html','style.css','app.js','worker.js','errors.js','trace.js','libraries.js','problem-model.js','learning-evidence.js','grading-code.js','grading.js','grading-worker.js','test-runner.js','exercise-ui.js','problems/catalog.json']);
const types = {html:'text/html; charset=utf-8', css:'text/css', js:'text/javascript',json:'application/json; charset=utf-8'};
if(process.env.PYBLOCKS_QA==='1')for(const file of ['exercise-qa.html','resilience-cases.js','resilience-qa.js'])routes.add(file);
http.createServer(async (req,res) => {
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','credentialless');
  const path = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (!routes.has(path)) {res.writeHead(404);res.end('Not found');return;}
  try {const data = await readFile(fileURLToPath(new URL(path, root)));res.writeHead(200,{'Content-Type':types[path.split('.').pop()], 'X-Content-Type-Options':'nosniff'});res.end(data);}
  catch {res.writeHead(500);res.end('Unable to load file');}
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log(`PyBlocks: http://127.0.0.1:${process.env.PORT || 4173}`));
