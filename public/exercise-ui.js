import {validateProblems,expand,walk,executionBlocks,lockedIntact,hintAt} from './problem-model.js';
import {grade} from './grading.js';
import {runCases} from './test-runner.js';
import {generateGradingCode} from './grading-code.js';
const names={build:'組み立て',fill:'穴埋め',fix:'修正',free:'自由制作'};
const labels={learning:'学習目的の処理を実行',output:'公開テストの出力',test_cases:'全テストケース',required_blocks:'必須ブロック',forbidden_blocks:'禁止ブロックを使わない',available_blocks:'使用できるブロック',state:'変数・リストの最終状態',nesting:'ブロックのネスト',functions:'関数の呼び出し',locked:'固定ブロックの保持'};
export async function installExercises({Blockly,workspace,generator,isRunning,onChange,onActive}){
  const panel=document.createElement('section');panel.className='exercise-panel';
  panel.innerHTML='<div class="exercise-top"><strong>練習問題</strong><label>問題 <select id="exercise-select"><option value="">問題を選んでください</option></select></label><button id="exercise-start">取り組む</button><button id="exercise-leave" disabled>自由編集へ戻る</button></div><div id="exercise-body" hidden><h2 id="exercise-title"></h2><p id="exercise-instruction"></p><div id="exercise-rules"></div><details><summary>公開テスト</summary><pre id="exercise-tests"></pre></details><div class="exercise-actions"><button id="exercise-grade" class="primary">採点する</button><button id="exercise-cancel" disabled>採点を中止</button><button id="exercise-hint">次のヒント</button><button id="exercise-reset">問題を最初から</button></div><div id="exercise-hints"></div><div id="exercise-result" role="status" aria-live="polite"></div></div>';
  document.querySelector('.toolbar').before(panel);
  const $=id=>document.getElementById('exercise-'+id);
  let catalog;
  try{const response=await fetch('./problems/catalog.json');if(!response.ok)throw new Error('問題ファイルを読み込めません');catalog=validateProblems(await response.json(),new Set(Object.keys(Blockly.Blocks)));}
  catch(error){$('select').disabled=true;$('start').disabled=true;const p=document.createElement('p');p.textContent=error.message;panel.append(p);return;}
  for(const p of catalog)$('select').add(new Option(`Lv.${p.difficulty} · ${names[p.type]} · ${p.title}`,p.id));
  let active=null,freeState,fullToolbox=workspace.options.languageTree,baseline,lastValid,restoring=false,scheduled,controller,attempts=0,hints=0;
  const save=()=>Blockly.serialization.workspaces.save(workspace);
  const controls=['run','load','clear','undo','example','slow-mode'];
  function fixed(){for(const {block} of walk(baseline).filter(e=>e.block.locked)){const live=workspace.getBlockById(block.id);if(live){live.setMovable(false);live.setDeletable(false);live.setEditable(false);}}}
  function load(state){restoring=true;Blockly.serialization.workspaces.load(structuredClone(state),workspace);workspace.clearUndo();restoring=false;onChange();}
  function restrictions(state){const allowed=expand(active.available_blocks),banned=expand(active.forbidden_blocks),sets=executionBlocks(state);return sets.workspaceBlocks.every(e=>allowed.includes(e.block.type))&&(active.forbidden_block_scope==='workspace'?sets.workspaceBlocks:sets.executableBlocks).every(e=>!banned.includes(e.block.type))&&lockedIntact(baseline,state);}
  workspace.addChangeListener(event=>{
    if(!active||restoring||event.isUiEvent)return;
    clearTimeout(scheduled);scheduled=setTimeout(()=>{
      if(!active||restoring)return;
      const state=save();
      if(!restrictions(state)){load(lastValid);fixed();$('result').textContent='固定ブロックの変更、または使用できないブロックの追加を取り消しました。';}
      else lastValid=state;
      onChange();
    },0);
  });
  function filterFlyout(items){const allowed=expand(active.available_blocks).filter(t=>!expand(active.forbidden_blocks).includes(t));return items.filter(item=>!item.getAttribute||item.tagName.toLowerCase()!=='block'||allowed.includes(item.getAttribute('type')));}
  workspace.registerToolboxCategoryCallback('EXERCISE_VARIABLE',w=>filterFlyout(Blockly.Variables.flyoutCategory(w)));
  workspace.registerToolboxCategoryCallback('EXERCISE_PROCEDURE',w=>filterFlyout(Blockly.Procedures.flyoutCategory(w)));
  function begin(p){
    active=p;onActive(true);attempts=0;hints=0;
    const allowed=expand(p.available_blocks).filter(t=>!expand(p.forbidden_blocks).includes(t));
    workspace.updateToolbox({kind:'categoryToolbox',contents:[
      {kind:'category',name:'使えるブロック',colour:165,contents:allowed.filter(t=>!t.startsWith('variables_')&&!t.startsWith('procedures_')).map(type=>({kind:'block',type}))},
      ...(allowed.some(t=>t.startsWith('variables_'))?[{kind:'category',name:'変数',colour:30,custom:'EXERCISE_VARIABLE'}]:[]),
      ...(allowed.some(t=>t.startsWith('procedures_'))?[{kind:'category',name:'関数',colour:290,custom:'EXERCISE_PROCEDURE'}]:[])
    ]});
    load(p.initial_blocks);baseline=save();
    const locked=new Set(walk(p.initial_blocks).filter(e=>e.block.locked).map(e=>e.block.id));
    for(const e of walk(baseline))if(locked.has(e.block.id))e.block.locked=true;
    fixed();lastValid=save();
    $('body').hidden=false;$('leave').disabled=false;
    $('title').textContent=`Level ${p.difficulty} / ${names[p.type]} — ${p.title}`;
    $('instruction').textContent=p.instruction;
    $('rules').textContent=`必須：${p.required_blocks.join('、')||'なし'}　禁止：${p.forbidden_blocks.join('、')||'なし'}　🔒 固定ブロックは変更できません`;
    $('tests').textContent=p.test_cases.filter(t=>t.visibility==='public').map((t,i)=>`公開テスト ${i+1}\n入力：${t.input.join(' / ')||'なし'}\n期待：\n${t.expected_output||'（出力なし）'}`).join('\n\n');
    $('hints').replaceChildren();$('result').replaceChildren();$('hint').disabled=!p.hints.length;
    document.getElementById('load').disabled=true;document.getElementById('clear').disabled=true;
    workspace.scrollCenter();onChange();
  }
  $('start').onclick=()=>{if(controller||isRunning())return;const p=catalog.find(p=>p.id===$('select').value);if(!p)return;if(active&&!confirm('現在の問題を終了して切り替えますか？'))return;if(!active)freeState=save();begin(p);};
  $('reset').onclick=()=>{if(active&&!controller&&!isRunning()&&confirm('この問題を最初からやり直しますか？'))begin(active);};
  $('leave').onclick=()=>{if(controller||isRunning())return;active=null;clearTimeout(scheduled);onActive(false);workspace.updateToolbox(fullToolbox);load(freeState);$('body').hidden=true;$('leave').disabled=true;document.getElementById('load').disabled=false;document.getElementById('clear').disabled=false;onChange();};
  $('hint').onclick=()=>{hints++;$('hints').replaceChildren(...hintAt(active,hints).map(h=>{const p=document.createElement('p');p.textContent=`Hint ${h.level}：${h.text}`;return p;}));$('hint').disabled=hints>=active.hints.length;};
  function busy(value){
    for(const id of controls)document.getElementById(id).disabled=value||(!!active&&['load','clear'].includes(id));
    for(const id of ['grade','start','leave','reset','select'])$(id).disabled=value;
    $('cancel').disabled=!value;
    document.getElementById('blockly').inert=value;
  }
  $('cancel').onclick=()=>controller?.abort();
  $('grade').onclick=async()=>{
    if(!active||controller||isRunning())return;
    const state=save();if(!restrictions(state)){load(lastValid);fixed();$('result').textContent='ブロックの制限を確認してください。';return;}
    const source=generateGradingCode(workspace,generator),stateNames={};
    for(const v of workspace.getAllVariables())stateNames[v.name]=generator.nameDB_.getName(v.getId(),Blockly.Names.NameType.VARIABLE);
    controller=new AbortController();busy(true);
    try{
      const results=await runCases(source,active,stateNames,{signal:controller.signal,onProgress:(i,n)=>{$('result').textContent=`採点中 ${i+1} / ${n}（停止できます）`;}});
      const result=grade(active,state,results,++attempts);
      $('result').replaceChildren();
      const heading=document.createElement('h3');heading.textContent=`${result.score}点　${result.status}`;$('result').append(heading);
      for(const [key,value] of Object.entries(result.checks)){
        if(key==='state'&&!active.test_cases.some(t=>Object.keys(t.expected_state||{}).length))continue;
        if(key==='nesting'&&!active.grading.nesting?.length&&!active.grading.output_variables?.length)continue;
        if(key==='functions'&&!active.grading.functions?.length)continue;
        if(key==='locked'&&!walk(active.initial_blocks).some(e=>e.block.locked))continue;
        if(!(key in active.grading.score)&&!active.grading.completion_requirements.includes(key)&&!['forbidden_blocks','available_blocks','locked'].includes(key))continue;
        const row=document.createElement('p');row.textContent=`${value===1?'✓':'×'} ${labels[key]}${value>0&&value<1?'（一部達成）':''}`;$('result').append(row);
      }
      for(const visibility of ['public','hidden']){const tests=result.tests.filter(t=>t.visibility===visibility);if(!tests.length)continue;const p=document.createElement('p');p.textContent=`${visibility==='public'?'公開':'隠し'}テスト ${tests.filter(t=>t.pass).length} / ${tests.length} 成功`;$('result').append(p);}
      const feedback=document.createElement('p');feedback.textContent=result.feedback;$('result').append(feedback);
      if(result.details){const detail=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='出力の比較・元のエラー';pre.textContent=result.details;detail.append(summary,pre);$('result').append(detail);}
    }catch(error){$('result').textContent=error.name==='AbortError'?'採点を中止しました。':`採点できませんでした：${error.message}`;}
    finally{controller=null;busy(false);fixed();}
  };
}
