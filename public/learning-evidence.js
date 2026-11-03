import {expand} from './problem-model.js';

// Declarative structural patterns + evidence from the actual Python execution.
// A pattern's entire connected subtree must have run (across the test suite).
export function learningEvidence(problem,state,nodes,results){
  const rules=problem.grading.learning;
  if(!rules)return true;
  const reached=new Set(results.flatMap(r=>r.executed||[]));
  const names=new Map((state.variables||[]).map(v=>[v.id,v.name]));
  function matches(block,rule){
    if(rule.anyOf)return rule.anyOf.some(r=>matches(block,r));
    if(!block)return false;
    if(block.type.startsWith('procedures_def')){
      if(!results.some(r=>(r.calls||[]).includes(block.fields?.NAME)))return false;
    }else if(!reached.has(block.id))return false;
    if(rule.type&&!expand([rule.type]).includes(block.type))return false;
    if(rule.variable&&(names.get(block.fields?.VAR?.id)||block.fields?.VAR?.name)!==rule.variable)return false;
    if(Object.entries(rule.fields||{}).some(([k,v])=>block.fields?.[k]!==v))return false;
    if(rule.observed!==undefined){
      const values=results.flatMap(r=>r.values?.[block.id]||[]);
      if(!values.length||values.some(v=>JSON.stringify(v)!==JSON.stringify(rule.observed)))return false;
    }
    for(const [name,input] of Object.entries(rule.inputs||{})){
      const connection=block.inputs?.[name];
      if(!matches(connection?.block||connection?.shadow,input))return false;
    }
    return !rule.next||matches(block.next?.block,rule.next);
  }
  return rules.every(rule=>nodes.some(e=>matches(e.block,rule)));
}
