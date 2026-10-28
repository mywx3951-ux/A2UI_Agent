import assert from 'node:assert/strict';
import { createElement } from 'react';
import { ErrorType, init } from '../src/store/index.js';

describe('init', () => {
  it('初始化三个空的 Map', () => {
    const state = init().getState();

    assert.deepStrictEqual(state.surfaceMap, {});
    assert.deepStrictEqual(state.hydrateNodeMap, {});
    assert.deepStrictEqual(state.errorMap, {});
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
      'addError',
      'updateError',
      'removeError',
      'getError',
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

  it('每次初始化返回相互独立的 Store', () => {
    const first = init();
    const second = init();

    first.getState().addError('error-1', {
      type: ErrorType.PARSE_ERROR,
      content: '解析失败',
    });

    assert.deepStrictEqual(second.getState().errorMap, {});
  });
});
