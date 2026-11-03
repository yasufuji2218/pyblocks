const base='https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
let runtime;
self.onmessage=async({data})=>{
  try{
    if(!runtime){importScripts(base+'pyodide.js');runtime=loadPyodide({indexURL:base});}
    const py=await runtime;
    await py.loadPackagesFromImports(data.code);
    const g=py.toPy({});
    g.set('_source',data.code);g.set('_inputs_json',JSON.stringify(data.test.input));
    g.set('_state_json',JSON.stringify(data.stateNames||{}));
    self.postMessage({type:'ready'});
    try{
      const result=await py.runPythonAsync(`import json, sys, io, traceback, contextlib
class LimitedOutput(io.StringIO):
    def write(self, value):
        if self.tell() + len(value) > 64000:
            raise RuntimeError('出力が多すぎます。繰り返し回数を減らしてください。')
        return super().write(value)
inputs = iter(json.loads(_inputs_json))
def read_input(prompt=''):
    try:
        return next(inputs)
    except StopIteration:
        raise EOFError('問題の入力をすべて使いました')
calls = set()
executed = set()
values = {}
def grade_step(block_id):
    executed.add(block_id)
def grade_value(block_id, value):
    executed.add(block_id)
    try:
        snapshot = json.loads(json.dumps(value, allow_nan=False))
        if len(json.dumps(snapshot)) <= 2048:
            bucket = values.setdefault(block_id, [])
            if len(bucket) < 8 and snapshot not in bucket:
                bucket.append(snapshot)
    except (TypeError, ValueError):
        pass
    return value
def profile(frame, event, arg):
    if event == 'call' and frame.f_code.co_filename == '<student>':
        calls.add(frame.f_code.co_name)
scope = {'__name__': '__main__', 'input': read_input, '__grade_step__': grade_step, '__grade_value__': grade_value}
output = LimitedOutput()
error = None
try:
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        sys.setprofile(profile)
        exec(compile(_source, '<student>', 'exec'), scope)
except BaseException:
    error = traceback.format_exc()
finally:
    sys.setprofile(None)
states = {}
for original, generated in json.loads(_state_json).items():
    if generated in scope:
        try:
            json.dumps(scope[generated], allow_nan=False)
            states[original] = scope[generated]
        except (TypeError, ValueError):
            pass
json.dumps({'output': output.getvalue(), 'error': error, 'state': states, 'calls': sorted(calls), 'executed': sorted(executed), 'values': values}, ensure_ascii=False)
`,{globals:g});
      self.postMessage({type:'result',result:JSON.parse(result)});
    }finally{g.destroy();}
  }catch(error){self.postMessage({type:'result',result:{error:String(error),output:''}});}
};
