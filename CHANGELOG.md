# 更新说明（Changelog）

> 本文件记录项目各阶段的实质性变更。当前阶段：**从空脚手架到可运行的「协议解析 + 流式增量渲染」演示**。
> 最近更新：2026-11-09

---

## [现阶段] 2026-11-09 —— 核心 SDK 与流式渲染演示

### 概要

项目从「只有目录结构和空 `export {}`」推进到**可以跑起来的 A2UI 渲染闭环**：

- 能消费真实格式的 A2UI v0.8 JSONL 协议文本
- 能在**任意分块**的流式输入下逐条解析（chunk 切在字符串中间也不出错）
- 能把协议组装成组件树并渲染为 React 元素，新节点带淡入动画
- playground 提供 4 个 mock 场景的「模拟 LLM 流式播放」演示

当前数据源仍是**本地 mock 文件**，尚未接入 LLM 与 SSE。

| 指标 | 数值 |
| --- | --- |
| 单元测试 | 43 passing（buffer 11 / parser 17 / stream 3 / store 6 / treebuilder 6） |
| 协议消息覆盖 | 4 / 4（`surfaceUpdate`、`dataModelUpdate`、`beginRendering`、`deleteSurface`） |
| 渲染组件覆盖 | 3 / 18（`Text`、`Column`、`Row`） |
| 可运行进程 | 2（web playground、server 健康检查） |

---

### 新增

#### `@a2ui/core` · buffer（新模块）

流式 JSONL 缓冲区，解决「LLM 逐 token 返回、JSON 不完整」这一核心问题。

| 能力 | 说明 |
| --- | --- |
| `JsonlBuffer.append(chunk)` | 追加任意分块，返回本次可解析的完整消息 |
| `JsonlBuffer.flush()` | 流结束时输出剩余消息；有未闭合 JSON 则抛错 |
| `JsonlBuffer.pending` | 查看尚未组成完整 JSON 的剩余文本 |
| `JsonlBuffer.reset()` | 清空缓冲 |
| 大括号配对扫描 | 跳过字符串内部的 `{}` 与 `\"` 转义，不会误判边界 |
| 无分隔符切分 | 不依赖换行，`{"a":1}{"b":2}` 也能切开 |
| `surfaceUpdate` 拆分 | 一条消息含 N 个组件时拆成 N 条单组件消息，便于逐个渲染 |

#### `@a2ui/core` · parser（由空实现变为完整实现）

- `createParser(renderMap?, onError?, markMounted?)`：创建**有状态、可增量累积**的解析器
  - `parseLine(line)`：解析一条消息，返回累积结果
  - `parse(jsonl)`：整段解析（内部走 `JsonlBuffer`）
  - `getResult()` / `reset()`
- `parse(jsonl, renderMap?, onError?, markMounted?)`：一次性解析的便捷函数
- 四种消息处理器：
  - `surfaceUpdate` → 按 `component.id` 写入/更新 `HydrateNode`，并同步刷新 Surface 根节点引用
  - `beginRendering` → 建立 Surface（`beginRender` / `rootNode` / `catalogId` / `styles`）
  - `dataModelUpdate` → 按 `path` 合并数据（支持 `/` 全量替换与嵌套路径）
  - `deleteSurface` → 级联删除 Surface、其全部节点与数据模型
- 错误上报：组件未注册时写入 `RENDER_ERROR`
- 导出协议类型：`SurfaceUpdateMessage`、`BeginRenderingMessage`、`DataModelUpdateMessage`、`DeleteSurfaceMessage`、`A2uiServerMessage`、`ParseResult`

#### `@a2ui/core` · store（新模块）

基于 `zustand/vanilla` 的框架无关状态容器。

- `init(renderMap?, renderTree?)`：创建相互独立的 Store 实例；另导出默认实例 `a2uiStore`
- 三个 Map：`surfaceMap`（画布）、`hydrateNodeMap`（组件节点）、`errorMap`（错误）
- 完整 CRUD：`addSurface` / `updateSurface` / `removeSurface` / `getSurface`，节点与错误同构
- `markHydrateNodeMounted(id)`：标记挂载动画已完成（供渲染层回写）

#### `@a2ui/core` · vnode（由占位变为实现）

- `createVNode(component, renderMap?, onMissingRenderer?, context?)`：协议 `component` 包装对象 → React 元素
- 强制校验「有且仅有一个组件类型」
- `renderMap` 未命中时降级为同名 React 元素，并通过回调上报
- 新增 `A2uiRenderContext`：`{ id, surfaceId, hasMounted, markMounted }`，渲染函数据此决定是否播放动画

#### `@a2ui/core` · treebuilder（由占位变为实现）

- `treeBuild(surface, hydrateNodeMap, renderTree?)`：由 Surface 根节点递归组装组件树
- `renderTreeFromStore(store)`：直接按 Store 当前状态构建并回调 `renderTree`
- `A2uiTreeNode`：`{ id, surfaceId, parentId, type, vnode, children }`
- 支持容器通过 `children.explicitList` 引用子节点，子节点以 `key` 注入保证 React 复用
- **渐进渲染**：`beginRendering` 到达前，使用已缓冲的第一个组件（优先 id 为 `root`）作为临时根，实现「边到边渲染」

#### `@a2ui/react`（由占位变为实现）

- 组件实现：`Text`（`usageHint` 支持 h1–h5 / caption / body / 默认 span）、`Column`、`Row`（`distribution` / `alignment` 映射到 flex）
- 导出 `renderMap`，可直接传给 `init()` / `createParser()`
- 流式淡入：新节点渲染时带 `a2ui-stream-fade` 类，0.3s 高亮淡出；用 `hasMounted` + `markMounted()` 保证只播一次，并用 `event.target === currentTarget` 避免子组件动画冒泡误触发
- 容器使用虚线边框，便于在预览中辨认嵌套层级

#### `web/a2ui-playground`（由单行文本变为可交互演示）

- **模拟流式播放**：`setInterval` 每 50ms 推送 50 个字符的**原始 JSON 文本**（非预切好整行），完整走一遍 `JsonlBuffer → parser → store → renderTree` 链路
- 4 个 mock 场景：单个 Text、Column + 3 Text、嵌套 Column、Row + Column 混合
- 三种可视化：渲染预览、组件树（id · 类型）、Store 快照弹窗（三个 Map 的完整 JSON）
- 实时进度：已接收字符数 / 已解析消息数 / 是否推送中
- 未收到 `beginRendering` 时提示「流式构建中，等待 beginRendering…」
- 引入 antd 6 作为 UI 底座

#### 测试与 Mock 基建

- 引入 mocha + tsx，两套配置：
  - `npm test` → `test/**/*.test.ts`，排除 parser
  - `npm run test:parser` → 仅 parser（因为 parser 用例需要 `react` 渲染环境，单独跑）
- 三组测试：单元测试（buffer / store / treebuilder）、流式集成测试（mock 按 50 字符分块流入 → buffer → parser 全链路）、parser 端到端测试
- Mock 协议数据：`simple-text`、`column-text`、`nested-tree`、`mixed-tree` 四个 `.jsonl`

---

### 变更

- `packages/a2ui-core/src/index.ts`：新增 `./buffer` 导出
- `packages/a2ui-core/package.json`：新增依赖 `zustand`、`react`；新增 devDeps `mocha`、`tsx`、`@types/mocha`；新增 `test` / `test:parser` 脚本
- `web/a2ui-playground/package.json`：新增依赖 `antd`
- 根 `package.json`：新增 `test`、`test:parser` 脚本
- `web/a2ui-playground/src/main.tsx`：引入 antd reset 样式与 `stream-fade.css`

---

### 接口速览

```ts
import {
  JsonlBuffer,
  createParser,
  init,
  renderTreeFromStore,
} from '@a2ui/core';
import { renderMap } from '@a2ui/react';

// 1) 建 Store（renderTree 回调在每次构建后触发）
const store = init(renderMap, (tree) => render(tree));

// 2) 建解析器
const parser = createParser(
  renderMap,
  store.getState().addError,
  store.getState().markHydrateNodeMounted,
);

// 3) 流式消费：chunk 可以是任意位置切断的字符串
const buffer = new JsonlBuffer();
for (const line of buffer.append(chunk)) {
  parser.parseLine(line);
  const { surfaceMap, hydrateNodeMap } = parser.getResult();
  store.setState({ surfaceMap: { ...surfaceMap }, hydrateNodeMap: { ...hydrateNodeMap } });
  renderTreeFromStore(store); // 重新构建组件树并渲染
}
```

---

### 已知限制

| 类别 | 限制 |
| --- | --- |
| 数据流 | 数据源为本地 mock，**无 SSE / `ReadableStream` / `fetch`**；server 仅有 `GET /health` |
| 数据绑定 | `dataModelUpdate` 已解析进 `result.dataModelMap`，但**未写入 store**；渲染层只读 `literalString`，`BoundValue.path` 不生效 |
| 动态列表 | 仅支持 `children.explicitList`，`children.template` 未实现 |
| 组件覆盖 | 18 个标准组件只实现 3 个；无表单类、无 `Button`（`userAction` 事件链路完全缺失） |
| 多画布 | `renderTreeFromStore` 只渲染 `surfaceMap` 中的第一个 Surface |
| 样式 | `weight`（flex-grow）、`beginRendering.styles` 均未处理 |
| 健壮性 | playground 中 `parseLine()` / `flush()` 抛错未捕获，异常会让界面停在「推送中…」 |
| 协议语义 | `beginRendering` 前即开始渲染（为演示效果主动放宽，与规范的「防闪烁」意图不一致） |
| 性能 | 每条消息触发整棵组件树重建与全量 `setState`，长流下为 O(消息数 × 节点数) |
| 文档 | `ARCHITECTURE.md` 仍描述脚手架阶段，尚未与当前代码同步 |

---

### 下一步（按优先级）

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P0 | 接入 SSE + 对话区 | 服务端流式转发 LLM 输出，前端把 `setInterval` 换成 `ReadableStream` 读取，让演示变成真流 |
| P1 | 打通数据绑定 | `dataModelMap` 入 store，实现 `path` 读写，为表单类组件铺路 |
| P2 | 事件回传 | 实现 `Button` + `action` → `userAction`，形成「界面可交互」闭环 |
| P3 | 组件扩容 | 展示型 9 个可批量补；`List` + `template` 需改 treebuilder |
| P4 | 多轮调整 | 复用 `surfaceId` 与组件 id 的覆盖语义，让模型只返回增量协议 |
| P5 | 工程完善 | 组件画廊、协议调试面板、异常兜底、多 Surface 渲染、文档同步 |

---

### 提交记录

| commit | 说明 |
| --- | --- |
| `f9c75ea` | chore: 初始化 monorepo 与 a2ui-core 基础实现 |
| `05f7b64` | docs: 添加 A2UI v0.8 协议规范与项目文档 |

> 注意：上表两次提交之后，**流式相关改动仍在工作区未提交**（buffer 模块、增量解析、增量渲染、mock 播放、样式、相应测试），涉及 12 个文件修改（约 +1100 行）与 6 项新增。

---

### 如何验证当前阶段

```bash
npm install
npm run typecheck      # 4 个 workspace 全过
npm test               # 26 passing（buffer / stream / store / treebuilder）
npm run test:parser    # 17 passing
npm run dev:web        # http://localhost:5173 观看模拟流式生成
```
