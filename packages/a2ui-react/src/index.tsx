// @a2ui/react：基于 React 的 a2ui 协议渲染引擎

import type { ReactElement } from 'react';
import type { A2uiRenderMap } from '@a2ui/core';

interface TextProps {
  text?: {
    literalString?: string;
    path?: string;
  };
  usageHint?: string;
}

/** A2UI Text 组件的 React 渲染实现 */
export function Text(props: Record<string, unknown>): ReactElement {
  const { text, usageHint } = props as TextProps;
  const content = text?.literalString ?? '';

  switch (usageHint) {
    case 'h1':
      return <h1>{content}</h1>;
    case 'h2':
      return <h2>{content}</h2>;
    case 'h3':
      return <h3>{content}</h3>;
    case 'h4':
      return <h4>{content}</h4>;
    case 'h5':
      return <h5>{content}</h5>;
    case 'caption':
      return <small>{content}</small>;
    case 'body':
      return <p>{content}</p>;
    default:
      return <span>{content}</span>;
  }
}

/** A2UI 组件名到 React 渲染函数的映射 */
export const renderMap: A2uiRenderMap = {
  Text,
};
