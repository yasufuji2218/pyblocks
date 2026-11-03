import {walk} from './problem-model.js';
const clone=v=>structuredClone(v);
const b=(type,inputs={},fields={})=>({type,fields,inputs:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,{block:v}]))});
const number=v=>b('math_number',{}, {NUM:v}),text=v=>b('text',{}, {TEXT:v});
const print=v=>b('text_print',{TEXT:v}),get=name=>b('variables_get',{}, {VAR:{id:name}});
const set=(name,value)=>b('variables_set',{VALUE:value},{VAR:{id:name}});
function output(value){const blocks=String(value).split('\n').map(line=>print(text(line)));for(let i=0;i<blocks.length-1;i++)blocks[i].next={block:blocks[i+1]};return blocks[0];}
const input=()=>b('python_convert',{VALUE:b('python_input',{PROMPT:text('')})},{TYPE:'int'});
const state=(blocks,variables=[])=>({variables,blocks:{languageVersion:0,blocks}});
const names={normal:'正規解答',literal:'出力ベタ打ち',detached:'必須ブロック孤立',noise:'不要ブロック200個',forbidden:'禁止ブロック',separate:'必須構造を別配置',value:'値だけ合わせる',omit:'処理省略',fixed:'入力決め打ち',public:'公開テスト特化',hidden:'一般化不足',function:'関数未呼び出し',variable:'変数名のみ／内容不正',late:'最後に必須変数だけ代入',post:'正解出力後の誤処理',dead:'未実行分岐に正規構造'};
export function resilienceCases(p){
 const reference=()=>clone(p.solution.workspace),literal=()=>state([output(p.test_cases[0].expected_output)],clone(p.solution.workspace.variables||[]));
 const hasInput=p.test_cases.some(t=>t.input.length),hasHidden=p.test_cases.some(t=>t.visibility==='hidden');
 const results=[];
 const add=(kind,s,expected=false,note='')=>results.push({kind,name:names[kind],state:s,expected,note});
 const na=(kind,note)=>results.push({kind,name:names[kind],na:true,note});
 add('normal',reference(),true);
 add('literal',literal(),p.id==='print_01','文字表示自体が目的のprint_01は直接表示で正解');
 const detached=literal();
 for(const {block} of walk(p.solution.workspace))if(p.required_blocks.some(t=>t===block.type||({for:'controls_for',if:'controls_if',while:'controls_whileUntil',function:'procedures_defreturn',call:'procedures_callreturn'}[t]===block.type))&&block.type!=='text_print')detached.blocks.blocks.push({...clone(block),id:undefined,inputs:{},next:undefined});
 add('detached',detached,p.id==='print_01');
 const noise=reference();for(let i=0;i<200;i++)noise.blocks.blocks.push(number(i));add('noise',noise,true,'余分な値だけで減点しない。正規の処理は保持');
 if(p.forbidden_blocks.length){const s=reference();s.blocks.blocks.push(b('controls_whileUntil',{BOOL:b('logic_boolean',{}, {BOOL:'FALSE'})},{MODE:'WHILE'}));add('forbidden',s);}else na('forbidden','この問題には禁止指定なし。未許可ブロックは別の共通テストで検査');
 if(p.id==='print_01')na('separate','表示以外の包含構造を要求しない');else{
 const s=literal();for(const {block} of walk(p.solution.workspace))if(block.type.startsWith('controls_'))s.blocks.blocks.push({...clone(block),inputs:{},next:undefined});add('separate',s);}
 const changed=reference(),numeric=walk(changed).find(e=>e.block.type==='math_number');
 if(numeric){numeric.block.fields.NUM=numeric.block.fields.NUM===0?1:0;if(p.id==='arithmetic_01')walk(changed).filter(e=>e.block.type==='math_number')[1].block.fields.NUM=10;add('value',changed);}else na('value','変更対象の数値リテラルなし');
 const omitted=reference();omitted.blocks.blocks=[];add('omit',omitted);
 if(hasInput){const s=reference();for(const e of walk(s))for(const connection of Object.values(e.block.inputs||{}))if(connection.block?.type==='python_input')connection.block=text(p.test_cases[0].input[0]);add('fixed',s);}else na('fixed','入力なし');
 function lookup(tests){
  const conditions={};tests.forEach((t,i)=>{conditions['IF'+i]=b('logic_compare',{A:get('audit_input'),B:number(Number(t.input[0]))},{OP:'EQ'});conditions['DO'+i]=output(t.expected_output);});
  conditions.ELSE=print(text('未対応'));
  const decision={...b('controls_if',conditions),extraState:{elseIfCount:tests.length-1,hasElse:true}};
  const start=set('audit_input',input());start.next={block:decision};return state([start],[{id:'audit_input',name:'audit_input'}]);
 }
 if(hasInput&&hasHidden){add('public',lookup(p.test_cases.filter(t=>t.visibility==='public')));add('hidden',lookup(p.test_cases.slice(0,-1)));}else{na('public','複数入力・隠しテストの組合せなし');na('hidden','隠し入力なし');}
 if(p.grading.functions?.length){const s=literal();s.blocks.blocks.unshift(...reference().blocks.blocks.filter(v=>v.type.startsWith('procedures_def')));add('function',s);}else na('function','関数利用を要求しない');
 const requiredVar=Object.keys(p.test_cases[0].expected_state||{})[0]||p.grading.output_variables?.[0];
 if(requiredVar){const s=reference();s.blocks.blocks.push(set(requiredVar,text('不正')));add('variable',s);
  const late=literal();late.blocks.blocks.push(set(requiredVar,Array.isArray(p.test_cases[0].expected_state?.[requiredVar])?number(0):number(Number(p.test_cases[0].expected_state?.[requiredVar]||0))));add('late',late);
 }else{na('variable','必須の最終状態・出力変数なし');na('late','必須変数なし');}
 const post=reference();post.blocks.blocks.push(requiredVar?set(requiredVar,text('誤り')):print(text('余分な出力')));add('post',post);
 // Learning-purpose spoofing: preserve a superficially correct graph while
 // obtaining the answer through neutralized or substituted computations.
 if(p.id==='variable_01'){
  const s=reference(),node=s.blocks.blocks[0].next.block;
  node.inputs.TEXT.block=b('math_arithmetic',{A:b('math_arithmetic',{A:get('x'),B:number(0)},{OP:'MULTIPLY'}),B:number(10)},{OP:'ADD'});
  results.push({kind:'spoof',name:'変数を0倍して答えを足す',state:s,expected:false});
 }
 if(p.id==='list_01'){
  const s=reference(),node=s.blocks.blocks[0].next.block;
  node.inputs.TEXT.block=b('math_arithmetic',{A:b('math_arithmetic',{A:node.inputs.TEXT.block,B:number(0)},{OP:'MULTIPLY'}),B:number(3)},{OP:'ADD'});
  results.push({kind:'spoof',name:'リスト長を0倍して3を表示',state:s,expected:false});
 }
 if(p.id==='total_01'){
  const s=reference(),loop=walk(s).find(e=>e.block.type==='controls_for').block;
  loop.inputs.DO.block.inputs.VALUE.block.inputs.B.block=number(0);
  const formula=b('python_convert',{VALUE:b('math_arithmetic',{A:b('math_arithmetic',{A:get('n'),B:b('math_arithmetic',{A:get('n'),B:number(1)},{OP:'ADD'})},{OP:'MULTIPLY'}),B:number(2)},{OP:'DIVIDE'})},{TYPE:'int'});
  const guard=s.blocks.blocks[0].next.block.next.block,output=guard.next.block;
  guard.next={block:set('total',formula)};guard.next.block.next={block:output};
  results.push({kind:'spoof',name:'空の累積処理の後に公式で上書き',state:s,expected:false});
 }
 if(p.id==='function_01'){
  const s=reference(),def=s.blocks.blocks[0],correct=def.inputs.RETURN.block;
  const extra=b('math_arithmetic',{A:b('math_arithmetic',{A:get('n'),B:b('math_arithmetic',{A:get('n'),B:number(6)},{OP:'MINUS'})},{OP:'MULTIPLY'}),B:b('math_arithmetic',{A:get('n'),B:number(3)},{OP:'ADD'})},{OP:'MULTIPLY'});
  def.inputs.RETURN.block=b('math_arithmetic',{A:correct,B:extra},{OP:'ADD'});
  results.push({kind:'spoof',name:'既知入力でだけ2倍になる多項式',state:s,expected:false});
 }
 if(p.id==='print_01')na('dead','正しい文字を表示すれば学習目的を満たす');else{
  const original=reference(),s=literal(),stacks=original.blocks.blocks.filter(v=>!v.type.startsWith('procedures_def'));
  s.blocks.blocks.push(...original.blocks.blocks.filter(v=>v.type.startsWith('procedures_def')));
  for(const root of stacks)s.blocks.blocks.push(b('controls_if',{IF0:b('logic_boolean',{}, {BOOL:'FALSE'}),DO0:root}));add('dead',s);
 }
 // Blockly executes disconnected stacks in visual y-order, not JSON insertion
 // order. Explicit coordinates are essential for genuine "after output" attacks.
 for(const r of results)if(r.state)r.state.blocks.blocks.forEach((block,i)=>{block.x=45;block.y=45+i*220;});
 return results;
}
