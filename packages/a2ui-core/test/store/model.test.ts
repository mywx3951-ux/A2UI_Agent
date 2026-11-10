import assert from 'node:assert/strict';
import {
  getBindingPath,
  getLiteralValue,
  getModelValue,
  setModelValue,
} from '../../src/store/model.js';

describe('数据模型路径工具', () => {
  it('按对象路径读取', () => {
    assert.equal(getModelValue({ user: { name: 'Ada' } }, '/user/name'), 'Ada');
  });

  it('按数组下标读取', () => {
    const model = { items: [{ label: 'A' }, { label: 'B' }] };

    assert.equal(getModelValue(model, '/items/1/label'), 'B');
  });

  it('不存在的路径返回 undefined', () => {
    assert.equal(getModelValue({ user: {} }, '/user/name'), undefined);
    assert.equal(getModelValue({ items: [] }, '/items/0'), undefined);
    assert.equal(getModelValue(undefined, '/a'), undefined);
    assert.equal(getModelValue({ a: 1 }, '/a/b'), undefined);
  });

  it('按对象路径写入且保持不可变', () => {
    const before = { user: { name: 'Ada' }, other: { keep: true } };
    const after = setModelValue(before, '/user/name', 'Grace');

    assert.deepEqual(after, {
      user: { name: 'Grace' },
      other: { keep: true },
    });
    assert.deepEqual(before, { user: { name: 'Ada' }, other: { keep: true } });
    assert.notEqual(after.user, before.user);
    assert.equal(after.other, before.other);
  });

  it('按数组下标写入且保持不可变', () => {
    const before = { items: [{ label: 'A' }, { label: 'B' }] };
    const after = setModelValue(before, '/items/1/label', 'BB');

    assert.deepEqual(after, { items: [{ label: 'A' }, { label: 'BB' }] });
    assert.deepEqual(before, { items: [{ label: 'A' }, { label: 'B' }] });
    assert.notEqual(after.items, before.items);
    assert.equal(after.items[0], before.items[0]);
  });

  it('缺失的中间层级会自动创建', () => {
    assert.deepEqual(setModelValue({}, '/settings/volume', 65), {
      settings: { volume: 65 },
    });
  });

  it('根路径在值为对象时替换整份模型', () => {
    assert.deepEqual(setModelValue({ a: 1 }, '/', { b: 2 }), { b: 2 });
  });

  it('根路径的值不是对象时保持原模型', () => {
    const model = { a: 1 };

    assert.equal(setModelValue(model, '/', 'x'), model);
  });

  it('getLiteralValue 支持全部字面量类型', () => {
    assert.equal(getLiteralValue({ literalString: 'a' }), 'a');
    assert.equal(getLiteralValue({ literalNumber: 1 }), 1);
    assert.equal(getLiteralValue({ literalBoolean: true }), true);
    assert.deepEqual(getLiteralValue({ literalArray: ['x'] }), ['x']);
    assert.equal(getLiteralValue({ path: '/a' }), undefined);
    assert.equal(getLiteralValue('a'), undefined);
  });

  it('getBindingPath 只识别字符串 path', () => {
    assert.equal(getBindingPath({ path: '/a' }), '/a');
    assert.equal(getBindingPath({ literalString: 'a' }), undefined);
    assert.equal(getBindingPath({ path: 1 }), undefined);
  });
});
