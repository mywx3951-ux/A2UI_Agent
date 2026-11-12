// A2UI Agent 系统提示词：读取 docs/agent-prompt.md 模板，并在启动时注入 Catalog 与示例

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** src / dist 到仓库根目录都是向上三级 */
const repoRoot = resolve(__dirname, '../../..');

/** 提示词模板：docs/agent-prompt.md */
const template = readFileSync(
  resolve(repoRoot, 'docs/agent-prompt.md'),
  'utf8',
).trim();

/** 当前渲染器支持的组件与属性 */
const catalog = readFileSync(
  resolve(repoRoot, 'docs/catalog.json'),
  'utf8',
).trim();

/** 完整协议示例 */
const example = readFileSync(
  resolve(repoRoot, 'packages/a2ui-core/Mock/local-update.json'),
  'utf8',
).trim();

const variables: Record<string, string> = {
  catalog,
  example,
};

/**
 * 把模板里的 {{key}} 替换成运行时内容。
 * 未知占位符直接报错，避免把残缺的 prompt 发给模型。
 */
function renderPrompt(source: string): string {
  return source.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];

    if (value === undefined) {
      throw new Error(`docs/agent-prompt.md 中存在未知占位符: {{${key}}}`);
    }

    return value;
  });
}

export const SYSTEM_PROMPT = renderPrompt(template);
