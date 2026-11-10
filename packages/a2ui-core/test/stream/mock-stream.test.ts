import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JsonlBuffer } from '../../src/buffer/index.js';
import { createParser, type A2uiParser } from '../../src/parser/index.js';

const nestedMockPath = fileURLToPath(
  new URL('../../Mock/nested-tree.json', import.meta.url),
);

/** 模拟 playground 的流式输出：每 50 个字符一块 */
const CHUNK_SIZE = 50;

function createChunks(jsonl: string, chunkSize = CHUNK_SIZE): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < jsonl.length; index += chunkSize) {
    chunks.push(jsonl.slice(index, index + chunkSize));
  }

  return chunks;
}

interface StreamProgress {
  nodes: number;
  surfaces: number;
}

/**
 * 将分块依次送入 JsonlBuffer，再把 buffer 产出的完整 JSONL 交给 Parser。
 * 返回实际解析的消息和每条消息解析后的节点/画布数量。
 */
function feedStream(
  chunks: string[],
  buffer: JsonlBuffer,
  parser: A2uiParser,
): { lines: string[]; progress: StreamProgress[] } {
  const lines: string[] = [];
  const progress: StreamProgress[] = [];

  const consume = (completed: string[]) => {
    for (const line of completed) {
      lines.push(line);

      const result = parser.parseLine(line);
      progress.push({
        nodes: Object.keys(result.hydrateNodeMap).length,
        surfaces: Object.keys(result.surfaceMap).length,
      });
    }
  };

  for (const chunk of chunks) {
    consume(buffer.append(chunk));
  }

  consume(buffer.flush());

  return { lines, progress };
}

describe('Mock stream → JsonlBuffer → Parser', () => {
  it('将 nested-tree mock 按 50 字符分块流入并逐条解析', async () => {
    const jsonl = await readFile(nestedMockPath, 'utf8');
    const chunks = createChunks(jsonl);
    const buffer = new JsonlBuffer();
    const parser = createParser();

    const { lines, progress } = feedStream(chunks, buffer, parser);

    assert.ok(
      chunks.length > lines.length,
      '50 字符分块应跨越 JSON 边界，而不是一块对应一条消息',
    );
    assert.equal(lines.length, 10);

    assert.deepEqual(
      progress.map((item) => item.nodes),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 9],
    );
    assert.deepEqual(
      progress.map((item) => item.surfaces),
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    );

    const result = parser.getResult();
    assert.equal(Object.keys(result.hydrateNodeMap).length, 9);

    const surface = result.surfaceMap['mock-nested'];
    assert.ok(surface, '缺少 mock-nested');
    assert.equal(surface.rootNode.id, 'root');
  });

  it('mock stream 中的多组件 surfaceUpdate 会被拆成独立消息', () => {
    const raw =
      JSON.stringify({
        surfaceUpdate: {
          surfaceId: 'mock-multi',
          components: [
            { id: 'a', component: { Text: { text: { literalString: 'A' } } } },
            { id: 'b', component: { Text: { text: { literalString: 'B' } } } },
            { id: 'c', component: { Text: { text: { literalString: 'C' } } } },
          ],
        },
      }) +
      JSON.stringify({
        beginRendering: { surfaceId: 'mock-multi', root: 'a' },
      });

    const chunks = createChunks(raw);
    const buffer = new JsonlBuffer();
    const parser = createParser();

    const { lines, progress } = feedStream(chunks, buffer, parser);

    // 3 条拆分后的 surfaceUpdate + 1 条 beginRendering
    assert.equal(lines.length, 4);

    const messages = lines.map((line) => JSON.parse(line));
    const surfaceUpdates = messages.filter(
      (message) => 'surfaceUpdate' in message,
    );

    assert.equal(surfaceUpdates.length, 3);

    for (const message of surfaceUpdates) {
      assert.equal(message.surfaceUpdate.components.length, 1);
    }

    assert.deepEqual(
      progress.slice(0, 3).map((item) => item.nodes),
      [1, 2, 3],
    );

    const result = parser.getResult();
    assert.deepEqual(
      Object.keys(result.hydrateNodeMap).sort(),
      ['a', 'b', 'c'],
    );

    const surface = result.surfaceMap['mock-multi'];
    assert.ok(surface, '缺少 mock-multi');
    assert.equal(surface.rootNode.id, 'a');
  });

  it('未闭合 JSON 不会提前交给 Parser', () => {
    const raw =
      '{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"a","component":{"Text":{"text":{"literalString":"A"}}}}]}}';
    const splitAt = raw.indexOf(']}}');

    const buffer = new JsonlBuffer();
    const parser = createParser();

    const first = buffer.append(raw.slice(0, splitAt));
    assert.deepEqual(first, []);
    assert.equal(parser.getResult().hydrateNodeMap.a, undefined);

    const second = buffer.append(raw.slice(splitAt));
    assert.equal(second.length, 1);

    const result = parser.parseLine(second[0]);
    assert.ok(result.hydrateNodeMap.a, '补全后应解析出节点 a');
  });
});
