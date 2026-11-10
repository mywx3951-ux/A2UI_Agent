import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { parse } from '../../src/parser/index.js';
import { treeBuild, type A2uiTreeNode } from '../../src/treebuilder/index.js';
import type { A2uiRenderContext, A2uiRenderMap } from '../../src/vnode/index.js';

const listMockPath = fileURLToPath(
  new URL('../../Mock/list-template.json', import.meta.url),
);

async function setup() {
  const parsed = parse(await readFile(listMockPath, 'utf8'));
  const surface = parsed.surfaceMap['mock-list'];
  assert.ok(surface, '缺少 mock-list');

  const contexts = new Map<string, A2uiRenderContext>();
  const updateCalls: Array<{ path: string; value: unknown }> = [];

  const renderMap: A2uiRenderMap = {
    Text: (_props, context) => {
      contexts.set(context.id, context);
      return createElement('span');
    },
  };

  const build = (dataModel = parsed.dataModelMap['mock-list']) =>
    treeBuild(surface, parsed.hydrateNodeMap, undefined, {
      renderMap,
      dataModel,
      onUpdateModel: (path, value) => updateCalls.push({ path, value }),
    });

  return { parsed, contexts, updateCalls, build };
}

function findById(node: A2uiTreeNode, id: string): A2uiTreeNode | undefined {
  if (node.id === id) return node;

  for (const child of node.children) {
    const found = findById(child, id);
    if (found) return found;
  }

  return undefined;
}

describe('treeBuild – children.template 动态列表', () => {
  it('按 dataBinding 展开为 3 个模板实例', async () => {
    const { build } = await setup();
    const tree = build();
    const list = findById(tree, 'product-list');

    assert.ok(list, '缺少 product-list');
    assert.equal(list.type, 'List');
    assert.deepEqual(
      list.children.map((child) => child.id),
      ['product-card#p1', 'product-card#p2', 'product-card#p3'],
    );

    for (const child of list.children) {
      assert.equal(child.type, 'Card');
      assert.equal(child.parentId, 'product-list');
    }
  });

  it('模板内部子节点也按元素实例生成', async () => {
    const { build } = await setup();
    const tree = build();

    const row = findById(tree, 'product-row#p2');
    assert.ok(row, '缺少 product-row#p2');
    assert.equal(row.type, 'Row');
    assert.equal(row.parentId, 'product-card#p2');
    assert.deepEqual(
      row.children.map((child) => child.id),
      ['product-name#p2', 'product-price#p2'],
    );
  });

  it('模板内 path 相对当前元素解析', async () => {
    const { contexts, build } = await setup();
    build();

    const nameContext = contexts.get('product-name#p2');
    assert.ok(nameContext, '缺少 product-name#p2 上下文');
    assert.equal(nameContext.resolve({ path: '/name' }), '茉莉花茶');

    const priceContext = contexts.get('product-price#p2');
    assert.ok(priceContext);
    assert.equal(priceContext.resolve({ path: '/price' }), '¥18');
  });

  it('相对路径取不到时回退到整份画布模型', async () => {
    const { contexts, build } = await setup();
    build();

    const context = contexts.get('product-name#p1');
    assert.ok(context);

    // /products/p1/name 不是 item 内的字段，走绝对路径
    assert.equal(context.resolve({ path: '/products/p1/name' }), '手冲咖啡');
    assert.equal(context.resolve({ path: '/not-exist' }), undefined);
  });

  it('dataBinding 指向数组时按索引展开', async () => {
    const { build } = await setup();

    const tree = build({
      products: [
        { name: '拿铁', price: '¥30' },
        { name: '美式', price: '¥24' },
      ],
    });

    const list = findById(tree, 'product-list');
    assert.ok(list);
    assert.deepEqual(
      list.children.map((child) => child.id),
      ['product-card#0', 'product-card#1'],
    );
  });

  it('dataBinding 取不到集合时渲染为空', async () => {
    const { build } = await setup();
    const tree = build({});

    const list = findById(tree, 'product-list');
    assert.ok(list);
    assert.equal(list.children.length, 0);
  });

  it('元素作用域的 updateModel 会映射回集合路径', async () => {
    const { contexts, updateCalls, build } = await setup();
    build();

    const context = contexts.get('product-price#p2');
    assert.ok(context);

    context.updateModel('/price', '¥99');

    assert.deepEqual(updateCalls, [
      { path: '/products/p2/price', value: '¥99' },
    ]);
  });

  it('模板组件不存在时不渲染任何子节点', () => {
    const parsed = parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"List":{"children":{"template":{"componentId":"missing","dataBinding":"/products"}}}}}]}}\n' +
        '{"beginRendering":{"surfaceId":"s1","root":"root"}}',
    );
    const surface = parsed.surfaceMap['s1'];
    assert.ok(surface);

    const tree = treeBuild(surface, parsed.hydrateNodeMap, undefined, {
      dataModel: { products: { p1: { name: 'A' } } },
    });

    assert.equal(tree.type, 'List');
    assert.equal(tree.children.length, 0);
  });

  it('元素内取不到 path 时回退到 literal', async () => {
    const { contexts, build } = await setup();
    build();

    const context = contexts.get('product-name#p1');
    assert.ok(context);

    assert.equal(
      context.resolve({ path: '/missing', literalString: '兜底文案' }),
      '兜底文案',
    );
  });
});
