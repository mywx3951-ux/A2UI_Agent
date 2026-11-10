import { randomUUID } from 'node:crypto';
import { type IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import {
  generateA2ui,
  generateA2uiText,
  getAgentMode,
} from './agent';
import { AgentConfigError, parseAgentOutput } from './a2ui';
import { toSseEvent, type AguiEvent } from './agui';

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

/** 非流式接口：返回完整的 A2UI 消息数组 */
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
    const result = await generateA2ui(input);

    ctx.body = {
      messages: result.messages,
      meta: {
        model: result.model,
        durationMs: result.durationMs,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    ctx.status = error instanceof AgentConfigError ? 503 : 502;
    ctx.body = { error: { message } };

    console.error('[a2ui-server] /api/generate failed:', error);
  }
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

  const threadId =
    typeof body.threadId === 'string' && body.threadId.trim()
      ? body.threadId
      : randomUUID();
  const runId =
    typeof body.runId === 'string' && body.runId.trim()
      ? body.runId
      : randomUUID();
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

  // 客户断开时停止继续写入
  ctx.res.on('close', () => {
    closed = true;
  });

  const send = (event: AguiEvent) => {
    if (!closed) stream.write(toSseEvent(event));
  };

  try {
    send({ type: 'RUN_STARTED', threadId, runId, timestamp: Date.now() });
    send({
      type: 'STEP_STARTED',
      stepName: 'generate_a2ui',
      timestamp: Date.now(),
    });

    const result = await generateA2uiText(input);

    // 流式输出前先校验协议，避免把非法内容推给前端
    parseAgentOutput(result.text);

    send({
      type: 'TEXT_MESSAGE_START',
      messageId,
      role: 'assistant',
      timestamp: Date.now(),
    });

    const chunkSize = readPositiveInt(process.env.STREAM_CHUNK_SIZE, 80);
    const intervalMs = readPositiveInt(process.env.STREAM_INTERVAL_MS, 60);

    for (let index = 0; index < result.text.length; index += chunkSize) {
      if (closed) return;

      send({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId,
        delta: result.text.slice(index, index + chunkSize),
        timestamp: Date.now(),
      });

      if (index + chunkSize < result.text.length) {
        await delay(intervalMs);
      }
    }

    if (closed) return;

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
});

app.use(cors());
app.use(router.routes()).use(router.allowedMethods());

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(
    `a2ui-playground-server listening on http://localhost:${port} (mode: ${getAgentMode()})`,
  );
});
