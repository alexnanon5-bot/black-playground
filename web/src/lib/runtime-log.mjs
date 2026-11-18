const matching = { '(': ')', '[': ']', '{': '}' };

export function isRuntimeLog(source) {
  return /^\s*ToolRuntime\s*\(/.test(source);
}

export function formatRuntimeLog(source) {
  const stack = [];
  const output = [];
  const indent = () => '  '.repeat(Math.min(stack.length, 32));
  const nextNonSpace = /\S/g;
  const readNonSpace = (index) => {
    nextNonSpace.lastIndex = index;
    return nextNonSpace.exec(source)?.[0];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (/\s/.test(char)) {
      const previous = source[i - 1];
      if (previous && !/[\s([{,]/.test(previous) &&
          !/[)\]},]/.test(readNonSpace(i + 1) ?? '')) {
        output.push(' ');
      }
      continue;
    }

    if (char === "'" || char === '"') {
      const start = i;
      const quote = source.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
      i += quote.length;
      while (i < source.length && !source.startsWith(quote, i)) {
        i += source[i] === '\\' ? 2 : 1;
      }
      if (i >= source.length) throw new Error(`字符串未闭合（位置 ${start + 1}）`);
      i += quote.length - 1;
      output.push(source.slice(start, i + 1));
    } else if (char === '<') {
      // A repr can embed another repr or a qualified name such as <locals>.
      const start = i;
      let depth = 1;
      while (++i < source.length) {
        if (source[i] === '<') depth++;
        if (source[i] === '>' && --depth === 0) break;
      }
      if (depth) throw new Error(`对象描述未闭合（位置 ${start + 1}）`);
      output.push(source.slice(start, i + 1));
    } else if (matching[char]) {
      const close = matching[char];
      const empty = readNonSpace(i + 1) === close;
      stack.push({ close, empty });
      output.push(char);
      if (!empty) output.push('\n', indent());
    } else if (char === ')' || char === ']' || char === '}') {
      const group = stack.pop();
      if (group?.close !== char) throw new Error(`括号不匹配（位置 ${i + 1}）`);
      if (output.at(-1) === ' ') output.pop();
      if (!group.empty) output.push('\n', indent());
      output.push(char);
    } else if (char === ',') {
      if (output.at(-1) === ' ') output.pop();
      output.push(char);
      if (stack.length && readNonSpace(i + 1) !== stack.at(-1).close) {
        output.push('\n', indent());
      }
    } else {
      output.push(char);
    }
  }

  if (stack.length) throw new Error('输入结束时仍有括号未闭合');
  return output.join('').trim();
}
