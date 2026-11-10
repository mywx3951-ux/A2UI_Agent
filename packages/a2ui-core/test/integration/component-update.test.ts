import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JsonlBuffer } from '../../src/buffer/index.js';
import { createParser } from '../../src/parser/index.js';

const initialMockPath = fileURLToPath(
  new URL('../../Mock/component-update-initial.json', import.meta.url),
);

const patchMockPath = fileURLToPath(
  new URL('../../Mock/component-update-patch.json', import.meta.url),
);

function toLines(json: string): string[] {
  const buffer = new JsonlBuffer();
  return [...buffer.append(json), ...buffer.flush()];
}

describe('端到端：增量组件更新', () => {
  it('补丁只替换目标节点，其余节点保持原对象', async () => {
    const parser = createParser();

    for (const line of toLines(await readFile(initialMockPath, 'utf8'))) {
      parser.parseLine(line);
    }

    const before = { ...parser.getResult().hydrateNodeMap };

    assert.deepEqual(Object.keys(before).sort(), [
      'footer-text',
      'note-text',
      'price-text',
      'root',
      'title',
    ]);

    for (const line of toLines(await readFile(patchMockPath, 'utf8'))) {
      parser.parseLine(line);
    }

    const after = parser.getResult().hydrateNodeMap;

    // 被更新的节点换了新对象
    assert.notEqual(after['price-text'], before['price-text']);
    assert.notEqual(after.root, before.root);

    // 未涉及的节点对象引用保持不变
    assert.equal(after.title, before.title);
    assert.equal(after['note-text'], before['note-text']);
    assert.equal(after['footer-text'], before['footer-text']);

    // 新增节点
    assert.ok(after['notice-text'], '缺少 notice-text');
    assert.equal(before['notice-text'], undefined);
  });

  it('补丁后价格文案更新，且根节点引用新组件', async () => {
    const parser = createParser();

    for (const line of toLines(await readFile(initialMockPath, 'utf8'))) {
      parser.parseLine(line);
    }

    const initialRoot = parser.getResult().hydrateNodeMap.root;
    assert.match(
      initialRoot.protocol ?? '',
      /"explicitList":\["title","price-text","note-text","footer-text"\]/,
    );

    for (const line of toLines(await readFile(patchMockPath, 'utf8'))) {
      parser.parseLine(line);
    }

    const result = parser.getResult();

    assert.match(
      result.hydrateNodeMap['price-text'].protocol ?? '',
      /价格：¥32（已更新）/,
    );

    assert.match(
      result.hydrateNodeMap.root.protocol ?? '',
      /"explicitList":\["title","price-text","notice-text","note-text","footer-text"\]/,
    );

    // 画布、节点总数：初始 5 个 + 新增 1 个
    assert.equal(Object.keys(result.hydrateNodeMap).length, 6);
    assert.equal(result.surfaceMap['mock-update'].rootNode.id, 'root');
  });
});
