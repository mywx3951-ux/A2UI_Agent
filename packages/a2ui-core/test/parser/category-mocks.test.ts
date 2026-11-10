import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from '../../src/parser/index.js';

function mockPath(name: string): string {
  return fileURLToPath(new URL(`../../Mock/${name}`, import.meta.url));
}

function componentTypes(protocols: string[]): Set<string> {
  return new Set(
    protocols.map(
      (protocol) => Object.keys(JSON.parse(protocol) as Record<string, unknown>)[0],
    ),
  );
}

const CASES = [
  {
    file: 'display-components.json',
    surfaceId: 'mock-display',
    types: [
      'AudioPlayer',
      'Column',
      'Divider',
      'Icon',
      'Image',
      'Row',
      'Text',
      'Video',
    ],
  },
  {
    file: 'container-components.json',
    surfaceId: 'mock-containers',
    types: [
      'Button',
      'Card',
      'Column',
      'Divider',
      'List',
      'Modal',
      'Row',
      'Tabs',
      'Text',
    ],
  },
  {
    file: 'form-components.json',
    surfaceId: 'mock-forms',
    types: [
      'Button',
      'CheckBox',
      'Column',
      'DateTimeInput',
      'Divider',
      'MultipleChoice',
      'Slider',
      'Text',
      'TextField',
    ],
  },
];

describe('Mock – 分类组件数据', () => {
  for (const testCase of CASES) {
    it(`${testCase.file} 只包含本类组件`, async () => {
      const parsed = parse(await readFile(mockPath(testCase.file), 'utf8'));
      const surface = parsed.surfaceMap[testCase.surfaceId];

      assert.ok(surface, `缺少 ${testCase.surfaceId}`);
      assert.equal(surface.rootNode.id, 'root');

      const protocols = Object.values(parsed.hydrateNodeMap).map(
        (node) => node.protocol ?? '',
      );

      assert.deepEqual(
        [...componentTypes(protocols)].sort(),
        [...testCase.types].sort(),
      );
    });
  }

  it('三个分类合并后覆盖标准 Catalog 的 18 个组件', async () => {
    const all = new Set<string>();

    for (const testCase of CASES) {
      const parsed = parse(await readFile(mockPath(testCase.file), 'utf8'));

      for (const node of Object.values(parsed.hydrateNodeMap)) {
        all.add(Object.keys(JSON.parse(node.protocol ?? '{}') as Record<string, unknown>)[0]);
      }
    }

    assert.equal(all.size, 18);
  });

  it('表单类 Mock 的数据模型可供 path 绑定解析', async () => {
    const parsed = parse(await readFile(mockPath('form-components.json'), 'utf8'));
    const model = parsed.dataModelMap['mock-forms'];

    assert.ok(model, '缺少 mock-forms 数据模型');

    const user = model.user as Record<string, unknown>;
    const settings = model.settings as Record<string, unknown>;

    assert.equal(user.name, 'Ada Lovelace');
    assert.equal(user.subscribed, true);
    assert.equal(settings.volume, 65);
  });
});
