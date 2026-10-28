import {
  ErrorType,
  type A2uiError,
  type HydrateNode,
  type Surface,
} from '../store/types.js';
import { createVNode, type A2uiRenderMap } from '../vnode/index.js';

/** dataModelUpdate 中的单个数据条目 */
export interface DataModelEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: DataModelEntry[];
}

/** surfaceUpdate：添加或更新画布上的组件定义 */
export interface SurfaceUpdateMessage {
  surfaceId: string;
  components: Array<{
    id: string;
    component: Record<string, unknown>;
    weight?: number;
  }>;
}

/** beginRendering：通知客户端可以开始渲染 */
export interface BeginRenderingMessage {
  surfaceId: string;
  root: string;
  catalogId?: string;
  styles?: Record<string, unknown>;
}

/** dataModelUpdate：更新某个画布的数据模型 */
export interface DataModelUpdateMessage {
  surfaceId: string;
  path?: string;
  contents: DataModelEntry[];
}

/** deleteSurface：删除画布及其内容 */
export interface DeleteSurfaceMessage {
  surfaceId: string;
}

export type A2uiServerMessage =
  | { beginRendering: BeginRenderingMessage }
  | { surfaceUpdate: SurfaceUpdateMessage }
  | { dataModelUpdate: DataModelUpdateMessage }
  | { deleteSurface: DeleteSurfaceMessage };

/** 解析结果：画布、水合节点与各画布的数据模型 */
export interface ParseResult {
  surfaceMap: Record<string, Surface>;
  hydrateNodeMap: Record<string, HydrateNode>;
  dataModelMap: Record<string, Record<string, unknown>>;
}

const MESSAGE_TYPES = [
  'beginRendering',
  'surfaceUpdate',
  'dataModelUpdate',
  'deleteSurface',
] as const;

type MessageType = (typeof MESSAGE_TYPES)[number];

/** 解析过程中产生错误时的回调 */
export type ParseErrorHandler = (id: string, error: A2uiError) => void;

/**
 * 解析 A2UI JSONL 文本。
 * 每一行是一条独立的 server-to-client 消息。
 * renderMap 用于把组件协议渲染为对应的 React 实例并写入 _vnode。
 * 组件未注册时通过 onError 上报 RENDER_ERROR。
 */
export function parse(
  jsonl: string,
  renderMap: A2uiRenderMap = {},
  onError?: ParseErrorHandler,
): ParseResult {
  const result: ParseResult = {
    surfaceMap: {},
    hydrateNodeMap: {},
    dataModelMap: {},
  };

  const lines = jsonl.split(/\r?\n/);

  lines.forEach((line, index) => {
    const content = line.trim();
    if (!content) return;

    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error(`第 ${index + 1} 行不是合法的 JSON`);
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`第 ${index + 1} 行必须是 JSON 对象`);
    }

    const message = value as Record<string, unknown>;
    const type = getMessageType(message);

    switch (type) {
      case 'surfaceUpdate':
        handleSurfaceUpdate(
          message.surfaceUpdate as SurfaceUpdateMessage,
          result,
          renderMap,
          onError,
        );
        break;
      case 'beginRendering':
        handleBeginRendering(message.beginRendering as BeginRenderingMessage, result);
        break;
      case 'dataModelUpdate':
        handleDataModelUpdate(
          message.dataModelUpdate as DataModelUpdateMessage,
          result,
        );
        break;
      case 'deleteSurface':
        handleDeleteSurface(message.deleteSurface as DeleteSurfaceMessage, result);
        break;
    }
  });

  return result;
}

function getMessageType(message: Record<string, unknown>): MessageType {
  const keys = Object.keys(message);

  if (keys.length !== 1) {
    throw new Error('A2UI 消息必须且只能包含一个消息类型');
  }

  const [type] = keys;
  if (!(MESSAGE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`未知的 A2UI 消息类型: ${type}`);
  }

  return type as MessageType;
}

/** 处理 surfaceUpdate：按 component id 写入或更新 HydrateNode */
function handleSurfaceUpdate(
  message: SurfaceUpdateMessage,
  result: ParseResult,
  renderMap: A2uiRenderMap,
  onError?: ParseErrorHandler,
): void {
  if (!message?.surfaceId || !Array.isArray(message.components)) {
    throw new Error('surfaceUpdate 缺少 surfaceId 或 components');
  }

  for (const component of message.components) {
    const node: HydrateNode = {
      id: component.id,
      _vnode: createVNode(component.component, renderMap, (componentType) => {
        onError?.(component.id, {
          type: ErrorType.RENDER_ERROR,
          content: `组件 "${componentType}" 未注册渲染器（surfaceId: ${message.surfaceId}, componentId: ${component.id}）`,
        });
      }),
      surfaceId: message.surfaceId,
      protocol: JSON.stringify(component.component),
    };

    result.hydrateNodeMap[node.id] = node;

    // 如果组件在 beginRendering 之后更新，同步刷新 Surface 的根节点引用
    const surface = result.surfaceMap[message.surfaceId];
    if (surface && surface.rootNode.id === node.id) {
      surface.rootNode = node;
    }
  }
}

/** 处理 beginRendering：建立 Surface 并确定根节点 */
function handleBeginRendering(
  message: BeginRenderingMessage,
  result: ParseResult,
): void {
  if (!message?.surfaceId || !message.root) {
    throw new Error('beginRendering 缺少 surfaceId 或 root');
  }

  const rootNode = result.hydrateNodeMap[message.root];
  if (!rootNode) {
    throw new Error(`beginRendering 的 root 组件不存在: ${message.root}`);
  }

  result.surfaceMap[message.surfaceId] = {
    id: message.surfaceId,
    beginRender: true,
    rootNode,
    catalogId: message.catalogId,
    styles: message.styles,
  };
}

/** 处理 dataModelUpdate：按 path 更新对应画布的数据模型 */
function handleDataModelUpdate(
  message: DataModelUpdateMessage,
  result: ParseResult,
): void {
  if (!message?.surfaceId || !Array.isArray(message.contents)) {
    throw new Error('dataModelUpdate 缺少 surfaceId 或 contents');
  }

  const current = result.dataModelMap[message.surfaceId] ?? {};
  result.dataModelMap[message.surfaceId] = applyDataUpdate(
    current,
    message.path,
    message.contents,
  );
}

/** 处理 deleteSurface：删除画布、其组件节点和数据模型 */
function handleDeleteSurface(
  message: DeleteSurfaceMessage,
  result: ParseResult,
): void {
  if (!message?.surfaceId) {
    throw new Error('deleteSurface 缺少 surfaceId');
  }

  const { surfaceId } = message;

  delete result.surfaceMap[surfaceId];
  delete result.dataModelMap[surfaceId];

  for (const nodeId of Object.keys(result.hydrateNodeMap)) {
    if (result.hydrateNodeMap[nodeId].surfaceId === surfaceId) {
      delete result.hydrateNodeMap[nodeId];
    }
  }
}

function applyDataUpdate(
  current: Record<string, unknown>,
  path: string | undefined,
  contents: DataModelEntry[],
): Record<string, unknown> {
  const next = entriesToObject(contents);

  // 未指定 path 或 path 为根时，替换整个数据模型
  if (!path || path === '/') {
    return next;
  }

  const segments = path.split('/').filter(Boolean);
  return mergeAtPath(current, segments, next);
}

function mergeAtPath(
  current: Record<string, unknown>,
  segments: string[],
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (segments.length === 0) {
    return { ...current, ...value };
  }

  const [head, ...rest] = segments;
  const child = isPlainObject(current[head]) ? current[head] : {};

  return {
    ...current,
    [head]: mergeAtPath(child, rest, value),
  };
}

function entriesToObject(
  entries: DataModelEntry[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const entry of entries) {
    result[entry.key] = entryValue(entry);
  }

  return result;
}

function entryValue(entry: DataModelEntry): unknown {
  if (entry.valueMap !== undefined) {
    return entriesToObject(entry.valueMap);
  }
  if (entry.valueString !== undefined) {
    return entry.valueString;
  }
  if (entry.valueNumber !== undefined) {
    return entry.valueNumber;
  }
  if (entry.valueBoolean !== undefined) {
    return entry.valueBoolean;
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
