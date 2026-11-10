import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { createParser, parse } from '../../src/parser/index.js';
import type { A2uiRenderContext } from '../../src/vnode/index.js';

const allMockPath = fileURLToPath(
  new URL('../../Mock/all-components.json', import.meta.url),
);

/** standard_catalog_definition.json 中的全部组件 */
const COMPONENT_TYPES = [
  'Text',
  'Image',
  'Icon',
  'Video',
  'AudioPlayer',
  'Row',
  'Column',
  'List',
  'Card',
  'Tabs',
  'Divider',
  'Modal',
  'Button',
  'CheckBox',
  'TextField',
  'DateTimeInput',
  'MultipleChoice',
  'Slider',
];

function componentType(protocol: string): string {
  return Object.keys(JSON.parse(protocol) as Record<string, unknown>)[0];
}

describe('Parser – 全量组件 Mock', () => {
  it('解析出标准 Catalog 的全部 18 种组件类型', async () => {
    const parsed = parse(await readFile(allMockPath, 'utf8'));
    const nodes = Object.values(parsed.hydrateNodeMap);
    const types = new Set(nodes.map((node) => componentType(node.protocol ?? '')));

    for (const type of COMPONENT_TYPES) {
      assert.ok(types.has(type), `缺少组件类型 ${type}`);
    }

    assert.equal(nodes.length, 42);
    assert.equal(types.size, COMPONENT_TYPES.length);
  });

  it('解析 dataModelUpdate 得到嵌套数据模型', async () => {
    const parsed = parse(await readFile(allMockPath, 'utf8'));
    const model = parsed.dataModelMap['mock-all'];

    assert.ok(model, '缺少 mock-all 数据模型');

    const user = model.user as Record<string, unknown>;
    const settings = model.settings as Record<string, unknown>;

    assert.equal(user.name, 'Ada Lovelace');
    assert.equal(user.subscribed, true);
    assert.equal(settings.volume, 65);
  });

  it('renderMap 上下文可以按 path 解析数据模型', async () => {
    const contexts = new Map<string, A2uiRenderContext>();

    const renderMap = {
      TextField: (_props: Record<string, unknown>, context: A2uiRenderContext) => {
        contexts.set(context.id, context);
        return createElement('input');
      },
      CheckBox: (_props: Record<string, unknown>, context: A2uiRenderContext) => {
        contexts.set(context.id, context);
        return createElement('input');
      },
      Slider: (_props: Record<string, unknown>, context: A2uiRenderContext) => {
        contexts.set(context.id, context);
        return createElement('input');
      },
    };

    parse(await readFile(allMockPath, 'utf8'), renderMap);

    const nameContext = contexts.get('field-name');
    assert.ok(nameContext, '缺少 field-name 的渲染上下文');
    assert.equal(nameContext.resolve({ path: '/user/name' }), 'Ada Lovelace');

    const volumeContext = contexts.get('slider-1');
    assert.ok(volumeContext, '缺少 slider-1 的渲染上下文');
    assert.equal(volumeContext.resolve({ path: '/settings/volume' }), 65);

    const trialContext = contexts.get('check-trial');
    assert.ok(trialContext, '缺少 check-trial 的渲染上下文');
    assert.equal(trialContext.resolve({ literalBoolean: false }), false);
    assert.equal(trialContext.resolve({ path: '/user/not-exist' }), undefined);
  });

  it('dataModelUpdate 晚于 surfaceUpdate 到达时仍能解析 path', () => {
    const contexts: A2uiRenderContext[] = [];

    const parser = createParser({
      Text: (_props: Record<string, unknown>, context: A2uiRenderContext) => {
        contexts.push(context);
        return createElement('span');
      },
    });

    parser.parseLine(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"t","component":{"Text":{"text":{"path":"/user/name"}}}}]}}',
    );

    const context = contexts[0];
    assert.ok(context, '缺少渲染上下文');
    assert.equal(context.resolve({ path: '/user/name' }), undefined);

    parser.parseLine(
      '{"dataModelUpdate":{"surfaceId":"s1","path":"/","contents":[{"key":"user","valueMap":[{"key":"name","valueString":"Ada"}]}]}}',
    );

    assert.equal(context.resolve({ path: '/user/name' }), 'Ada');
  });
});
