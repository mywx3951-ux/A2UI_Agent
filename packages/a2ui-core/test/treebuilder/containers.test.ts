import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from '../../src/parser/index.js';
import { treeBuild, type A2uiTreeNode } from '../../src/treebuilder/index.js';

const allMockPath = fileURLToPath(
  new URL('../../Mock/all-components.json', import.meta.url),
);

async function buildAllComponentsTree(): Promise<A2uiTreeNode> {
  const parsed = parse(await readFile(allMockPath, 'utf8'));
  const surface = parsed.surfaceMap['mock-all'];
  assert.ok(surface, '缺少 mock-all');

  return treeBuild(surface, parsed.hydrateNodeMap);
}

function findById(node: A2uiTreeNode, id: string): A2uiTreeNode | undefined {
  if (node.id === id) return node;

  for (const child of node.children) {
    const found = findById(child, id);
    if (found) return found;
  }

  return undefined;
}

describe('treeBuild – 非 explicitList 容器', () => {
  it('Card 通过 child 组装单个子节点', async () => {
    const tree = await buildAllComponentsTree();
    const card = findById(tree, 'hero-card');

    assert.ok(card, '缺少 hero-card');
    assert.equal(card.type, 'Card');
    assert.equal(card.children.length, 1);
    assert.equal(card.children[0].id, 'card-body');
    assert.equal(card.children[0].parentId, 'hero-card');
  });

  it('Button 通过 child 组装按钮内容', async () => {
    const tree = await buildAllComponentsTree();
    const button = findById(tree, 'modal-entry');

    assert.ok(button, '缺少 modal-entry');
    assert.equal(button.type, 'Button');
    assert.equal(button.children.length, 1);
    assert.equal(button.children[0].id, 'modal-entry-label');
  });

  it('Modal 同时组装 entryPointChild 与 contentChild', async () => {
    const tree = await buildAllComponentsTree();
    const modal = findById(tree, 'modal-block');

    assert.ok(modal, '缺少 modal-block');
    assert.equal(modal.type, 'Modal');
    assert.deepEqual(
      modal.children.map((child) => child.id),
      ['modal-entry', 'modal-content'],
    );
  });

  it('Tabs 按 tabItems 顺序组装子节点', async () => {
    const tree = await buildAllComponentsTree();
    const tabs = findById(tree, 'tabs-block');

    assert.ok(tabs, '缺少 tabs-block');
    assert.equal(tabs.type, 'Tabs');
    assert.deepEqual(
      tabs.children.map((child) => child.id),
      ['tab1-body', 'tab2-body'],
    );
  });

  it('List 走 explicitList 并保留方向属性', async () => {
    const tree = await buildAllComponentsTree();
    const list = findById(tree, 'list-block');

    assert.ok(list, '缺少 list-block');
    assert.equal(list.type, 'List');
    assert.deepEqual(
      list.children.map((child) => child.id),
      ['list-a', 'list-b', 'list-c'],
    );
  });

  it('包含全部 18 种组件类型的节点都进入组件树', async () => {
    const tree = await buildAllComponentsTree();
    const types = new Set<string>();

    const walk = (node: A2uiTreeNode) => {
      types.add(node.type);
      node.children.forEach(walk);
    };
    walk(tree);

    for (const type of [
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
    ]) {
      assert.ok(types.has(type), `组件树缺少 ${type}`);
    }
  });
});
