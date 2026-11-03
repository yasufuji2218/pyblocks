// Authoring utility. The application only reads the generated JSON catalog.
import {mkdir,writeFile} from 'node:fs/promises';
const n=v=>({type:'math_number',fields:{NUM:v}}), t=v=>({type:'text',fields:{TEXT:v}});
const get=name=>({type:'variables_get',fields:{VAR:{id:name}}});
const b=(type,inputs={},fields={})=>({type,fields,inputs:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,{block:v}]))});
const print=v=>b('text_print',{TEXT:v}), set=(name,v)=>b('variables_set',v?{VALUE:v}:{},{VAR:{id:name}});
const op=(a,c,kind='ADD')=>b('math_arithmetic',{A:a,B:c},{OP:kind});
const cmp=(a,c,kind)=>b('logic_compare',{A:a,B:c},{OP:kind});
const input=()=>b('python_convert',{VALUE:b('python_input',{PROMPT:t('')})},{TYPE:'int'});
function chain(...nodes){for(let i=0;i<nodes.length-1;i++)nodes[i].next={block:nodes[i+1]};return nodes[0];}
const ws=(nodes=[],names=[])=>({variables:names.map(name=>({name,id:name})),blocks:{languageVersion:0,blocks:nodes.map((v,i)=>({...v,x:45,y:45+i*220}))}});
const test=(input,expected_output,visibility='public',expected_state)=>({input,expected_output,visibility,...(expected_state?{expected_state}:{})});
const loop=(end,body)=>b('controls_for',{FROM:n(1),TO:end,BY:n(1),DO:body},{VAR:{id:'i'}});
const common=['text_print','text','math_number','variables_set','variables_get','math_arithmetic','logic_compare','logic_boolean','python_input','python_convert','math_change'];
const list=values=>({...b('lists_create_with',Object.fromEntries(values.map((v,i)=>['ADD'+i,n(v)]))),extraState:{itemCount:values.length}});
const problems=[];
function add(id,category,difficulty,type,title,instruction,required,extra,tests,solution,initial=ws(),grading={}){
 const available=[...new Set([...common,...extra,...required.flatMap(k=>({for:['controls_for','controls_repeat_ext','controls_forEach'],while:['controls_whileUntil'],if:['controls_if'],function:['procedures_defreturn','procedures_defnoreturn'],call:['procedures_callreturn','procedures_callnoreturn']}[k]||[k]))])];
 problems.push({id,course:'basic',category,difficulty,type,title,description:'ブロックとPythonの対応を確かめながら取り組みましょう。',instruction,available_blocks:available,required_blocks:required,forbidden_blocks:category==='for'?['while']:[],initial_blocks:initial,test_cases:tests,
 hints:[{level:1,text:instruction},{level:2,text:`使うブロック：${required.join('、')}`},{level:3,text:'入力・値の準備 → 計算や条件・繰り返し → 表示、の順に組み立てましょう。'},{level:4,text:grading.hint4||'公開テストの入力を紙に書き、変数の値を1つずつ追ってみましょう。'}],solution:{workspace:solution},grading:{score:{output:40,required_blocks:30,test_cases:30},completion_requirements:['output','test_cases','required_blocks','state','nesting','functions'],timeout_ms:3000,feedback_steps:['問題の指示と処理の順番を見直しましょう。','公開テストを手で計算し、境界の値も調べましょう。','ヒントを次の段階まで開いて、使うブロックと構造を確認しましょう。'],...grading}});
}
add('print_01','print',1,'build','こんにちはを表示','「こんにちは」を1行表示してください。',['text_print'],[],[test([],'こんにちは')],ws([print(t('こんにちは'))]));
const lockedSet={...set('x'),id:'fixed-set',locked:true};
add('variable_01','variable',1,'fill','変数の値を埋めよう','固定された代入ブロックの空欄に10を入れ、xを表示してください。',['variables_set'],[],[test([],'10','public',{x:10})],ws([chain({...set('x',n(10)),id:'fixed-set',locked:true},print(get('x')))],['x']),ws([chain(lockedSet,print(get('x')))],['x']));
add('arithmetic_01','arithmetic',2,'fix','計算を修正','7と3の合計を表示するように修正してください。',['math_arithmetic'],[],[test([],'10')],ws([print(op(n(7),n(3)))]),ws([print(op(n(7),n(3),'MINUS'))]));
add('input_01','input',2,'build','入力の2倍','整数を1つ入力し、その2倍だけを表示してください。',['python_input','math_arithmetic'],[],[test(['4'],'8'),test(['-2'],'-4','hidden'),test(['0'],'0','hidden'),test(['11'],'22','hidden')],ws([print(op(input(),n(2),'MULTIPLY'))]));
const sign=b('controls_if',{IF0:cmp(get('x'),n(0),'GTE'),DO0:print(t('非負')),ELSE:print(t('負'))});sign.extraState={hasElse:true};
add('if_01','if',2,'build','数の符号','整数を入力し、0以上なら「非負」、負なら「負」を表示してください。',['if'],[],[test(['3'],'非負'),test(['-1'],'負'),test(['0'],'非負','hidden'),test(['-20'],'負','hidden')],ws([chain(set('x',input()),sign)],['x']));
add('for_01','for',2,'fix','最後の5まで','forを使い1から5までを1行ずつ表示してください。whileは禁止です。',['for'],[],[test([],'1\n2\n3\n4\n5')],ws([loop(n(5),print(get('i')))],['i']),ws([loop(n(4),print(get('i')))],['i']));
const countdown=b('controls_whileUntil',{BOOL:cmp(get('x'),n(0),'GT'),DO:chain(print(get('x')),set('x',op(get('x'),n(1),'MINUS')))},{MODE:'WHILE'});
add('while_01','while',3,'build','カウントダウン','0以上の整数を入力し、その数から1まで表示してください。0なら何も表示しません。',['while'],[],[test(['3'],'3\n2\n1'),test(['0'],'','hidden'),test(['1'],'1','hidden')],ws([chain(set('x',input()),countdown)],['x']));
const fixedList={...set('numbers',list([3,5,7])),id:'list-set',locked:true};
add('list_01','list',3,'fill','リストの長さ','numbersを[3,5,7]のまま保ち、リストの長さを表示してください。',['lists_length'],['lists_create_with'],[test([],'3','public',{numbers:[3,5,7]})],ws([chain(structuredClone(fixedList),print(b('lists_length',{VALUE:get('numbers')})))],['numbers']),ws([chain(fixedList,print(null))],['numbers']));
// Empty inputs are represented by absent connections, not null blocks.
problems.at(-1).initial_blocks.blocks.blocks[0].next.block.inputs={};
const def=b('procedures_defreturn',{RETURN:op(get('n'),n(2),'MULTIPLY')},{NAME:'double'});def.extraState={params:[{name:'n',id:'n'}]};
const call=b('procedures_callreturn',{ARG0:input()});call.extraState={name:'double',params:['n']};
add('function_01','function',3,'build','2倍を返す関数','引数nの2倍を返すdouble関数を作り、入力した整数を渡して戻り値を表示してください。',['function','call'],[],[test(['6'],'12'),test(['0'],'0','hidden'),test(['-3'],'-6','hidden')],ws([def,print(call)],['n']),ws(),{functions:['double']});
add('math_01','math',3,'build','平方根を求める','0以上の整数を入力し、mathの平方根を表示してください。',['lib_sqrt'],[],[test(['16'],'4.0'),test(['9'],'3.0'),test(['0'],'0.0','hidden'),test(['25'],'5.0','hidden')],ws([print(b('lib_sqrt',{V0:input()}))]));
const even=b('controls_if',{IF0:cmp(b('math_modulo',{DIVIDEND:get('i'),DIVISOR:n(2)}),n(0),'EQ'),DO0:print(get('i'))});
add('nested_01','integrated',4,'free','偶数だけを選ぶ','1〜6をforで調べ、内側のifで偶数を判定して2・4・6を表示してください。',['for','if','text_print'],['math_modulo'],[test([],'2\n4\n6')],ws([loop(n(6),even)],['i']),ws(),{nesting:[['for','if','print']],score:{output:30,required_blocks:20,test_cases:30,nesting:20},hint4:'iを2で割った余りが0のときだけ、iを表示します。'});
const total=chain(set('n',input()),set('total',n(0)),loop(get('n'),set('total',op(get('total'),get('i')))),print(get('total')));
// Blockly's inclusive for counts backwards when end < start. Guard n=0.
const guarded=chain(set('n',input()),set('total',n(0)),b('controls_if',{IF0:cmp(get('n'),n(0),'GT'),DO0:loop(get('n'),set('total',op(get('total'),get('i'))))}),print(get('total')));
add('total_01','integrated',5,'free','1からnまでの合計','0以上の整数nを入力し、forで1〜nの合計を変数totalに保存して表示してください。n=0なら0です。',['for','if'],[],[test(['3'],'6','public',{total:6}),test(['5'],'15','public',{total:15}),test(['0'],'0','hidden',{total:0}),test(['1'],'1','hidden',{total:1}),test(['10'],'55','hidden',{total:55})],ws([guarded],['n','i','total']),ws(),{score:{output:30,test_cases:30,required_blocks:20,state:20},hint4:'total=0から始め、n>0の場合だけ1〜nを足します。'});
const connections={
 variable_01:{output_variables:['x']},
 arithmetic_01:{nesting:[['print','math_arithmetic']]},
 input_01:{nesting:[['print','math_arithmetic','python_input']]},
 if_01:{nesting:[['if','print']]},
 for_01:{nesting:[['for','print']],output_variables:['i']},
 while_01:{nesting:[['while','print']],output_variables:['x']},
 list_01:{nesting:[['print','lists_length','variables_get']],output_variables:['numbers']},
 function_01:{nesting:[['print','procedures_callreturn']],functions:[{name:'double',params:['n'],returns:true}]},
 math_01:{nesting:[['print','lib_sqrt','python_input']]},
 nested_01:{output_variables:['i']},
 total_01:{nesting:[['if','for','variables_set']],output_variables:['total']}
};
for(const p of problems){
 Object.assign(p.grading,connections[p.id]||{});
 p.forbidden_block_scope='executable';
 // Structural conditions receive points as well as blocking completion.
 if(p.grading.nesting||p.grading.output_variables){
  p.grading.score.output-=10;p.grading.score.nesting=(p.grading.score.nesting||0)+10;
 }
 if(p.grading.functions?.length){p.grading.score.output-=10;p.grading.score.functions=10;}
}
const vg=(name,observed)=>({type:'variables_get',variable:name,...(observed!==undefined?{observed}:{})});
const pn=v=>({type:'math_number',fields:{NUM:v}});
const pi=()=>({type:'python_convert',fields:{TYPE:'int'},inputs:{VALUE:{type:'python_input'}}});
const pp=value=>({type:'text_print',inputs:{TEXT:value}});
const calc=(a,b,kind='ADD')=>({type:'math_arithmetic',fields:{OP:kind},inputs:{A:a,B:b}});
const assign=(name,value)=>({type:'variables_set',variable:name,inputs:{VALUE:value}});
const learning={
 print_01:[pp({type:'text',fields:{TEXT:'こんにちは'}})],
 variable_01:[assign('x',pn(10)),pp(vg('x',10))],
 arithmetic_01:[pp({anyOf:[calc(pn(7),pn(3)),calc(pn(3),pn(7))]})],
 input_01:[pp({anyOf:[calc(pi(),pn(2),'MULTIPLY'),calc(pn(2),pi(),'MULTIPLY')]})],
 if_01:[assign('x',pi()),{type:'controls_if',inputs:{IF0:{type:'logic_compare',fields:{OP:'GTE'},inputs:{A:vg('x'),B:pn(0)}},DO0:pp({type:'text',fields:{TEXT:'非負'}}),ELSE:pp({type:'text',fields:{TEXT:'負'}})}}],
 for_01:[{type:'controls_for',variable:'i',inputs:{FROM:pn(1),TO:pn(5),BY:pn(1),DO:pp(vg('i'))}}],
 while_01:[assign('x',pi()),{type:'controls_whileUntil',fields:{MODE:'WHILE'},inputs:{BOOL:{type:'logic_compare',fields:{OP:'GT'},inputs:{A:vg('x'),B:pn(0)}},DO:{...pp(vg('x')),next:assign('x',calc(vg('x'),pn(1),'MINUS'))}}}],
 list_01:[pp({type:'lists_length',inputs:{VALUE:vg('numbers',[3,5,7])}})],
 function_01:[{type:'procedures_defreturn',fields:{NAME:'double'},inputs:{RETURN:calc(vg('n'),pn(2),'MULTIPLY')}},pp({type:'procedures_callreturn',inputs:{ARG0:pi()}})],
 math_01:[pp({type:'lib_sqrt',inputs:{V0:pi()}})],
 nested_01:[{type:'controls_for',variable:'i',inputs:{FROM:pn(1),TO:pn(6),BY:pn(1),DO:{type:'controls_if',inputs:{IF0:{type:'logic_compare',fields:{OP:'EQ'},inputs:{A:{type:'math_modulo',inputs:{DIVIDEND:vg('i'),DIVISOR:pn(2)}},B:pn(0)}},DO0:pp(vg('i'))}}}}],
 total_01:[assign('n',pi()),assign('total',pn(0)),{type:'controls_for',variable:'i',inputs:{FROM:pn(1),TO:vg('n'),BY:pn(1),DO:assign('total',calc(vg('total'),vg('i')))}},pp(vg('total'))]
};
// Stable authored IDs are also used by regression fixtures. Blockly preserves them.
function identify(b,path){if(!b)return;b.id??=path;for(const [k,v] of Object.entries(b.inputs||{}))identify(v.block||v.shadow,path+'.'+k);identify(b.next?.block,path+'.next');}
for(const p of problems){
 p.grading.learning=learning[p.id];
 p.grading.score={output:30,test_cases:30,required_blocks:20,learning:20};
 for(const state of [p.initial_blocks,p.solution.workspace])state.blocks.blocks.forEach((b,i)=>identify(b,p.id+'.'+i));
 if(p.id==='for_01')p.test_cases[0].expected_state={i:5};
 if(p.id==='while_01')for(const t of p.test_cases)t.expected_state={x:0};
 if(p.id==='nested_01')p.test_cases[0].expected_state={i:6};
}
const extraHidden={
 input_01:[test(['-17'],'-34','hidden'),test(['37'],'74','hidden')],
 if_01:[test(['-9999'],'負','hidden'),test(['9999'],'非負','hidden')],
 while_01:[test(['5'],'5\n4\n3\n2\n1','hidden',{x:0}),test(['2'],'2\n1','hidden',{x:0})],
 function_01:[test(['7'],'14','hidden'),test(['-11'],'-22','hidden')],
 math_01:[test(['2'],'1.4142135623730951','hidden'),test(['81'],'9.0','hidden')],
 total_01:[test(['2'],'3','hidden',{total:3}),test(['17'],'153','hidden',{total:153})]
};
const clarified={
 if_01:'整数を変数xに入力し、xが0以上なら「非負」、負なら「負」をif / elseで表示してください。',
 for_01:'変数iを1から5まで1ずつ増やすforの内側で、iを直接表示してください。whileは禁止です。',
 while_01:'0以上の整数を変数xに入力し、x > 0の間、xを直接表示して1減らしてください。0なら何も表示しません。',
 input_01:'整数を1つ入力し、入力値と2を掛ける演算ブロックの結果を直接表示してください。',
 list_01:'numbersを[3,5,7]のまま保ち、numbersの長さを求めるブロックの結果を直接表示してください。',
 nested_01:'変数iを1〜6まで1ずつ増やすforの内側で、iを2で割った余りが0かifで判定し、iを直接表示してください。'
};
for(const p of problems){p.test_cases.push(...(extraHidden[p.id]||[]));if(clarified[p.id]){p.instruction=clarified[p.id];p.hints[0].text=p.instruction;}}
await mkdir(new URL('../public/problems/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/problems/catalog.json',import.meta.url),JSON.stringify(problems,null,2)+'\n');
