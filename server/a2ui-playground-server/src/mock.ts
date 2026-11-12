// Mock 协议来源：读取 packages/a2ui-core/Mock 下的标准 A2UI JSON

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** src / dist 到仓库根目录都是向上三级 */
const repoRoot = resolve(__dirname, '../../..');
const mockDir = resolve(repoRoot, 'packages/a2ui-core/Mock');

/** 只包含增量补丁，不能单独渲染 */
const PATCH_ONLY_FILES = new Set(['component-update-patch.json']);

export interface MockProtocol {
  /** 协议文本（标准 JSON 数组） */
  text: string;
  /** 实际命中的 Mock 文件名 */
  file: string;
}

/** 可独立渲染的 Mock 文件列表 */
export function listMockFiles(): string[] {
  return readdirSync(mockDir)
    .filter((file) => file.endsWith('.json') && !PATCH_ONLY_FILES.has(file))
    .sort();
}

/**
 * 读取 Mock 协议。
 * - 设置 A2UI_MOCK_FILE 为具体文件名时，固定返回该文件；
 * - 未设置或设为 random 时，每次请求随机挑选一个可渲染的 Mock。
 */
export function readMockProtocol(): MockProtocol {
  const configured = process.env.A2UI_MOCK_FILE?.trim();
  const file =
    configured && configured.toLowerCase() !== 'random'
      ? configured
      : pickRandom(listMockFiles());

  return {
    text: readFileSync(resolve(mockDir, file), 'utf8').trim(),
    file,
  };
}

function pickRandom(files: string[]): string {
  if (files.length === 0) {
    throw new Error('Mock 目录为空，无法返回 A2UI 协议');
  }

  return files[Math.floor(Math.random() * files.length)];
}
