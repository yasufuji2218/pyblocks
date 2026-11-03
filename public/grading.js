import {expand,executionBlocks,lockedIntact} from './problem-model.js';
import {explainError,classifyError} from './errors.js';
import {learningEvidence} from './learning-evidence.js';
export const normalize=text=>String(text).replace(/\r\n?/g,'\n').replace(/\n+$/,'');
export function grade(problem,state,results,attempt=1){
  const {workspaceBlocks,executableBlocks:nodes,detachedBlocks}=executionBlocks(state),types=nodes.map(e=>e.block.type);
  const has=name=>expand([name]).some(t=>types.includes(t));
  const detachedRequired=problem.required_blocks.filter(name=>!has(name)&&detachedBlocks.some(e=>!e.inactive&&expand([name]).includes(e.block.type)));
  const variableNames=new Map((state.variables||[]).map(v=>[v.id,v.name]));
  const outputVariables=(problem.grading.output_variables||[]).every(name=>nodes.some(e=>e.block.type==='variables_get'&&(variableNames.get(e.block.fields?.VAR?.id)||e.block.fields?.VAR?.name)===name&&e.ancestors.some(b=>b.type==='text_print')));
  const functionUsed=spec=>{
    const rule=typeof spec==='string'?{name:spec}:spec;
    const def=nodes.find(e=>['procedures_defreturn','procedures_defnoreturn'].includes(e.block.type)&&e.block.fields?.NAME===rule.name)?.block;
    return !!def&&(!rule.params||JSON.stringify((def.extraState?.params||[]).map(p=>typeof p==='string'?p:p.name))===JSON.stringify(rule.params))&&(!rule.returns||def.type==='procedures_defreturn'&&!!(def.inputs?.RETURN?.block||def.inputs?.RETURN?.shadow))&&cases.every(c=>(c.result.calls||[]).includes(rule.name));
  };
  const cases=problem.test_cases.map((t,i)=>{
    const r=results[i]||{error:'テスト未実行'};
    const output=!r.error&&!r.timeout&&normalize(r.output||'')===normalize(t.expected_output);
    const finalState=!r.error&&!r.timeout&&Object.entries(t.expected_state||{}).every(([k,v])=>JSON.stringify(r.state?.[k])===JSON.stringify(v));
    return {test:t,result:r,output,state:finalState,pass:output&&finalState};
  });
  const ratio=list=>list.length?list.filter(Boolean).length/list.length:1;
  const publicCases=cases.filter(c=>c.test.visibility==='public');
  const nesting=(problem.grading.nesting||[]).every(path=>nodes.some(e=>{
    if(!expand([path.at(-1)]).includes(e.block.type))return false;
    let cursor=0;
    for(const a of e.ancestors)if(expand([path[cursor]]).includes(a.type))cursor++;
    return cursor>=path.length-1;
  }));
  const checks={
    output:ratio(publicCases.map(c=>c.output)),test_cases:ratio(cases.map(c=>c.pass)),
    required_blocks:ratio(problem.required_blocks.map(has)),
    forbidden_blocks:Number(!problem.forbidden_blocks.some(name=>(problem.forbidden_block_scope==='workspace'?workspaceBlocks.filter(e=>!e.inactive):nodes).some(e=>expand([name]).includes(e.block.type)))),
    available_blocks:Number(workspaceBlocks.every(e=>expand(problem.available_blocks).includes(e.block.type))),
    state:ratio(cases.map(c=>c.state)),nesting:Number(nesting&&outputVariables),
    functions:Number((problem.grading.functions||[]).every(functionUsed)),
    locked:Number(lockedIntact(problem.initial_blocks,state)),
    learning:Number(learningEvidence(problem,state,nodes,results))
  };
  let score=Math.round(Object.entries(problem.grading.score).reduce((sum,[key,weight])=>sum+weight*checks[key],0));
  const complete=cases.every(c=>!c.result.error&&!c.result.timeout)&&checks.learning===1&&checks.available_blocks===1&&checks.forbidden_blocks===1&&checks.locked===1&&problem.grading.completion_requirements.every(k=>checks[k]===1);
  if(!complete)score=Math.min(score,99);
  if(checks.learning===0)score=Math.min(score,59);
  if(cases.some(c=>c.result.error||c.result.timeout)||!checks.locked||!checks.available_blocks||!checks.forbidden_blocks)score=Math.min(score,49);
  const status=complete?'完全正解':score>0?'部分正解':'不正解';
  const failed=cases.find(c=>c.result.error), timed=cases.find(c=>c.result.timeout);
  let feedback='よくできました。別の入力や解き方でも試してみましょう。',details='';
  if(failed){feedback=failed.test.visibility==='hidden'?'隠しテストで実行エラーになりました。入力値の種類や範囲を確認しましょう。':explainError(failed.result.error);if(failed.test.visibility==='public')details=failed.result.error;}
  else if(timed)feedback='処理が時間内に終わりませんでした。繰り返しの終了条件を確認しましょう。';
  else if(detachedRequired.length)feedback='必要なブロックは配置されていますが、実際のプログラムには接続されていません。計算結果を表示ブロックの入力などにつないでください。';
  else if(checks.nesting<1)feedback='計算や変数の値を表示につなぎ、問題で指定された内側・外側の接続関係を確認しましょう。';
  else if(!checks.learning)feedback='出力だけでなく、指定された値・変数・計算を使う処理が実際に実行される必要があります。表示につながる計算と、実行されない分岐を確認しましょう。';
  else if(['required_blocks','forbidden_blocks','available_blocks','functions','locked','state'].some(k=>checks[k]<1))feedback='問題で指定されたブロック・構造・最終状態の条件を確認しましょう。';
  else if(publicCases.some(c=>!c.output)){
    const c=publicCases.find(c=>!c.output);feedback='公開テストの出力が違います。表示する値や繰り返しの範囲を確認しましょう。';details=`期待：\n${c.test.expected_output}\n\n実際：\n${c.result.output||'（出力なし）'}`;
  }else if(cases.some(c=>!c.pass))feedback='一部の入力で結果が違います。境界の値や別の入力でも確認しましょう。';
  const extra=problem.grading.feedback_steps?.[Math.min(Math.max(0,attempt-1),problem.grading.feedback_steps.length-1)];
  if(!complete&&extra)feedback+='\n'+extra;
  return {score,status,checks,feedback,details,errorType:failed?classifyError(failed.result.error):timed?'Timeout':null,
    tests:cases.map(c=>c.test.visibility==='hidden'?{visibility:'hidden',pass:c.pass}:{visibility:'public',pass:c.pass,input:c.test.input,expected:c.test.expected_output,actual:c.result.output||'',error:c.result.error||'',timeout:!!c.result.timeout})};
}
