import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { JsonlBuffer } from '../../src/buffer/index.js';
import { createParser, parse } from '../../src/parser/index.js';
import { ErrorType, init } from '../../src/store/index.js';
import type { A2uiRenderContext } from '../../src/vnode/index.js';

const mockPath = fileURLToPath(
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

async function loadMock(): Promise<string> {
  return readFile(mockPath, 'utf8');
}

describe('Parser', () => {
  it('解析 simple-text.json 得到对应的 Surface', async () => {
    const result = parse(await loadMock());

    assert.deepEqual(Object.keys(result.surfaceMap), ['mock-surface']);

    const surface = result.surfaceMap['mock-surface'];
    assert.ok(surface, '缺少 surfaceId 为 mock-surface 的 Surface');
    assert.equal(surface.id, 'mock-surface');
    assert.equal(surface.beginRender, true);
    assert.equal(surface.rootNode.id, 'root');
    assert.equal(surface.rootNode.surfaceId, 'mock-surface');
    assert.equal(
      surface.catalogId,
      'https://a2ui.org/specification/v0_8/catalogs/minimal/minimal_catalog.json',
    );
  });

  it('解析 simple-text.json 得到对应的 HydrateNode', async () => {
    const result = parse(await loadMock());

    assert.deepEqual(Object.keys(result.hydrateNodeMap), ['root']);

    const node = result.hydrateNodeMap['root'];
    assert.ok(node, '缺少 id 为 root 的 HydrateNode');
    assert.equal(node.id, 'root');
    assert.equal(node.surfaceId, 'mock-surface');
    assert.equal(node.hasMounted, false);

    assert.ok(node._vnode, 'root 节点缺少 _vnode');
    assert.equal(node._vnode.type, 'Text');
    assert.deepEqual(node._vnode.props, {
      text: {
        literalString: 'Hello, A2UI!',
      },
      usageHint: 'h2',
    });

    assert.ok(node.protocol, 'root 节点缺少原始协议内容');
    assert.deepEqual(JSON.parse(node.protocol), {
      Text: {
        text: {
          literalString: 'Hello, A2UI!',
        },
        usageHint: 'h2',
      },
    });
  });

  it('解析 column-text.json 得到 Column 和三个 Text 节点', async () => {
    const result = parse(await readFile(columnMockPath, 'utf8'));

    const surface = result.surfaceMap['mock-column'];
    assert.ok(surface, '缺少 mock-column');
    assert.equal(surface.id, 'mock-column');
    assert.equal(surface.beginRender, true);
    assert.equal(surface.rootNode.id, 'root');

    assert.deepEqual(Object.keys(result.hydrateNodeMap), [
      'root',
      'text-1',
      'text-2',
      'text-3',
    ]);

    const rootNode = result.hydrateNodeMap['root'];
    assert.ok(rootNode, '缺少 root 节点');
    assert.equal(rootNode.surfaceId, 'mock-column');
    assert.deepEqual(JSON.parse(rootNode.protocol ?? ''), {
      Column: {
        children: {
          explicitList: ['text-1', 'text-2', 'text-3'],
        },
        distribution: 'start',
        alignment: 'stretch',
      },
    });

    for (const id of ['text-1', 'text-2', 'text-3']) {
      const node = result.hydrateNodeMap[id];
      assert.ok(node, `缺少 ${id} 节点`);
      assert.equal(node.surfaceId, 'mock-column');
    }
  });

  it('valueMap 支持「条目数组的数组」写法并生成列表', () => {
    const result = parse(
      JSON.stringify([
        {
          dataModelUpdate: {
            surfaceId: 'weather-widget',
            path: '/weather',
            contents: [
              {
                key: 'cities',
                valueMap: [
                  [
                    { key: 'name', valueString: '杭州' },
                    { key: 'temp', valueString: '26°' },
                  ],
                  [
                    { key: 'name', valueString: '北京' },
                    { key: 'temp', valueString: '24°' },
                  ],
                ],
              },
            ],
          },
        },
      ]),
    );

    assert.deepEqual(result.dataModelMap['weather-widget'].weather, {
      cities: [
        { name: '杭州', temp: '26°' },
        { name: '北京', temp: '24°' },
      ],
    });
  });

  it('解析 nested-tree.json 得到多层嵌套节点', async () => {
    const result = parse(await readFile(nestedMockPath, 'utf8'));

    const surface = result.surfaceMap['mock-nested'];
    assert.ok(surface, '缺少 mock-nested');
    assert.equal(surface.beginRender, true);
    assert.equal(surface.rootNode.id, 'root');

    assert.deepEqual(Object.keys(result.hydrateNodeMap), [
      'root',
      'header',
      'content',
      'intro',
      'details',
      'detail-1',
      'detail-2',
      'detail-3',
      'footer',
    ]);

    const contentNode = result.hydrateNodeMap['content'];
    assert.ok(contentNode, '缺少 content 节点');
    assert.deepEqual(JSON.parse(contentNode.protocol ?? ''), {
      Column: {
        children: {
          explicitList: ['intro', 'details'],
        },
        distribution: 'start',
        alignment: 'stretch',
      },
    });

    const detailsNode = result.hydrateNodeMap['details'];
    assert.ok(detailsNode, '缺少 details 节点');
    assert.deepEqual(JSON.parse(detailsNode.protocol ?? ''), {
      Column: {
        children: {
          explicitList: ['detail-1', 'detail-2', 'detail-3'],
        },
        distribution: 'start',
        alignment: 'stretch',
      },
    });
  });

  it('解析 mixed-tree.json 得到 Column/Row/Text 混合节点', async () => {
    const result = parse(await readFile(mixedMockPath, 'utf8'));

    const surface = result.surfaceMap['mock-mixed'];
    assert.ok(surface, '缺少 mock-mixed');
    assert.equal(surface.beginRender, true);
    assert.equal(surface.rootNode.id, 'root');
    assert.equal(Object.keys(result.hydrateNodeMap).length, 14);

    const toolbar = result.hydrateNodeMap['toolbar'];
    assert.ok(toolbar, '缺少 toolbar 节点');
    assert.deepEqual(JSON.parse(toolbar.protocol ?? ''), {
      Row: {
        children: {
          explicitList: ['btn-a', 'btn-b', 'btn-c'],
        },
        distribution: 'spaceBetween',
        alignment: 'center',
      },
    });

    const stats = result.hydrateNodeMap['stats'];
    assert.ok(stats, '缺少 stats 节点');
    assert.deepEqual(JSON.parse(stats.protocol ?? ''), {
      Row: {
        children: {
          explicitList: ['stat-1', 'stat-2'],
        },
        distribution: 'spaceAround',
        alignment: 'center',
      },
    });
  });

  it('支持逐条 parseLine 并在 beginRendering 后生成 Surface', async () => {
    const jsonl = await readFile(nestedMockPath, 'utf8');
    const buffer = new JsonlBuffer();
    const lines = [...buffer.append(jsonl), ...buffer.flush()];

    const parser = createParser();
    const nodeCounts: number[] = [];
    const surfaceCounts: number[] = [];

    for (const line of lines) {
      const result = parser.parseLine(line);
      nodeCounts.push(Object.keys(result.hydrateNodeMap).length);
      surfaceCounts.push(Object.keys(result.surfaceMap).length);
    }

    assert.deepEqual(nodeCounts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
    assert.deepEqual(surfaceCounts, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

    const result = parser.getResult();
    const surface = result.surfaceMap['mock-nested'];
    assert.ok(surface, '缺少 mock-nested');
    assert.equal(surface.rootNode.id, 'root');

    parser.reset();
    assert.deepEqual(Object.keys(parser.getResult().surfaceMap), []);
    assert.deepEqual(Object.keys(parser.getResult().hydrateNodeMap), []);
  });

  it('使用 renderMap 渲染组件并写入 _vnode', async () => {
    const renderMap = {
      Text: (props: Record<string, unknown>) =>
        createElement(
          'strong',
          null,
          (props.text as { literalString: string }).literalString,
        ),
    };

    const result = parse(await loadMock(), renderMap);
    const node = result.hydrateNodeMap['root'];

    assert.ok(node, '缺少 id 为 root 的 HydrateNode');
    assert.equal(node._vnode.type, 'strong');

    const vnodeProps = node._vnode.props as { children: string };
    assert.deepEqual(vnodeProps.children, 'Hello, A2UI!');
  });

  it('调用 renderMap 时传入完整的组件属性', async () => {
    let received: Record<string, unknown> | undefined;

    const renderMap = {
      Text: (props: Record<string, unknown>) => {
        received = props;
        return createElement('span', null, 'rendered');
      },
    };

    await parse(await loadMock(), renderMap);

    assert.deepEqual(received, {
      text: {
        literalString: 'Hello, A2UI!',
      },
      usageHint: 'h2',
    });
  });

  it('按组件类型选择对应的 render', () => {
    const result = parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"text","component":{"Text":{"text":{"literalString":"hi"}}}},{"id":"card","component":{"Card":{"child":"text"}}}]}}',
      {
        Text: () => createElement('span'),
        Card: () => createElement('section'),
      },
    );

    const textNode = result.hydrateNodeMap['text'];
    const cardNode = result.hydrateNodeMap['card'];

    assert.ok(textNode, '缺少 text 节点');
    assert.ok(cardNode, '缺少 card 节点');
    assert.equal(textNode._vnode.type, 'span');
    assert.equal(cardNode._vnode.type, 'section');
  });

  it('renderMap 没有匹配项时回退为同名 React 元素', () => {
    const result = parse(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Unknown":{"foo":"bar"}}}]}}',
      {
        Text: () => createElement('span'),
      },
    );

    const node = result.hydrateNodeMap['root'];
    assert.ok(node, '缺少 root 节点');
    assert.equal(node._vnode.type, 'Unknown');
    assert.deepEqual(node._vnode.props, { foo: 'bar' });
  });

  it('同一个组件更新时重新调用 render 并替换 _vnode', () => {
    const calls: string[] = [];

    const renderMap = {
      Text: (props: Record<string, unknown>) => {
        const text = (props.text as { literalString: string }).literalString;
        calls.push(text);
        return createElement('span', null, text);
      },
    };

    const result = parse(
      [
        '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"literalString":"first"}}}}]}}',
        '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"literalString":"second"}}}}]}}',
      ].join('\n'),
      renderMap,
    );

    assert.deepEqual(calls, ['first', 'second']);

    const node = result.hydrateNodeMap['root'];
    assert.ok(node, '缺少 root 节点');

    const vnodeProps = node._vnode.props as { children: string };
    assert.equal(vnodeProps.children, 'second');
  });

  it('调用 renderMap 时传入 hasMounted 与 markMounted', async () => {
    let received: A2uiRenderContext | undefined;
    const marked: string[] = [];

    const renderMap = {
      Text: (_props: Record<string, unknown>, context: A2uiRenderContext) => {
        received = context;
        return createElement('span');
      },
    };

    parse(await loadMock(), renderMap, undefined, (id) => marked.push(id));

    assert.ok(received, 'renderMap 未收到上下文');
    assert.equal(received.hasMounted, false);
    assert.equal(received.id, 'root');
    assert.equal(received.surfaceId, 'mock-surface');

    received.markMounted();
    assert.deepEqual(marked, ['root']);
  });

  it('已有组件更新时保留 hasMounted 状态', () => {
    const parser = createParser();

    const first = parser.parseLine(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"literalString":"first"}}}}]}}',
    );

    const node = first.hydrateNodeMap['root'];
    assert.ok(node, '缺少 root 节点');
    assert.equal(node.hasMounted, false);

    node.hasMounted = true;

    parser.parseLine(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"literalString":"second"}}}}]}}',
    );

    const updated = parser.getResult().hydrateNodeMap['root'];
    assert.ok(updated, '缺少更新后的 root 节点');
    assert.equal(updated.hasMounted, true);
  });

  it('组件已注册时不会在 store 中产生错误', async () => {
    const renderMap = {
      Text: () => createElement('span'),
    };
    const store = init(renderMap);

    parse(await loadMock(), renderMap, store.getState().addError);

    assert.equal(store.getState().getError('root'), undefined);
  });

  it('组件未注册时在 store 中写入 RENDER_ERROR', async () => {
    const store = init();

    const result = parse(await loadMock(), {}, store.getState().addError);

    const error = store.getState().getError('root');
    assert.ok(error, 'root 节点缺少渲染错误');
    assert.equal(error.type, ErrorType.RENDER_ERROR);
    assert.match(error.content, /Text/);
    assert.match(error.content, /mock-surface/);
    assert.match(error.content, /root/);

    // 未注册时仍保留同名 React 元素作为兜底渲染
    const node = result.hydrateNodeMap['root'];
    assert.ok(node, '缺少 root 节点');
    assert.equal(node._vnode.type, 'Text');
  });

  it('处理 dataModelUpdate，并按 path 合并数据', () => {
    const result = parse(
      [
        '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"path":"/user/name"}}}}]}}',
        '{"dataModelUpdate":{"surfaceId":"s1","contents":[{"key":"user","valueMap":[{"key":"name","valueString":"Bob"}]}]}}',
        '{"dataModelUpdate":{"surfaceId":"s1","path":"/user","contents":[{"key":"age","valueNumber":30}]}}',
        '{"beginRendering":{"surfaceId":"s1","root":"root"}}',
      ].join('\n'),
    );

    assert.deepEqual(result.dataModelMap['s1'], {
      user: {
        name: 'Bob',
        age: 30,
      },
    });
  });

  it('处理 deleteSurface，只删除目标画布及其节点和数据', () => {
    const result = parse(
      [
        '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Text":{"text":{"literalString":"A"}}}}]}}',
        '{"dataModelUpdate":{"surfaceId":"s1","contents":[{"key":"x","valueString":"y"}]}}',
        '{"beginRendering":{"surfaceId":"s1","root":"root"}}',
        '{"surfaceUpdate":{"surfaceId":"s2","components":[{"id":"root2","component":{"Text":{"text":{"literalString":"B"}}}}]}}',
        '{"dataModelUpdate":{"surfaceId":"s2","contents":[{"key":"x","valueString":"y"}]}}',
        '{"beginRendering":{"surfaceId":"s2","root":"root2"}}',
        '{"deleteSurface":{"surfaceId":"s1"}}',
      ].join('\n'),
    );

    assert.deepEqual(Object.keys(result.surfaceMap), ['s2']);
    assert.deepEqual(Object.keys(result.hydrateNodeMap), ['root2']);
    assert.equal(result.dataModelMap['s1'], undefined);
    assert.deepEqual(result.dataModelMap['s2'], { x: 'y' });
  });
});
