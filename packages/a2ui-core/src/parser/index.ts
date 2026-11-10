import { JsonlBuffer } from '../buffer/index.js';
import {
  ErrorType,
  type A2uiError,
  type HydrateNode,
  type Surface,
} from '../store/types.js';
import {
  getBindingPath,
  getLiteralValue,
  getModelValue,
  isPlainObject,
  setModelValue,
  type A2uiDataModel,
} from '../store/model.js';
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
 * Parser 运行时端口。
 * 数据模型统一由中心 Store 持有：解析时写入，渲染时读取。
 * 不传时退化为 Parser 内部的 dataModelMap。
 */
export interface A2uiParserRuntime {
  getDataModel?(surfaceId: string): A2uiDataModel | undefined;
  setDataModel?(surfaceId: string, model: A2uiDataModel): void;
  removeDataModel?(surfaceId: string): void;
  updateModel?(surfaceId: string, path: string, value: unknown): void;
}

/** 可增量的 A2UI 解析器，适合逐行消费流式消息 */
export interface A2uiParser {
  /** 解析一条完整的 JSONL 消息，返回累积结果 */
  parseLine(line: string): ParseResult;
  /** 解析一段 JSONL，累积到当前结果 */
  parse(jsonl: string): ParseResult;
  /** 获取当前累积结果 */
  getResult(): ParseResult;
  /** 清空累积结果 */
  reset(): void;
}

function createEmptyResult(): ParseResult {
  return {
    surfaceMap: {},
    hydrateNodeMap: {},
    dataModelMap: {},
  };
}

/**
 * 创建一个可增量解析的 A2UI Parser。
 * 每次 parseLine 都会把消息应用到同一份累积结果上。
 * renderMap 用于把组件协议渲染为对应的 React 实例并写入 _vnode。
 */
export function createParser(
  renderMap: A2uiRenderMap = {},
  onError?: ParseErrorHandler,
  markMounted?: (id: string) => void,
  runtime?: A2uiParserRuntime,
): A2uiParser {
  let result = createEmptyResult();
  let lineNumber = 0;

  const parseLine = (line: string): ParseResult => {
    const content = line.trim();
    if (!content) return result;

    lineNumber += 1;
    applyMessage(
      content,
      lineNumber,
      result,
      renderMap,
      onError,
      markMounted,
      runtime,
    );

    return result;
  };

  const parseJsonl = (jsonl: string): ParseResult => {
    const buffer = new JsonlBuffer();
    const lines = [...buffer.append(jsonl), ...buffer.flush()];

    for (const line of lines) {
      parseLine(line);
    }

    return result;
  };

  return {
    parseLine,
    parse: parseJsonl,
    getResult: () => result,
    reset: () => {
      result = createEmptyResult();
      lineNumber = 0;
    },
  };
}

/**
 * 一次性解析 A2UI JSONL 文本。
 * 每一行是一条独立的 server-to-client 消息。
 * renderMap 用于把组件协议渲染为对应的 React 实例并写入 _vnode。
 * 组件未注册时通过 onError 上报 RENDER_ERROR。
 */
export function parse(
  jsonl: string,
  renderMap: A2uiRenderMap = {},
  onError?: ParseErrorHandler,
  markMounted?: (id: string) => void,
  runtime?: A2uiParserRuntime,
): ParseResult {
  return createParser(renderMap, onError, markMounted, runtime).parse(jsonl);
}

function applyMessage(
  content: string,
  lineNumber: number,
  result: ParseResult,
  renderMap: A2uiRenderMap,
  onError?: ParseErrorHandler,
  markMounted?: (id: string) => void,
  runtime?: A2uiParserRuntime,
): void {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`第 ${lineNumber} 行不是合法的 JSON`);
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`第 ${lineNumber} 行必须是 JSON 对象`);
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
        markMounted,
        runtime,
      );
      break;
    case 'beginRendering':
      handleBeginRendering(message.beginRendering as BeginRenderingMessage, result);
      break;
    case 'dataModelUpdate':
      handleDataModelUpdate(
        message.dataModelUpdate as DataModelUpdateMessage,
        result,
        runtime,
      );
      break;
    case 'deleteSurface':
      handleDeleteSurface(
        message.deleteSurface as DeleteSurfaceMessage,
        result,
        runtime,
      );
      break;
  }
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
  markMounted?: (id: string) => void,
  runtime?: A2uiParserRuntime,
): void {
  if (!message?.surfaceId || !Array.isArray(message.components)) {
    throw new Error('surfaceUpdate 缺少 surfaceId 或 components');
  }

  // 隐式初始化：组件里同时写了 path 和 literal* 的字段，
  // 先把 literal 播种进数据模型，之后渲染统一以模型为准。
  const seeded = seedComponentLiterals(
    result,
    message.surfaceId,
    message.components,
    runtime,
  );

  if (seeded) {
    result.dataModelMap[message.surfaceId] = seeded;
    runtime?.setDataModel?.(message.surfaceId, seeded);
  }

  // 绑定解析器读取中心 Store 的最新数据模型，
  // 因此 dataModelUpdate 晚于 surfaceUpdate 到达时也能在渲染阶段取到值。
  const resolve = createResolver(result, message.surfaceId, runtime);
  const updateModel = (path: string, value: unknown) => {
    const model = setModelValue(
      result.dataModelMap[message.surfaceId] ?? {},
      path,
      value,
    );

    result.dataModelMap[message.surfaceId] = model;

    if (runtime?.updateModel) {
      runtime.updateModel(message.surfaceId, path, value);
    } else {
      runtime?.setDataModel?.(message.surfaceId, model);
    }
  };

  for (const component of message.components) {
    const existingNode = result.hydrateNodeMap[component.id];
    const hasMounted = existingNode?.hasMounted ?? false;

    const markNodeMounted = () => {
      markMounted?.(component.id);

      const currentNode = result.hydrateNodeMap[component.id];
      if (currentNode) {
        currentNode.hasMounted = true;
      }
    };

    const node: HydrateNode = {
      id: component.id,
      _vnode: createVNode(
        component.component,
        renderMap,
        (componentType) => {
          onError?.(component.id, {
            type: ErrorType.RENDER_ERROR,
            content: `组件 "${componentType}" 未注册渲染器（surfaceId: ${message.surfaceId}, componentId: ${component.id}）`,
          });
        },
        {
          id: component.id,
          surfaceId: message.surfaceId,
          hasMounted,
          markMounted: markNodeMounted,
          resolve,
          updateModel,
        },
      ),
      surfaceId: message.surfaceId,
      hasMounted,
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

/** 处理 dataModelUpdate：按 path 更新对应画布的数据模型，并同步到中心 Store */
function handleDataModelUpdate(
  message: DataModelUpdateMessage,
  result: ParseResult,
  runtime?: A2uiParserRuntime,
): void {
  if (!message?.surfaceId || !Array.isArray(message.contents)) {
    throw new Error('dataModelUpdate 缺少 surfaceId 或 contents');
  }

  const current =
    runtime?.getDataModel?.(message.surfaceId) ??
    result.dataModelMap[message.surfaceId] ??
    {};

  const model = applyDataUpdate(current, message.path, message.contents);

  result.dataModelMap[message.surfaceId] = model;
  runtime?.setDataModel?.(message.surfaceId, model);
}

/** 处理 deleteSurface：删除画布、其组件节点和数据模型 */
function handleDeleteSurface(
  message: DeleteSurfaceMessage,
  result: ParseResult,
  runtime?: A2uiParserRuntime,
): void {
  if (!message?.surfaceId) {
    throw new Error('deleteSurface 缺少 surfaceId');
  }

  const { surfaceId } = message;

  delete result.surfaceMap[surfaceId];
  delete result.dataModelMap[surfaceId];
  runtime?.removeDataModel?.(surfaceId);

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

/**
 * 创建数据绑定解析器。
 * 优先按 path 从中心 Store 的数据模型取值，
 * 取不到时回退到 literal* 字面量。
 */
function createResolver(
  result: ParseResult,
  surfaceId: string,
  runtime?: A2uiParserRuntime,
) {
  return <T = unknown,>(value: unknown): T | undefined => {
    const path = getBindingPath(value);

    if (path !== undefined) {
      const model =
        runtime?.getDataModel?.(surfaceId) ?? result.dataModelMap[surfaceId];
      const resolved = getModelValue(model, path);

      if (resolved !== undefined) return resolved as T;
    }

    return getLiteralValue(value) as T | undefined;
  };
}

/**
 * 扫描组件的属性树，把同时包含 path 和 literal* 的字段播种到数据模型。
 * 模型里已有值时保留已有值，避免覆盖服务端下发的数据。
 * 返回写入后的模型；没有变化时返回 undefined。
 */
function seedComponentLiterals(
  result: ParseResult,
  surfaceId: string,
  components: Array<{ component: Record<string, unknown> }>,
  runtime?: A2uiParserRuntime,
): A2uiDataModel | undefined {
  const current =
    runtime?.getDataModel?.(surfaceId) ?? result.dataModelMap[surfaceId] ?? {};

  let model = current;
  let changed = false;

  for (const component of components) {
    const seeded = seedValue(model, component.component);

    model = seeded.model;
    changed = changed || seeded.changed;
  }

  return changed ? model : undefined;
}

function seedValue(
  model: A2uiDataModel,
  value: unknown,
): { model: A2uiDataModel; changed: boolean } {
  if (Array.isArray(value)) {
    let next = model;
    let changed = false;

    for (const item of value) {
      const seeded = seedValue(next, item);
      next = seeded.model;
      changed = changed || seeded.changed;
    }

    return { model: next, changed };
  }

  if (!isPlainObject(value)) return { model, changed: false };

  let next = model;
  let changed = false;

  const path = getBindingPath(value);
  const literal = getLiteralValue(value);

  if (
    path !== undefined &&
    literal !== undefined &&
    getModelValue(next, path) === undefined
  ) {
    next = setModelValue(next, path, literal);
    changed = true;
  }

  for (const child of Object.values(value)) {
    const seeded = seedValue(next, child);
    next = seeded.model;
    changed = changed || seeded.changed;
  }

  return { model: next, changed };
}
