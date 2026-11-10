import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { parse } from '../../src/parser/index.js';
import { init } from '../../src/store/index.js';
import {
  renderTreeFromStore,
  treeBuild,
  type A2uiTreeNode,
} from '../../src/treebuilder/index.js';

const simpleMockPath = fileURLToPath(
  new URL('../../Mock/simple-text.json', import.meta.url),
);

const columnMockPath = fileURLToPath(
  new URL('../../Mock/column-text.json', import.meta.url),
);

const nestedMockPath = fileURLToPath(
  new URL('../../Mock/nested-tree.json', import.meta.url),
);

const mixedMockPath = fileURLToPath(
  new URL('../../Mock/mixed-tree.json', import.meta.url),
);

describe('treeBuild', () => {
  it('单个 Text 组件生成无子节点的组件树', async () => {
    const parsed = parse(await readFile(simpleMockPath, 'utf8'));
    const surface = parsed.surfaceMap['mock-surface'];
    assert.ok(surface, '缺少 mock-surface');

    const tree = treeBuild(surface, parsed.hydrateNodeMap);

    assert.equal(tree.id, 'root');
    assert.equal(tree.surfaceId, 'mock-surface');
    assert.equal(tree.parentId, undefined);
    assert.equal(tree.type, 'Text');
    assert.equal(tree.vnode.type, 'Text');
    assert.deepEqual(tree.children, []);
  });

  it('将 Column 和三个 Text 组装为父子组件树', async () => {
    const renderMap = {
      Column: () => createElement('div'),
      Text: (props: Record<string, unknown>) =>
        createElement(
          'span',
          null,
          (props.text as { literalString: string }).literalString,
        ),
    };

    const parsed = parse(await readFile(columnMockPath, 'utf8'), renderMap);
    const surface = parsed.surfaceMap['mock-column'];
    assert.ok(surface, '缺少 mock-column');

    const tree = treeBuild(surface, parsed.hydrateNodeMap);

    assert.equal(tree.id, 'root');
    assert.equal(tree.parentId, undefined);
    assert.equal(tree.type, 'Column');
    assert.equal(tree.children.length, 3);
    assert.deepEqual(
      tree.children.map((child) => child.id),
      ['text-1', 'text-2', 'text-3'],
    );

    for (const child of tree.children) {
      assert.equal(child.parentId, 'root');
      assert.equal(child.vnode.type, 'span');
    }

    assert.equal(tree.vnode.type, 'div');
    assert.equal(tree.children[0].vnode.type, 'span');

    const vnodeProps = tree.vnode.props as { children: unknown[] };
    assert.equal(vnodeProps.children.length, 3);
  });

  it('将多层嵌套 Column 组装为组件树', async () => {
    const renderMap = {
      Column: () => createElement('div'),
      Text: (props: Record<string, unknown>) =>
        createElement(
          'span',
          null,
          (props.text as { literalString: string }).literalString,
        ),
    };

    const parsed = parse(await readFile(nestedMockPath, 'utf8'), renderMap);
    const surface = parsed.surfaceMap['mock-nested'];
    assert.ok(surface, '缺少 mock-nested');

    const tree = treeBuild(surface, parsed.hydrateNodeMap);

    assert.equal(tree.type, 'Column');

    // root -> header, content, footer
    assert.equal(tree.children.length, 3);
    const [header, content, footer] = tree.children;
    assert.equal(header.id, 'header');
    assert.equal(content.id, 'content');
    assert.equal(footer.id, 'footer');

    // content -> intro, details
    assert.equal(content.children.length, 2);
    const [intro, details] = content.children;
    assert.equal(intro.id, 'intro');
    assert.equal(details.id, 'details');
    assert.equal(details.type, 'Column');

    // details -> detail-1, detail-2, detail-3
    assert.equal(details.children.length, 3);
    assert.deepEqual(
      details.children.map((child) => child.id),
      ['detail-1', 'detail-2', 'detail-3'],
    );

    for (const child of tree.children) {
      assert.equal(child.parentId, 'root');
    }
    for (const child of content.children) {
      assert.equal(child.parentId, 'content');
    }
    for (const child of details.children) {
      assert.equal(child.parentId, 'details');
    }

    // 每一层父容器都注入了对应数量的子 vnode
    const rootProps = tree.vnode.props as { children: unknown[] };
    assert.equal(rootProps.children.length, 3);

    const contentProps = content.vnode.props as { children: unknown[] };
    assert.equal(contentProps.children.length, 2);

    const detailsProps = details.vnode.props as { children: unknown[] };
    assert.equal(detailsProps.children.length, 3);
  });

  it('混合 Column、Row 与 Text 的树结构', async () => {
    const renderMap = {
      Column: () => createElement('div'),
      Row: () => createElement('div'),
      Text: (props: Record<string, unknown>) =>
        createElement(
          'span',
          null,
          (props.text as { literalString: string }).literalString,
        ),
    };

    const parsed = parse(await readFile(mixedMockPath, 'utf8'), renderMap);
    const surface = parsed.surfaceMap['mock-mixed'];
    assert.ok(surface, '缺少 mock-mixed');

    const tree = treeBuild(surface, parsed.hydrateNodeMap);

    assert.equal(tree.type, 'Column');
    assert.equal(tree.children.length, 4);
    assert.deepEqual(
      tree.children.map((child) => child.id),
      ['title', 'toolbar', 'content', 'footer'],
    );

    const toolbar = tree.children.find((child) => child.id === 'toolbar');
    assert.ok(toolbar, '缺少 toolbar');
    assert.equal(toolbar.type, 'Row');
    assert.equal(toolbar.children.length, 3);

    const content = tree.children.find((child) => child.id === 'content');
    assert.ok(content, '缺少 content');
    assert.equal(content.type, 'Column');
    assert.equal(content.children.length, 2);

    const stats = content.children.find((child) => child.id === 'stats');
    assert.ok(stats, '缺少 stats');
    assert.equal(stats.type, 'Row');
    assert.equal(stats.children.length, 2);

    const footer = tree.children.find((child) => child.id === 'footer');
    assert.ok(footer, '缺少 footer');
    assert.equal(footer.type, 'Row');
    assert.equal(footer.children.length, 2);

    for (const child of toolbar.children) {
      assert.equal(child.parentId, 'toolbar');
    }
    for (const child of stats.children) {
      assert.equal(child.parentId, 'stats');
    }

    const toolbarProps = toolbar.vnode.props as { children: unknown[] };
    assert.equal(toolbarProps.children.length, 3);

    const statsProps = stats.vnode.props as { children: unknown[] };
    assert.equal(statsProps.children.length, 2);
  });

  it('treeBuild 完成后调用 renderTree 回调', async () => {
    const rendered: A2uiTreeNode[] = [];

    const parsed = parse(await readFile(columnMockPath, 'utf8'));
    const surface = parsed.surfaceMap['mock-column'];
    assert.ok(surface, '缺少 mock-column');

    const tree = treeBuild(surface, parsed.hydrateNodeMap, (value) => {
      if (value) rendered.push(value);
    });

    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].id, tree.id);
  });

  it('renderTreeFromStore 在 beginRendering 前使用临时根并调用 renderTree', () => {
    const rendered: Array<A2uiTreeNode | null> = [];
    const store = init({}, (tree) => rendered.push(tree));

    const parsed = parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"literalString":"hi"}}}}]}}',
    );
    store.setState({
      surfaceMap: parsed.surfaceMap,
      hydrateNodeMap: parsed.hydrateNodeMap,
    });

    const tree = renderTreeFromStore(store);

    assert.ok(tree, '缺少临时组件树');
    assert.equal(tree.id, 'root');
    assert.equal(tree.type, 'Text');
    assert.equal(Object.keys(store.getState().surfaceMap).length, 0);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0]?.id, 'root');
  });
});
