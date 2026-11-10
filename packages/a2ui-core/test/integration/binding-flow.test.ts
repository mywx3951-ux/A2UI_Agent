import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JsonlBuffer } from '../../src/buffer/index.js';
import { createParser, type A2uiParserRuntime } from '../../src/parser/index.js';
import { init } from '../../src/store/index.js';
import {
  renderTreeFromStore,
  type A2uiTreeNode,
} from '../../src/treebuilder/index.js';
import type { A2uiRenderContext, A2uiRenderMap } from '../../src/vnode/index.js';

const profileMockPath = fileURLToPath(
  new URL('../../Mock/binding-profile.json', import.meta.url),
);

const SURFACE_ID = 'mock-profile';

/**
 * 搭一条和 playground 一致的完整链路：
 * Parser(runtime) → Store(dataModelMap / hydrateNodeMap) → treeBuild → renderTree
 */
async function setup() {
  const contexts = new Map<string, A2uiRenderContext>();
  const renderedTrees: Array<A2uiTreeNode | null> = [];

  const renderMap: A2uiRenderMap = {
    Text: (_props, context) => {
      contexts.set(context.id, context);
      return createElement('span');
    },
    CheckBox: (_props, context) => {
      contexts.set(context.id, context);
      return createElement('input');
    },
  };

  const store = init(renderMap, (tree) => renderedTrees.push(tree));

  const runtime: A2uiParserRuntime = {
    getDataModel: (surfaceId) => store.getState().getDataModel(surfaceId),
    setDataModel: (surfaceId, model) =>
      store.getState().setDataModel(surfaceId, model),
    removeDataModel: (surfaceId) => store.getState().removeDataModel(surfaceId),
    updateModel: (surfaceId, path, value) =>
      store.getState().updateModel(surfaceId, path, value),
  };

  const parser = createParser(
    renderMap,
    store.getState().addError,
    store.getState().markHydrateNodeMounted,
    runtime,
  );

  const jsonl = await readFile(profileMockPath, 'utf8');
  const buffer = new JsonlBuffer();
  const lines = [...buffer.append(jsonl), ...buffer.flush()];

  const feed = () => {
    for (const line of lines) {
      parser.parseLine(line);

      const result = parser.getResult();
      store.setState({
        surfaceMap: { ...result.surfaceMap },
        hydrateNodeMap: { ...result.hydrateNodeMap },
      });

      renderTreeFromStore(store);
    }
  };

  return { store, parser, contexts, renderedTrees, lines, feed };
}

function findById(node: A2uiTreeNode, id: string): A2uiTreeNode | undefined {
  if (node.id === id) return node;

  for (const child of node.children) {
    const found = findById(child, id);
    if (found) return found;
  }

  return undefined;
}

describe('端到端：协议 → Parser → Store → 绑定 → 组件树', () => {
  it('JSON 数组协议共 6 条消息，解析出 4 个组件节点', async () => {
    const { store, contexts, renderedTrees, lines, feed } = await setup();

    assert.equal(lines.length, 6);

    feed();

    assert.deepEqual(Object.keys(store.getState().hydrateNodeMap).sort(), [
      'greeting-text',
      'name-text',
      'root',
      'verified-check',
    ]);
    assert.equal(Object.keys(store.getState().surfaceMap).length, 1);
    assert.equal(contexts.size, 3);
    assert.equal(renderedTrees.length, lines.length);
  });

  it('数据模型合并服务端数据并隐式播种缺失的 path', async () => {
    const { store, feed } = await setup();

    feed();

    assert.deepEqual(store.getState().getDataModel(SURFACE_ID), {
      user: { name: 'Ada', verified: true },
      // 组件里只有 path + literalString，模型缺失时用 literal 播种
      greeting: { title: 'Welcome' },
    });
  });

  it('Text 绑定以模型为准，literal 不覆盖服务端已有值', async () => {
    const { contexts, feed } = await setup();

    feed();

    const nameContext = contexts.get('name-text');
    assert.ok(nameContext, '缺少 name-text 上下文');

    // 模型里是 Ada，组件的 literalString 只是兜底
    assert.equal(nameContext.resolve({ path: '/user/name' }), 'Ada');
    assert.equal(
      nameContext.resolve({ path: '/user/name', literalString: 'Fallback Name' }),
      'Ada',
    );
  });

  it('隐式播种的字段可以正常解析', async () => {
    const { contexts, feed } = await setup();

    feed();

    const greetingContext = contexts.get('greeting-text');
    assert.ok(greetingContext);
    assert.equal(greetingContext.resolve({ path: '/greeting/title' }), 'Welcome');
  });

  it('Boolean 绑定保留原始类型', async () => {
    const { contexts, feed } = await setup();

    feed();

    const checkContext = contexts.get('verified-check');
    assert.ok(checkContext);
    assert.equal(checkContext.resolve({ path: '/user/verified' }), true);
  });

  it('updateModel 写回 Store，并让绑定值立即变化', async () => {
    const { store, contexts, renderedTrees, feed } = await setup();

    feed();

    const before = renderedTrees.length;
    const nameContext = contexts.get('name-text');
    assert.ok(nameContext);
    assert.equal(nameContext.resolve({ path: '/user/name' }), 'Ada');

    store.getState().updateModel(SURFACE_ID, '/user/name', 'Grace');

    assert.deepEqual(store.getState().getDataModel(SURFACE_ID), {
      user: { name: 'Grace', verified: true },
      greeting: { title: 'Welcome' },
    });
    assert.equal(nameContext.resolve({ path: '/user/name' }), 'Grace');

    // updateModel 内部触发了重新组装组件树
    assert.equal(renderedTrees.length, before + 1);
  });

  it('组件树按 Column 组装三个子节点', async () => {
    const { renderedTrees, feed } = await setup();

    feed();

    const tree = renderedTrees.at(-1);
    assert.ok(tree, '缺少渲染树');
    assert.equal(tree.id, 'root');
    assert.equal(tree.type, 'Column');
    assert.deepEqual(
      tree.children.map((child) => child.id),
      ['name-text', 'verified-check', 'greeting-text'],
    );
    assert.equal(findById(tree, 'verified-check')?.type, 'CheckBox');

    for (const child of tree.children) {
      assert.equal(child.parentId, 'root');
    }
  });

  it('deleteSurface 同时清理 Surface、节点与数据模型', async () => {
    const { parser, store, feed } = await setup();

    feed();

    parser.parseLine('{"deleteSurface":{"surfaceId":"mock-profile"}}');

    const result = parser.getResult();
    store.setState({
      surfaceMap: { ...result.surfaceMap },
      hydrateNodeMap: { ...result.hydrateNodeMap },
    });

    assert.deepEqual(store.getState().surfaceMap, {});
    assert.deepEqual(store.getState().hydrateNodeMap, {});
    assert.equal(store.getState().getDataModel(SURFACE_ID), undefined);
  });
});
