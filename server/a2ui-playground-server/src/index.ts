import { randomUUID } from 'node:crypto';
import { type IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import {
  chatWithModel,
  generateA2uiText,
  getAgentMode,
  streamChatWithModel,
  // [暂时停用] HTML 生成接口，当前主流程只使用 A2UI JSON
  // streamHtmlWithModel,
} from './agent';
import { AgentConfigError, parseAgentOutput } from './a2ui';
import {
  A2UI_CHUNK_EVENT,
  toSseEvent,
  type AguiEvent,
} from './agui';

// .env 可选：存在时自动加载，不覆盖进程里已有的环境变量
try {
  process.loadEnvFile();
} catch {
  // 没有 .env 时继续使用当前进程环境变量
}

const app = new Koa();
const router = new Router();

/** 读取并解析 JSON 请求体，避免额外引入 bodyparser 依赖 */
async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) return {};

  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('请求体必须是 JSON 对象');
  }

  return parsed as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 兼容 { input } 与 AG-UI 的 { messages: [...] } 两种输入 */
function readInput(body: Record<string, unknown>): string {
  if (typeof body.input === 'string') return body.input.trim();

  const messages = body.messages;

  if (!Array.isArray(messages)) return '';

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (
      isPlainObject(message) &&
      message.role === 'user' &&
      typeof message.content === 'string'
    ) {
      return message.content.trim();
    }
  }

  return '';
}

/** 读取图片输入：只接受 data URL 或 http(s) 地址，最多 4 张 */
function readImages(body: Record<string, unknown>): string[] {
  const images = body.images;

  if (!Array.isArray(images)) return [];

  return images
    .filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    )
    .slice(0, 4);
}

/** 读取当前页面协议，用于多轮增量更新 */
function readCurrentProtocol(body: Record<string, unknown>): string | undefined {
  const value = body.currentProtocol;

  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** 读取本轮目标组件 id 列表；兼容旧的单个 targetComponentId 字段 */
function readTargetComponentIds(body: Record<string, unknown>): string[] {
  const raw = body.targetComponentIds;
  const values = Array.isArray(raw) ? raw : [body.targetComponentId];

  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .slice(0, 20);
}

/** 读取最近对话，最多保留 8 条 */
function readHistory(
  body: Record<string, unknown>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const value = body.history;

  if (!Array.isArray(value)) return [];

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const item of value) {
    if (!isPlainObject(item)) continue;

    const role = item.role;
    const content = item.content;

    if (
      (role === 'user' || role === 'assistant') &&
      typeof content === 'string' &&
      content.trim() !== ''
    ) {
      history.push({ role, content: content.trim() });
    }
  }

  return history.slice(-8);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', mode: getAgentMode() };
});

/*
 * [暂时停用] 非流式 A2UI 生成接口。
 * 当前 Playground 统一走 POST /api/agent 的 AG-UI SSE 流式链路，
 * 该接口与 Mock 模式一起保留代码，后续需要时取消注释即可。
router.post('/api/generate', async (ctx) => {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(ctx.req);
  } catch {
    ctx.status = 400;
    ctx.body = { error: { message: '请求体必须是合法的 JSON 对象' } };
    return;
  }

  const input = readInput(body);

  if (!input) {
    ctx.status = 400;
    ctx.body = { error: { message: 'input 或最后一条 user message 不能为空' } };
    return;
  }

  try {
    const result = await generateA2ui(input, readImages(body));

    ctx.body = {
      messages: result.messages,
      meta: {
        model: result.model,
        durationMs: result.durationMs,
        mockFile: result.mockFile,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    ctx.status = error instanceof AgentConfigError ? 503 : 502;
    ctx.body = { error: { message } };

    console.error('[a2ui-server] /api/generate failed:', error);
  }
});
*/

/** 最基础的模型对话接口：只验证 OpenAI 连通性，不生成 A2UI */
router.post('/api/chat', async (ctx) => {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(ctx.req);
  } catch {
    ctx.status = 400;
    ctx.body = { error: { message: '请求体必须是合法的 JSON 对象' } };
    return;
  }

  const input = readInput(body);

  if (!input) {
    ctx.status = 400;
    ctx.body = { error: { message: 'input 或最后一条 user message 不能为空' } };
    return;
  }

  try {
    const result = await chatWithModel(input);

    ctx.body = {
      reply: result.reply,
      meta: {
        model: result.model,
        durationMs: result.durationMs,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    ctx.status = error instanceof AgentConfigError ? 503 : 502;
    ctx.body = { error: { message } };

    console.error('[a2ui-server] /api/chat failed:', error);
  }
});

/** 流式模型对话：服务端按 token 推送，前端边收边显示 */
router.post('/api/chat/stream', async (ctx) => {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(ctx.req);
  } catch {
    ctx.status = 400;
    ctx.body = { error: { message: '请求体必须是合法的 JSON 对象' } };
    return;
  }

  const input = readInput(body);

  if (!input) {
    ctx.status = 400;
    ctx.body = { error: { message: 'input 或最后一条 user message 不能为空' } };
    return;
  }

  const threadId = randomUUID();
  const runId = randomUUID();
  const messageId = randomUUID();
  const stream = new PassThrough();
  let closed = false;

  ctx.status = 200;
  ctx.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  ctx.body = stream;

  ctx.res.on('close', () => {
    closed = true;
  });

  const send = (event: AguiEvent) => {
    if (!closed) stream.write(toSseEvent(event));
  };

  // 同 /api/agent：不 await，先让 Koa 接管 stream
  void (async () => {
    try {
      send({ type: 'RUN_STARTED', threadId, runId, timestamp: Date.now() });
      send({
        type: 'STEP_STARTED',
        stepName: 'chat_completion',
        timestamp: Date.now(),
      });
      send({
        type: 'TEXT_MESSAGE_START',
        messageId,
        role: 'assistant',
        timestamp: Date.now(),
      });

      for await (const delta of streamChatWithModel(input)) {
        if (closed) return;

        send({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId,
          delta,
          timestamp: Date.now(),
        });
      }

      if (closed) return;

      send({ type: 'TEXT_MESSAGE_END', messageId, timestamp: Date.now() });
      send({
        type: 'STEP_FINISHED',
        stepName: 'chat_completion',
        timestamp: Date.now(),
      });
      send({ type: 'RUN_FINISHED', threadId, runId, timestamp: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      send({ type: 'RUN_ERROR', message, timestamp: Date.now() });
      console.error('[a2ui-server] /api/chat/stream failed:', error);
    } finally {
      stream.end();
    }
  })();
});

/** AG-UI SSE 流式接口：把 A2UI 协议文本作为 assistant 文本分块推送 */
router.post('/api/agent', async (ctx) => {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(ctx.req);
  } catch {
    ctx.status = 400;
    ctx.body = { error: { message: '请求体必须是合法的 JSON 对象' } };
    return;
  }

  const input = readInput(body);

  if (!input) {
    ctx.status = 400;
    ctx.body = { error: { message: 'input 或最后一条 user message 不能为空' } };
    return;
  }

  const images = readImages(body);
  const currentProtocol = readCurrentProtocol(body);
  const history = readHistory(body);
  const targetComponentIds = readTargetComponentIds(body);
  const threadId =
    typeof body.threadId === 'string' && body.threadId.trim()
      ? body.threadId
      : randomUUID();
  const runId =
    typeof body.runId === 'string' && body.runId.trim()
      ? body.runId
      : randomUUID();

  const stream = new PassThrough();
  let closed = false;

  ctx.status = 200;
  ctx.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  ctx.body = stream;

  // 客户断开时停止继续写入
  ctx.res.on('close', () => {
    closed = true;
  });

  const send = (event: AguiEvent) => {
    if (!closed) stream.write(toSseEvent(event));
  };

  // 关键：Koa 要等中间件返回后才开始消费 ctx.body 的流。
  // 这里不 await，让事件循环立刻回到 Koa，后续 chunk 才能实时写给客户端。
  void (async () => {
    try {
      send({ type: 'RUN_STARTED', threadId, runId, timestamp: Date.now() });
      send({
        type: 'STEP_STARTED',
        stepName: 'generate_a2ui',
        timestamp: Date.now(),
      });

      const result = await generateA2uiText(input, images, {
        currentProtocol,
        history,
        targetComponentIds,
      });

      // 先校验协议，避免把非法内容推给前端；再转成 JSONL 逐行推送
      const messages = parseAgentOutput(result.text, {
        partial: Boolean(currentProtocol),
      });
      const jsonl = messages
        .map((message) => JSON.stringify(message))
        .join('\n');

      const surfaceId =
        messages
          .map(
            (message) =>
              (message.beginRendering as { surfaceId?: string } | undefined)
                ?.surfaceId,
          )
          .find((id) => typeof id === 'string' && id !== '') ??
        messages
          .map(
            (message) =>
              (message.surfaceUpdate as { surfaceId?: string } | undefined)
                ?.surfaceId,
          )
          .find((id) => typeof id === 'string' && id !== '');

      const messageId = randomUUID();

      // assistant 文本通道：只用于聊天区展示
      send({
        type: 'TEXT_MESSAGE_START',
        messageId,
        role: 'assistant',
        timestamp: Date.now(),
      });

      const chunkSize = readPositiveInt(process.env.STREAM_CHUNK_SIZE, 80);
      const intervalMs = readPositiveInt(process.env.STREAM_INTERVAL_MS, 60);

      for (let index = 0; index < jsonl.length; index += chunkSize) {
        if (closed) return;

        send({
          type: 'CUSTOM',
          name: A2UI_CHUNK_EVENT,
          value: jsonl.slice(index, index + chunkSize),
          timestamp: Date.now(),
        });

        if (index + chunkSize < jsonl.length) {
          await delay(intervalMs);
        }
      }

      if (closed) return;

      // 协议推送完成后，再给出 assistant 的自然语言说明
      const summary =
        messages.length === 0
          ? 'agent完成：未检测到需要变更的界面内容'
          : `agent完成：${
              currentProtocol ? '已更新界面' : '已生成界面'
            }${surfaceId ? ` ${surfaceId}` : ''}，共 ${messages.length} 条协议消息`;

      send({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId,
        delta: summary,
        timestamp: Date.now(),
      });
      send({ type: 'TEXT_MESSAGE_END', messageId, timestamp: Date.now() });

      send({
        type: 'STEP_FINISHED',
        stepName: 'generate_a2ui',
        timestamp: Date.now(),
      });
      send({ type: 'RUN_FINISHED', threadId, runId, timestamp: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      send({ type: 'RUN_ERROR', message, timestamp: Date.now() });
      console.error('[a2ui-server] /api/agent failed:', error);
    } finally {
      stream.end();
    }
  })();
});

/*
 * [暂时停用] 流式 HTML 生成接口。
 * 当前前端主流程只消费 A2UI JSON，HTML + CSS 模式保留代码供后续实验，
 * 需要时取消注释并把 streamHtmlWithModel 重新加入顶部 import 即可。
router.post('/api/html/stream', async (ctx) => {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(ctx.req);
  } catch {
    ctx.status = 400;
    ctx.body = { error: { message: '请求体必须是合法的 JSON 对象' } };
    return;
  }

  const input = readInput(body);

  if (!input) {
    ctx.status = 400;
    ctx.body = { error: { message: 'input 或最后一条 user message 不能为空' } };
    return;
  }

  const images = readImages(body);
  const threadId = randomUUID();
  const runId = randomUUID();
  const messageId = randomUUID();
  const stream = new PassThrough();
  let closed = false;

  ctx.status = 200;
  ctx.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  ctx.body = stream;

  ctx.res.on('close', () => {
    closed = true;
  });

  const send = (event: AguiEvent) => {
    if (!closed) stream.write(toSseEvent(event));
  };

  void (async () => {
    try {
      send({ type: 'RUN_STARTED', threadId, runId, timestamp: Date.now() });
      send({
        type: 'STEP_STARTED',
        stepName: 'generate_html',
        timestamp: Date.now(),
      });
      send({
        type: 'TEXT_MESSAGE_START',
        messageId,
        role: 'assistant',
        timestamp: Date.now(),
      });

      for await (const delta of streamHtmlWithModel(input, images)) {
        if (closed) return;

        send({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId,
          delta,
          timestamp: Date.now(),
        });
      }

      if (closed) return;

      send({ type: 'TEXT_MESSAGE_END', messageId, timestamp: Date.now() });
      send({
        type: 'STEP_FINISHED',
        stepName: 'generate_html',
        timestamp: Date.now(),
      });
      send({ type: 'RUN_FINISHED', threadId, runId, timestamp: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      send({ type: 'RUN_ERROR', message, timestamp: Date.now() });
      console.error('[a2ui-server] /api/html/stream failed:', error);
    } finally {
      stream.end();
    }
  })();
});
*/

app.use(cors());
app.use(router.routes()).use(router.allowedMethods());

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(
    `a2ui-playground-server listening on http://localhost:${port} (mode: ${getAgentMode()})`,
  );
});
