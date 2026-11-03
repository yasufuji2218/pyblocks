/* Python runs in a disposable worker, never on the host operating system. */
const base = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
let runtime;
self.onmessage = async ({data}) => {
  try {
    if (!runtime) {
      importScripts(base + 'pyodide.js');
      runtime = await loadPyodide({indexURL:base});
    }
    let count = 0;
    self.postMessage({type:'loading',text:'必要なライブラリを読み込み中…'});
    await runtime.loadPackagesFromImports(data.code);
    if(data.csvFile){
      const bytes=new TextEncoder().encode(data.csvFile.text);
      if(bytes.length>2*1024*1024) throw new Error('CSVは2MBまでです');
      runtime.FS.writeFile('data.csv',bytes);
    }
    const output = text => {if (++count > 1000) throw new Error('出力が1000行を超えました。繰り返し回数を減らしてください。');self.postMessage({type:'output',text:String(text).slice(0,4000)});};
    runtime.setStdout({batched:output});
    runtime.setStderr({batched:output});
    self.postMessage({type:'running'});
    const globals = runtime.toPy({});
    try {
      if (/import matplotlib/.test(data.code)) {
        let plotCount=0;
        globals.set('__pyblocks_plot', image=>{if(++plotCount>10)throw new Error('グラフは1回の実行で10枚までです');self.postMessage({type:'plot',image:String(image)});});
        await runtime.runPythonAsync(`import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io as __pyblocks_io
import base64 as __pyblocks_base64
def __pyblocks_show(*args, **kwargs):
    for number in plt.get_fignums():
        buffer = __pyblocks_io.BytesIO()
        plt.figure(number).savefig(buffer, format='png', dpi=100)
        __pyblocks_plot(__pyblocks_base64.b64encode(buffer.getvalue()).decode('ascii'))
    plt.close('all')
plt.show = __pyblocks_show
`,{globals});
      }
      const control=new Int32Array(data.inputBuffer,0,2);
      const chars=new Uint16Array(data.inputBuffer,8);
      globals.set('__pyblocks_input', prompt => {
        Atomics.store(control,0,0);
        self.postMessage({type:'input',prompt:String(prompt)});
        Atomics.wait(control,0,0);
        return String.fromCharCode(...chars.subarray(0,Atomics.load(control,1)));
      });
      await runtime.runPythonAsync(`def input(prompt=""):
    return __pyblocks_input(str(prompt))
`, {globals});
      if (data.slow) {
        globals.set('__pyblocks_notify', id => self.postMessage({type:'step',id:String(id)}));
        await runtime.runPythonAsync(`import time as __pyblocks_time
def __pyblocks_step(block_id):
    __pyblocks_notify(block_id)
    __pyblocks_time.sleep(0.7)
`, {globals});
      }
      await runtime.runPythonAsync(data.code, {globals});
    }
    finally {globals.destroy();}
    self.postMessage({type:'done'});
  } catch (error) {self.postMessage({type:'error',text:String(error)});}
};
