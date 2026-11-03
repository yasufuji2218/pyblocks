import test from 'node:test';
import assert from 'node:assert/strict';
import {explainError} from '../public/errors.js';
test('undefined variables are explained by name',()=>assert.match(explainError("Traceback\nNameError: name 'score' is not defined"),/変数「score」/));
test('arithmetic and type errors have beginner explanations',()=>{assert.match(explainError('ZeroDivisionError: division by zero'),/0で割る/);assert.match(explainError('TypeError'),/種類/);});
test('unknown errors retain a useful fallback',()=>assert.match(explainError('unknown'),/詳細/));
