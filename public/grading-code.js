// Instrument only grading; the learner's displayed/exported source stays plain Python.
export function generateGradingCode(workspace,generator){
  generator.addReservedWords('__grade_step__,__grade_value__');
  const original=generator.forBlock,wrapped=Object.create(original);
  for(const type of Object.keys(original))wrapped[type]=function(block,g){
    const code=original[type].call(this,block,g),id=JSON.stringify(block.id);
    if(Array.isArray(code))return [`__grade_value__(${id}, ${code[0]})`,g.ORDER_FUNCTION_CALL];
    return code?`__grade_step__(${id})\n${code}`:code;
  };
  generator.forBlock=wrapped;
  try{return generator.workspaceToCode(workspace);}finally{generator.forBlock=original;}
}
