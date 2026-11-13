// A2UI Agent：默认使用 Mock 协议，也可通过环境变量切换到 OpenAI

import OpenAI from 'openai';
import {
  AgentConfigError,
  AgentOutputError,
  parseAgentOutput,
  type A2uiMessage,
} from './a2ui';
import { readMockProtocol } from './mock';
import { HTML_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompt';
import { A2UI_TOOLS, executeTool } from './tools';

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

/** 多轮增量更新的上下文 */
export interface A2uiConversationContext {
  /** 当前页面的完整 A2UI 协议 JSON */
  currentProtocol?: string;
  /** 最近几轮对话 */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 本轮要修改或删除的目标组件 id */
  targetComponentId?: string;
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
  context: A2uiConversationContext = {},
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

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserContent(input, images, context) },
  ];

  let content: string | null | undefined;
  const maxRounds = 4;

  try {
    for (let round = 0; round < maxRounds; round += 1) {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        messages,
        tools: A2UI_TOOLS,
        tool_choice: 'auto',
      });

      const message = completion.choices[0]?.message;

      if (!message) {
        throw new AgentOutputError('模型没有返回消息');
      }

      // 模型请求调用工具：执行后把结果回填，再进入下一轮
      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });

        for (const toolCall of message.tool_calls) {
          // 只处理标准 function 工具调用
          if (toolCall.type !== 'function') {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: '不支持的工具类型' }),
            });
            continue;
          }

          const toolName = toolCall.function.name;

          console.log(
            `[a2ui-agent] tool call: ${toolName} ${toolCall.function.arguments}`,
          );

          let toolResult: string;

          try {
            toolResult = executeTool(toolName, toolCall.function.arguments);
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : '未知错误';
            toolResult = JSON.stringify({ error: messageText });
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        continue;
      }

      content = message.content;

      if (!content) {
        throw new AgentOutputError('模型没有返回内容');
      }

      // 输出不是合法 A2UI 协议时，让模型修正一次
      try {
        parseAgentOutput(content, {
          partial: Boolean(context.currentProtocol),
        });
        break;
      } catch {
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content:
            '上一条输出不是合法的 A2UI JSON 数组。请严格只输出 JSON 数组，不要解释、不要 Markdown 代码块，并确保包含 surfaceUpdate 和 beginRendering。',
        });
        content = null;
      }
    }
  } catch (error) {
    if (error instanceof AgentOutputError) throw error;

    const message = error instanceof Error ? error.message : '未知错误';
    throw new AgentOutputError(`调用 OpenAI 失败: ${message}`);
  }

  if (!content) {
    throw new AgentOutputError('Agent 未返回最终内容（可能工具调用轮次超限）');
  }

  return {
    text: content,
    model,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 构造 user message。
 * 有 currentProtocol 时把当前协议和最近对话放进上下文，用于多轮微调。
 */
function buildUserContent(
  input: string,
  images: string[],
  context: A2uiConversationContext = {},
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const sections: string[] = [];

  if (context.currentProtocol?.trim()) {
    sections.push(
      `当前页面 A2UI 协议（请在此基础上做增量修改）：\n${context.currentProtocol.trim()}`,
    );
  }

  if (context.history && context.history.length > 0) {
    const lines = context.history
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');

    sections.push(`最近对话：\n${lines}`);
  }

  if (context.targetComponentId?.trim()) {
    sections.push(
      `本轮目标组件 id：${context.targetComponentId.trim()}\n请只修改或删除该组件，不要改动其他组件。删除组件时，从父组件的 children 中移除该 id。`,
    );
  }

  sections.push(`用户的新要求：\n${input}`);

  const text = sections.join('\n\n');

  if (images.length === 0) return text;

  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text },
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

/** 流式生成标准 HTML 页面（内联 CSS，不含脚本） */
export async function* streamHtmlWithModel(
  input: string,
  images: string[] = [],
): AsyncGenerator<string> {
  const { client, model } = createOpenAIClient();

  let completion;

  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      stream: true,
      messages: [
        { role: 'system', content: HTML_SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(input, images) },
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
