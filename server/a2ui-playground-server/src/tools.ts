// A2UI Agent 工具：图标查询
// 工具结果供模型在生成 Icon 组件前查询可用名称

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** src / dist 到仓库根目录都是向上三级 */
const repoRoot = resolve(__dirname, '../../..');

interface IconMeta {
  name: string;
  aliases: string[];
  keywords: string[];
  category: string;
}

const iconCatalog = JSON.parse(
  readFileSync(resolve(repoRoot, 'docs/icon-catalog.json'), 'utf8'),
) as { icons: IconMeta[] };

/** 暴露给模型的工具定义 */
export const A2UI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_a2ui_icons',
      description:
        '获取 A2UI Icon 组件可用的图标名称列表。生成包含 Icon 的 A2UI 协议前调用此工具，按关键词筛选合适的图标。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              '可选关键词，用于筛选图标，例如 home、user、cart、设置、搜索。',
          },
          limit: {
            type: 'number',
            description: '最多返回的图标数量，默认 40，最大 80。',
          },
        },
      },
    },
  },
];

/** 执行工具调用，返回字符串结果 */
export function executeTool(name: string, argsJson: string): string {
  if (name !== 'list_a2ui_icons') {
    throw new Error(`未知工具: ${name}`);
  }

  let args: Record<string, unknown> = {};

  try {
    const parsed: unknown = JSON.parse(argsJson || '{}');

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    throw new Error('工具参数不是合法 JSON');
  }

  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const rawLimit = typeof args.limit === 'number' ? args.limit : 40;
  const limit = Math.min(Math.max(Math.floor(rawLimit), 1), 80);

  return JSON.stringify(searchIcons(query, limit));
}

function searchIcons(query: string, limit: number) {
  const keyword = query.toLowerCase();

  const matched = keyword
    ? iconCatalog.icons.filter((icon) => {
        const haystack = [
          icon.name,
          icon.category,
          ...icon.aliases,
          ...icon.keywords,
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(keyword);
      })
    : iconCatalog.icons;

  const icons = matched.slice(0, limit).map((icon) => ({
    name: icon.name,
    category: icon.category,
  }));

  return {
    query,
    total: matched.length,
    returned: icons.length,
    icons,
    usage: 'Icon.name 只能使用这里返回的 name；找不到合适图标时使用 info。',
  };
}
