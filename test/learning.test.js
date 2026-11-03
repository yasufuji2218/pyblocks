import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {grade} from '../public/grading.js';
import {walk,validateProblems} from '../public/problem-model.js';
import {generateGradingCode} from '../public/grading-code.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../public/problems/catalog.json',import.meta.url)));
const q=id=>structuredClone(catalog.find(p=>p.id===id));
function evidence(p,state=p.solution.workspace){return p.test_cases.map(t=>({output:t.expected_output,state:t.expected_state||{},calls:['double'],executed:walk(state).map(e=>e.block.id),values:Object.fromEntries(walk(state).filter(e=>e.block.type==='variables_get').map(e=>[e.block.id,[e.block.fields.VAR.id==='numbers'?[3,5,7]:10]]))}));}
for(const p of catalog){
 test(`${p.id}: missing execution evidence fails closed`,()=>{
  const r=evidence(p);for(const t of r){delete t.executed;delete t.calls;}
  const result=grade(p,p.solution.workspace,r);assert.notEqual(result.status,'完全正解');assert.ok(result.score<=59);
 });
 test(`${p.id}: output followed by runtime error cannot score highly`,()=>{
  const r=evidence(p);r[0].error='ValueError: after output';const result=grade(p,p.solution.workspace,r);
  assert.notEqual(result.status,'完全正解');assert.ok(result.score<=49);
 });
 test(`${p.id}: correct structure with one failed output receives partial credit`,()=>{
  const r=evidence(p);r[0].output='incorrect';const result=grade(p,p.solution.workspace,r);
  assert.equal(result.status,'部分正解');assert.ok(result.score>0&&result.score<100);
 });
}
test('0 + 10 is not the requested 7 + 3 even when executed',()=>{
 const p=q('arithmetic_01'),s=structuredClone(p.solution.workspace),expr=s.blocks.blocks[0].inputs.TEXT.block;
 expr.inputs.A.block.fields.NUM=0;expr.inputs.B.block.fields.NUM=10;
 assert.equal(grade(p,s,evidence(p,s)).checks.learning,0);
});
test('getter must actually hold x=10 when printed, not only at program end',()=>{
 const p=q('variable_01'),r=evidence(p),getter=walk(p.solution.workspace).find(e=>e.block.type==='variables_get').block;
 r[0].values[getter.id]=[0];assert.equal(grade(p,p.solution.workspace,r).checks.learning,0);
});
test('list values at use must match, even if final list is restored',()=>{
 const p=q('list_01'),r=evidence(p),getter=walk(p.solution.workspace).find(e=>e.block.type==='variables_get').block;
 r[0].values[getter.id]=[[9,9,9]];assert.equal(grade(p,p.solution.workspace,r).checks.learning,0);
});
test('a matched print in an unexecuted branch earns no learning credit',()=>{
 const p=q('arithmetic_01'),r=evidence(p);for(const t of r)t.executed=[];
 assert.equal(grade(p,p.solution.workspace,r).checks.learning,0);
});
test('bad learning schema is rejected',()=>{const p=q('print_01');p.grading.learning=[{type:42}];assert.throws(()=>validateProblems([p]));});
test('grading instrumentation restores generator handlers even after failure',()=>{
 const handlers={literal:()=>['7',0],statement:()=>"print(7)\n"};
 const g={forBlock:handlers,ORDER_FUNCTION_CALL:2,addReservedWords(){},workspaceToCode(){assert.match(this.forBlock.literal({id:'value'},this)[0],/__grade_value__/);assert.match(this.forBlock.statement({id:'print'},this),/__grade_step__/);throw Error('expected');}};
 assert.throws(()=>generateGradingCode({},g));assert.equal(g.forBlock,handlers);
});
