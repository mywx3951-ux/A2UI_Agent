import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JsonlBuffer } from '../../src/buffer/index.js';

const nestedMockPath = fileURLToPath(
  new URL('../../Mock/nested-tree.json', import.meta.url),
);

describe('JsonlBuffer', () => {
  it('从分块中提取完整 JSON 对象，并保留未完成的部分', () => {
    const buffer = new JsonlBuffer();

    assert.deepEqual(buffer.append('{"a":1}\n{"b":2'), ['{"a":1}']);
    assert.equal(buffer.pending, '{"b":2');

    assert.deepEqual(buffer.append('}\n'), ['{"b":2}']);
    assert.equal(buffer.pending, '');
  });

  it('支持任意分块和 CRLF', () => {
    const buffer = new JsonlBuffer();
    const lines: string[] = [];

    lines.push(...buffer.append('{"a":'));
    lines.push(...buffer.append('1}\r\n{"b":2}\r'));
    lines.push(...buffer.append('\n'));

    assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
  });

  it('忽略空行和纯空白分块', () => {
    const buffer = new JsonlBuffer();

    assert.deepEqual(buffer.append('\n  \n{"a":1}\n'), ['{"a":1}']);
    assert.deepEqual(buffer.append(' \n\t'), []);
  });

  it('完整对象无需换行也会在 append 时输出', () => {
    const buffer = new JsonlBuffer();

    assert.deepEqual(buffer.append('{"a":1}'), ['{"a":1}']);
    assert.deepEqual(buffer.flush(), []);
    assert.equal(buffer.pending, '');
  });

  it('flush 遇到未完成 JSON 时报错', () => {
    const buffer = new JsonlBuffer();

    buffer.append('{"a":');

    assert.throws(() => buffer.flush(), /未完成/);
  });

  it('reset 清空缓冲区', () => {
    const buffer = new JsonlBuffer();

    buffer.append('{"a":');
    buffer.reset();

    assert.equal(buffer.pending, '');
    assert.deepEqual(buffer.append('{"a":1}'), ['{"a":1}']);
  });

  it('没有换行的多个 JSON 对象也能切分', () => {
    const buffer = new JsonlBuffer();

    assert.deepEqual(buffer.append('{"a":1}{"b":2}'), ['{"a":1}', '{"b":2}']);
  });

  it('字符串中的括号不会影响 JSON 边界识别', () => {
    const buffer = new JsonlBuffer();
    const message = JSON.stringify({
      surfaceUpdate: {
        surfaceId: 's1',
        components: [
          {
            id: 'a',
            component: {
              Text: { text: { literalString: 'brace } and { and quote "' } },
            },
          },
        ],
      },
    });

    assert.deepEqual(buffer.append(message), [message]);
  });

  it('不完整的 JSON 在后续分块补全后才输出', () => {
    const buffer = new JsonlBuffer();

    const first = buffer.append(
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"a","component":{"Text":{"text":{"literalString":"A"}}}}',
    );

    assert.deepEqual(first, []);
    assert.ok(buffer.pending.includes('"a"'));

    const second = buffer.append(']}}');

    assert.equal(second.length, 1);

    const parsed = JSON.parse(second[0]) as {
      surfaceUpdate: { components: Array<{ id: string }> };
    };
    assert.equal(parsed.surfaceUpdate.components[0].id, 'a');
    assert.equal(buffer.pending, '');
  });

  it('surfaceUpdate 包含多个 component 时拆分为独立 JSONL', () => {
    const buffer = new JsonlBuffer();
    const message = {
      surfaceUpdate: {
        surfaceId: 's1',
        components: [
          { id: 'a', component: { Text: { text: { literalString: 'A' } } } },
          { id: 'b', component: { Text: { text: { literalString: 'B' } } } },
          { id: 'c', component: { Text: { text: { literalString: 'C' } } } },
        ],
      },
    };

    const lines = buffer.append(JSON.stringify(message));

    assert.equal(lines.length, 3);

    const parsed = lines.map(
      (line) =>
        JSON.parse(line) as {
          surfaceUpdate: {
            surfaceId: string;
            components: Array<{ id: string }>;
          };
        },
    );

    for (const item of parsed) {
      assert.equal(item.surfaceUpdate.surfaceId, 's1');
      assert.equal(item.surfaceUpdate.components.length, 1);
    }

    assert.deepEqual(
      parsed.map((item) => item.surfaceUpdate.components[0].id),
      ['a', 'b', 'c'],
    );
  });

  it('切分 nested-tree.json 得到 9 条 surfaceUpdate 和 1 条 beginRendering', async () => {
    const buffer = new JsonlBuffer();
    const jsonl = await readFile(nestedMockPath, 'utf8');

    const lines = [...buffer.append(jsonl), ...buffer.flush()];
    assert.equal(lines.length, 10);

    const messages = lines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );

    assert.equal(
      messages.filter((message) => 'surfaceUpdate' in message).length,
      9,
    );
    assert.equal(
      messages.filter((message) => 'beginRendering' in message).length,
      1,
    );
  });

  it('JSON 数组按元素逐条输出', () => {
    const buffer = new JsonlBuffer();

    assert.deepEqual(buffer.append('[{"a":1},{"b":2}]'), ['{"a":1}', '{"b":2}']);
    assert.equal(buffer.pending, '');
  });

  it('JSON 数组分块时元素完成即输出，无需等待整个数组', () => {
    const buffer = new JsonlBuffer();
    const lines: string[] = [];

    lines.push(...buffer.append('[{"a":1},'));
    assert.deepEqual(lines, ['{"a":1}']);

    lines.push(...buffer.append('{"b":2'));
    assert.deepEqual(lines, ['{"a":1}']);

    lines.push(...buffer.append('}]'));
    assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
    assert.equal(buffer.pending, '');
  });

  it('未闭合的 JSON 数组在 flush 时报错', () => {
    const buffer = new JsonlBuffer();

    buffer.append('[{"a":1},');

    assert.throws(() => buffer.flush(), /未完成/);
  });

  it('reset 会重置数组模式', () => {
    const buffer = new JsonlBuffer();

    buffer.append('[');
    buffer.reset();

    assert.deepEqual(buffer.append('{"a":1}'), ['{"a":1}']);
  });

  it('数组中的多组件 surfaceUpdate 同样拆分为独立消息', () => {
    const buffer = new JsonlBuffer();
    const message = {
      surfaceUpdate: {
        surfaceId: 's1',
        components: [
          { id: 'a', component: { Text: { text: { literalString: 'A' } } } },
          { id: 'b', component: { Text: { text: { literalString: 'B' } } } },
        ],
      },
    };

    const lines = buffer.append(JSON.stringify([message]));

    assert.equal(lines.length, 2);
    assert.deepEqual(
      lines.map(
        (line) =>
          (
            JSON.parse(line) as {
              surfaceUpdate: { components: Array<{ id: string }> };
            }
          ).surfaceUpdate.components[0].id,
      ),
      ['a', 'b'],
    );
  });
});
