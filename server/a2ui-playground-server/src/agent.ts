// A2UI Agent：默认使用 Mock 协议，也可通过环境变量切换到 OpenAI

import OpenAI from 'openai';
import {
  AgentConfigError,
  AgentOutputError,
  parseAgentOutput,
  type A2uiMessage,
} from './a2ui';
import { readMockProtocol } from './mock';
import { SYSTEM_PROMPT } from './prompt';

export type AgentMode = 'mock' | 'openai';

export interface GenerateTextResult {
  text: string;
  model: string;
  durationMs: number;
  /** Mock 模式下实际命中的文件名 */
  mockFile?: string;
}

export interface GenerateA2uiResult {
  messages: A2uiMessage[];
  model: string;
  durationMs: number;
  /** Mock 模式下实际命中的文件名 */
  mockFile?: string;
}

export interface ChatResult {
  reply: string;
  model: string;
  durationMs: number;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 60_000;

export function getAgentMode(): AgentMode {
  return process.env.A2UI_AGENT_MODE?.trim().toLowerCase() === 'openai'
    ? 'openai'
    : 'mock';
}

/** 读取 OpenAI 配置；缺少 Key 时抛出 AgentConfigError */
function createOpenAIClient(): { client: OpenAI; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new AgentConfigError(
      '缺少 OPENAI_API_KEY，请先在 server/a2ui-playground-server/.env 中配置',
    );
  }

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutValue = Number(process.env.OPENAI_TIMEOUT_MS);
  const timeout =
    Number.isFinite(timeoutValue) && timeoutValue > 0
      ? timeoutValue
      : DEFAULT_TIMEOUT_MS;
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;

  return { client: new OpenAI({ apiKey, baseURL, timeout }), model };
}

/** 生成 A2UI 协议文本；有图片时走多模态消息 */
export async function generateA2uiText(
  input: string,
  images: string[] = [],
): Promise<GenerateTextResult> {
  if (getAgentMode() === 'mock') {
    const mock = readMockProtocol();

    return {
      text: mock.text,
      model: 'mock',
      durationMs: 0,
      mockFile: mock.file,
    };
  }

  const { client, model } = createOpenAIClient();
  const startedAt = Date.now();

  let content: string | null | undefined;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(input, images) },
      ],
    });

    content = completion.choices[0]?.message?.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new AgentOutputError(`调用 OpenAI 失败: ${message}`);
  }

  if (!content) {
    throw new AgentOutputError('Agent 未返回任何内容');
  }

  return {
    text: content,
    model,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 无图片时保持纯文本 content；有图片时构造 OpenAI 多模态 content。
 * 是否真正支持图片取决于所选模型是否具备视觉能力。
 */
function buildUserContent(
  input: string,
  images: string[],
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (images.length === 0) return input;

  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: input },
  ];

  for (const url of images) {
    parts.push({ type: 'image_url', image_url: { url } });
  }

  return parts;
}

/** 最基础的模型对话：不注入 A2UI 协议，只验证 OpenAI 连通性 */
export async function chatWithModel(input: string): Promise<ChatResult> {
  const { client, model } = createOpenAIClient();
  const startedAt = Date.now();

  let content: string | null | undefined;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: '你是一个简洁、友好的中文助手。' },
        { role: 'user', content: input },
      ],
    });

    content = completion.choices[0]?.message?.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new AgentOutputError(`调用 OpenAI 失败: ${message}`);
  }

  if (!content) {
    throw new AgentOutputError('模型未返回任何内容');
  }

  return {
    reply: content,
    model,
    durationMs: Date.now() - startedAt,
  };
}

/** 建立流式模型对话，按 token 增量产出文本 */
export async function* streamChatWithModel(
  input: string,
): AsyncGenerator<string> {
  const { client, model } = createOpenAIClient();

  let completion;

  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: 'system', content: '你是一个简洁、友好的中文助手。' },
        { role: 'user', content: input },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new AgentOutputError(`调用 OpenAI 失败: ${message}`);
  }

  try {
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;

      if (delta) yield delta;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new AgentOutputError(`读取模型流失败: ${message}`);
  }
}

/** 生成并校验 A2UI 消息数组 */
export async function generateA2ui(
  input: string,
  images: string[] = [],
): Promise<GenerateA2uiResult> {
  const result = await generateA2uiText(input, images);

  return {
    messages: parseAgentOutput(result.text),
    model: result.model,
    durationMs: result.durationMs,
    mockFile: result.mockFile,
  };
}
