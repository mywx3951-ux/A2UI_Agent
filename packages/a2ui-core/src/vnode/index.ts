// A2UI vnode：a2ui 协议组件到虚拟节点的映射与管理

import { createElement, type ReactElement } from 'react';

/** 组件渲染函数：接收协议属性，返回 React 实例 */
export type A2uiRender = (props: Record<string, unknown>) => ReactElement;

/** 组件名到渲染函数的映射 */
export type A2uiRenderMap = Record<string, A2uiRender>;

/**
 * 从 A2UI 的 component 包装对象创建虚拟节点。
 * 优先使用 renderMap 中对应的渲染函数；没有匹配项时退化为同名 React 元素。
 * component 必须且只能包含一个组件类型，例如 { Text: { ... } }。
 */
export function createVNode(
  component: Record<string, unknown>,
  renderMap: A2uiRenderMap = {},
  onMissingRenderer?: (componentType: string) => void,
): ReactElement {
  const entries = Object.entries(component);

  if (entries.length !== 1) {
    throw new Error('A2UI 组件必须且只能包含一个组件类型');
  }

  const [type, props] = entries[0];
  const componentProps = isPlainObject(props) ? props : {};
  const render = renderMap[type];

  if (!render) {
    onMissingRenderer?.(type);
    return createElement(type, componentProps);
  }

  return render(componentProps);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
