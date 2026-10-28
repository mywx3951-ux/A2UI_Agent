import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from '../../src/parser/index.js';
import { treeBuild } from '../../src/treebuilder/index.js';

const mockPath = fileURLToPath(
  new URL('../../Mock/simple-text.jsonl', import.meta.url),
);

describe('treeBuild', () => {
  it('将 Surface 的根节点组装为组件树', async () => {
    const parsed = parse(await readFile(mockPath, 'utf8'));
    const surface = parsed.surfaceMap['mock-surface'];
    assert.ok(surface, '缺少 mock-surface');

    const tree = treeBuild(surface, parsed.hydrateNodeMap);

    assert.equal(tree.id, 'root');
    assert.equal(tree.surfaceId, 'mock-surface');
    assert.equal(tree.vnode.type, 'Text');
    assert.deepEqual(tree.children, []);
  });
});
