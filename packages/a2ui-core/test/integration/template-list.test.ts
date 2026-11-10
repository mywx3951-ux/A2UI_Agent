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

const listMockPath = fileURLToPath(
  new URL('../../Mock/list-template.json', import.meta.url),
);

const SURFACE_ID = 'mock-list';

async function setup() {
  const contexts = new Map<string, A2uiRenderContext>();
  const renderedTrees: Array<A2uiTreeNode | null> = [];

  const renderMap: A2uiRenderMap = {
    Text: (_props, context) => {
      contexts.set(context.id, context);
      return createElement('span');
    },
  };

  const store = init(renderMap, (tree) => renderedTrees.push(tree));

  const runtime: A2uiParserRuntime = {
    getDataModel: (surfaceId) => store.getState().getDataModel(surfaceId),
    setDataModel: (surfaceId, model) =>
      store.getState().setDataModel(surfaceId, model),
    removeDataModel: (surfaceId) => store.getState().removeDataModel(surfaceId),
  };

  const parser = createParser(renderMap, undefined, undefined, runtime);

  const jsonl = await readFile(listMockPath, 'utf8');
  const buffer = new JsonlBuffer();
  const lines = [...buffer.append(jsonl), ...buffer.flush()];

  for (const line of lines) {
    parser.parseLine(line);
  }

  const result = parser.getResult();
  store.setState({
    surfaceMap: { ...result.surfaceMap },
    hydrateNodeMap: { ...result.hydrateNodeMap },
  });
  renderTreeFromStore(store);

  const tree = () => renderedTrees.at(-1) ?? null;

  return { store, contexts, renderedTrees, tree };
}

function findById(node: A2uiTreeNode, id: string): A2uiTreeNode | undefined {
  if (node.id === id) return node;

  for (const child of node.children) {
    const found = findById(child, id);
    if (found) return found;
  }

  return undefined;
}

describe('端到端：动态列表随数据模型变化重建', () => {
  it('初始从 valueMap 展开出 3 个商品卡片', async () => {
    const { tree } = await setup();

    const list = findById(tree() as A2uiTreeNode, 'product-list');
    assert.ok(list);
    assert.equal(list.children.length, 3);
  });

  it('updateModel 修改元素字段后绑定值更新', async () => {
    const { store, contexts, tree } = await setup();

    const before = contexts.get('product-name#p2');
    assert.ok(before);
    assert.equal(before.resolve({ path: '/name' }), '茉莉花茶');

    store.getState().updateModel(SURFACE_ID, '/products/p2/name', '乌龙茶');

    const after = contexts.get('product-name#p2');
    assert.ok(after);
    assert.equal(after.resolve({ path: '/name' }), '乌龙茶');

    const list = findById(tree() as A2uiTreeNode, 'product-list');
    assert.ok(list);
    assert.equal(list.children.length, 3);
  });

  it('updateModel 新增集合项后列表自动增加节点', async () => {
    const { store, contexts, tree } = await setup();

    store
      .getState()
      .updateModel(SURFACE_ID, '/products/p4', { name: '拿铁', price: '¥30' });

    const list = findById(tree() as A2uiTreeNode, 'product-list');
    assert.ok(list);
    assert.deepEqual(
      list.children.map((child) => child.id),
      ['product-card#p1', 'product-card#p2', 'product-card#p3', 'product-card#p4'],
    );

    const newName = contexts.get('product-name#p4');
    assert.ok(newName);
    assert.equal(newName.resolve({ path: '/name' }), '拿铁');
  });

  it('删除集合项后列表自动减少节点', async () => {
    const { store, tree } = await setup();

    store.getState().updateModel(SURFACE_ID, '/products/p2', undefined);

    const list = findById(tree() as A2uiTreeNode, 'product-list');
    assert.ok(list);
    assert.deepEqual(
      list.children.map((child) => child.id),
      ['product-card#p1', 'product-card#p3'],
    );
  });
});
