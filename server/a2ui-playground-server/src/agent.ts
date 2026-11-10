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
}

export interface GenerateA2uiResult {
  messages: A2uiMessage[];
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

/** 生成 A2UI 协议文本；SSE 接口直接按文本分块推送 */
export async function generateA2uiText(
  input: string,
): Promise<GenerateTextResult> {
  if (getAgentMode() === 'mock') {
    return {
      text: readMockProtocol(),
      model: 'mock',
      durationMs: 0,
    };
  }

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

  const client = new OpenAI({ apiKey, baseURL, timeout });
  const startedAt = Date.now();

  let content: string | null | undefined;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
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

/** 生成并校验 A2UI 消息数组 */
export async function generateA2ui(
  input: string,
): Promise<GenerateA2uiResult> {
  const result = await generateA2uiText(input);

  return {
    messages: parseAgentOutput(result.text),
    model: result.model,
    durationMs: result.durationMs,
  };
}
