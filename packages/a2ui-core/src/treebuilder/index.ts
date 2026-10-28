// A2UI treebuilder：根据协议构建渲染树

import type { ReactElement } from 'react';
import type { HydrateNode, Surface } from '../store/types.js';

/** 组件树节点 */
export interface A2uiTreeNode {
  id: string;
  surfaceId: string;
  vnode: ReactElement;
  children: A2uiTreeNode[];
}

/**
 * 将 Surface 的根 HydrateNode 组装为组件树。
 * 当前 mock 只有一个组件，暂不递归组装 children，仅返回根节点。
 */
export function treeBuild(
  surface: Surface,
  hydrateNodeMap: Record<string, HydrateNode>,
): A2uiTreeNode {
  const rootNode = hydrateNodeMap[surface.rootNode.id] ?? surface.rootNode;

  return {
    id: rootNode.id,
    surfaceId: rootNode.surfaceId,
    vnode: rootNode._vnode,
    children: [],
  };
}
