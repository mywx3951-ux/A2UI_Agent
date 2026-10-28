import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { parse } from '../../src/parser/index.js';
import { ErrorType, init } from '../../src/store/index.js';

const mockPath = fileURLToPath(
  new URL('../../Mock/simple-text.jsonl', import.meta.url),
);

async function loadMock(): Promise<string> {
  return readFile(mockPath, 'utf8');
}

describe('Parser', () => {
  it('解析 simple-text.jsonl 得到对应的 Surface', async () => {
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

  it('解析 simple-text.jsonl 得到对应的 HydrateNode', async () => {
    const result = parse(await loadMock());

    assert.deepEqual(Object.keys(result.hydrateNodeMap), ['root']);

    const node = result.hydrateNodeMap['root'];
    assert.ok(node, '缺少 id 为 root 的 HydrateNode');
    assert.equal(node.id, 'root');
    assert.equal(node.surfaceId, 'mock-surface');

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
