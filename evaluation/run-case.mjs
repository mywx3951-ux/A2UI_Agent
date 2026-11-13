#!/usr/bin/env node

// A2UI Agent 单个用例执行器
// 用法：node evaluation/run-case.mjs <case-id>
//       node evaluation/run-case.mjs --list
//       A2UI_SERVER_URL=http://localhost:3000 node evaluation/run-case.mjs 06-theme

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.A2UI_SERVER_URL ?? 'http://localhost:3000';
const ALLOWED_TYPES = new Set([
  'beginRendering',
  'surfaceUpdate',
  'dataModelUpdate',
  'deleteSurface',
]);

const caseId = process.argv[2];

if (!caseId) {
  console.error('用法: node evaluation/run-case.mjs <case-id>');
  console.error('      node evaluation/run-case.mjs --list');
  process.exit(1);
}

const cases = JSON.parse(
  await readFile(resolve(__dirname, 'cases.json'), 'utf8'),
);

// 只允许 docs/catalog.json 中已定义的组件，外加 OpenLink 扩展
const catalog = JSON.parse(
  await readFile(resolve(__dirname, '../docs/catalog.json'), 'utf8'),
);
const allowedComponents = new Set([
  ...Object.keys(catalog.components ?? {}),
  'OpenLink',
]);

if (caseId === '--list') {
  for (const item of cases) {
    console.log(`${item.id.padEnd(24)} ${item.title}`);
  }
  process.exit(0);
}

const testCase = cases.find((item) => item.id === caseId);

if (!testCase) {
  console.error(`未找到用例: ${caseId}`);
  process.exit(1);
}

const startedAt = Date.now();
let chunkCount = 0;
let protocol = '';
let runError = null;
let summary = '';

try {
  const response = await fetch(`${BASE_URL}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ input: testCase.input }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
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

      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data) continue;

      const event = JSON.parse(data);

      if (event.type === 'CUSTOM' && event.name === 'a2ui.jsonl.chunk') {
        chunkCount += 1;
        protocol += event.value;
      }

      if (event.type === 'TEXT_MESSAGE_CONTENT') {
        summary += event.delta ?? '';
      }

      if (event.type === 'RUN_ERROR') {
        runError = event.message ?? 'RUN_ERROR';
      }
    }
  }
} catch (error) {
  console.error(`请求失败: ${error.message}`);
  process.exit(1);
}

const durationMs = Date.now() - startedAt;

const checks = [];
const messages = [];
const componentTypes = new Set();
const componentIds = new Set();
const unknownComponents = new Set();
const iconNames = [];
let surfaceId = null;
let root = null;
let primaryColor = null;
let font = null;

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
}

check('请求成功', runError === null, runError ?? '');
check('消息非空', protocol.trim().length > 0, `收到 ${protocol.length} 字符`);
check('流式分块', chunkCount > 3, `${chunkCount} 个 CUSTOM 分块`);

if (protocol.trim()) {
  const lines = protocol.split('\n').filter((line) => line.trim() !== '');

  for (const line of lines) {
    try {
      const message = JSON.parse(line);
      messages.push(message);

      const keys = Object.keys(message);

      if (keys.length !== 1 || !ALLOWED_TYPES.has(keys[0])) {
        check(`消息类型合法: ${line.slice(0, 40)}`, false, `字段: ${keys.join(',')}`);
      }

      if (message.surfaceUpdate?.components) {
        for (const component of message.surfaceUpdate.components) {
          componentIds.add(component.id);

          const type = Object.keys(component.component ?? {})[0];

          if (type) {
            componentTypes.add(type);

            if (!allowedComponents.has(type)) {
              unknownComponents.add(type);
            }

            if (type === 'Icon') {
              const iconName = component.component.Icon?.name;

              if (typeof iconName?.literalString === 'string') {
                iconNames.push(iconName.literalString);
              }
            }
          }
        }

        surfaceId = message.surfaceUpdate.surfaceId ?? surfaceId;
      }

      if (message.beginRendering) {
        surfaceId = message.beginRendering.surfaceId ?? surfaceId;
        root = message.beginRendering.root ?? root;
        primaryColor = message.beginRendering.styles?.primaryColor ?? primaryColor;
        font = message.beginRendering.styles?.font ?? font;
      }
    } catch {
      check(`JSON 片段可解析: ${line.slice(0, 40)}`, false, '');
    }
  }

  check('包含 surfaceUpdate', messages.some((m) => m.surfaceUpdate), '');
  check('包含 beginRendering', messages.some((m) => m.beginRendering), '');
  check('根节点存在', root !== null && componentIds.has(root), `root=${root}`);
  check(
    '组件均在 Catalog 中',
    unknownComponents.size === 0,
    unknownComponents.size > 0
      ? `未定义组件: ${[...unknownComponents].join(', ')}`
      : `${componentTypes.size} 种已定义组件`,
  );

  if (iconNames.length > 0) {
    const allowedIcons = new Set(
      catalog.components?.Icon?.properties?.name?.properties?.literalString
        ?.enum ?? [],
    );
    const unknownIcons = iconNames.filter((name) => !allowedIcons.has(name));

    check(
      '图标名称合法',
      unknownIcons.length === 0,
      unknownIcons.length > 0
        ? `未定义图标: ${unknownIcons.join(', ')}`
        : `${iconNames.length} 个图标`,
    );
  }
}

if (typeof testCase.minDistinctComponents === 'number') {
  check(
    `组件种类 >= ${testCase.minDistinctComponents}`,
    componentTypes.size >= testCase.minDistinctComponents,
    `实际 ${componentTypes.size} 种`,
  );
}

if (testCase.expectComponents?.length) {
  for (const type of testCase.expectComponents) {
    check(`包含组件 ${type}`, componentTypes.has(type), [...componentTypes].join(', '));
  }
}

if (testCase.expectPrimaryColor) {
  check(
    `主色 ${testCase.expectPrimaryColor}`,
    (primaryColor ?? '').toLowerCase() === testCase.expectPrimaryColor.toLowerCase(),
    primaryColor ?? '未设置',
  );
}

if (testCase.expectFont) {
  check(
    `字体包含 ${testCase.expectFont}`,
    (font ?? '').includes(testCase.expectFont),
    font ?? '未设置',
  );
}

const failed = checks.filter((item) => !item.passed);
const passed = failed.length === 0;

console.log('');
console.log(`用例: ${testCase.id} - ${testCase.title}`);
console.log(`提示词: ${testCase.input}`);
console.log(`耗时: ${durationMs}ms`);
console.log(`分块: ${chunkCount}  CUSTOM 消息: ${messages.length}`);
console.log(`surfaceId: ${surfaceId ?? '-'}  root: ${root ?? '-'}`);
console.log(`组件: ${[...componentTypes].join(', ') || '-'}`);
console.log(`图标: ${iconNames.join(', ') || '-'}`);
console.log('');

for (const item of checks) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? `  (${item.detail})` : ''}`);
}

console.log('');
console.log(passed ? '结论: PASS' : `结论: FAIL（${failed.length} 项未通过）`);

const resultDir = resolve(__dirname, 'results');
await mkdir(resultDir, { recursive: true });

const result = {
  caseId: testCase.id,
  title: testCase.title,
  input: testCase.input,
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  durationMs,
  chunkCount,
  messageCount: messages.length,
  surfaceId,
  root,
  componentTypes: [...componentTypes],
  iconNames,
  primaryColor,
  font,
  summary,
  passed,
  checks,
  messages,
};

const file = resolve(resultDir, `${testCase.id}-${Date.now()}.json`);
await writeFile(file, JSON.stringify(result, null, 2), 'utf8');

console.log(`结果已保存: ${file}`);

process.exit(passed ? 0 : 1);
