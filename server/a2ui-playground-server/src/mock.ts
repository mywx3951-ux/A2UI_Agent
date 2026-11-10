// Mock 协议来源：读取 packages/a2ui-core/Mock 下的标准 A2UI JSON

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** src / dist 到仓库根目录都是向上三级 */
const repoRoot = resolve(__dirname, '../../..');
const DEFAULT_MOCK_FILE = 'shopping-cart.json';

/** 读取 Mock 协议文本，后续由 SSE 分块推送 */
export function readMockProtocol(): string {
  const file = process.env.A2UI_MOCK_FILE?.trim() || DEFAULT_MOCK_FILE;
  const path = resolve(repoRoot, 'packages/a2ui-core/Mock', file);

  return readFileSync(path, 'utf8').trim();
}
