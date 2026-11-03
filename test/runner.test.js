import test from 'node:test';
import assert from 'node:assert/strict';
import {runCases} from '../public/test-runner.js';
const problem={test_cases:[{input:[],expected_output:''},{input:['2'],expected_output:'2'}],grading:{timeout_ms:100}};
test('runner isolates cases and terminates every completed worker',async()=>{
 const previous=globalThis.Worker,instances=[];
 globalThis.Worker=class{constructor(){instances.push(this);}postMessage(data){queueMicrotask(()=>{this.onmessage({data:{type:'ready'}});this.onmessage({data:{type:'result',result:{output:data.test.expected_output}}});});}terminate(){this.terminated=true;}};
 try{const results=await runCases('pass',problem,{});assert.equal(instances.length,2);assert.equal(results[1].output,'2');assert.ok(instances.every(w=>w.terminated));}finally{globalThis.Worker=previous;}
});
test('runner terminates infinite execution on timeout',async()=>{
 const previous=globalThis.Worker;let terminated=false;
 globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}terminate(){terminated=true;}};
 try{const [result]=await runCases('while True: pass',{...problem,test_cases:[problem.test_cases[0]]},{});assert.equal(result.timeout,true);assert.equal(terminated,true);}finally{globalThis.Worker=previous;}
});
test('runner abort releases the active worker',async()=>{
 const previous=globalThis.Worker,controller=new AbortController();let terminated=false;
 globalThis.Worker=class{postMessage(){queueMicrotask(()=>controller.abort());}terminate(){terminated=true;}};
 try{await assert.rejects(runCases('pass',problem,{}, {signal:controller.signal}),{name:'AbortError'});assert.equal(terminated,true);}finally{globalThis.Worker=previous;}
});
