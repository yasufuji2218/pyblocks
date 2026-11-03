export const aliases={print:['text_print'],for:['controls_for','controls_repeat_ext','controls_forEach'],while:['controls_whileUntil'],if:['controls_if'],function:['procedures_defreturn','procedures_defnoreturn'],call:['procedures_callreturn','procedures_callnoreturn']};
export const expand=names=>names.flatMap(n=>aliases[n]||[n]);
aliases.arithmetic=['math_arithmetic'];
// Blockly emits every enabled top-level statement stack, but naked expressions
// are not part of a statement. Keep this registry explicit for pure JSON grading.
const statementTypes=new Set(['text_print','variables_set','math_change','controls_if','controls_for','controls_repeat_ext','controls_forEach','controls_whileUntil','controls_flow_statements','procedures_callnoreturn','procedures_ifreturn','lists_setIndex','text_append','lib_shuffle','lib_sleep','lib_plot','lib_scatter','lib_bar','lib_hist','lib_title','lib_xlabel','lib_ylabel','lib_legend','lib_show']);
const definitions=new Set(['procedures_defreturn','procedures_defnoreturn']);
const procedureName=b=>b.fields?.NAME||b.extraState?.name;
export function executionBlocks(state){
  const workspaceBlocks=walk(state), active=workspaceBlocks.filter(e=>!e.inactive),entries=new Map(active.map(e=>[e.block,e]));
  const included=new Set(), called=new Set();
  function include(b){
    if(!b)return;
    const entry=entries.get(b);
    if(!entry)return include(b.next?.block);
    if(included.has(b))return;
    included.add(b);
    if(['procedures_callreturn','procedures_callnoreturn'].includes(b.type))called.add(procedureName(b));
    for(const input of Object.values(b.inputs||{}))include(input.block||input.shadow);
    include(b.next?.block);
  }
  for(const b of state?.blocks?.blocks||[])if(statementTypes.has(b.type))include(b);
  // Resolve transitive calls, including mutually recursive definitions.
  let changed=true;
  while(changed){changed=false;for(const e of active)if(definitions.has(e.block.type)&&called.has(procedureName(e.block))&&!included.has(e.block)){include(e.block);changed=true;}}
  return {workspaceBlocks,executableBlocks:active.filter(e=>included.has(e.block)),detachedBlocks:workspaceBlocks.filter(e=>!included.has(e.block))};
}
export const criteria=['output','test_cases','required_blocks','forbidden_blocks','available_blocks','state','nesting','functions','locked','learning'];
export function walk(state) {
  const result=[];
  function visit(b,ancestors=[],parent=null,slot='root',disabled=false){
    if(!b)return;
    const inactive=disabled||b.disabled===true||(b.disabledReasons||[]).length>0;
    result.push({block:b,ancestors,parent,slot,inactive});
    for(const [key,input] of Object.entries(b.inputs||{}))visit(input.block||input.shadow,[...ancestors,b],b.id,key,inactive);
    visit(b.next?.block,ancestors,b.id,'next',disabled);
  }
  for(const b of state?.blocks?.blocks||[])visit(b);
  return result;
}
export function validateProblems(data,knownTypes) {
  if(!Array.isArray(data)||!data.length)throw new Error('問題一覧は空でない配列にしてください');
  const ids=new Set();
  for(const p of data){
    const fail=msg=>{throw new Error(`${p.id||'問題'}: ${msg}`);};
    for(const key of ['id','course','category','title','description','instruction'])if(typeof p[key]!=='string'||!p[key].trim())fail(key+' が必要です');
    if(ids.has(p.id))fail('idが重複しています');ids.add(p.id);
    if(!Number.isInteger(p.difficulty)||p.difficulty<1||p.difficulty>5)fail('difficultyは1〜5');
    if(!['build','fill','fix','free'].includes(p.type))fail('問題形式が不正です');
    for(const key of ['available_blocks','required_blocks','forbidden_blocks']){
      if(!Array.isArray(p[key])||p[key].some(v=>typeof v!=='string'))fail(key+'は文字列配列');
      if(knownTypes&&expand(p[key]).some(t=>!knownTypes.has(t)))fail(key+'に不明なブロック');
    }
    if(!p.available_blocks.length)fail('使用可能ブロックが必要です');
    const allowed=expand(p.available_blocks), banned=expand(p.forbidden_blocks);
    if(p.required_blocks.some(r=>!expand([r]).some(t=>allowed.includes(t)&&!banned.includes(t))))fail('必須ブロックが使用できません');
    if(!p.initial_blocks?.blocks||!Array.isArray(p.initial_blocks.blocks.blocks))fail('initial_blocksはBlocklyワークスペース形式');
    const initial=walk(p.initial_blocks), blockIds=new Set();
    for(const {block:b} of initial){
      if(typeof b.type!=='string'||!allowed.includes(b.type)||banned.includes(b.type))fail('初期ブロックが使用制限に違反');
      if(b.locked!==undefined&&typeof b.locked!=='boolean')fail('lockedは真偽値');
      if(b.locked&&!b.id)fail('lockedには固定idが必要');
      if(b.id&&blockIds.has(b.id))fail('ブロックid重複');if(b.id)blockIds.add(b.id);
    }
    if(!Array.isArray(p.test_cases)||!p.test_cases.length)fail('テストケースが必要');
    for(const t of p.test_cases){
      if(!Array.isArray(t.input)||t.input.some(v=>typeof v!=='string')||typeof t.expected_output!=='string')fail('入力・出力形式が不正');
      if(!['public','hidden'].includes(t.visibility))fail('visibilityが不正');
      if(t.expected_state!==undefined&&(!t.expected_state||Array.isArray(t.expected_state)||typeof t.expected_state!=='object'))fail('expected_stateはオブジェクト');
    }
    if(!p.test_cases.some(t=>t.visibility==='public'))fail('公開テストが必要');
    if(!Array.isArray(p.hints)||p.hints.some(h=>!Number.isInteger(h.level)||h.level<1||h.level>4||typeof h.text!=='string'))fail('ヒントが不正');
    if(new Set(p.hints.map(h=>h.level)).size!==p.hints.length)fail('ヒント段階重複');
    if(!p.solution||typeof p.solution!=='object')fail('solutionが必要');
    const g=p.grading;
    if(!g?.score||Object.entries(g.score).some(([k,v])=>!criteria.includes(k)||!Number.isFinite(v)||v<0)||Math.abs(Object.values(g.score).reduce((a,b)=>a+b,0)-100)>0.001)fail('配点の合計は100');
    if(!Array.isArray(g.completion_requirements)||!g.completion_requirements.length||g.completion_requirements.some(k=>!criteria.includes(k)))fail('完全正解条件が不正');
    for(const n of g.nesting||[])if(!Array.isArray(n)||n.length<2||n.some(v=>typeof v!=='string'))fail('nestingはブロック名の経路配列');
    if(p.forbidden_block_scope!==undefined&&!['workspace','executable'].includes(p.forbidden_block_scope))fail('forbidden_block_scopeが不正');
    if(g.functions!==undefined&&(!Array.isArray(g.functions)||g.functions.some(v=>typeof v!=='string'&&(!v||typeof v.name!=='string'||!Array.isArray(v.params)||v.params.some(n=>typeof n!=='string')||typeof v.returns!=='boolean'))))fail('functionsは関数名または関数仕様の配列');
    if(g.output_variables!==undefined&&(!Array.isArray(g.output_variables)||g.output_variables.some(v=>typeof v!=='string')))fail('output_variablesは変数名配列');
    if(g.learning!==undefined){
      const pattern=r=>r&&typeof r==='object'&&!Array.isArray(r)&&(r.anyOf?Array.isArray(r.anyOf)&&r.anyOf.length&&r.anyOf.every(pattern):typeof r.type==='string'&&(!r.inputs||typeof r.inputs==='object'&&Object.values(r.inputs).every(pattern))&&(!r.next||pattern(r.next)));
      if(!Array.isArray(g.learning)||!g.learning.length||!g.learning.every(pattern))fail('learningは接続パターンの配列');
    }
    if(g.timeout_ms!==undefined&&(!Number.isInteger(g.timeout_ms)||g.timeout_ms<100||g.timeout_ms>10000))fail('timeout_msは100〜10000');
  }
  return data;
}
export function lockedSignature(entry){
  const b=entry.block;
  return JSON.stringify([b.type,b.fields||{},b.extraState||{},entry.parent,entry.slot,entry.slot==='root'?[b.x||0,b.y||0]:null,entry.inactive]);
}
export function lockedIntact(initial,current){
  const now=new Map(walk(current).map(e=>[e.block.id,e]));
  const oldNames=new Map((initial.variables||[]).map(v=>[v.id,v.name]));
  const newNames=new Map((current.variables||[]).map(v=>[v.id,v.name]));
  return walk(initial).filter(e=>e.block.locked).every(e=>now.has(e.block.id)&&lockedSignature(e)===lockedSignature(now.get(e.block.id))&&Object.values(e.block.fields||{}).every(v=>!v?.id||!oldNames.has(v.id)||oldNames.get(v.id)===newNames.get(v.id)));
}
export function hintAt(problem,count){return [...problem.hints].sort((a,b)=>a.level-b.level).slice(0,Math.max(0,Math.min(4,count)));}
