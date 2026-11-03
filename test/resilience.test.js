import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {grade,normalize} from '../public/grading.js';
import {resilienceCases} from '../public/resilience-cases.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const catalog=read('../public/problems/catalog.json'),records=read('./fixtures/resilience.json');
test('audit fixture covers every declared attack and current hidden test case',()=>{
 for(const p of catalog){
  const actual=records.filter(r=>r.id===p.id);
  assert.deepEqual(actual.map(r=>r.kind),resilienceCases(p).map(r=>r.kind));
  for(const r of actual.filter(r=>!r.na)){assert.equal(r.results.length,p.test_cases.length);assert.equal(r.pass,true);}
 }
});
for(const r of records.filter(r=>!r.na))test(`live Python replay ${r.id} / ${r.name}`,()=>{
 const p=catalog.find(p=>p.id===r.id),result=grade(p,r.state,r.results);
 assert.equal(result.status==='完全正解',r.expected);
 assert.equal(result.score,r.result.score);
 assert.ok(r.expected?result.score===100:result.score<100);
 if(r.kind==='omit')assert.equal(result.score,0);
 if(['public','hidden'].includes(r.kind)){
  const publicCases=p.test_cases.map((t,i)=>({t,r:r.results[i]})).filter(c=>c.t.visibility==='public');
  assert.ok(publicCases.every(c=>normalize(c.r.output)===normalize(c.t.expected_output)),'attack really must match all public outputs');
  assert.ok(p.test_cases.some((t,i)=>t.visibility==='hidden'&&normalize(r.results[i].output)!==normalize(t.expected_output)),'hidden inputs expose lack of generalization');
 }
});
test('final required state is enforced after correct outputs',()=>{
 for(const r of records.filter(r=>r.kind==='post'&&!r.na)){
  const p=catalog.find(p=>p.id===r.id);
  if(p.test_cases.some(t=>t.expected_state))assert.ok(grade(p,r.state,r.results).checks.state<1);
 }
});
test('four purpose-spoofing examples are reproduced and rejected',()=>{
 const spoof=records.filter(r=>r.kind==='spoof');assert.equal(spoof.length,4);
 for(const r of spoof)assert.equal(grade(catalog.find(p=>p.id===r.id),r.state,r.results).checks.learning,0);
});
test('previous structural rules admitted zero-multiplied variables, lists and formula overwrite',()=>{
 for(const r of records.filter(r=>r.kind==='spoof')){
  const old=structuredClone(catalog.find(p=>p.id===r.id));delete old.grading.learning;
  // The old function suite had only 6, 0, -3; its tailored polynomial matches
  // those cases. New hidden inputs 7 and -11 expose it independently as well.
  const count=r.id==='function_01'?3:old.test_cases.length;
  old.test_cases=old.test_cases.slice(0,count);
  assert.equal(grade(old,r.state,r.results.slice(0,count)).status,'完全正解');
  assert.notEqual(grade(catalog.find(p=>p.id===r.id),r.state,r.results).status,'完全正解');
 }
});
test('previous arithmetic rules admitted 0 + 10 as 7 + 3',()=>{
 const r=records.find(r=>r.id==='arithmetic_01'&&r.kind==='value'),p=structuredClone(catalog.find(p=>p.id===r.id));
 delete p.grading.learning;assert.equal(grade(p,r.state,r.results).status,'完全正解');
});
test('new final loop states reject corruption that the old questions did not inspect',()=>{
 for(const id of ['for_01','while_01','nested_01']){
  const r=records.find(r=>r.id===id&&r.kind==='post'),old=structuredClone(catalog.find(p=>p.id===id));
  delete old.grading.learning;for(const t of old.test_cases)delete t.expected_state;
  assert.equal(grade(old,r.state,r.results).status,'完全正解');
  assert.notEqual(grade(catalog.find(p=>p.id===id),r.state,r.results).status,'完全正解');
 }
});
