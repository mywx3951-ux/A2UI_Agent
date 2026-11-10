import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { parse } from '../../src/parser/index.js';
import { treeBuild } from '../../src/treebuilder/index.js';
import type { A2uiRenderContext, A2uiRenderMap } from '../../src/vnode/index.js';

const minMockPath = fileURLToPath(
  new URL('../../Mock/list-template-min.json', import.meta.url),
);

describe('treeBuild – 最小动态列表 Mock', () => {
  it('只有 List 根节点与模板 Text，也能展开为 2 个实例', async () => {
    const parsed = parse(await readFile(minMockPath, 'utf8'));
    const surface = parsed.surfaceMap['mock-list-min'];

    assert.ok(surface, '缺少 mock-list-min');
    assert.deepEqual(Object.keys(parsed.hydrateNodeMap).sort(), [
      'item-text',
      'root',
    ]);

    const contexts = new Map<string, A2uiRenderContext>();
    const renderMap: A2uiRenderMap = {
      Text: (_props, context) => {
        contexts.set(context.id, context);
        return createElement('span');
      },
    };

    const tree = treeBuild(surface, parsed.hydrateNodeMap, undefined, {
      renderMap,
      dataModel: parsed.dataModelMap['mock-list-min'],
    });

    assert.equal(tree.type, 'List');
    assert.equal(tree.id, 'root');
    assert.deepEqual(
      tree.children.map((child) => child.id),
      ['item-text#a', 'item-text#b'],
    );

    for (const child of tree.children) {
      assert.equal(child.type, 'Text');
      assert.equal(child.parentId, 'root');
      assert.equal(child.children.length, 0);
    }

    assert.equal(contexts.get('item-text#a')?.resolve({ path: '/label' }), 'A');
    assert.equal(contexts.get('item-text#b')?.resolve({ path: '/label' }), 'B');
  });
});
