import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {executionBlocks,walk} from '../public/problem-model.js';
import {grade} from '../public/grading.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../public/problems/catalog.json',import.meta.url)));
const ws=(...blocks)=>({blocks:{blocks}}),num={type:'math_number',fields:{NUM:10}};
const print=value=>({type:'text_print',inputs:{TEXT:{block:value}}});
const plus={type:'math_arithmetic',inputs:{A:{block:num},B:{block:num}}};
// These tests isolate static reachability; runtime evidence is tested separately.
const q=id=>{const p=structuredClone(catalog.find(p=>p.id===id));delete p.grading.learning;return p;};
const results=p=>p.test_cases.map(t=>({output:t.expected_output,state:structuredClone(t.expected_state||{}),calls:['double'],executed:walk(p.solution.workspace).map(e=>e.block.id),values:Object.fromEntries(walk(p.solution.workspace).filter(e=>e.block.type==='variables_get').map(e=>[e.block.id,[e.block.fields.VAR.id==='numbers'?[3,5,7]:10]]))}));
test('connected expressions count; detached values and arithmetic do not',()=>{
 const p=q('arithmetic_01');
 assert.equal(grade(p,ws(print(plus)),results(p)).status,'完全正解');
 const r=grade(p,ws(print(num),plus),results(p));
 assert.equal(r.checks.required_blocks,0);assert.equal(r.status,'部分正解');assert.match(r.feedback,/接続されていません/);
 assert.equal(executionBlocks(ws(num,plus)).executableBlocks.length,0);
});
test('next, statement inputs, value inputs and shadow inputs are traversed',()=>{
 const root={type:'controls_for',inputs:{DO:{block:print(plus)}},next:{block:print({type:'text'})}};
 assert.equal(executionBlocks(ws(root)).detachedBlocks.length,0);
 assert.equal(executionBlocks(ws({type:'text_print',inputs:{TEXT:{shadow:num}}})).executableBlocks.length,2);
});
test('unused definitions and their bodies do not satisfy requirements',()=>{
 const def={type:'procedures_defreturn',fields:{NAME:'unused'},inputs:{RETURN:{block:plus}}};
 assert.equal(grade(q('arithmetic_01'),ws(def,print(num)),results(q('arithmetic_01'))).checks.required_blocks,0);
});
test('disabled containers suppress descendants but not their following statements',()=>{
 const root={type:'controls_if',disabled:true,inputs:{DO0:{block:print(plus)}},next:{block:print(num)}};
 assert.equal(executionBlocks(ws(root)).executableBlocks.filter(e=>e.block.type==='text_print').length,1);
});
test('for and if in separate stacks do not satisfy nesting',()=>{
 const p=q('nested_01');
 assert.equal(grade(p,p.solution.workspace,results(p)).checks.nesting,1);
 assert.equal(grade(p,ws({type:'controls_for'},{type:'controls_if'},print(num)),results(p)).checks.nesting,0);
});
test('function definition, arguments, return and actual calls are independently checked',()=>{
 const p=q('function_01');assert.equal(grade(p,p.solution.workspace,results(p)).checks.functions,1);
 for(const change of [s=>s.blocks.blocks.pop(),s=>s.blocks.blocks[0].extraState.params=[],s=>delete s.blocks.blocks[0].inputs.RETURN]){
  const s=structuredClone(p.solution.workspace);change(s);assert.equal(grade(p,s,results(p)).checks.functions,0);
 }
 const r=results(p);r[0].calls=[];assert.equal(grade(p,p.solution.workspace,r).checks.functions,0);
});
test('transitive procedure calls resolve without infinite recursion',()=>{
 const def=name=>({type:'procedures_defnoreturn',fields:{NAME:name},inputs:{STACK:{block:{type:'procedures_callnoreturn',extraState:{name:name==='a'?'b':'a'}}}}});
 const s=ws(def('a'),def('b'),{type:'procedures_callnoreturn',extraState:{name:'a'}});
 assert.equal(executionBlocks(s).detachedBlocks.length,0);
});
test('forbidden scope defaults to executable; workspace scope includes detached expressions',()=>{
 const p=q('print_01');p.forbidden_blocks=['math_arithmetic'];p.available_blocks.push('math_arithmetic');
 const s=ws(print({type:'text'}),plus);
 assert.equal(grade(p,s,results(p)).checks.forbidden_blocks,1);
 p.forbidden_block_scope='workspace';assert.equal(grade(p,s,results(p)).checks.forbidden_blocks,0);
 p.forbidden_block_scope='executable';assert.equal(grade(p,ws(print(plus)),results(p)).checks.forbidden_blocks,0);
});
for(const original of catalog){
 if(original.forbidden_blocks.length)test(`${original.id}: forbidden statements in executable stacks are rejected`,()=>{
  const p=structuredClone(original);
  const s=structuredClone(p.solution.workspace);s.blocks.blocks.push({type:'controls_whileUntil'});
  assert.equal(grade(p,s,results(p)).checks.forbidden_blocks,0);
 });
 test(`${original.id}: reference solution remains fully correct`,()=>{
  const p=structuredClone(original);assert.equal(grade(p,p.solution.workspace,results(p)).status,'完全正解');
 });
 test(`${original.id}: literal outputs cannot replace the learning structure`,()=>{
  const p=q(original.id),s=ws(print({type:'text',fields:{TEXT:p.test_cases[0].expected_output}}));
  // Existence alone: move every required expression to a separate root.
  for(const e of walk(p.solution.workspace))if(!['text_print'].includes(e.block.type)&&!e.block.next)s.blocks.blocks.push({...structuredClone(e.block),inputs:{}});
  const r=grade(p,s,results(p));
  if(p.id==='print_01')assert.equal(r.status,'完全正解'); // Literal text is the goal.
  else assert.notEqual(r.status,'完全正解');
 });
 test(`${original.id}: missing input connections cannot earn completion`,()=>{
  const p=structuredClone(original),s=structuredClone(p.solution.workspace);
  for(const e of walk(s))delete e.block.inputs;
  const r=grade(p,s,p.test_cases.map(()=>({output:''})));
  assert.notEqual(r.status,'完全正解');
 });
}
test('preserved locked assignment plus literal print cannot replace use of x',()=>{
 const p=q('variable_01'),s=structuredClone(p.solution.workspace);
 s.blocks.blocks[0].next.block.inputs.TEXT.block=num;
 const r=grade(p,s,results(p));assert.equal(r.checks.locked,1);assert.equal(r.checks.state,1);assert.equal(r.checks.nesting,0);assert.notEqual(r.status,'完全正解');
});
test('connected but unused assignment arithmetic cannot replace printed calculation',()=>{
 const p=q('arithmetic_01'),s=ws({type:'variables_set',inputs:{VALUE:{block:plus}}},print(num));
 const r=grade(p,s,results(p));assert.equal(r.checks.required_blocks,1);assert.equal(r.checks.nesting,0);assert.notEqual(r.status,'完全正解');
});
