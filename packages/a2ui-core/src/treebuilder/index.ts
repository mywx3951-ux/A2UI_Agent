// A2UI treebuilder：根据协议构建渲染树

import { cloneElement, type ReactElement } from 'react';
import type {
  A2uiStore,
  A2uiStoreState,
  HydrateNode,
  Surface,
} from '../store/types.js';
import {
  getBindingPath,
  getLiteralValue,
  getModelValue,
  isPlainObject,
  type A2uiDataModel,
} from '../store/model.js';
import {
  createVNode,
  type A2uiRenderContext,
  type A2uiRenderMap,
} from '../vnode/index.js';

/** 组件树节点 */
export interface A2uiTreeNode {
  id: string;
  surfaceId: string;
  parentId?: string;
  /** A2UI 组件类型，例如 Column、Row、Text */
  type: string;
  vnode: ReactElement;
  children: A2uiTreeNode[];
}

/** 渲染组件树回调，由 init 传入，SDK 在每次 treeBuild 后调用 */
export type A2uiRenderTree = (tree: A2uiTreeNode | null) => void;

/** treeBuild 需要的额外依赖，用于展开动态列表 */
export interface TreeBuildOptions {
  /** 组件名到渲染函数的映射，元素作用域内重建 vnode 时需要 */
  renderMap?: A2uiRenderMap;
  /** 当前画布的数据模型，children.template 的数据来源 */
  dataModel?: A2uiDataModel;
  /** 元素作用域内写回数据模型 */
  onUpdateModel?: (path: string, value: unknown) => void;
}

/** 动态列表元素的作用域 */
interface ItemScope {
  item: A2uiDataModel;
  collectionPath: string;
  itemKey: string;
  options: TreeBuildOptions;
}

/**
 * 将 Surface 的根 HydrateNode 组装为组件树。
 * 支持 explicitList 与 children.template 两种子节点定义方式。
 * 构建完成后立即调用 renderTree，由 SDK 决定渲染时机。
 */
export function treeBuild(
  surface: Surface,
  hydrateNodeMap: Record<string, HydrateNode>,
  renderTree?: A2uiRenderTree,
  options: TreeBuildOptions = {},
): A2uiTreeNode {
  const rootNode = hydrateNodeMap[surface.rootNode.id] ?? surface.rootNode;
  const tree = buildTreeNode(rootNode, hydrateNodeMap, options);

  renderTree?.(tree);

  return tree;
}

/**
 * 从 Store 当前状态构建并渲染组件树。
 * beginRendering 到达前，使用已缓冲的第一个组件作为临时根，
 * 从而支持逐条消息到达时即时渲染。
 */
export function renderTreeFromStore(store: {
  getState(): A2uiStore;
}): A2uiTreeNode | null {
  const state = store.getState();
  const surface = getPreviewSurface(state);

  if (!surface) {
    state.renderTree?.(null);
    return null;
  }

  return treeBuild(surface, state.hydrateNodeMap, state.renderTree, {
    renderMap: state.renderMap,
    dataModel: state.dataModelMap[surface.id],
    onUpdateModel: (path, value) => state.updateModel(surface.id, path, value),
  });
}

function getPreviewSurface(state: A2uiStoreState): Surface | undefined {
  const renderedSurface = Object.values(state.surfaceMap)[0];
  if (renderedSurface) return renderedSurface;

  const nodes = Object.values(state.hydrateNodeMap);
  if (nodes.length === 0) return undefined;

  const rootNode = nodes.find((node) => node.id === 'root') ?? nodes[0];

  return {
    id: rootNode.surfaceId,
    beginRender: false,
    rootNode,
  };
}

function buildTreeNode(
  node: HydrateNode,
  hydrateNodeMap: Record<string, HydrateNode>,
  options: TreeBuildOptions,
  parentId?: string,
  scope?: ItemScope,
  instanceId?: string,
): A2uiTreeNode {
  const component = getComponent(node);
  const id = instanceId ?? node.id;

  // 元素作用域内的节点需要按当前 item 重新解析绑定，因此重建 vnode
  const vnode = scope ? rebuildVNode(node, component, id, scope) : node._vnode;

  const template = getTemplate(component);

  const children = template
    ? buildTemplateChildren(id, template, hydrateNodeMap, options)
    : getChildIds(component)
        .map((childId) => hydrateNodeMap[childId])
        .filter((child): child is HydrateNode => child !== undefined)
        .map((child) =>
          buildTreeNode(
            child,
            hydrateNodeMap,
            options,
            id,
            scope,
            scope ? `${child.id}#${scope.itemKey}` : undefined,
          ),
        );

  const childVnodes = children.map((child) =>
    cloneElement(child.vnode, { key: child.id }),
  );

  return {
    id,
    surfaceId: node.surfaceId,
    parentId,
    type: component?.type ?? 'Unknown',
    vnode:
      children.length > 0
        ? cloneElement(vnode, {}, ...childVnodes)
        : vnode,
    children,
  };
}

/** 按 dataBinding 展开模板，为每个元素生成一个实例 */
function buildTemplateChildren(
  parentId: string,
  template: TemplateSpec,
  hydrateNodeMap: Record<string, HydrateNode>,
  options: TreeBuildOptions,
): A2uiTreeNode[] {
  const templateNode = hydrateNodeMap[template.componentId];
  if (!templateNode) return [];

  const collection = getModelValue(options.dataModel, template.dataBinding);

  return toEntries(collection).map(([itemKey, item]) =>
    buildTreeNode(
      templateNode,
      hydrateNodeMap,
      options,
      parentId,
      {
        item: isPlainObject(item) ? item : {},
        collectionPath: template.dataBinding,
        itemKey,
        options,
      },
      `${template.componentId}#${itemKey}`,
    ),
  );
}

/**
 * dataBinding 支持两种集合形态：
 * - 数组：按索引顺序展开
 * - 对象（dataModelUpdate 的 valueMap）：按 key 顺序展开
 */
function toEntries(collection: unknown): Array<[string, unknown]> {
  if (Array.isArray(collection)) {
    return collection.map((item, index) => [String(index), item]);
  }

  if (isPlainObject(collection)) {
    // 值为 undefined 视为该元素已被移除
    return Object.entries(collection).filter(
      ([, value]) => value !== undefined,
    );
  }

  return [];
}

/** 在元素作用域内重建 vnode，使 path 相对当前 item 解析 */
function rebuildVNode(
  node: HydrateNode,
  component: ParsedComponent | undefined,
  id: string,
  scope: ItemScope,
): ReactElement {
  const renderMap = scope.options.renderMap;

  if (!renderMap || !component) return node._vnode;

  return createVNode(
    { [component.type]: component.props },
    renderMap,
    undefined,
    createScopedContext(node, id, scope),
  );
}

function createScopedContext(
  node: HydrateNode,
  id: string,
  scope: ItemScope,
): A2uiRenderContext {
  const resolve = <T = unknown,>(value: unknown): T | undefined => {
    const path = getBindingPath(value);

    if (path !== undefined) {
      // 先按当前元素解析相对路径，再回退到整份画布模型
      const relative = path.replace(/^\/+/, '');
      const itemValue = getModelValue(scope.item, relative);

      if (itemValue !== undefined) return itemValue as T;

      const absolute = getModelValue(scope.options.dataModel, path);

      if (absolute !== undefined) return absolute as T;
    }

    return getLiteralValue(value) as T | undefined;
  };

  const updateModel = (path: string, value: unknown) => {
    const relative = path.replace(/^\/+/, '');
    scope.options.onUpdateModel?.(
      `${scope.collectionPath}/${scope.itemKey}/${relative}`,
      value,
    );
  };

  return {
    id,
    surfaceId: node.surfaceId,
    hasMounted: true,
    markMounted: () => {},
    resolve,
    updateModel,
  };
}

interface TemplateSpec {
  componentId: string;
  dataBinding: string;
}

function getTemplate(
  component: ParsedComponent | undefined,
): TemplateSpec | undefined {
  if (!component) return undefined;

  const children = component.props.children;
  if (!isPlainObject(children)) return undefined;

  const template = children.template;
  if (!isPlainObject(template)) return undefined;

  if (
    typeof template.componentId !== 'string' ||
    typeof template.dataBinding !== 'string'
  ) {
    return undefined;
  }

  return {
    componentId: template.componentId,
    dataBinding: template.dataBinding,
  };
}

interface ParsedComponent {
  type: string;
  props: Record<string, unknown>;
}

/** 从节点的原始协议中解析组件类型和属性 */
function getComponent(node: HydrateNode): ParsedComponent | undefined {
  if (!node.protocol) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(node.protocol);
  } catch {
    return undefined;
  }

  if (!isPlainObject(parsed)) return undefined;

  const entries = Object.entries(parsed);
  if (entries.length !== 1) return undefined;

  const [type, props] = entries[0];

  return {
    type,
    props: isPlainObject(props) ? props : {},
  };
}

/**
 * 按组件类型读取子节点 id。
 * - Row / Column / List 使用 children.explicitList
 * - Card / Button 使用 child
 * - Modal 使用 entryPointChild 和 contentChild
 * - Tabs 使用 tabItems[].child
 * children.template 由 buildTemplateChildren 单独处理。
 */
function getChildIds(component: ParsedComponent | undefined): string[] {
  if (!component) return [];

  const { type, props } = component;

  if (type === 'Tabs') {
    const tabItems = props.tabItems;
    if (!Array.isArray(tabItems)) return [];

    return tabItems
      .map((item) =>
        isPlainObject(item) && typeof item.child === 'string'
          ? item.child
          : undefined,
      )
      .filter((id): id is string => id !== undefined);
  }

  if (type === 'Card' || type === 'Button') {
    return typeof props.child === 'string' ? [props.child] : [];
  }

  if (type === 'Modal') {
    return [props.entryPointChild, props.contentChild].filter(
      (id): id is string => typeof id === 'string',
    );
  }

  const children = props.children;
  if (!isPlainObject(children)) return [];

  const explicitList = children.explicitList;
  if (!Array.isArray(explicitList)) return [];

  return explicitList.filter((id): id is string => typeof id === 'string');
}
