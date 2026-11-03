// Declarative block catalog: label, Python expression, default input values.
export function installLibraries(Blockly, generator) {
  const imports={random:'import random',math:'import math',datetime:'import datetime',time:'import time',statistics:'import statistics',np:'import numpy as np',pd:'import pandas as pd',plt:'import matplotlib.pyplot as plt'};
  const groups={};
  function add(lib,name,label,expression,defaults=[],statement=false) {
    const type='lib_'+name;
    Blockly.defineBlocksWithJsonArray([{type,message0:label,args0:defaults.map((_,i)=>({type:'input_value',name:'V'+i})),colour:lib==='plt'?25:lib==='pd'?210:lib==='np'?250:165,...(statement?{previousStatement:null,nextStatement:null}:{output:null}),tooltip:expression}]);
    generator.forBlock[type]=(block,g)=>{
      g.definitions_['import_'+lib]=imports[lib];
      const code=expression.replace(/\$(\d+)/g,(_,n)=>g.valueToCode(block,'V'+n,g.ORDER_NONE)||'None');
      return statement?code+'\n':[code,g.ORDER_ATOMIC];
    };
    (groups[lib]??=[]).push({kind:'block',type,inputs:Object.fromEntries(defaults.map((v,i)=>['V'+i,{shadow:{type:typeof v==='number'?'math_number':'text',fields:typeof v==='number'?{NUM:v}:{TEXT:v}}}]))});
  }
  add('random','randint','%1 から %2 までのランダムな整数','random.randint($0, $1)',[1,6]);
  add('random','random','0以上1未満のランダムな小数','random.random()');
  add('random','choice','リスト %1 からランダムに選ぶ','random.choice($0)',['']);
  add('random','shuffle','リスト %1 をシャッフルする','random.shuffle($0)',[''],true);
  for(const [fn,label] of [['sqrt','平方根'],['ceil','切り上げ'],['floor','切り捨て'],['sin','sin（ラジアン）'],['cos','cos（ラジアン）'],['tan','tan（ラジアン）']]) add('math',fn,'%1 の'+label,`math.${fn}($0)`,[16]);
  add('math','pow','%1 の %2 乗','math.pow($0, $1)',[2,3]);add('math','pi','円周率 π','math.pi');
  add('datetime','now','現在の日時','datetime.datetime.now()');add('datetime','today','今日の日付','datetime.date.today()');
  for(const [prop,label] of [['year','年'],['month','月'],['day','日'],['hour','時'],['minute','分']]) add('datetime',prop,'%1 の'+label,`($0).${prop}`,['']);
  add('datetime','weekday','%1 の曜日（月曜0〜日曜6）','($0).weekday()',['']);
  add('datetime','date','%1 年 %2 月 %3 日の日付','datetime.date($0, $1, $2)',[2026,1,1]);
  add('datetime','datediff','日付 %1 から %2 を引いた日数','(($0) - ($1)).days',['','']);
  add('time','sleep','%1 秒待つ','time.sleep($0)',[1],true);add('time','clock','経過時間の計測値（秒）','time.perf_counter()');
  for(const [fn,label] of [['mean','平均'],['median','中央値'],['mode','最頻値']]) add('statistics','stats_'+fn,'リスト %1 の'+label,`statistics.${fn}($0)`,['']);
  add('np','array','リスト %1 からNumPy配列を作る','np.array($0)',['']);
  add('np','arange','%1 から %2 未満まで %3 刻みの配列','np.arange($0, $1, $2)',[0,10,1]);
  add('np','linspace','%1 から %2 まで %3 個の等間隔配列','np.linspace($0, $1, $2)',[0,10,5]);
  add('np','element','配列 %1 の %2 番目（0始まり）','($0)[$1]',['',0]);
  for(const [fn,label] of [['add','足す'],['subtract','引く'],['multiply','掛ける'],['divide','割る']]) add('np',fn,'配列 %1 と %2 を'+label,`np.${fn}($0, $1)`,['',2]);
  for(const [fn,label] of [['sum','合計'],['mean','平均'],['max','最大値'],['min','最小値']]) add('np','np_'+fn,'配列 %1 の'+label,`np.${fn}($0)`,['']);
  add('pd','csv','CSV %1 を読み込む','pd.read_csv($0)',['data.csv']);
  add('pd','head','表 %1 の先頭 %2 行','($0).head($1)',['',5]);
  add('pd','column','表 %1 の列 %2','($0)[$1]',['','value']);
  add('pd','row','表 %1 の行 %2（0始まり）','($0).iloc[$1]',['',0]);
  add('pd','filter','表 %1 から条件 %2 に合う行を抽出','($0).loc[$1]',['','']);
  for(const [fn,label] of [['mean','平均'],['max','最大値'],['min','最小値'],['isna','欠損値の確認']]) add('pd','pd_'+fn,'%1 の'+label,`($0).${fn}()`,['']);
  for(const [fn,label] of [['plot','折れ線グラフ'],['scatter','散布図'],['bar','棒グラフ']]) add('plt',fn,label+' X %1 Y %2 凡例名 %3',`plt.${fn}($0, $1, label=$2)`,['','','data'],true);
  add('plt','hist','%1 のヒストグラム（区間数 %2）','plt.hist($0, bins=$1)',['',10],true);
  for(const [fn,label] of [['title','タイトル'],['xlabel','X軸ラベル'],['ylabel','Y軸ラベル']]) add('plt',fn,label+'を %1 にする',`plt.${fn}($0)`,[''],true);
  add('plt','legend','凡例を表示','plt.legend()',[],true);add('plt','show','グラフを表示','plt.show()',[],true);
  generator.addReservedWords('np,pd,plt,random,math,datetime,time,statistics');
  const category=(key,name)=>({kind:'category',name,colour:190,contents:groups[key]});
  return [{kind:'category',name:'標準ライブラリ入門',colour:165,contents:['random','math','datetime','time','statistics'].map(k=>category(k,k))},{kind:'category',name:'Python実践コース',colour:250,contents:[category('np','NumPy'),category('pd','pandas'),category('plt','Matplotlib')]}];
}
