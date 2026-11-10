// A2UI 数据模型：按 JSON Pointer 风格路径读写

/** 单个 surface 的数据模型 */
export type A2uiDataModel = Record<string, unknown>;

export function isPlainObject(value: unknown): value is A2uiDataModel {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 按 '/user/name' 这样的路径读取值，取不到返回 undefined */
export function getModelValue(model: unknown, path: string): unknown {
  let current = model;

  for (const segment of path.split('/').filter(Boolean)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
    } else if (isPlainObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }

    if (current === undefined) return undefined;
  }

  return current;
}

/**
 * 按路径不可变写入值。
 * 根路径（'' 或 '/'）在值为对象时替换整份模型，否则保持原模型。
 * 子路径会逐层创建缺失的对象，数组下标会按索引写入。
 */
export function setModelValue(
  model: A2uiDataModel,
  path: string,
  value: unknown,
): A2uiDataModel {
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return isPlainObject(value) ? value : model;
  }

  return writeAt(model, segments, value) as A2uiDataModel;
}

type ModelContainer = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is ModelContainer {
  return isPlainObject(value) || Array.isArray(value);
}

function writeAt(
  container: ModelContainer,
  segments: string[],
  value: unknown,
): ModelContainer {
  const [head, ...rest] = segments;

  if (Array.isArray(container)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0) return container;

    const next = [...container];
    next[index] =
      rest.length === 0
        ? value
        : writeAt(isContainer(next[index]) ? next[index] : {}, rest, value);

    return next;
  }

  if (rest.length === 0) {
    return { ...container, [head]: value };
  }

  const child = isContainer(container[head]) ? container[head] : {};

  return { ...container, [head]: writeAt(child, rest, value) };
}

/** 从 BoundValue 中取出字面量（literalString / literalNumber / literalBoolean / literalArray） */
export function getLiteralValue(value: unknown): unknown {
  if (!isPlainObject(value)) return undefined;

  if ('literalString' in value) return value.literalString;
  if ('literalNumber' in value) return value.literalNumber;
  if ('literalBoolean' in value) return value.literalBoolean;
  if ('literalArray' in value) return value.literalArray;

  return undefined;
}

/** 取出 BoundValue 绑定的数据模型路径 */
export function getBindingPath(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined;

  return typeof value.path === 'string' ? value.path : undefined;
}
