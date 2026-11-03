import {resilienceCases} from './resilience-cases.js';
import {generateGradingCode} from './grading-code.js';
import {grade} from './grading.js';
export function installResilienceQA(Blockly,g,log){
 const button=document.createElement('button');button.textContent='全12問の耐性テスト';log.before(button);
 const details=document.createElement('details'),summary=document.createElement('summary'),json=document.createElement('pre');
 summary.textContent='監査データ';json.id='audit-json';details.append(summary,json);log.after(details);
 button.onclick=async()=>{
  button.disabled=true;log.textContent='耐性テスト開始\n';const records=[];let worker;
  function stop(){worker?.terminate();worker=null;}
  // QA only: reuse the runtime for trusted, generated fixtures. Each case gets
  // a fresh Python globals dictionary. Production runCases still terminates
  // a fresh Worker after every test, as before.
  function run(code,test,stateNames,timeout){return new Promise(resolve=>{
   worker??=new Worker('./grading-worker.js');let timer;
   const done=result=>{clearTimeout(timer);resolve(result);};
   timer=setTimeout(()=>{stop();done({error:'QA runtime load timeout',output:''});},180000);
   worker.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);timer=setTimeout(()=>{stop();done({timeout:true,output:''});},timeout);}
    if(data.type==='result')done(data.result);
   };
   worker.onerror=()=>{stop();done({error:'QA worker error',output:''});};
   worker.postMessage({code,test,stateNames});
  });}
  try{
   const catalog=await (await fetch('./problems/catalog.json')).json();
   for(const p of catalog){
    for(const scenario of resilienceCases(p)){
     if(scenario.na){records.push({id:p.id,title:p.title,...scenario});continue;}
     const w=new Blockly.Workspace();
     try{
      Blockly.serialization.workspaces.load(scenario.state,w);
      const state=Blockly.serialization.workspaces.save(w),source=generateGradingCode(w,g),stateNames={};
      for(const v of w.getAllVariables())stateNames[v.name]=g.nameDB_.getName(v.getId(),Blockly.Names.NameType.VARIABLE);
      const results=[];
      for(const test of p.test_cases)results.push(await run(source,test,stateNames,p.grading.timeout_ms||3000));
      const result=grade(p,state,results),pass=(result.status==='完全正解')===scenario.expected;
      records.push({id:p.id,title:p.title,kind:scenario.kind,name:scenario.name,expected:scenario.expected,note:scenario.note,state,source,results,result,pass});
      log.textContent+=`${p.id} / ${scenario.name}: ${result.score}点 ${result.status} ${pass?'PASS':'FAIL'}\n`;
     }catch(e){records.push({id:p.id,kind:scenario.kind,error:String(e),pass:false});log.textContent+=`${p.id}/${scenario.kind}: ERROR ${e}\n`;}
     finally{w.dispose();}
    }
   }
   const tested=records.filter(r=>!r.na),failed=tested.filter(r=>!r.pass);
   log.textContent+=`完了：${tested.length}パターン、対象外${records.length-tested.length}、失敗${failed.length}\n`;
  }catch(e){log.textContent+=e.stack;}
  finally{stop();json.textContent=JSON.stringify(records);button.disabled=false;}
 };
}
