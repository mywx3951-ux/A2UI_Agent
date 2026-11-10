# A2UI 项目进度交接

> 最后更新：2026-11-10
> 用途：新任务开始前先读本文件，可快速对齐当前实现范围与接口约定。

## 0. 一句话现状

A2UI v0.8 的**客户端渲染链路已经跑通**：JSON/JSONL 流 → Buffer → Parser → Store（含数据模型）→ TreeBuild → React 渲染，标准 Catalog 18 个组件 + OpenLink 扩展均可渲染，并支持数据绑定、双向写回、动态列表模板、组件级增量更新与 Button 本地 Action。**Server 端基础链路已接通**：默认 Mock 模式，`POST /api/generate` 返回完整消息，`POST /api/agent` 通过 AG-UI SSE 流式输出协议文本；OpenAI 模式已保留但默认不启用。

---

## 1. 已完成模块

### 1.1 `packages/a2ui-core`

| 模块 | 文件 | 能力 |
| --- | --- | --- |
| 缓冲区 | `src/buffer/index.ts` | 支持 JSONL 与 JSON 数组；跨分块拼接；数组元素完成即输出；`surfaceUpdate` 多组件自动拆分；未闭合 `flush` 报错 |
| 解析器 | `src/parser/index.ts` | 处理 4 种服务端消息；`createParser` 增量解析；通过 `renderMap` 生成 `_vnode`；未注册组件上报 `RENDER_ERROR`；`runtime` 端口把数据模型写入中心 Store；`path + literal` 隐式播种 |
| 状态 | `src/store/index.ts`、`types.ts` | zustand/vanilla；`surfaceMap` / `hydrateNodeMap` / `errorMap` / `dataModelMap`；CRUD + `markHydrateNodeMounted` + `updateModel` |
| 数据模型工具 | `src/store/model.ts` | `getModelValue` / `setModelValue`（支持数组下标）、`getLiteralValue`、`getBindingPath` |
| 虚拟节点 | `src/vnode/index.ts` | `createVNode`；`A2uiRenderMap`；`A2uiRenderContext`（`resolve` / `updateModel` / `hasMounted`） |
| 组件树 | `src/treebuilder/index.ts` | `explicitList`、`child`、`entryPointChild`/`contentChild`、`tabItems`、`children.template` 动态列表；元素作用域；`renderTreeFromStore` |

### 1.2 `packages/a2ui-react`

- 标准 Catalog **18 个组件**全部实现：`Text` `Image` `Icon` `Video` `AudioPlayer` `Row` `Column` `List` `Card` `Tabs` `Divider` `Modal` `Button` `CheckBox` `TextField` `DateTimeInput` `MultipleChoice` `Slider`
- 扩展组件 `OpenLink`：渲染为 `<a target="_blank" rel="noopener noreferrer">`，点击打开外部网页
- `Button.action.localDataModelUpdate`：点击时按 `surfaceId / path / contents` 调用 `updateModel`，实现本地数据更新
- `src/icons.tsx`：47 个图标名的内联 SVG
- 流式入场淡出动画：`hasMounted === false` 时加 `a2ui-stream-fade`，动画结束回调 `markMounted`

### 1.3 `web/a2ui-playground`

- antd 6 界面，13 个 Mock 切换按钮（新增购物车、本地更新）
- 50ms / 50 字符的原始 JSON 流模拟
- 逐条解析即渲染（`beginRendering` 前用临时根）
- 渲染预览 / 组件树（id · 类型）/ 数据模型（Store）/ Store 弹窗
- 「模拟 updateModel」按钮
- 「应用组件更新（LLM 第二轮）」增量补丁演示
- 「测试非 SSE 接口」按钮：调用 Server 的 `POST /api/generate`，把返回 messages 直接交给 Parser 渲染

### 1.4 Mock 数据清单（`packages/a2ui-core/Mock`）

| 文件 | surfaceId | 用途 |
| --- | --- | --- |
| `simple-text.json` | `mock-surface` | 单 Text |
| `column-text.json` | `mock-column` | Column + 3 Text |
| `nested-tree.json` | `mock-nested` | 3 层嵌套 Column |
| `mixed-tree.json` | `mock-mixed` | Column / Row 混合 |
| `display-components.json` | `mock-display` | 展示类组件 |
| `container-components.json` | `mock-containers` | 容器类组件 |
| `form-components.json` | `mock-forms` | 表单类 + `path` 绑定 |
| `all-components.json` | `mock-all` | 全 18 组件（42 节点） |
| `binding-profile.json` | `mock-profile` | JSON 数组 + 绑定/播种 |
| `list-template.json` | `mock-list` | `children.template` 动态列表 |
| `list-template-min.json` | `mock-list-min` | 模板最小用例 |
| `component-update-initial.json` | `mock-update` | 增量更新初始态 |
| `component-update-patch.json` | `mock-update` | 增量更新补丁 |
| `shopping-cart.json` | `surface-cart` | 购物车列表：`/cart/items` + `line` 文本 |
| `local-update.json` | `surface-local` | 本地 Action + OpenLink 最小示例 |

> 全部 Mock 已统一为标准缩进 JSON 数组（`.json`）；`JsonlBuffer` 同时支持 JSON 数组与 JSONL。

---

## 2. 本阶段改动过的模块

按功能回顾（全部是本轮对话内完成的改动）：

1. **Store 从「只有组件」升级为「组件 + 数据模型」**
   - 新增 `dataModelMap`、`setDataModel` / `getDataModel` / `removeDataModel` / `updateModel`
   - `updateModel` 写入后调用 `renderTreeFromStore` 触发重绘

2. **Parser 与 Store 打通**
   - 新增 `A2uiParserRuntime`，`dataModelUpdate` / `deleteSurface` 同步到 Store
   - `resolve` 改为**实时读 Store**，不再读解析时快照
   - 绑定优先级：元素作用域相对路径 → 画布绝对路径 → `literal*`

3. **`path + literal` 隐式初始化**
   - 解析 `surfaceUpdate` 时扫描属性树，模型缺失才播种，已有值不覆盖

4. **TreeBuild 扩展**
   - 支持 `Card` / `Button` / `Modal` / `Tabs` 的 `child` 类子节点
   - 支持 `children.template`：`dataBinding` 可为数组或 `valueMap` 对象
   - 模板实例 id = `${componentId}#${itemKey}`，作用域内重建 vnode
   - 模板内 `updateModel` 自动映射为 `/集合路径/元素key/字段`

5. **Buffer 扩展**
   - 从「只支持 JSONL」扩展为「JSONL + JSON 数组」
   - 数组元素闭合即输出，支持真正逐元素流式渲染

6. **React 层**
   - 补齐 15 个缺失组件 + 47 个内联 SVG 图标
   - 组件内 `resolve` 读取绑定值

7. **测试体系**
   - `a2ui-core`：Mocha + tsx，Parser 用例独立配置
   - `a2ui-react`：新增 Mocha + `renderToStaticMarkup` 渲染测试

8. **购物车列表 Mock 与预览**
   - 新增 `shopping-cart.json`，用 `List.children.template` 绑定 `/cart/items`，每项一个 `line` 文本
   - Playground 新增「购物车列表（template）」入口

9. **Button 本地更新 Action**
   - 协议扩展 `Button.action.localDataModelUpdate = { surfaceId, path, contents }`
   - `a2ui-react` 新增 `triggerLocalAction`，点击时递归解析 `contents` 并调用 `context.updateModel`
   - 新增 `local-update.json` 最小示例与 3 个单元测试

10. **OpenLink 组件**
    - 协议与 Renderer 新增 `OpenLink`，支持 `url` / `text` 绑定
    - 渲染为 `<a target="_blank" rel="noopener noreferrer">`
    - 已加入 `local-update.json` 示例

11. **Mock 数据规范化**
    - 8 个 `.jsonl` 全部转为标准缩进 JSON 数组 `.json`
    - Playground 导入与 7 个测试文件的引用同步更新

12. **Server 基础链路与 AG-UI SSE**
    - Koa 实现 `POST /api/generate`（非流式）与 `POST /api/agent`（SSE）
    - 默认 `A2UI_AGENT_MODE=mock`，从 `packages/a2ui-core/Mock` 读取协议
    - AG-UI 事件：`RUN_STARTED → STEP_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT × N → TEXT_MESSAGE_END → STEP_FINISHED → RUN_FINISHED`
    - OpenAI Agent 代码保留，切换到 `openai` 模式后启用

13. **Playground 联调与启动修复**
    - 新增「测试非 SSE 接口」按钮，调用 `/api/generate` 并渲染返回消息
    - 修复 `npm run dev:server` 的 ts-node 模块解析问题（相对导入改为无扩展名）

---

## 3. 新增内容一览

| 类别 | 新增 |
| --- | --- |
| 核心文件 | `src/store/model.ts`（路径读写工具） |
| React 文件 | `src/icons.tsx`、`test/render.test.tsx`、`.mocharc.json`、`tsconfig.test.json` |
| Core 测试 | `test/store/model.test.ts`、`test/parser/all-components.test.ts`、`test/parser/category-mocks.test.ts`、`test/parser/model-binding.test.ts`、`test/treebuilder/containers.test.ts`、`test/treebuilder/template-list.test.ts`、`test/treebuilder/template-list-min.test.ts`、`test/stream/mock-stream.test.ts`、`test/integration/binding-flow.test.ts`、`test/integration/template-list.test.ts`、`test/integration/component-update.test.ts` |
| Server 文件 | `src/{index,agent,a2ui,agui,mock,prompt}.ts`、`.env.example` |
| Mock | 见 1.4 表格（15 份，全部标准 JSON 数组） |
| 能力 | JSON 数组流、数据模型中心化、`updateModel`、模板动态列表、增量组件补丁、`localDataModelUpdate`、`OpenLink`、购物车示例、AG-UI SSE |

---

## 4. 核心 API 速查

```ts
// 初始化
const store = init(renderMap, renderTree);

// 数据模型
store.getState().setDataModel(surfaceId, model);
store.getState().updateModel(surfaceId, '/user/name', 'Grace');
store.getState().getDataModel(surfaceId);

// 解析
const parser = createParser(renderMap, onError, markMounted, {
  getDataModel, setDataModel, removeDataModel, updateModel,
});
parser.parseLine(line);
parser.getResult();

// 缓冲区
const buffer = new JsonlBuffer();
buffer.append(chunk); // string[]
buffer.flush();

// 构建与渲染
treeBuild(surface, hydrateNodeMap, renderTree, { renderMap, dataModel, onUpdateModel });
renderTreeFromStore(store);

// 渲染上下文（renderMap 的第二个参数）
context.resolve({ path: '/name' });
context.updateModel('/name', 'Grace');
```

### Server 接口

```bash
# 非 SSE：返回完整 messages
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"input":"生成一个购物车页面"}'

# AG-UI SSE：流式事件
curl -N -X POST http://localhost:3000/api/agent \
  -H 'Content-Type: application/json' \
  -d '{"input":"生成一个购物车页面"}'
```

AG-UI 事件顺序：

```text
RUN_STARTED
→ STEP_STARTED
→ TEXT_MESSAGE_START
→ TEXT_MESSAGE_CONTENT × N
→ TEXT_MESSAGE_END
→ STEP_FINISHED
→ RUN_FINISHED
```

---

## 5. 文件地图

```
packages/a2ui-core/
├── Mock/                     # 15 份协议 Mock（标准 JSON 数组）
├── src/
│   ├── buffer/index.ts
│   ├── parser/index.ts
│   ├── store/{index,types,model}.ts
│   ├── treebuilder/index.ts
│   ├── vnode/index.ts
│   └── index.ts              # barrel
└── test/
    ├── buffer/ store/ parser/ treebuilder/ stream/ integration/
packages/a2ui-react/
├── src/{index.tsx,icons.tsx}
└── test/render.test.tsx
web/a2ui-playground/
└── src/{App.tsx,main.tsx,stream-fade.css}
server/a2ui-playground-server/
├── src/{index,agent,a2ui,agui,mock,prompt}.ts
└── .env.example
specification/v0_8/           # 官方协议（勿改）
```

---

## 6. 关键约定（改代码前必须知道）

1. **数据模型唯一来源是 `store.dataModelMap`**，Parser 通过 `runtime` 写入，渲染时读取；不要另建一份缓存。
2. **绑定解析顺序**：模板元素作用域相对路径 → 画布绝对路径 → `literal*`。
3. **`path + literal` 同时存在**：模型里没有值才播种，已有值绝不覆盖。
4. **模板实例 id 必须稳定**：`${componentId}#${itemKey}`，集合 key 用 `valueMap` 的 key，不要用数组下标。
5. **`surfaceUpdate` 按 id 覆盖**：未出现在消息里的节点对象引用保持不变（增量更新的基础）。
6. **集合值为 `undefined` 视为删除该项**。
7. **构建顺序**：`a2ui-core` → `a2ui-react` → `playground`。`a2ui-react` 的测试会读取 core 的 `dist`，先 build core。
8. 代码注释、文档、提交说明统一用中文。
9. Button 本地更新使用 `action.localDataModelUpdate`（surfaceId/path/contents），不要改回 `type: local + updates`。
10. Server 默认 `A2UI_AGENT_MODE=mock`；`/api/agent` 使用 AG-UI SSE，A2UI 协议文本通过 `TEXT_MESSAGE_CONTENT.delta` 分块推送。
11. Server 源码相对导入保持无扩展名（ts-node CJS 可解析）；若改为 ESM，需要恢复 `.js` 扩展名。
12. `OpenLink` 是标准 Catalog 之外的扩展组件，`all-components` 仍只覆盖标准 18 个组件。

---

## 7. 已知限制与坑

- `treeBuild` 每次全量重建，所有视图组件都会重新执行 `resolve`；DOM 只更新差异处。
- 表单控件只读；`updateModel` 目前靠 Button 本地 Action 或 Playground 按钮触发。
- 模板实例 `hasMounted` 固定 `true`，无入场动画。
- 未实现 `userAction`，服务端 Action 的 client-to-server 事件回传尚未接入。
- `children.template` 指向数组时，插入元素会导致后续下标位移，实例 id 不稳定。
- 示例媒体 URL（MDN）在部分网络环境会请求失败，属于网络问题，不是应用错误。
- Server 默认 Mock 模式会忽略用户输入，固定返回 `A2UI_MOCK_FILE` 指定的协议。
- Server 的 OpenAI 模式已保留，但 SSE 目前是“先取完整文本再分块”，不是 token 级流式。
- `OpenLink` 与 `localDataModelUpdate` 是 v0.8 之外的扩展，`specification/` 官方快照未修改。

---

## 8. 常用命令与验证结果

```bash
npm run dev:web          # playground → http://localhost:5173
npm run dev:server       # server → http://localhost:3000
npm test                 # core + react
npm run test:parser      # Parser 专项
npm run typecheck -w @a2ui/core
npm run typecheck -w @a2ui/react
npm run typecheck -w @a2ui/playground-server
npm run typecheck -w @a2ui/playground
npm run build -w @a2ui/core && npm run build -w @a2ui/react
npm run build -w @a2ui/playground-server
npm run build -w @a2ui/playground
```

最近一次全量验证：

```
core:   74 passing
react:  21 passing
parser: 33 passing
server: typecheck / build 通过
playground: typecheck / build 通过
浏览器：购物车、本地 Action、OpenLink、非 SSE 按钮、AG-UI SSE 均验证通过
```

---

## 9. 2026-11-10 下午工作总结

今天下午的主要增进集中在「协议能力 + Mock 规范 + Server 基础设施 + Playground 联调」四个方向：

1. **协议能力扩展**
   - 新增 `Button.action.localDataModelUpdate`，实现按钮点击 → `updateModel` → Store → 重渲染的本地更新闭环。
   - 新增 `OpenLink` 组件，支持 `url` / `text` 绑定并在新标签页打开外部网页。
   - 两项都属于 A2UI v0.8 之外的扩展，已写入 `packages/a2ui-react/docs/catalog.json`。
2. **Mock 数据规范化**
   - `Mock` 目录统一为标准缩进 JSON 数组，8 个 `.jsonl` 全部转为 `.json`。
   - 新增 `shopping-cart.json`（购物车列表）与 `local-update.json`（本地 Action + OpenLink）两个示例。
3. **Server 基础链路**
   - 基于 Koa 实现 `POST /api/generate`（非流式）与 `POST /api/agent`（AG-UI SSE）。
   - 默认 `A2UI_AGENT_MODE=mock`，从 `packages/a2ui-core/Mock` 读取协议并分块推送。
   - AG-UI 事件序列：`RUN_STARTED → STEP_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT × N → TEXT_MESSAGE_END → STEP_FINISHED → RUN_FINISHED`。
   - OpenAI Agent 代码保留，设置 `A2UI_AGENT_MODE=openai` 后启用。
4. **Playground 联调**
   - 新增「购物车列表」「本地更新」两个 Mock 预览。
   - 新增「测试非 SSE 接口」按钮，调用 `/api/generate` 并把返回 messages 交给 Parser 渲染。
   - 修复 `npm run dev:server` 的 ts-node 模块解析问题（相对导入改为无扩展名）。
