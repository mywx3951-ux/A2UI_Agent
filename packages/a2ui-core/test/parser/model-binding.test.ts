import assert from 'node:assert/strict';
import { createElement } from 'react';
import { createParser, parse, type A2uiParserRuntime } from '../../src/parser/index.js';
import { setModelValue, type A2uiDataModel } from '../../src/store/index.js';
import type { A2uiRenderContext } from '../../src/vnode/index.js';

interface RuntimeCalls {
  set: string[];
  removed: string[];
  updates: Array<{ surfaceId: string; path: string; value: unknown }>;
}

/** 模拟中心 Store 的数据模型端口 */
function createRuntime(initial: Record<string, A2uiDataModel> = {}) {
  const models: Record<string, A2uiDataModel> = { ...initial };
  const calls: RuntimeCalls = { set: [], removed: [], updates: [] };

  const runtime: A2uiParserRuntime = {
    getDataModel: (surfaceId) => models[surfaceId],
    setDataModel: (surfaceId, model) => {
      models[surfaceId] = model;
      calls.set.push(surfaceId);
    },
    removeDataModel: (surfaceId) => {
      delete models[surfaceId];
      calls.removed.push(surfaceId);
    },
    updateModel: (surfaceId, path, value) => {
      models[surfaceId] = setModelValue(models[surfaceId] ?? {}, path, value);
      calls.updates.push({ surfaceId, path, value });
    },
  };

  return { models, calls, runtime };
}

function captureContexts() {
  const contexts = new Map<string, A2uiRenderContext>();

  const renderMap = {
    Text: (_props: Record<string, unknown>, context: A2uiRenderContext) => {
      contexts.set(context.id, context);
      return createElement('span');
    },
  };

  return { contexts, renderMap };
}

describe('Parser – 数据模型与绑定', () => {
  it('dataModelUpdate 会同步写入运行时的中心模型', () => {
    const { models, calls, runtime } = createRuntime();

    parse(
      '{"dataModelUpdate":{"surfaceId":"s1","path":"/","contents":[{"key":"user","valueMap":[{"key":"name","valueString":"Ada"}]}]}}',
      {},
      undefined,
      undefined,
      runtime,
    );

    assert.deepStrictEqual(models.s1, { user: { name: 'Ada' } });
    assert.deepStrictEqual(calls.set, ['s1']);
  });

  it('resolve 实时读取中心模型，而不是解析时的快照', () => {
    const { contexts, renderMap } = captureContexts();
    const { models, runtime } = createRuntime({ s1: { user: { name: 'Ada' } } });

    parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"t","component":{"Text":{"text":{"path":"/user/name"}}}}]}}',
      renderMap,
      undefined,
      undefined,
      runtime,
    );

    const context = contexts.get('t');
    assert.ok(context, '缺少渲染上下文');
    assert.equal(context.resolve({ path: '/user/name' }), 'Ada');

    // 模拟 Store 中模型被 updateModel 改写
    models.s1 = setModelValue(models.s1, '/user/name', 'Grace');

    assert.equal(context.resolve({ path: '/user/name' }), 'Grace');
  });

  it('path 与 literal 并存时，literal 会隐式播种进模型', () => {
    const { contexts, renderMap } = captureContexts();
    const { models, runtime } = createRuntime();

    parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"t","component":{"Text":{"text":{"path":"/doc/title","literalString":"Hello"}}}}]}}',
      renderMap,
      undefined,
      undefined,
      runtime,
    );

    assert.deepStrictEqual(models.s1, { doc: { title: 'Hello' } });

    const context = contexts.get('t');
    assert.ok(context);
    assert.equal(context.resolve({ path: '/doc/title' }), 'Hello');
  });

  it('模型里已有值时不会被 literal 覆盖', () => {
    const { models, runtime } = createRuntime({
      s1: { doc: { title: 'From Server' } },
    });

    parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"t","component":{"Text":{"text":{"path":"/doc/title","literalString":"Hello"}}}}]}}',
      {},
      undefined,
      undefined,
      runtime,
    );

    assert.deepStrictEqual(models.s1, { doc: { title: 'From Server' } });
  });

  it('渲染上下文的 updateModel 会写回中心模型', () => {
    const { contexts, renderMap } = captureContexts();
    const { models, calls, runtime } = createRuntime();

    parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"t","component":{"Text":{"text":{"path":"/user/name","literalString":"Ada"}}}}]}}',
      renderMap,
      undefined,
      undefined,
      runtime,
    );

    const context = contexts.get('t');
    assert.ok(context);

    context.updateModel('/user/name', 'Grace');

    assert.deepStrictEqual(calls.updates, [
      { surfaceId: 's1', path: '/user/name', value: 'Grace' },
    ]);
    assert.deepStrictEqual(models.s1, { user: { name: 'Grace' } });
    assert.equal(context.resolve({ path: '/user/name' }), 'Grace');
  });

  it('deleteSurface 会移除中心模型', () => {
    const { models, calls, runtime } = createRuntime({
      s1: { a: 1 },
      s2: { b: 2 },
    });

    parse(
      '{"deleteSurface":{"surfaceId":"s1"}}',
      {},
      undefined,
      undefined,
      runtime,
    );

    assert.equal(models.s1, undefined);
    assert.deepStrictEqual(models.s2, { b: 2 });
    assert.deepStrictEqual(calls.removed, ['s1']);
  });

  it('不传 runtime 时退化为 Parser 内部模型', () => {
    const parser = createParser();

    parser.parseLine(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"t","component":{"Text":{"text":{"path":"/doc/title","literalString":"Hello"}}}}]}}',
    );

    assert.deepStrictEqual(parser.getResult().dataModelMap.s1, {
      doc: { title: 'Hello' },
    });
  });
});
