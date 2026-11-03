import {explainError} from './errors.js';
import {mapTrace} from './trace.js';
import {installLibraries} from './libraries.js';
import {installExercises} from './exercise-ui.js';
const $ = id => document.getElementById(id);
const key = 'pyblocks.workspace.v1';
let csvFile={name:'data.csv',text:'day,value\n1,10\n2,18\n3,15\n4,25\n5,32\n'};
const csvPanel=document.createElement('div');csvPanel.className='csv-panel';
csvPanel.innerHTML='<label>学習用CSV（UTF-8・2MBまで） <input id="csv-upload" type="file" accept=".csv"></label> <span id="csv-status">data.csv（サンプルデータ）</span>';
$('output').parentElement.before(csvPanel);
const plots=document.createElement('div');plots.id='plots';$('output').after(plots);
$('csv-upload').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  if(!/\.csv$/i.test(file.name)||file.size>2*1024*1024){$('csv-status').textContent='CSV形式・2MB以下のファイルを選んでください';event.target.value='';return;}
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());csvFile={name:'data.csv',text};$('csv-status').textContent=file.name+' → data.csv として読み込み済み';}
  catch{$('csv-status').textContent='UTF-8形式のCSVを選んでください';}
};
let workspace, worker, timer, code = '', running = false;
let exerciseActive=false;
let traceLines = new Map();
let inputBuffer, deadline = 0, remaining = 0;
const inputForm = document.createElement('form');
inputForm.id='input-form'; inputForm.hidden=true;
inputForm.innerHTML='<label for="input-value" id="input-prompt">入力してください</label><div><input id="input-value" type="text" maxlength="4096" autocomplete="off"><button type="submit" class="primary">送信 ↵</button></div>';
$('output').after(inputForm);
function armExecutionTimer() {
  deadline=performance.now()+remaining;
  timer=setTimeout(()=>{finish('時間制限');message($('output').textContent+'\n実行時間の制限に達したため停止しました。',true);},remaining);
}
inputForm.onsubmit = event => {
  event.preventDefault();
  if (!running || !inputBuffer || inputForm.hidden) return;
  const text=$('input-value').value;
  const control=new Int32Array(inputBuffer,0,2), chars=new Uint16Array(inputBuffer,8);
  for(let i=0;i<text.length;i++) chars[i]=text.charCodeAt(i);
  Atomics.store(control,1,text.length);
  $('output').textContent+=text+'\n';
  inputForm.hidden=true; $('status').textContent='実行中';
  armExecutionTimer();
  Atomics.store(control,0,1); Atomics.notify(control,0);
};
function showCode(source) {
  $('code').replaceChildren(...source.split('\n').map((text,index) => {
    const line = document.createElement('span');
    line.className = 'code-line';
    line.dataset.line = index;
    line.textContent = text || '\u200b';
    return line;
  }));
}
function highlightCode(id) {
  $('code').querySelector('.executing')?.classList.remove('executing');
  const index = traceLines.get(id);
  const line = index === undefined ? null : $('code').children[index];
  if (!line) return;
  line.classList.add('executing');
  const panel = $('code');
  const top = line.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  if (top < panel.scrollTop || top + line.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = Math.max(0, top - panel.clientHeight / 2);
}
const value = (type, fields) => ({block:{type,fields}});
const num = n => value('math_number',{NUM:n});
const str = text => value('text',{TEXT:text});
const variable = () => value('variables_get',{VAR:{id:'var-x'}});
const print = input => ({type:'text_print',inputs:{TEXT:input}});
const examples = {
  hello: {blocks:{languageVersion:0,blocks:[{...print(str('こんにちは、Python！')),x:45,y:55}]}},
  variable: {variables:[{name:'x',id:'var-x'}],blocks:{languageVersion:0,blocks:[{type:'variables_set',x:45,y:55,fields:{VAR:{id:'var-x'}},inputs:{VALUE:num(10)},next:{block:print(value('math_arithmetic',{OP:'ADD'}))}}]}},
  condition: {variables:[{name:'x',id:'var-x'}],blocks:{languageVersion:0,blocks:[{type:'variables_set',x:45,y:55,fields:{VAR:{id:'var-x'}},inputs:{VALUE:num(10)},next:{block:{type:'controls_if',inputs:{IF0:{block:{type:'logic_compare',fields:{OP:'GT'},inputs:{A:variable(),B:num(5)}}},DO0:{block:print(str('大きい'))}}}}}]}},
  loop: {variables:[{name:'i',id:'var-i'}],blocks:{languageVersion:0,blocks:[{type:'controls_for',x:45,y:55,fields:{VAR:{id:'var-i'}},inputs:{FROM:num(1),TO:num(10),BY:num(1),DO:{block:print(value('variables_get',{VAR:{id:'var-i'}}))}}}]}}
};
examples.variable.blocks.blocks[0].next.block.inputs.TEXT.block.inputs = {A:variable(),B:num(5)};
const whileBody = print(variable());
whileBody.next = {block:{type:'math_change',fields:{VAR:{id:'var-x'}},inputs:{DELTA:num(1)}}};
const whileBlock = {type:'controls_whileUntil',fields:{MODE:'WHILE'},inputs:{BOOL:{block:{type:'logic_compare',fields:{OP:'LTE'},inputs:{A:variable(),B:num(5)}}},DO:{block:whileBody}}};
examples.while = {variables:[{name:'x',id:'var-x'}],blocks:{languageVersion:0,blocks:[{type:'variables_set',x:45,y:45,fields:{VAR:{id:'var-x'}},inputs:{VALUE:num(1)},next:{block:whileBlock}}]}};
const listBlock = {type:'lists_create_with',extraState:{itemCount:3},inputs:{ADD0:num(10),ADD1:num(20),ADD2:num(30)}};
const eachBlock = {type:'controls_forEach',fields:{VAR:{id:'item'}},inputs:{LIST:value('variables_get',{VAR:{id:'numbers'}}),DO:{block:print(value('variables_get',{VAR:{id:'item'}}))}}};
examples.list = {variables:[{name:'numbers',id:'numbers'},{name:'item',id:'item'}],blocks:{languageVersion:0,blocks:[{type:'variables_set',x:45,y:45,fields:{VAR:{id:'numbers'}},inputs:{VALUE:{block:listBlock}},next:{block:eachBlock}}]}};
examples.function = `<xml xmlns="https://developers.google.com/blockly/xml"><variables><variable id="arg-n">n</variable></variables>
<block type="procedures_defreturn" x="45" y="40"><mutation><arg name="n" varid="arg-n"/></mutation><field name="NAME">double</field><value name="RETURN"><block type="math_arithmetic"><field name="OP">MULTIPLY</field><value name="A"><block type="variables_get"><field name="VAR" id="arg-n">n</field></block></value><value name="B"><block type="math_number"><field name="NUM">2</field></block></value></block></value></block>
<block type="text_print" x="45" y="220"><value name="TEXT"><block type="procedures_callreturn"><mutation name="double"><arg name="n"/></mutation><value name="ARG0"><block type="math_number"><field name="NUM">6</field></block></value></block></value></block></xml>`;
for (const [id,label] of [['while','whileで1から5まで'],['list','リストの中身を表示'],['function','引数と戻り値を使う']]) $('example').add(new Option(label,id));
const inputExample = {type:'python_input',inputs:{PROMPT:str('数字を入力してください：')}};
examples.input = {blocks:{languageVersion:0,blocks:[{...print({block:{type:'python_convert',fields:{TYPE:'int'},inputs:{VALUE:{block:inputExample}}}}),x:45,y:55}]}};
$('example').add(new Option('入力した数字を表示','input'));
const libValue=(type,inputs={})=>({block:{type:'lib_'+type,inputs}});
examples.dice={blocks:{languageVersion:0,blocks:[{...print(libValue('randint',{V0:num(1),V1:num(6)})),x:45,y:45}]}};
const csvValue=()=>libValue('csv',{V0:str('data.csv')});
const column=name=>libValue('column',{V0:csvValue(),V1:str(name)});
const analysisPrint=print(libValue('np_mean',{V0:libValue('array',{V0:column('value')})}));
analysisPrint.next={block:{type:'lib_plot',inputs:{V0:column('day'),V1:column('value'),V2:str('value')},next:{block:{type:'lib_show'}}}};
examples.analysis={blocks:{languageVersion:0,blocks:[{...analysisPrint,x:45,y:45}]}};
for(const [id,label] of [['dice','標準：サイコロ'],['analysis','実践：CSV → 平均 → グラフ']]) $('example').add(new Option(label,id));
const standardSteps=[print(libValue('randint',{V0:num(1),V1:num(6)})),print(libValue('sqrt',{V0:num(16)})),print(libValue('today')),print(libValue('stats_mean',{V0:{block:{type:'lists_create_with',extraState:{itemCount:3},inputs:{ADD0:num(10),ADD1:num(20),ADD2:num(30)}}}})),{type:'lib_sleep',inputs:{V0:num(0.1)}},print(str('標準ライブラリの実行完了'))];
for(let i=0;i<standardSteps.length-1;i++)standardSteps[i].next={block:standardSteps[i+1]};
examples.standard={blocks:{languageVersion:0,blocks:[{...standardSteps[0],x:45,y:45}]}};
$('example').add(new Option('標準：5つのライブラリを試す','standard'));
const slowLabel = document.createElement('label');
slowLabel.innerHTML = '<input id="slow-mode" type="checkbox"> ゆっくり実行（ブロックが光る）';
$('run').before(slowLabel);
function message(text, error=false) {$('output').textContent = text;$('output').classList.toggle('error',error);}
function finish(status) {
  clearTimeout(timer); worker?.terminate();worker = undefined;running=false;
  workspace?.highlightBlock(null);
  highlightCode(null);
  inputForm.hidden=true; inputBuffer=undefined;
  $('slow-mode').disabled = false;
  $('run').disabled = !workspace; $('stop').disabled=true;$('status').textContent=status;
}
function execute() {
  if (running || !code.trim()) {if (!code.trim()) message('まずブロックを置いてみましょう。');return;}
  const slow = $('slow-mode').checked;
  plots.replaceChildren();
  if (!globalThis.crossOriginIsolated || !globalThis.SharedArrayBuffer) {
    message('実行環境の更新が必要です。サーバーを再起動し、Ctrl＋F5でページを更新してください。',true);return;
  }
  inputBuffer=new SharedArrayBuffer(8+4096*2);
  let executionCode = code;
  if (slow) {
    const generator = python.pythonGenerator;
    try {
      generator.STATEMENT_PREFIX = '__pyblocks_step(%1)\n';
      generator.addReservedWords('__pyblocks_step');
      executionCode = generator.workspaceToCode(workspace);
      const trace = mapTrace(executionCode);
      traceLines = trace.blocks;
      showCode(trace.code);
    } finally { generator.STATEMENT_PREFIX = ''; }
  }
  running=true;message('');$('slow-mode').disabled=true;$('run').disabled=true;$('stop').disabled=false;$('status').textContent='Pythonを読み込み中…';
  // A fresh interpreter for each run prevents state from leaking between programs.
  worker = new Worker('./worker.js');
  timer = setTimeout(()=>{finish('読み込み失敗');message('Python・ライブラリの読み込みが時間切れになりました。接続を確認して再実行してください。',true);},180000);
  worker.onmessage = ({data}) => {
    if (data.type === 'loading') {$('status').textContent=data.text;}
    else if(data.type === 'plot') {const img=document.createElement('img');img.src='data:image/png;base64,'+data.image;img.alt='Pythonで作成したグラフ';plots.append(img);}
    else if (data.type === 'running') {
      clearTimeout(timer);$('status').textContent='実行中';
      const limit = slow ? 120 : 10;
      remaining=limit*1000; armExecutionTimer();
    } else if (data.type === 'input') {
      remaining=Math.max(0,deadline-performance.now());clearTimeout(timer);
      $('input-prompt').textContent=data.prompt || '入力してください';
      $('output').textContent+=data.prompt;
      $('input-value').value='';inputForm.hidden=false;
      $('status').textContent='入力待ち';$('input-value').focus();
    } else if (data.type === 'step') {
      workspace.highlightBlock(data.id);
      highlightCode(data.id);
      $('status').textContent='ゆっくり実行中';
    } else if (data.type === 'output') $('output').textContent += data.text+'\n';
    else if (data.type === 'done') {finish('実行完了');if (!$('output').textContent) message('実行が完了しました。表示する内容はありません。');}
    else if (data.type === 'error') {finish('エラー');message($('output').textContent+'\n'+explainError(data.text)+'\n\n詳細:\n'+data.text,true);}
  };
  worker.onerror = () => {finish('読み込み失敗');message('実行環境を読み込めませんでした。インターネット接続を確認して再実行してください。',true);};
  worker.postMessage({code:executionCode,slow,inputBuffer,csvFile});
}
function synchronize() {
  if (running) return;
  try {code=python.pythonGenerator.workspaceToCode(workspace);showCode(code || '# 左のカテゴリからブロックを置いてみよう');$('run').disabled=running;$('download').disabled=!code.trim();}
  catch(error) {code='';$('code').textContent='コードを生成できませんでした。ブロックの接続を確認してください。';$('run').disabled=true;$('download').disabled=true;return;}
  if(exerciseActive){$('save-status').textContent='練習中（自由編集の保存は保持）';return;}
  try {localStorage.setItem(key,JSON.stringify(Blockly.serialization.workspaces.save(workspace)));$('save-status').textContent='✓ 自動保存済み';}
  catch {$('save-status').textContent='保存できません（ブラウザーの設定を確認）';}
}
function loadExample(name) {
  if (typeof examples[name] === 'string') Blockly.Xml.clearWorkspaceAndLoadFromXml(Blockly.utils.xml.textToDom(examples[name]),workspace);
  else Blockly.serialization.workspaces.load(examples[name],workspace);
  workspace.scrollCenter();synchronize();
}
try {
  if (!globalThis.Blockly || !globalThis.python) throw new Error('Blocklyを読み込めませんでした。');
  python.pythonGenerator.INDENT = '    ';
  const libraryCategories=installLibraries(Blockly,python.pythonGenerator);
  python.pythonGenerator.addReservedWords('__pyblocks_input,__pyblocks_notify,__pyblocks_time,__pyblocks_step');
  Blockly.defineBlocksWithJsonArray([
    {type:'python_input',message0:'%1 と表示して入力を受け取る',args0:[{type:'input_value',name:'PROMPT'}],output:'String',colour:190,tooltip:'キーボードから入力した文字列を受け取ります'},
    {type:'python_convert',message0:'%1 を %2 に変換',args0:[{type:'input_value',name:'VALUE'},{type:'field_dropdown',name:'TYPE',options:[['整数（int）','int'],['小数（float）','float'],['文字列（str）','str']]}],output:null,colour:190}
  ]);
  python.pythonGenerator.forBlock.python_input=(block,g)=>[`input(${g.valueToCode(block,'PROMPT',g.ORDER_NONE)||"''"})`,g.ORDER_FUNCTION_CALL];
  python.pythonGenerator.forBlock.python_convert=(block,g)=>[`${block.getFieldValue('TYPE')}(${g.valueToCode(block,'VALUE',g.ORDER_NONE)||"''"})`,g.ORDER_FUNCTION_CALL];
  // Reserve layout space for the larger icon so it never overlaps block fields.
  class LargeMutatorIcon extends Blockly.icons.MutatorIcon {
    getSize() { return new Blockly.utils.Size(32, 32); }
    initView(listener) {
      super.initView(listener);
      if (this.largeIconView) return;
      const artwork = Blockly.utils.dom.createSvgElement('g', {}, this.svgRoot);
      for (const child of [...this.svgRoot.children]) {
        if (child !== artwork) artwork.appendChild(child);
      }
      const original = super.getSize();
      artwork.setAttribute('transform', `scale(${32 / original.width} ${32 / original.height})`);
      this.setTooltip('ブロックの項目を追加・変更する');
      this.largeIconView = true;
    }
  }
  for (const [type, items] of Object.entries({controls_if:['controls_if_elseif','controls_if_else'],lists_create_with:['lists_create_with_item'],procedures_defnoreturn:['procedures_mutatorarg'],procedures_defreturn:['procedures_mutatorarg']})) {
    const originalInit = Blockly.Blocks[type].init;
    Blockly.Blocks[type].init = function () {
      originalInit.call(this);
      this.setMutator(new LargeMutatorIcon(items, this));
    };
  }
  // Blockly measures the SVG text with these margins when building the flyout.
  Blockly.FlyoutButton.TEXT_MARGIN_X = 18;
  Blockly.FlyoutButton.TEXT_MARGIN_Y = 13;
  Blockly.FlyoutButton.BORDER_RADIUS = 8;
  const block = (type,inputs) => ({kind:'block',type,...(inputs?{inputs}:{})});
  const shadow = (type,fields) => ({shadow:{type,fields}});
  workspace = Blockly.inject('blockly',{
    toolbox:{kind:'categoryToolbox',contents:[
      {kind:'category',name:'表示・文字',colour:'#5687bd',contents:[block('text_print',{TEXT:shadow('text',{TEXT:'こんにちは！'})}),block('text')]},
      {kind:'category',name:'変数',colour:'#bc7d40',custom:'VARIABLE'},
      {kind:'category',name:'入力・変換',colour:'#329c9c',contents:[block('python_input',{PROMPT:shadow('text',{TEXT:'名前を入力してください：'})}),block('python_convert',{VALUE:shadow('text',{TEXT:'123'})})]},
      {kind:'category',name:'数値・計算',colour:'#679567',contents:[block('math_number'),block('math_arithmetic',{A:shadow('math_number',{NUM:1}),B:shadow('math_number',{NUM:2})})]},
      {kind:'category',name:'条件分岐',colour:'#8e78ae',contents:[block('controls_if'),block('logic_compare'),block('logic_boolean')]},
      {kind:'category',name:'繰り返し',colour:'#c19a41',contents:[block('controls_repeat_ext',{TIMES:shadow('math_number',{NUM:10})}),block('controls_for',{FROM:shadow('math_number',{NUM:1}),TO:shadow('math_number',{NUM:10}),BY:shadow('math_number',{NUM:1})}),block('controls_whileUntil'),block('math_change',{DELTA:shadow('math_number',{NUM:1})}),block('controls_forEach'),block('controls_flow_statements')]},
      {kind:'category',name:'リスト',colour:'#5687bd',contents:[block('lists_create_with'),block('lists_repeat'),block('lists_length'),block('lists_isEmpty'),block('lists_getIndex'),block('lists_setIndex'),block('lists_indexOf')]},
      {kind:'category',name:'関数',colour:'#9962a0',custom:'PROCEDURE'},
      ...libraryCategories
    ]},grid:{spacing:22,length:2,colour:'#dce5d9',snap:true},trashcan:true,zoom:{controls:true,wheel:false,startScale:.95,maxScale:1.5,minScale:.5},move:{scrollbars:true,drag:true,wheel:true},renderer:'zelos'
  });
  let restored=false;
  try {const saved=localStorage.getItem(key);if(saved){Blockly.serialization.workspaces.load(JSON.parse(saved),workspace);restored=true;}}
  catch {$('save-status').textContent='保存データを読み込めませんでした';}
  if (!restored) loadExample('hello');
  synchronize();$('status').textContent='実行できます';
  workspace.addChangeListener(event=>{if (!event.isUiEvent) synchronize();});
  // Mutator fields and menus can be rendered outside the SVG bubble itself.
  // Listen at pointer-down so dragging from inside a bubble remains uninterrupted.
  document.addEventListener('pointerdown', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.blocklyBubble, .blocklyWidgetDiv, .blocklyDropDownDiv, .blocklyContextMenu')) return;
    for (const block of workspace.getAllBlocks(false)) {
      for (const icon of block.getIcons()) {
        if (!(icon instanceof LargeMutatorIcon) || !icon.bubbleIsVisible()) continue;
        // Let Blockly toggle the gear itself; closing it here would reopen it.
        if (icon.getFocusableElement().contains(target)) continue;
        void icon.setBubbleVisible(false);
      }
    }
  }, true);
  new ResizeObserver(()=>Blockly.svgResize(workspace)).observe($('blockly'));
} catch(error) {message('ブロックエディターの読み込みに失敗しました。インターネット接続を確認してページを再読み込みしてください。\n'+error.message,true);$('status').textContent='読み込み失敗';}
$('run').onclick=execute;
$('stop').onclick=()=>{finish('停止しました');message($('output').textContent+'\n実行を停止しました。');};
$('undo').onclick=()=>workspace?.undo(false);
$('load').onclick=()=>{if(workspace && confirm('現在のブロックをサンプルに置き換えますか？')) loadExample($('example').value);};
$('clear').onclick=()=>{if(workspace && confirm('ブロックをすべて消して、新しく作りますか？')){workspace.clear();synchronize();}};
$('clear-output').onclick=()=>message('');
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([code],{type:'text/x-python;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='main.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
if(workspace)installExercises({Blockly,workspace,generator:python.pythonGenerator,isRunning:()=>running,onChange:synchronize,onActive:value=>{exerciseActive=value;}});
