// A2UI Agent 输出解析与基础校验

const MESSAGE_TYPES = [
  'beginRendering',
  'surfaceUpdate',
  'dataModelUpdate',
  'deleteSurface',
] as const;

export type A2uiMessage = Record<string, unknown>;

export interface ParseAgentOptions {
  /** 增量更新模式：允许只返回部分消息，甚至空数组 */
  partial?: boolean;
}

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

export class AgentOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentOutputError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 解析模型返回的 A2UI 协议。
 * 兼容纯 JSON 数组、{ messages: [...] } 包装以及 Markdown 代码块。
 */
export function parseAgentOutput(
  content: string,
  options: ParseAgentOptions = {},
): A2uiMessage[] {
  const text = stripCodeFence(content);
  const parsed = parseJson(text);
  const messages = normalizeMessages(parsed);

  if (messages.length === 0) {
    if (options.partial) return [];

    throw new AgentOutputError('Agent 输出的消息数组为空');
  }

  const validated: A2uiMessage[] = [];

  messages.forEach((message, index) => {
    validateMessage(message, index);
    validated.push(message);
  });

  // 全量生成必须包含结构定义和渲染入口；增量更新允许只返回变更消息
  if (!options.partial) {
    if (!validated.some((message) => 'surfaceUpdate' in message)) {
      throw new AgentOutputError('Agent 输出缺少 surfaceUpdate 消息');
    }

    if (!validated.some((message) => 'beginRendering' in message)) {
      throw new AgentOutputError('Agent 输出缺少 beginRendering 消息');
    }
  }

  return validated;
}

function stripCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试 JSONL / 数组 / 对象提取
  }

  // JSONL：每行一条 A2UI 消息
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (lines.length > 1) {
    try {
      const values = lines.map((line) => JSON.parse(line));

      if (values.every(isPlainObject)) {
        return values;
      }
    } catch {
      // 继续尝试数组/对象提取
    }
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');

  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    } catch {
      // 继续尝试对象提取
    }
  }

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');

  if (objectStart !== -1 && objectEnd > objectStart) {
    try {
      return JSON.parse(text.slice(objectStart, objectEnd + 1));
    } catch {
      // 交给下方统一报错
    }
  }

  throw new AgentOutputError('Agent 返回的内容不是合法 JSON');
}

function normalizeMessages(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;

  if (isPlainObject(parsed) && Array.isArray(parsed.messages)) {
    return parsed.messages;
  }

  throw new AgentOutputError(
    'Agent 输出必须是 A2UI 消息数组，或包含 messages 数组的 JSON 对象',
  );
}

function validateMessage(
  value: unknown,
  index: number,
): asserts value is A2uiMessage {
  const label = `第 ${index + 1} 条消息`;

  if (!isPlainObject(value)) {
    throw new AgentOutputError(`${label}不是 JSON 对象`);
  }

  const keys = Object.keys(value);

  if (keys.length !== 1) {
    throw new AgentOutputError(`${label}必须且只能包含一个消息类型`);
  }

  const type = keys[0];

  if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
    throw new AgentOutputError(`${label}类型不支持: ${type}`);
  }

  const payload = value[type];

  if (!isPlainObject(payload)) return;

  switch (type) {
    case 'surfaceUpdate':
      if (!Array.isArray(payload.components)) {
        throw new AgentOutputError(`${label}的 surfaceUpdate 缺少 components`);
      }
      break;
    case 'dataModelUpdate':
      if (!Array.isArray(payload.contents)) {
        throw new AgentOutputError(`${label}的 dataModelUpdate 缺少 contents`);
      }
      break;
    case 'beginRendering':
      if (typeof payload.root !== 'string' || payload.root === '') {
        throw new AgentOutputError(`${label}的 beginRendering 缺少 root`);
      }
      break;
    case 'deleteSurface':
      if (typeof payload.surfaceId !== 'string' || payload.surfaceId === '') {
        throw new AgentOutputError(`${label}的 deleteSurface 缺少 surfaceId`);
      }
      break;
  }
}
