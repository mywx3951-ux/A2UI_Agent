// A2UI 缓冲区：处理流式 JSON / JSONL，并规范化为完整 A2UI 消息

/**
 * 接收任意分块的 JSON 文本，支持两种输入形态：
 * - JSONL：每行（或每个完整对象）是一条消息
 * - JSON 数组：[{...}, {...}]，单个元素是一条消息
 *
 * 每识别出一个完整消息对象就立即输出，因此数组形态也能随流式分块逐步渲染。
 * surfaceUpdate 会把每个 component 拆成一条独立消息，
 * 确保 Parser 每次只收到一条可解析的 A2UI 消息。
 */
export class JsonlBuffer {
  private buffer = '';

  /** unknown：尚未确定输入形态；object：JSONL；array：JSON 数组 */
  private mode: 'unknown' | 'object' | 'array' = 'unknown';

  /** 当前尚未组成完整消息的剩余文本 */
  get pending(): string {
    return this.buffer;
  }

  /** 追加一段流式文本，返回本次可解析的完整 JSONL 消息 */
  append(chunk: string): string[] {
    this.buffer += chunk;
    return this.drain();
  }

  /**
   * 流结束时调用：输出剩余完整消息。
   * 如果仍有未闭合的 JSON（或未闭合的数组），说明协议不完整，直接报错。
   */
  flush(): string[] {
    const lines = this.drain();

    // 数组已开始但还没遇到 ']'，说明协议不完整
    if (this.mode === 'array') {
      throw new Error('JSON 流结束时仍有未完成的数据: 数组未闭合');
    }

    if (this.buffer.trim() !== '') {
      throw new Error(
        `JSON 流结束时仍有未完成的数据: ${this.buffer.slice(0, 40)}`,
      );
    }

    return lines;
  }

  /** 清空缓冲区 */
  reset(): void {
    this.buffer = '';
    this.mode = 'unknown';
  }

  private drain(): string[] {
    const lines: string[] = [];
    let index = 0;

    while (index < this.buffer.length) {
      while (index < this.buffer.length && isWhitespace(this.buffer[index])) {
        index += 1;
      }

      if (index >= this.buffer.length) break;

      const char = this.buffer[index];

      if (this.mode === 'unknown') {
        if (char === '{') {
          this.mode = 'object';
        } else if (char === '[') {
          this.mode = 'array';
          index += 1;
          continue;
        } else {
          throw new Error(`无法识别的 JSON 起始字符: ${char}`);
        }
      }

      if (this.mode === 'array') {
        // 数组结束
        if (char === ']') {
          index += 1;
          this.mode = 'unknown';
          continue;
        }

        // 元素分隔符
        if (char === ',') {
          index += 1;
          continue;
        }
      }

      if (char !== '{' && char !== '[') {
        throw new Error(`无法识别的 JSON 起始字符: ${char}`);
      }

      const end = findJsonEnd(this.buffer, index);

      if (end === -1) break;

      lines.push(...this.parseValue(index, end));
      index = end + 1;
    }

    this.buffer = this.buffer.slice(index);
    return lines;
  }

  private parseValue(start: number, end: number): string[] {
    const raw = this.buffer.slice(start, end + 1);
    let value: unknown;

    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`JSON 片段无法解析: ${raw.slice(0, 80)}`);
    }

    return normalizeMessage(value);
  }
}

/**
 * 把完整 JSON 对象规范化为 JSONL 行。
 * surfaceUpdate 包含多个 component 时，拆成多条独立消息。
 */
function normalizeMessage(value: unknown): string[] {
  if (!isPlainObject(value)) {
    throw new Error('A2UI 消息必须是 JSON 对象');
  }

  const entries = Object.entries(value);

  if (entries.length !== 1) {
    throw new Error('A2UI 消息必须且只能包含一个消息类型');
  }

  const [type, payload] = entries[0];

  if (type === 'surfaceUpdate' && isPlainObject(payload)) {
    const components = payload.components;

    if (Array.isArray(components) && components.length > 1) {
      return components.map((component) =>
        JSON.stringify({
          surfaceUpdate: {
            ...payload,
            components: [component],
          },
        }),
      );
    }
  }

  return [JSON.stringify(value)];
}

/**
 * 从 start 位置开始寻找与起始括号匹配的结束位置。
 * 会跳过字符串内部的括号和转义字符。
 * 返回 -1 表示当前分块还不完整。
 */
function findJsonEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === open) {
      depth += 1;
      continue;
    }

    if (char === close) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function isWhitespace(char: string): boolean {
  return (
    char === ' ' ||
    char === '\n' ||
    char === '\r' ||
    char === '\t' ||
    char === '\uFEFF'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
