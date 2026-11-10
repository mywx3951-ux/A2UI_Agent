import assert from 'node:assert/strict';
import { createElement } from 'react';
import { ErrorType, init } from '../src/store/index.js';

describe('init', () => {
  it('初始化三个空的 Map 与空数据模型', () => {
    const state = init().getState();

    assert.deepStrictEqual(state.surfaceMap, {});
    assert.deepStrictEqual(state.hydrateNodeMap, {});
    assert.deepStrictEqual(state.errorMap, {});
    assert.deepStrictEqual(state.dataModelMap, {});
  });

  it('初始化全部 CRUD 方法', () => {
    const state = init().getState();
    const methods = [
      'addSurface',
      'updateSurface',
      'removeSurface',
      'getSurface',
      'addHydrateNode',
      'updateHydrateNode',
      'removeHydrateNode',
      'getHydrateNode',
      'markHydrateNodeMounted',
      'addError',
      'updateError',
      'removeError',
      'getError',
      'setDataModel',
      'getDataModel',
      'removeDataModel',
      'updateModel',
    ] as const;

    for (const method of methods) {
      assert.equal(typeof state[method], 'function', `${method} 未初始化`);
    }
  });

  it('保存传入的 renderMap', () => {
    const renderMap = {
      Text: () => createElement('span'),
    };

    const state = init(renderMap).getState();

    assert.equal(state.renderMap, renderMap);
  });

  it('保存传入的 renderTree', () => {
    const renderTree = () => {};

    const state = init({}, renderTree).getState();

    assert.equal(state.renderTree, renderTree);
  });

  it('将 hydrateNode 标记为已挂载', () => {
    const store = init();

    store.getState().addHydrateNode({
      id: 'node-1',
      _vnode: createElement('span'),
      surfaceId: 's1',
      hasMounted: false,
    });

    store.getState().markHydrateNodeMounted('node-1');

    assert.equal(store.getState().getHydrateNode('node-1')?.hasMounted, true);
  });

  it('每次初始化返回相互独立的 Store', () => {
    const first = init();
    const second = init();

    first.getState().addError('error-1', {
      type: ErrorType.PARSE_ERROR,
      content: '解析失败',
    });

    assert.deepStrictEqual(second.getState().errorMap, {});
  });

  it('按路径更新数据模型且保持不可变', () => {
    const store = init();
    store.getState().setDataModel('s1', { user: { name: 'Ada' } });

    const before = store.getState().getDataModel('s1');
    store.getState().updateModel('s1', '/user/name', 'Grace');
    store.getState().updateModel('s1', '/settings/volume', 65);

    const after = store.getState().getDataModel('s1');

    assert.deepStrictEqual(before, { user: { name: 'Ada' } });
    assert.deepStrictEqual(after, {
      user: { name: 'Grace' },
      settings: { volume: 65 },
    });
  });

  it('updateModel 后重新渲染组件树', () => {
    const rendered: unknown[] = [];
    const store = init({}, (tree) => rendered.push(tree));

    store.getState().setDataModel('s1', {});
    store.getState().updateModel('s1', '/user/name', 'Grace');

    // 没有 surface 时 renderTree 收到 null
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0], null);
  });

  it('可以删除某个画布的数据模型', () => {
    const store = init();
    store.getState().setDataModel('s1', { a: 1 });
    store.getState().setDataModel('s2', { b: 2 });

    store.getState().removeDataModel('s1');

    assert.equal(store.getState().getDataModel('s1'), undefined);
    assert.deepStrictEqual(store.getState().getDataModel('s2'), { b: 2 });
  });
});
