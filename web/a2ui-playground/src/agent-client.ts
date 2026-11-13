// 浏览器端 AG-UI SSE 客户端：协议流与 assistant 文本走两条独立通道

/** A2UI 协议分块事件名，与服务端约定保持一致 */
export const A2UI_CHUNK_EVENT = 'a2ui.jsonl.chunk';

export type AgentEventType =
  | 'RUN_STARTED'
  | 'STEP_STARTED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'MESSAGES_SNAPSHOT'
  | 'CUSTOM'
  | 'STEP_FINISHED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR';

interface AgentMessage {
  role?: string;
  content?: string;
}

export interface AgentEvent {
  type?: AgentEventType | string;
  delta?: string;
  /** RUN_ERROR 时为错误文本；部分实现会在首条事件用对象形式携带 assistant 消息 */
  message?: string | AgentMessage;
  messages?: AgentMessage[];
  name?: string;
  value?: unknown;
}

export interface StreamAgentOptions {
  /** 每收到一个 AG-UI 事件触发一次 */
  onEvent?: (event: AgentEvent) => void;
  /** 收到一段 A2UI 协议文本（只认 CUSTOM / a2ui.jsonl.chunk） */
  onChunk?: (chunk: string) => void;
  /** 收到 assistant 流式文本增量（TEXT_MESSAGE_CONTENT） */
  onTextDelta?: (delta: string) => void;
  /** 收到一条完整的 assistant 消息（MESSAGES_SNAPSHOT 或 message 对象） */
  onMessage?: (text: string) => void;
  /** 多模态输入：data URL 或 http(s) 图片地址 */
  images?: string[];
  /** 当前页面的完整 A2UI 协议，用于多轮增量更新 */
  currentProtocol?: string;
  /** 最近几轮对话 */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 本轮要修改的目标组件 id 列表（支持一次选中多个） */
  targetComponentIds?: string[];
}

export interface StreamAgentResult {
  /** 本次流式返回的 A2UI 协议文本 */
  protocol: string;
  /** assistant 自然语言文本，用于聊天气泡 */
  message: string;
}

export interface ChatResult {
  reply: string;
  model?: string;
  durationMs?: number;
}

/** Server 地址，与 server/.env 中的 PORT 保持一致 */
export const API_BASE_URL = 'http://localhost:3000';

/** 调用最基础的模型对话接口（不渲染 A2UI） */
export async function chatWithModel(input: string): Promise<ChatResult> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as {
    reply?: unknown;
    meta?: { model?: string; durationMs?: number };
  };

  if (typeof payload.reply !== 'string') {
    throw new Error('响应缺少 reply 字段');
  }

  return {
    reply: payload.reply,
    model: payload.meta?.model,
    durationMs: payload.meta?.durationMs,
  };
}

/**
 * 调用 POST /api/agent 并消费 SSE 流。
 * 使用 fetch + ReadableStream，因为 EventSource 只支持 GET。
 */
export async function streamAgent(
  input: string,
  options: StreamAgentOptions = {},
): Promise<StreamAgentResult> {
  const response = await fetch(`${API_BASE_URL}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      input,
      images: options.images?.length ? options.images : undefined,
      currentProtocol: options.currentProtocol,
      history: options.history?.length ? options.history : undefined,
      targetComponentIds: options.targetComponentIds?.length
        ? options.targetComponentIds
        : undefined,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(await readErrorMessage(response));
  }

  let protocol = '';
  let message = '';
  let runError: string | null = null;

  await readSseFrames(response, (event) => {
    options.onEvent?.(event);

    // 通道一：A2UI 协议文本，交给 Buffer 解析渲染
    const chunk = extractProtocolChunk(event);

    if (chunk !== null) {
      protocol += chunk;
      options.onChunk?.(chunk);
    }

    // 通道二：assistant 自然语言，交给聊天气泡
    if (
      event.type === 'TEXT_MESSAGE_CONTENT' &&
      typeof event.delta === 'string'
    ) {
      message += event.delta;
      options.onTextDelta?.(event.delta);
    } else {
      const snapshot = extractAssistantMessage(event);

      if (snapshot !== null) {
        message = snapshot;
        options.onMessage?.(snapshot);
      }
    }

    if (event.type === 'RUN_ERROR') {
      runError =
        typeof event.message === 'string'
          ? event.message
          : '服务端返回 RUN_ERROR';
    }
  });

  if (runError) throw new Error(runError);

  return { protocol, message };
}

export interface StreamChatOptions {
  onEvent?: (event: AgentEvent) => void;
  /** 收到 assistant 文本增量时触发，用于边收边显示 */
  onTextDelta?: (delta: string) => void;
}

/** 调用 POST /api/chat/stream，逐 token 接收模型回复 */
export async function streamChat(
  input: string,
  options: StreamChatOptions = {},
): Promise<ChatResult> {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  let reply = '';
  let runError: string | null = null;

  await readSseFrames(response, (event) => {
    options.onEvent?.(event);

    if (
      event.type === 'TEXT_MESSAGE_CONTENT' &&
      typeof event.delta === 'string'
    ) {
      reply += event.delta;
      options.onTextDelta?.(event.delta);
    }

    if (event.type === 'RUN_ERROR') {
      runError =
        typeof event.message === 'string'
          ? event.message
          : '服务端返回 RUN_ERROR';
    }
  });

  if (runError) throw new Error(runError);

  return { reply };
}

/*
 * [暂时停用] HTML 生成客户端。
 * 当前 Playground 主流程只使用 A2UI JSON，服务端 /api/html/stream 也已一并注释。
 * 需要恢复时取消注释即可。
export interface StreamHtmlOptions {
  images?: string[];
  onDelta?: (delta: string) => void;
}

export async function streamHtml(
  input: string,
  options: StreamHtmlOptions = {},
): Promise<{ html: string }> {
  const response = await fetch(`${API_BASE_URL}/api/html/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      input,
      images: options.images?.length ? options.images : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  let html = '';
  let runError: string | null = null;

  await readSseFrames(response, (event) => {
    if (
      event.type === 'TEXT_MESSAGE_CONTENT' &&
      typeof event.delta === 'string'
    ) {
      html += event.delta;
      options.onDelta?.(event.delta);
    }

    if (event.type === 'RUN_ERROR') {
      runError =
        typeof event.message === 'string'
          ? event.message
          : '服务端返回 RUN_ERROR';
    }
  });

  if (runError) throw new Error(runError);

  return { html };
}
*/

/** 读取 SSE 响应体，每解析出一个 data 帧就回调一次 */
async function readSseFrames(
  response: Response,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('响应没有可读取的流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    pending += decoder.decode(value, { stream: true });

    let boundary = pending.indexOf('\n\n');

    while (boundary !== -1) {
      const frame = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      boundary = pending.indexOf('\n\n');

      const event = parseFrame(frame);

      if (event) onEvent(event);
    }
  }
}

/** 解析单个 SSE 帧，取其中所有 data: 行并合成一个事件 */
function parseFrame(frame: string): AgentEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data) return null;

  return JSON.parse(data) as AgentEvent;
}

/** 只从 CUSTOM / a2ui.jsonl.chunk 中提取 A2UI 协议文本 */
function extractProtocolChunk(event: AgentEvent): string | null {
  if (
    event.type === 'CUSTOM' &&
    event.name === A2UI_CHUNK_EVENT &&
    typeof event.value === 'string'
  ) {
    return event.value;
  }

  return null;
}

/** 从 MESSAGES_SNAPSHOT 或 message 对象中提取 assistant 完整文本 */
function extractAssistantMessage(event: AgentEvent): string | null {
  if (event.type === 'MESSAGES_SNAPSHOT' && Array.isArray(event.messages)) {
    return lastAssistantContent(event.messages);
  }

  if (typeof event.message === 'object' && event.message !== null) {
    const { role, content } = event.message;

    return role === 'assistant' && typeof content === 'string' ? content : null;
  }

  return null;
}

function lastAssistantContent(messages: AgentMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === 'assistant' && typeof message.content === 'string') {
      return message.content;
    }
  }

  return null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };

    return payload.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
