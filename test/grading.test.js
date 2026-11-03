import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateProblems,lockedIntact,hintAt,walk} from '../public/problem-model.js';
import {grade} from '../public/grading.js';
import {classifyError,explainError} from '../public/errors.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../public/problems/catalog.json',import.meta.url)));
const copy=v=>structuredClone(v), question=id=>{const p=copy(catalog.find(p=>p.id===id));delete p.grading.learning;p.grading.score={output:40,required_blocks:30,test_cases:30};return p;};
const success=p=>p.test_cases.map(t=>({output:t.expected_output,state:copy(t.expected_state||{}),calls:['double']}));
test('catalog contains 12 valid questions, all forms and levels',()=>{
  assert.equal(validateProblems(catalog).length,12);
  assert.equal(new Set(catalog.map(p=>p.type)).size,4);
  assert.deepEqual([...new Set(catalog.map(p=>p.difficulty))].sort(),[1,2,3,4,5]);
});
for(const [name,change] of [
  ['difficulty',p=>p.difficulty=6],['type',p=>p.type='unknown'],['score',p=>p.grading.score.output=99],
  ['requirements',p=>p.grading.completion_requirements=['bad']],['input',p=>p.test_cases[0].input=[4]],
  ['visibility',p=>p.test_cases[0].visibility='private'],['available',p=>p.available_blocks=[]],
  ['required forbidden conflict',p=>p.forbidden_blocks=p.required_blocks],['hints',p=>p.hints.push(p.hints[0])]
])test('invalid data rejected: '+name,()=>{const p=question('print_01');change(p);assert.throws(()=>validateProblems([p]));});
test('duplicate question ids rejected',()=>assert.throws(()=>validateProblems([catalog[0],catalog[0]])));
test('unknown block ids rejected when runtime registry supplied',()=>assert.throws(()=>validateProblems([catalog[0]],new Set(['text_print']))));
test('required block missing gives partial credit even with correct output',()=>{
 const p=question('for_01');const state={blocks:{blocks:[{type:'text_print'}]}};
 const r=grade(p,state,success(p));assert.equal(r.score,70);assert.equal(r.status,'部分正解');
});
test('available and forbidden blocks independently prevent full correctness',()=>{
 const p=question('for_01'), state=copy(p.solution.workspace);state.blocks.blocks.push({type:'controls_whileUntil'});
 const r=grade(p,state,success(p));assert.equal(r.checks.available_blocks,0);assert.equal(r.checks.forbidden_blocks,0);assert.notEqual(r.status,'完全正解');
});
test('disabled required blocks do not count',()=>{
 const p=question('for_01'),state=copy(p.solution.workspace);state.blocks.blocks[0].disabledReasons=['MANUALLY_DISABLED'];
 assert.equal(grade(p,state,success(p)).checks.required_blocks,0);
});
test('public and hidden tests share comparisons but hidden values are redacted',()=>{
 const p=question('input_01'),r=success(p);r[2].output='secret-output';
 const result=grade(p,p.solution.workspace,r);assert.equal(result.tests.length,p.test_cases.length);assert.equal(result.tests[2].pass,false);
 assert.deepEqual(Object.keys(result.tests[2]).sort(),['pass','visibility']);assert.ok(!JSON.stringify(result).includes('secret-output'));assert.equal(result.status,'部分正解');
});
test('all tests correct allows a different solution structure',()=>{
 const p=question('print_01'),state={blocks:{blocks:[{type:'text_print',inputs:{TEXT:{block:{type:'text',fields:{TEXT:'こんにちは'}}}}}]}};
 assert.equal(grade(p,state,success(p)).status,'完全正解');
});
test('zero score is incorrect; full score alone is not completion',()=>{
 const p=question('for_01');assert.equal(grade(p,{blocks:{blocks:[]}},[{output:'wrong'}]).status,'不正解');
 p.grading.score={output:100};assert.equal(grade(p,{blocks:{blocks:[]}},success(p)).score,99);assert.equal(grade(p,{blocks:{blocks:[]}},success(p)).status,'部分正解');
});
test('final scalar and list states are checked deeply',()=>{
 const p=question('list_01'),r=success(p);r[0].state.numbers=[3,5];assert.equal(grade(p,p.solution.workspace,r).checks.state,0);
 const q=question('total_01'),s=success(q);s[0].state.total=5;assert.equal(grade(q,q.solution.workspace,s).tests[0].pass,false);
});
test('nesting requires containment, not adjacent matching types',()=>{
 const p=question('nested_01');assert.equal(grade(p,p.solution.workspace,success(p)).checks.nesting,1);
 const state={blocks:{blocks:[{type:'controls_for',next:{block:{type:'controls_if',next:{block:{type:'text_print'}}}}}]}};
 assert.equal(grade(p,state,success(p)).checks.nesting,0);
});
test('function must actually be called',()=>{
 const p=question('function_01');const r=success(p);r[0].calls=[];assert.equal(grade(p,p.solution.workspace,r).checks.functions,0);
});
test('locked blocks reject deletion, movement, edits, reparenting and disabling',()=>{
 const p=question('variable_01'),base=p.initial_blocks;
 for(const mutate of [s=>s.blocks.blocks.shift(),s=>s.blocks.blocks[0].x++,s=>s.blocks.blocks[0].fields.VAR.id='other',s=>s.blocks.blocks[0].disabled=true]){
  const state=copy(base);mutate(state);assert.equal(lockedIntact(base,state),false);
 }
 const state=copy(base);const locked=state.blocks.blocks.shift();state.blocks.blocks.push({type:'controls_if',id:'parent',inputs:{DO0:{block:locked}}});assert.equal(lockedIntact(base,state),false);
});
test('locked container accepts filling an empty input',()=>{
 const p=question('variable_01');assert.equal(lockedIntact(p.initial_blocks,p.solution.workspace),true);
 assert.ok(walk(p.solution.workspace).some(e=>e.block.type==='math_number'));
});
test('renaming a variable used by a locked block is rejected',()=>{
 const p=question('variable_01'),state=copy(p.initial_blocks);state.variables[0].name='renamed';assert.equal(lockedIntact(p.initial_blocks,state),false);
});
test('errors precede timeouts and structural feedback; hidden errors do not leak',()=>{
 const p=question('input_01'),r=success(p);r[0].error="NameError: name 'x' is not defined";r[1]={timeout:true};
 const result=grade(p,p.solution.workspace,r);assert.equal(result.errorType,'NameError');assert.match(result.feedback,/変数/);
 const hidden=success(p);hidden[1].error='ValueError: secret123';assert.ok(!JSON.stringify(grade(p,p.solution.workspace,hidden)).includes('secret123'));
});
test('timeout classification',()=>{const p=question('for_01');assert.equal(grade(p,p.solution.workspace,[{timeout:true}]).errorType,'Timeout');});
test('major Python errors classified and explained',()=>{
 for(const type of ['NameError','TypeError','ValueError','IndexError','ZeroDivisionError','SyntaxError','KeyError','EOFError','RecursionError'])assert.equal(classifyError(type+': example'),type);
 assert.match(explainError('IndexError'),/範囲外/);
});
test('hints are revealed progressively; feedback deepens after failure',()=>{
 const p=question('for_01');assert.equal(hintAt(p,0).length,0);assert.equal(hintAt(p,1).length,1);assert.equal(hintAt(p,99).length,4);
 assert.notEqual(grade(p,p.initial_blocks,[{output:'bad'}],1).feedback,grade(p,p.initial_blocks,[{output:'bad'}],3).feedback);
});
