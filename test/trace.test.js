import test from 'node:test';
import assert from 'node:assert/strict';
import {mapTrace} from '../public/trace.js';
test('markers map nested statements to displayed Python without leaking markers',()=>{
  const result=mapTrace(`__pyblocks_step('loop')\nfor i in range(3):\n    __pyblocks_step('output')\n    print(i)\n`);
  assert.equal(result.code,'for i in range(3):\n    print(i)\n');
  assert.equal(result.blocks.get('loop'),0);
  assert.equal(result.blocks.get('output'),1);
});
test('escaped block ids and repeated markers remain traceable',()=>{
  const result=mapTrace(`__pyblocks_step("a\\\"b")\n__pyblocks_step('next')\nprint(1)`);
  assert.equal(result.blocks.get('a"b'),0);
  assert.equal(result.blocks.get('next'),0);
});
