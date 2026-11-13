import assert from 'node:assert/strict';
import { cloneElement, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { A2uiRenderContext } from '@a2ui/core';
import { A2uiSurface, renderMap, triggerLocalAction } from '../src/index.js';

const DATA: Record<string, unknown> = {
  user: {
    name: 'Ada Lovelace',
    bio: 'Mathematician',
    dob: '1815-12-10',
    subscribed: true,
  },
  settings: { volume: 65 },
};

/** 构造与 Parser 相同语义的渲染上下文 */
function createContext(hasMounted = true): A2uiRenderContext {
  const resolve = <T,>(value: unknown): T | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;

    const bind = value as Record<string, unknown>;

    for (const key of [
      'literalString',
      'literalNumber',
      'literalBoolean',
      'literalArray',
    ]) {
      if (key in bind) return bind[key] as T;
    }

    if (typeof bind.path === 'string') {
      let current: unknown = DATA;

      for (const segment of bind.path.split('/').filter(Boolean)) {
        if (typeof current !== 'object' || current === null) return undefined;
        current = (current as Record<string, unknown>)[segment];
      }

      return current as T;
    }

    return undefined;
  };

  return {
    id: 'test',
    surfaceId: 's1',
    hasMounted,
    markMounted: () => {},
    resolve,
    updateModel: () => {},
  };
}

function render(
  name: string,
  props: Record<string, unknown>,
  children?: ReactNode,
  context: A2uiRenderContext = createContext(),
): string {
  const renderComponent = renderMap[name];
  assert.ok(renderComponent, `renderMap 缺少 ${name}`);

  const element = renderComponent(props, context);

  return renderToStaticMarkup(
    children === undefined ? element : cloneElement(element, {}, children),
  );
}

describe('renderMap – 组件渲染', () => {
  it('覆盖标准 Catalog 的 18 个组件与 OpenLink 扩展', () => {
    for (const name of [
      'Text',
      'Image',
      'Icon',
      'Video',
      'AudioPlayer',
      'Row',
      'Column',
      'List',
      'Card',
      'Tabs',
      'Divider',
      'Modal',
      'Button',
      'CheckBox',
      'TextField',
      'DateTimeInput',
      'MultipleChoice',
      'Slider',
      'OpenLink',
    ]) {
      assert.equal(typeof renderMap[name], 'function', `缺少组件 ${name}`);
    }

    assert.equal(Object.keys(renderMap).length, 19);
  });

  it('Text 支持 usageHint 与 path 绑定', () => {
    assert.match(
      render('Text', {
        text: { literalString: 'Hello' },
        usageHint: 'h1',
      }),
      /<h1[^>]*>Hello<\/h1>/,
    );

    assert.match(
      render('Text', { text: { path: '/user/name' }, usageHint: 'body' }),
      /<p[^>]*>Ada Lovelace<\/p>/,
    );
  });

  it('每个组件都支持 style 并覆盖默认样式', () => {
    assert.match(
      render('Text', {
        text: { literalString: 'Styled' },
        usageHint: 'h1',
        style: { color: '#ff0000', fontSize: 32 },
      }),
      /<h1[^>]*color:#ff0000[^>]*font-size:32px/,
    );

    const button = render(
      'Button',
      {
        primary: true,
        style: { backgroundColor: '#ff4d4f', borderRadius: 0 },
      },
      '提交',
    );
    assert.match(button, /background-color:#ff4d4f/);
    assert.match(button, /border-radius:0/);

    const column = render('Column', { style: { padding: 24, gap: 16 } }, 'child');
    assert.match(column, /padding:24px/);
    assert.match(column, /gap:16px/);
  });

  it('Image 渲染 src、alt 与 object-fit', () => {
    const html = render('Image', {
      url: { literalString: 'https://example.com/a.png' },
      altText: { literalString: 'cover' },
      fit: 'contain',
      usageHint: 'smallFeature',
    });

    assert.match(html, /src="https:\/\/example\.com\/a\.png"/);
    assert.match(html, /alt="cover"/);
    assert.match(html, /object-fit:contain/);
  });

  it('Icon 渲染内联 SVG，未知名称回退到 info', () => {
    assert.match(render('Icon', { name: { literalString: 'home' } }), /<svg/);
    assert.match(render('Icon', { name: { literalString: 'home' } }), /aria-label="home"/);
    assert.match(render('Icon', { name: { literalString: 'not-exist' } }), /aria-label="not-exist"/);
  });

  it('Video 与 AudioPlayer 渲染媒体元素', () => {
    assert.match(
      render('Video', { url: { literalString: 'https://example.com/v.mp4' } }),
      /<video[^>]+src="https:\/\/example\.com\/v\.mp4"/,
    );

    const audio = render('AudioPlayer', {
      url: { literalString: 'https://example.com/a.mp3' },
      description: { literalString: '示例音频' },
    });
    assert.match(audio, /<audio[^>]+src="https:\/\/example\.com\/a\.mp3"/);
    assert.match(audio, /示例音频/);
  });

  it('Column / Row / List 渲染为对应方向的 flex 容器', () => {
    assert.match(
      render('Column', { distribution: 'center', alignment: 'end' }, 'child'),
      /flex-direction:column/,
    );
    assert.match(
      render('Row', { distribution: 'spaceBetween', alignment: 'center' }, 'child'),
      /flex-direction:row/,
    );
    assert.match(
      render('List', { direction: 'horizontal', alignment: 'start' }, 'child'),
      /flex-direction:row/,
    );
  });

  it('Card 渲染传入的子节点', () => {
    assert.match(render('Card', {}, 'card content'), /card content/);
  });

  it('Tabs 依次渲染标题与子节点', () => {
    const html = render(
      'Tabs',
      {
        tabItems: [
          { title: { literalString: 'Overview' }, child: 'a' },
          { title: { literalString: 'Details' }, child: 'b' },
        ],
      },
      [createElement('span', { key: 'a' }, 'A'), createElement('span', { key: 'b' }, 'B')],
    );

    assert.match(html, /Overview/);
    assert.match(html, /Details/);
    assert.match(html, />A</);
    assert.match(html, />B</);
  });

  it('Divider 渲染分隔线', () => {
    assert.match(render('Divider', { axis: 'horizontal' }), /<hr/);
    assert.match(render('Divider', { axis: 'vertical' }), /aria-orientation="vertical"/);
  });

  it('Modal 渲染入口与内容子节点', () => {
    const html = render('Modal', {}, [
      createElement('span', { key: 'entry' }, 'entry'),
      createElement('span', { key: 'content' }, 'content'),
    ]);

    assert.match(html, /entry/);
    assert.match(html, /content/);
    assert.match(html, /Modal 内容预览/);
  });

  it('Button 渲染 primary 样式与子节点', () => {
    const html = render(
      'Button',
      { primary: true, action: { name: 'open_modal' } },
      '打开弹窗',
    );

    assert.match(html, /打开弹窗/);
    assert.ok(html.includes('background:var(--a2ui-primary-color, #1677ff)'));
    assert.match(html, /data-action="open_modal"/);
    assert.match(html, /data-action-type="server"/);
  });

  it('localDataModelUpdate 按 path + contents 调用 updateModel', () => {
    const calls: Array<[string, unknown]> = [];
    const context = createContext();

    context.updateModel = (path, value) => {
      calls.push([path, value]);
    };

    const applied = triggerLocalAction(
      {
        name: 'updateDemoLine',
        localDataModelUpdate: {
          surfaceId: 's1',
          path: '/demo',
          contents: [
            { key: 'line', valueString: '已更新' },
            {
              key: 'meta',
              valueMap: [
                { key: 'count', valueNumber: 2 },
                { key: 'active', valueBoolean: true },
              ],
            },
          ],
        },
      },
      context,
    );

    assert.equal(applied, 3);
    assert.deepEqual(calls, [
      ['/demo/line', '已更新'],
      ['/demo/meta/count', 2],
      ['/demo/meta/active', true],
    ]);
  });

  it('surfaceId 不匹配或畸形 contents 不写模型', () => {
    const calls: Array<[string, unknown]> = [];
    const context = createContext();

    context.updateModel = (path, value) => {
      calls.push([path, value]);
    };

    assert.equal(triggerLocalAction({ name: 'server_action' }, context), 0);
    assert.equal(
      triggerLocalAction(
        {
          name: 'other_surface',
          localDataModelUpdate: {
            surfaceId: 'other',
            path: '/demo',
            contents: [{ key: 'line', valueString: 'x' }],
          },
        },
        context,
      ),
      0,
    );
    assert.equal(
      triggerLocalAction(
        {
          name: 'missing_contents',
          localDataModelUpdate: { surfaceId: 's1' },
        },
        context,
      ),
      0,
    );
    assert.equal(
      triggerLocalAction(
        {
          name: 'malformed',
          localDataModelUpdate: {
            surfaceId: 's1',
            path: '/demo',
            contents: [{ key: '', valueString: 'x' }, { key: 'empty' }],
          },
        },
        context,
      ),
      0,
    );
    assert.deepEqual(calls, []);
  });

  it('Button localDataModelUpdate 渲染 type 标记', () => {
    const html = render(
      'Button',
      {
        action: {
          name: 'updateDemoLine',
          localDataModelUpdate: {
            surfaceId: 's1',
            path: '/demo',
            contents: [{ key: 'line', valueString: '已更新' }],
          },
        },
      },
      '本地更新',
    );

    assert.match(html, /data-action-type="local"/);
  });

  it('OpenLink 渲染外部链接并在新标签页打开', () => {
    const html = render('OpenLink', {
      url: { literalString: 'https://a2ui.org' },
      text: { literalString: '打开 A2UI 官网' },
    });

    assert.match(html, /href="https:\/\/a2ui\.org"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /打开 A2UI 官网/);
  });

  it('CheckBox 依据绑定值渲染选中态', () => {
    const checked = render('CheckBox', {
      label: { literalString: '订阅' },
      value: { path: '/user/subscribed' },
    });
    assert.match(checked, /checked=""/);
    assert.match(checked, /订阅/);

    const unchecked = render('CheckBox', {
      label: { literalString: '试用' },
      value: { literalBoolean: false },
    });
    assert.doesNotMatch(unchecked, /checked=""/);
  });

  it('TextField 支持长短文本与只读值', () => {
    const short = render('TextField', {
      label: { literalString: '用户名' },
      text: { path: '/user/name' },
      textFieldType: 'shortText',
    });
    assert.match(short, /value="Ada Lovelace"/);
    assert.match(short, /readOnly/);

    const long = render('TextField', {
      label: { literalString: '简介' },
      text: { path: '/user/bio' },
      textFieldType: 'longText',
    });
    assert.match(long, /<textarea/);
    assert.match(long, /Mathematician/);
  });

  it('DateTimeInput 按 enableDate / enableTime 选择输入类型', () => {
    const date = render('DateTimeInput', {
      value: { path: '/user/dob' },
      enableDate: true,
      enableTime: false,
    });

    assert.match(date, /type="date"/);
    assert.match(date, /value="1815-12-10"/);
  });

  it('MultipleChoice 支持 chips 选中态', () => {
    const html = render('MultipleChoice', {
      selections: { literalArray: ['email'] },
      options: [
        { label: { literalString: '邮件' }, value: 'email' },
        { label: { literalString: '短信' }, value: 'sms' },
      ],
      variant: 'chips',
    });

    assert.match(html, /邮件/);
    assert.match(html, /短信/);
    assert.ok(html.includes('background:var(--a2ui-primary-soft, #e6f4ff)'));
  });

  it('Slider 渲染标签、数值与范围', () => {
    const html = render('Slider', {
      label: { literalString: '音量' },
      value: { path: '/settings/volume' },
      minValue: 0,
      maxValue: 100,
    });

    assert.match(html, /音量/);
    assert.match(html, />65</);
    assert.match(html, /value="65"/);
    assert.match(html, /max="100"/);
  });

  it('A2uiSurface 把 styles 注入为 CSS 变量与字体', () => {
    const html = renderToStaticMarkup(
      createElement(
        A2uiSurface,
        { styles: { primaryColor: '#ff0000', font: 'Georgia, serif' } },
        createElement('span', null, 'themed'),
      ),
    );

    assert.match(html, /--a2ui-primary-color:#ff0000/);
    assert.match(html, /--a2ui-primary-soft:rgba\(255, 0, 0, 0.12\)/);
    assert.match(html, /font-family:Georgia, serif/);
  });

  it('未完成挂载动画的组件带 a2ui-stream-fade 类', () => {
    const html = render(
      'Text',
      { text: { literalString: 'Hello' } },
      undefined,
      createContext(false),
    );

    assert.match(html, /class="a2ui-stream-fade"/);
  });
});
