import { createStore } from 'zustand/vanilla';
import type { A2uiStore } from './types.js';
import type { A2uiRenderMap } from '../vnode/index.js';

export * from './types.js';

/**
 * 初始化 A2UI Store。
 * 每次调用都会通过 createStore 创建一个新的、三个 Map 均为空的 Store。
 * renderMap 用于 Parser 在生成 _vnode 时渲染对应组件。
 * 使用 zustand/vanilla，不依赖 React 等具体视图框架。
 */
export function init(renderMap: A2uiRenderMap = {}) {
  return createStore<A2uiStore>()((set, get) => ({
    surfaceMap: {},
    hydrateNodeMap: {},
    errorMap: {},
    renderMap,

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
  }));
}

/** 默认的全局 Store 实例 */
export const a2uiStore = init();
