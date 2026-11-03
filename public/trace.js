// Separate execution markers from the Python shown to learners.
export function mapTrace(source) {
  const lines = [], blocks = new Map();
  let pending = [];
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*__pyblocks_step\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\)\s*$/);
    if (match) {
      const literal = match[1];
      const id = literal[0] === '"' ? JSON.parse(literal) : literal.slice(1,-1).replace(/\\(['\\])/g,'$1');
      pending.push(id);
    } else {
      if (line.trim() && pending.length) {
        for (const id of pending) blocks.set(id, lines.length);
        pending = [];
      }
      lines.push(line);
    }
  }
  return {code:lines.join('\n'), blocks};
}
