import type { ReactElement } from 'react';
import type { A2uiRenderMap } from '../vnode/index.js';

/** 错误类型枚举 */
export enum ErrorType {
    /** 协议解析错误 */
    PARSE_ERROR = 'PARSE_ERROR',
    /** 组件渲染错误 */
    RENDER_ERROR = 'RENDER_ERROR',
}

/** 错误对象 */
export interface A2uiError {
    type: ErrorType;
    content: string;
}

/** 画布/视图，代表一个独立的 UI 渲染区域 */
export interface Surface {
    /** 唯一标识 */
    id: string;
    /** 是否开始渲染 */
    beginRender: boolean;
    /** 根节点 */
    rootNode: HydrateNode;
    /** beginRendering 指定的组件目录 */
    catalogId?: string;
    /** beginRendering 携带的样式 */
    styles?: Record<string, unknown>;
}

/** 组件节点（水合节点） */
export interface HydrateNode {
    /** 节点唯一标识 */
    id: string;
    /** React 虚拟节点，用于实际渲染 */
    _vnode: ReactElement;
    /** 所属画布 ID */
    surfaceId: string;
    /** 原始协议内容（如 JSONL 协议数据） */
    protocol?: string;
}

/** Store 中维护的数据 */
export interface A2uiStoreState {
    /** 所有画布，按 id 索引 */
    surfaceMap: Record<string, Surface>;
    /** 所有组件节点，按 id 索引 */
    hydrateNodeMap: Record<string, HydrateNode>;
    /** 所有错误，按 id 索引 */
    errorMap: Record<string, A2uiError>;
    /** 组件渲染映射，由 init 传入 */
    renderMap: A2uiRenderMap;
}

/** 三个 Map 基于 id 的增删改查操作 */
export interface A2uiStoreActions {
    addSurface(surface: Surface): void;
    updateSurface(id: string, patch: Partial<Omit<Surface, 'id'>>): void;
    removeSurface(id: string): void;
    getSurface(id: string): Surface | undefined;

    addHydrateNode(node: HydrateNode): void;
    updateHydrateNode(id: string, patch: Partial<Omit<HydrateNode, 'id'>>): void;
    removeHydrateNode(id: string): void;
    getHydrateNode(id: string): HydrateNode | undefined;

    addError(id: string, error: A2uiError): void;
    updateError(id: string, patch: Partial<A2uiError>): void;
    removeError(id: string): void;
    getError(id: string): A2uiError | undefined;
}

/** 完整的 A2UI Store：数据 + 操作 */
export type A2uiStore = A2uiStoreState & A2uiStoreActions;
