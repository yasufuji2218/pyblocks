export async function runCases(code,problem,stateNames,{signal,onProgress=()=>{}}={}){
  const results=[];
  for(let i=0;i<problem.test_cases.length;i++){
    if(signal?.aborted)throw new DOMException('採点を中止しました','AbortError');
    onProgress(i,problem.test_cases.length);
    results.push(await new Promise((resolve,reject)=>{
      const worker=new Worker('./grading-worker.js');
      let timer,done=false;
      function finish(result,error){if(done)return;done=true;clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);}
      const abort=()=>finish(null,new DOMException('採点を中止しました','AbortError'));
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>finish({error:'実行環境の読み込みが時間切れになりました',output:''}),180000);
      worker.onmessage=({data})=>{
        if(data.type==='ready'){clearTimeout(timer);timer=setTimeout(()=>finish({timeout:true,output:''}),problem.grading.timeout_ms||3000);}
        if(data.type==='result')finish(data.result);
      };
      worker.onerror=()=>finish({error:'実行環境を読み込めませんでした。接続を確認してください。',output:''});
      worker.postMessage({code,test:problem.test_cases[i],stateNames});
    }));
  }
  return results;
}
