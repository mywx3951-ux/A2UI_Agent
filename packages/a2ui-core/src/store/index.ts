import { createStore } from 'zustand/vanilla';
import type { A2uiStore } from './types.js';
import type { A2uiRenderMap } from '../vnode/index.js';
import { renderTreeFromStore } from '../treebuilder/index.js';
import type { A2uiRenderTree } from '../treebuilder/index.js';
import { setModelValue } from './model.js';

export * from './types.js';
export * from './model.js';

/**
 * 初始化 A2UI Store。
 * 每次调用都会通过 createStore 创建一个新的、三个 Map 均为空的 Store。
 * renderMap 用于 Parser 在生成 _vnode 时渲染对应组件。
 * renderTree 由 SDK 在每次 treeBuild 后调用。
 * 数据模型统一保存在 dataModelMap 中，Parser 解析时写入，渲染时读取。
 * 使用 zustand/vanilla，不依赖 React 等具体视图框架。
 */
export function init(
  renderMap: A2uiRenderMap = {},
  renderTree?: A2uiRenderTree,
) {
  return createStore<A2uiStore>()((set, get) => ({
    surfaceMap: {},
    hydrateNodeMap: {},
    errorMap: {},
    dataModelMap: {},
    renderMap,
    renderTree,

    addSurface: (surface) =>
      set((state) => ({
        surfaceMap: { ...state.surfaceMap, [surface.id]: surface },
      })),

    updateSurface: (id, patch) =>
      set((state) => {
        const surface = state.surfaceMap[id];
        if (!surface) return state;
        return {
          surfaceMap: { ...state.surfaceMap, [id]: { ...surface, ...patch } },
        };
      }),

    removeSurface: (id) =>
      set((state) => {
        if (!(id in state.surfaceMap)) return state;
        const surfaceMap = { ...state.surfaceMap };
        delete surfaceMap[id];
        return { surfaceMap };
      }),

    getSurface: (id) => get().surfaceMap[id],

    addHydrateNode: (node) =>
      set((state) => ({
        hydrateNodeMap: { ...state.hydrateNodeMap, [node.id]: node },
      })),

    updateHydrateNode: (id, patch) =>
      set((state) => {
        const node = state.hydrateNodeMap[id];
        if (!node) return state;
        return {
          hydrateNodeMap: {
            ...state.hydrateNodeMap,
            [id]: { ...node, ...patch },
          },
        };
      }),

    removeHydrateNode: (id) =>
      set((state) => {
        if (!(id in state.hydrateNodeMap)) return state;
        const hydrateNodeMap = { ...state.hydrateNodeMap };
        delete hydrateNodeMap[id];
        return { hydrateNodeMap };
      }),

    getHydrateNode: (id) => get().hydrateNodeMap[id],

    markHydrateNodeMounted: (id) =>
      set((state) => {
        const node = state.hydrateNodeMap[id];
        if (!node || node.hasMounted) return state;

        return {
          hydrateNodeMap: {
            ...state.hydrateNodeMap,
            [id]: { ...node, hasMounted: true },
          },
        };
      }),

    addError: (id, error) =>
      set((state) => ({
        errorMap: { ...state.errorMap, [id]: error },
      })),

    updateError: (id, patch) =>
      set((state) => {
        const error = state.errorMap[id];
        if (!error) return state;
        return {
          errorMap: { ...state.errorMap, [id]: { ...error, ...patch } },
        };
      }),

    removeError: (id) =>
      set((state) => {
        if (!(id in state.errorMap)) return state;
        const errorMap = { ...state.errorMap };
        delete errorMap[id];
        return { errorMap };
      }),

    getError: (id) => get().errorMap[id],

    setDataModel: (surfaceId, model) =>
      set((state) => ({
        dataModelMap: { ...state.dataModelMap, [surfaceId]: model },
      })),

    getDataModel: (surfaceId) => get().dataModelMap[surfaceId],

    removeDataModel: (surfaceId) =>
      set((state) => {
        if (!(surfaceId in state.dataModelMap)) return state;

        const dataModelMap = { ...state.dataModelMap };
        delete dataModelMap[surfaceId];
        return { dataModelMap };
      }),

    updateModel: (surfaceId, path, value) => {
      const current = get().dataModelMap[surfaceId] ?? {};

      set((state) => ({
        dataModelMap: {
          ...state.dataModelMap,
          [surfaceId]: setModelValue(current, path, value),
        },
      }));

      // 模型变化后重新组装组件树，读取最新绑定值
      renderTreeFromStore({ getState: get });
    },
  }));
}

/** 默认的全局 Store 实例 */
export const a2uiStore = init();
