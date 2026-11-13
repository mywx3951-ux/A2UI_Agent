# A2UI Agent Playground

用自然语言或设计稿生成 **A2UI v0.8** 协议，并在浏览器中实时渲染、持续微调的实验项目。

模型不直接生成 HTML，而是输出结构化的 A2UI JSON；客户端解析协议后交给 React 组件库渲染。这样既保留了生成式 UI 的灵活性，又能保证组件样式和交互的一致性。

```text
自然语言 / 图片 → 大模型 → A2UI JSON → SSE 流式传输 → 解析 → React 渲染
```

当前主流程已经跑通，支持多轮增量更新、组件级样式、点击组件定向修改，以及完整的评测用例。

> 说明：服务端 **Mock 模式** 和 **HTML 生成接口** 暂时注释停用，代码仍保留在仓库中，需要时可直接恢复。`packages/a2ui-core/Mock` 下的 JSON 目前作为单元测试 fixture 和提示词示例继续使用。

---

## 1. 核心能力

| 能力 | 说明 |
| --- | --- |
| 自然语言生成 UI | 描述页面需求，模型输出 A2UI 协议并实时渲染 |
| 图片输入 | 最多 4 张图片，作为多模态上下文交给模型 |
| SSE 流式渲染 | 协议按 chunk 推送，浏览器边接收、边解析、边渲染 |
| 多轮增量更新 | 基于当前协议只返回变更的组件 / 数据 / 主题 |
| 点击组件定向修改 | Ctrl / Command + 点击预览组件，可多选并带入下一轮对话 |
| 组件级 `style` | 所有组件支持 camelCase CSS 属性覆盖，用于局部样式微调 |
| 主题 | `beginRendering.styles` 支持 `font` 与 `primaryColor` |
| 图标查询工具 | 模型生成 `Icon` 前通过 `list_a2ui_icons` 查询合法图标名 |
| 仅模型对话模式 | 不生成 UI，单独验证模型连通性与流式输出 |
| JSON 面板 | 实时展示完整 A2UI 协议，支持一键复制、显示 / 隐藏 |
| 评测套件 | 17 个分级用例，可自动执行并校验协议结构与组件白名单 |

---

## 2. 快速开始

### 2.1 环境要求

- Node.js **20.12+**（推荐 20.19+ 或 22+）
- npm 10+
- DeepSeek / OpenAI 兼容的 API Key

### 2.2 安装与构建

```bash
git clone git@github.com:mywx3951-ux/A2UI_Agent.git
cd A2UI_Agent
npm install

# 首次运行建议先构建内部包
npm run build -w @a2ui/core
npm run build -w @a2ui/react
```

### 2.3 配置模型

```bash
cd server/a2ui-playground-server
cp .env.example .env
```

编辑 `.env`：

```bash
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com
# OPENAI_TIMEOUT_MS=60000

STREAM_CHUNK_SIZE=80
STREAM_INTERVAL_MS=60
PORT=3000
```

`.env` 已被 `.gitignore` 忽略。DeepSeek 使用 OpenAI 兼容协议，因此不需要额外的 SDK。

### 2.4 启动

终端 1：

```bash
npm run dev:server
```

终端 2：

```bash
npm run dev:web
```

浏览器访问 `http://localhost:5173`。

自检：

```bash
curl http://localhost:3000/health
# { "status": "ok", "mode": "openai" }
```

---

## 3. 使用方式

### 3.1 生成页面

在左侧输入需求，例如：

- `生成一个天气卡片，显示城市、温度和天气状况`
- `生成一个登录卡片，主色使用 #e8590c，字体使用 Georgia`

按 Enter 或点击「发送」后：

- 中间预览区会随协议到达逐步出现组件
- 右侧 JSON 面板实时展示完整 A2UI 协议
- 生成完成后可点击「复制 JSON」

### 3.2 多轮修改

生成完成后继续输入修改需求，例如：

- `把刷新按钮改成蓝色`
- `增加一个湿度字段`
- `主色换成 #e8590c`

从第二轮开始，前端会把当前完整协议作为 `currentProtocol` 传给服务端，服务端只返回需要变更的消息，页面不会整体重置。

### 3.3 点击组件定向修改

1. 按住 **Ctrl**（Windows / Linux）或 **Command**（macOS），点击预览区中的组件
2. 再次按住 Ctrl / Command 点击其他组件，可同时选中多个
3. 输入框上方会出现「目标组件」标签列表，点击标签上的 × 可单独移除，或点击「清空」
4. 下一次对话只针对这些 Component ID 生效，例如：
   - `把这些组件改成红色圆角 12`
   - `删除选中的组件`

目标 ID 列表会随请求通过 `targetComponentIds` 传给模型，提示词要求模型只修改或删除这些组件。

> 不按 Ctrl / Command 的普通点击不会触发选中，避免影响链接、按钮等组件自身的交互。

### 3.4 组件级样式

每个组件都支持可选的 `style` 字段，使用 camelCase CSS 属性名：

```json
{
  "id": "login-button",
  "component": {
    "Button": {
      "child": "login-label",
      "primary": true,
      "style": {
        "backgroundColor": "#ff4d4f",
        "borderColor": "#ff4d4f",
        "borderRadius": 10,
        "padding": "10px 24px",
        "fontSize": 16
      }
    }
  }
}
```

自定义样式会与组件内置样式合并，未指定的属性保持默认值。优先使用 `usageHint` 和 `beginRendering.styles` 保持整体一致，只有在需要局部微调时才使用 `style`。

### 3.5 图片输入

点击「添加图片」，最多 4 张。前端会把本地图片转成 data URL 发给模型。模型需要具备视觉能力才能真正理解图片内容。

### 3.6 仅测试模型对话

打开左上角「仅测试模型对话」开关：

- 请求走 `/api/chat/stream`
- 左侧逐字显示模型回复
- 不生成 UI
- 用于单独验证模型连通性与流式能力

### 3.7 JSON 面板

- 生成过程中实时增长并自动滚动
- 「复制 JSON」复制完整协议
- 「隐藏 / 显示」控制右侧面板；隐藏后渲染区自动占满剩余宽度，协议仍在后台更新

---

## 4. 架构与数据流

### 4.1 主链路

```text
用户输入（文本 + 图片）
  ↓
POST /api/agent
  ↓
Server：系统提示词 + Catalog + 模型 → A2UI JSON
  ↓
AG-UI SSE：CUSTOM / a2ui.jsonl.chunk 分块推送
  ↓
浏览器：fetch + ReadableStream
  ↓
JsonlBuffer：跨 chunk 拼接，切出完整 JSON 消息
  ↓
Parser：解析 surfaceUpdate / dataModelUpdate / beginRendering / deleteSurface
  ↓
Store：surfaceMap / hydrateNodeMap / errorMap / dataModelMap
  ↓
TreeBuilder：按 children / child / tabItems / template 构建组件树
  ↓
@a2ui/react：renderMap 渲染为 React 组件
```

### 4.2 增量更新

- `surfaceUpdate`：按组件 `id` 覆盖或新增
- `dataModelUpdate`：按 `path` 合并数据模型
- `beginRendering`：按 `surfaceId` 替换主题与根节点
- `deleteSurface`：清空整个 surface

删除单个组件没有独立消息，做法是修改父组件的 `children`，不再引用该 `id`。

列表数据建议写成带索引 `key` 的映射：

```json
{
  "key": "cities",
  "valueMap": [
    { "key": "0", "valueMap": [{ "key": "name", "valueString": "杭州" }] },
    { "key": "1", "valueMap": [{ "key": "name", "valueString": "北京" }] }
  ]
}
```

渲染器同时兼容模型偶尔输出的 `valueMap: [[...], [...]]` 写法，会自动转换成数组供 `List.children.template` 展开。

### 4.3 两条 SSE 通道

`/api/agent` 同时推送两类数据：

| 通道 | 事件 | 用途 |
| --- | --- | --- |
| A2UI 协议 | `CUSTOM` + `name: "a2ui.jsonl.chunk"` | 交给 Buffer / Parser 渲染 |
| 自然语言 | `TEXT_MESSAGE_CONTENT` | 聊天区展示「正在生成 / 已完成」 |

事件顺序：

```text
RUN_STARTED
→ STEP_STARTED
→ TEXT_MESSAGE_START
→ CUSTOM / a2ui.jsonl.chunk × N
→ TEXT_MESSAGE_CONTENT
→ TEXT_MESSAGE_END
→ STEP_FINISHED
→ RUN_FINISHED
```

失败时发送 `RUN_ERROR`。

---

## 5. 项目结构

```text
A2UI_agent/
├── docs/                          # 提示词与协议文档
│   ├── agent-prompt.md            # A2UI Agent 提示词模板
│   ├── html-agent-prompt.md       # HTML 生成提示词（暂时停用）
│   ├── catalog.json               # 当前渲染器支持的组件与属性
│   ├── icon-catalog.json          # 48 个合法图标注册表
│   └── client_to_server.json      # 客户端事件协议（userAction）
├── packages/
│   ├── a2ui-core/                 # A2UI 协议 SDK
│   │   ├── Mock/                  # 测试 fixture 与提示词示例
│   │   └── src/
│   │       ├── buffer/            # JSONL / JSON 数组流式缓冲
│   │       ├── parser/            # 服务端消息解析
│   │       ├── store/             # zustand 状态与数据模型
│   │       ├── treebuilder/       # 组件树构建
│   │       └── vnode/             # 组件到虚拟节点的映射
│   └── a2ui-react/                # React 渲染器
│       ├── src/index.tsx          # renderMap、18 个组件、A2uiSurface
│       ├── src/icons.tsx          # 内联 SVG 图标
│       └── test/render.test.tsx   # 服务端渲染测试
├── server/
│   └── a2ui-playground-server/
│       ├── src/index.ts           # Koa 路由与 SSE
│       ├── src/agent.ts           # 模型调用、工具循环、流式生成
│       ├── src/prompt.ts          # 提示词模板组装
│       ├── src/tools.ts           # list_a2ui_icons 工具
│       ├── src/agui.ts            # AG-UI 事件定义与序列化
│       ├── src/a2ui.ts            # 输出解析与校验
│       ├── src/mock.ts            # Mock 读取（暂时停用）
│       └── .env.example
├── web/
│   └── a2ui-playground/
│       └── src/
│           ├── App.tsx            # 对话、预览、JSON 面板
│           ├── agent-client.ts    # SSE 客户端
│           └── stream-fade.css    # 入场动画与光标
├── evaluation/                    # 17 个分级评测用例
├── specification/v0_8/            # A2UI 官方协议快照
└── package.json                   # npm workspaces 根配置
```

### 5.1 模块职责

| 模块 | 职责 |
| --- | --- |
| `@a2ui/core` | 协议 SDK：缓冲、解析、状态、数据模型、组件树 |
| `@a2ui/react` | 渲染器：18 个标准组件 + `OpenLink` + 主题容器 |
| `web/a2ui-playground` | 可视化 Playground |
| `server/a2ui-playground-server` | 模型网关与 SSE 服务 |
| `docs` | 提示词、Catalog、图标注册表 |
| `evaluation` | 评测用例与自动执行脚本 |

---

## 6. 核心模块

### 6.1 `@a2ui/core`

| 模块 | 文件 | 能力 |
| --- | --- | --- |
| Buffer | `src/buffer/index.ts` | 支持 JSONL 与 JSON 数组；跨分块拼接；元素闭合即输出 |
| Parser | `src/parser/index.ts` | 解析 4 种消息；生成 vnode；同步数据模型 |
| Store | `src/store/index.ts` | zustand/vanilla；surfaceMap / hydrateNodeMap / errorMap / dataModelMap |
| Data Model | `src/store/model.ts` | `getModelValue` / `setModelValue`，支持数组下标 |
| VNode | `src/vnode/index.ts` | `createVNode`、`A2uiRenderMap`、`A2uiRenderContext` |
| TreeBuilder | `src/treebuilder/index.ts` | `explicitList`、`child`、`tabs`、`template` 动态列表 |

常用 API：

```ts
import {
  init,
  createParser,
  JsonlBuffer,
  renderTreeFromStore,
} from '@a2ui/core';

const store = init(renderMap, (tree) => {
  // 渲染树变化
});

const parser = createParser(renderMap, onError, markMounted, runtime);
parser.parseLine(line);
parser.getResult();

const buffer = new JsonlBuffer();
const messages = buffer.append(chunk);
```

### 6.2 `@a2ui/react`

- `renderMap`：组件名 → React 渲染函数
- 18 个标准组件：
  `Text` `Image` `Icon` `Video` `AudioPlayer` `Row` `Column` `List` `Card` `Tabs` `Divider` `Modal` `Button` `CheckBox` `TextField` `DateTimeInput` `MultipleChoice` `Slider`
- 扩展组件：
  - `OpenLink`：在新标签页打开链接
  - `Button.action.localDataModelUpdate`：点击后写回本地数据模型
- 所有组件支持组件级 `style` 覆盖
- `A2uiSurface`：把 `beginRendering.styles` 转成 CSS 变量
  - `font`
  - `primaryColor`
- `icons.tsx`：48 个内联 SVG 图标

### 6.3 Server

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | Koa 路由、SSE 响应、请求体解析 |
| `src/agent.ts` | 模型调用、工具循环、A2UI / 对话生成 |
| `src/prompt.ts` | 读取 `docs/agent-prompt.md`，注入 Catalog 与示例 |
| `src/tools.ts` | `list_a2ui_icons` 图标查询工具 |
| `src/agui.ts` | AG-UI 事件类型与 SSE 序列化 |
| `src/a2ui.ts` | 模型输出解析、A2UI 消息校验 |
| `src/mock.ts` | Mock 读取（暂时停用） |

### 6.4 Playground

- 左侧对话区（30%）
- 中间渲染预览
- 右侧 A2UI JSON（可隐藏）
- SSE 增量解析与渲染
- 点击组件选中 Component ID
- 图片附件
- 仅模型对话测试模式

---

## 7. 接口

### 7.1 健康检查

```http
GET /health
```

```json
{ "status": "ok", "mode": "openai" }
```

### 7.2 A2UI Agent（SSE）

```http
POST /api/agent
Content-Type: application/json

{
  "input": "把刷新按钮改成蓝色",
  "images": [],
  "currentProtocol": "[{\"surfaceUpdate\":{...}}]",
  "history": [
    { "role": "user", "content": "生成一个天气卡片" },
    { "role": "assistant", "content": "agent完成：已生成界面 weather-card" }
  ],
  "targetComponentIds": ["refresh-button", "temperature-text"]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `input` | 是 | 用户本轮需求 |
| `images` | 否 | 图片 data URL 或 http(s) 地址，最多 4 张 |
| `currentProtocol` | 否 | 当前页面完整 A2UI 协议；传入后进入增量更新模式 |
| `history` | 否 | 最近对话，服务端最多取 8 条 |
| `targetComponentIds` | 否 | 本轮只修改或删除这些组件；兼容旧的单个 `targetComponentId` 字段 |

`CUSTOM` 事件示例：

```json
{
  "type": "CUSTOM",
  "name": "a2ui.jsonl.chunk",
  "value": "{\"surfaceUpdate\":{\"surfaceId\":\"...\"}}"
}
```

### 7.3 模型对话

```http
POST /api/chat          # 非流式
POST /api/chat/stream   # SSE 流式
Content-Type: application/json

{ "input": "用一句话介绍你自己" }
```

### 7.4 暂时停用的接口

以下代码仍保留在仓库中，但已注释，不参与当前主流程：

| 接口 | 说明 |
| --- | --- |
| `POST /api/generate` | 非流式 A2UI 生成 |
| `POST /api/html/stream` | HTML + CSS 流式生成 |

恢复方式：在 `server/a2ui-playground-server/src/index.ts` 中取消对应路由注释，并恢复顶部 `import`。

---

## 8. 提示词与 Catalog

### 8.1 A2UI 提示词

[docs/agent-prompt.md](docs/agent-prompt.md) 是模板，包含两个占位符：

- `{{catalog}}`：由 `docs/catalog.json` 注入
- `{{example}}`：由 `packages/a2ui-core/Mock/local-update.json` 注入

组装逻辑在 [server/a2ui-playground-server/src/prompt.ts](server/a2ui-playground-server/src/prompt.ts)。修改提示词后需要重启 Server。

提示词覆盖：

- 输出格式与消息结构
- 多轮增量更新规则
- 指定组件操作规则
- 组件使用规则与数据绑定规则
- 组件级 `style` 规范
- 图标查询工具的使用方式
- 自检清单

### 8.2 Catalog

[docs/catalog.json](docs/catalog.json) 描述当前渲染器实际支持的组件与属性，会作为系统提示词的一部分发给模型。

所有组件（含扩展组件 `OpenLink`）都支持可选的 `style` 字段，使用 camelCase CSS 属性名，例如：

```json
{ "style": { "fontSize": 18, "color": "#1677ff", "borderRadius": 12 } }
```

新增组件时必须同步更新：

1. `docs/catalog.json`
2. `packages/a2ui-react/src/index.tsx` 的 `renderMap`
3. 必要时更新 `docs/agent-prompt.md`

### 8.3 图标工具

当模型需要使用 `Icon` 时，会先调用 `list_a2ui_icons` 工具查询合法图标名。工具读取 [docs/icon-catalog.json](docs/icon-catalog.json)，按名称、分类、别名和关键词匹配，返回可用图标列表。

---

## 9. 测试与评测

### 9.1 单元与集成测试

```bash
npm test
```

覆盖：

- `a2ui-core`：Buffer、Parser、Store、数据模型、TreeBuilder、模板列表、增量更新
- `a2ui-react`：18 个组件、OpenLink、本地 Action、主题容器、组件级 style、入场动画

Parser 专项：

```bash
npm run test:parser
```

### 9.2 Agent 评测

评测用例位于 `evaluation/`，共 17 个，按能力分级：

```bash
# 查看全部用例
node evaluation/run-case.mjs --list

# 执行单个用例
node evaluation/run-case.mjs 06-theme

# 指定 Server 地址
A2UI_SERVER_URL=http://localhost:3000 node evaluation/run-case.mjs 09-multi-turn-update
```

执行结果会写入 `evaluation/results/`（已加入 `.gitignore`）。详细说明见 [evaluation/README.md](evaluation/README.md)。

---

## 10. 常用命令

```bash
# 开发
npm run dev:web
npm run dev:server

# 测试
npm test
npm run test:parser

# 类型检查
npm run typecheck
npm run typecheck -w @a2ui/core
npm run typecheck -w @a2ui/react
npm run typecheck -w @a2ui/playground
npm run typecheck -w @a2ui/playground-server

# 构建
npm run build -w @a2ui/core
npm run build -w @a2ui/react
npm run build -w @a2ui/playground-server
npm run build -w @a2ui/playground

# 生产启动 Server
npm run build -w @a2ui/playground-server
npm run start -w @a2ui/playground-server
```

---

## 11. 联调与排查

### 11.1 前端连的是哪个 Server

[web/a2ui-playground/src/agent-client.ts](web/a2ui-playground/src/agent-client.ts)：

```ts
export const API_BASE_URL = 'http://localhost:3000';
```

如果 Server 端口或地址不同，需要同步修改。

### 11.2 SSE 没有流式效果

排查顺序：

1. DevTools → Network → 对应请求 → **EventStream** 面板
2. 确认响应头：
   - `Content-Type: text/event-stream`
   - `Transfer-Encoding: chunked`
3. 确认 Koa 处理函数没有 `await` 整个发送循环
   - 必须 `void (async () => { ... })()`，先让中间件返回
4. 确认没有代理 / 网关缓存
   - 响应头已设置 `Cache-Control: no-cache, no-transform`
   - `X-Accel-Buffering: no`

### 11.3 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `503 缺少 OPENAI_API_KEY` | `.env` 未配置或未重启 | 填 Key 后重启 Server |
| `401` / `502 调用 OpenAI 失败` | Key、模型名或 Base URL 错误 | 检查 `.env` |
| `EADDRINUSE :::3000` | 端口被旧进程占用 | `lsof -nP -iTCP:3000 -sTCP:LISTEN` 后结束进程 |
| `Port 5173 is in use` | 有旧 Vite 进程 | 结束旧进程或使用新端口 |
| `has no exported member` | `dist` 未更新 | 重新构建 core / react |
| 修改 `.env` 不生效 | Server 不热加载 env | 重启 `npm run dev:server` |
| 图片没有效果 | 模型不支持视觉 | 换成多模态模型 |

### 11.4 如何切换模型

修改 `.env`：

```bash
OPENAI_MODEL=deepseek-chat
# 或
OPENAI_MODEL=deepseek-reasoner
# 或任意 OpenAI 兼容模型
OPENAI_BASE_URL=https://api.deepseek.com
```

---

## 12. 构建与部署

### 12.1 构建

```bash
npm run build -w @a2ui/core
npm run build -w @a2ui/react
npm run build -w @a2ui/playground-server
npm run build -w @a2ui/playground
```

### 12.2 启动 Server

```bash
npm run start -w @a2ui/playground-server
```

### 12.3 部署前端

`web/a2ui-playground/dist` 是纯静态资源，可部署到任意静态服务器。

注意：

- 当前 `API_BASE_URL` 是硬编码的 `http://localhost:3000`
- 正式部署时建议改成环境变量，例如 `VITE_API_BASE_URL`
- Server 已开启 CORS，但仍建议生产环境收紧来源

---

## 13. 设计取舍

A2UI 属于**混合式生成 UI**：模型负责结构与语义，渲染器负责样式与交互。

- `usageHint`：让模型描述「这是标题 / 头像 / 卡片图」，而不是具体字号颜色
- `beginRendering.styles`：提供全局主题（字体、主色）
- 组件级 `style`：作为受控逃生口，用于用户明确要求的局部样式微调
- 组件内置样式：保证同一语义在不同页面中表现一致

这能降低模型对设计稿的感知要求，也让换主题、换渲染器时协议保持稳定。

---

## 14. 已知限制

- 表单控件目前只读：`CheckBox` / `TextField` / `DateTimeInput` / `MultipleChoice` / `Slider`
- `userAction` 客户端到服务端事件尚未接入
- 多轮增量更新依赖模型只输出变更消息；模型偶尔返回全量组件时仍能渲染，但会失去 token 优势
- `beginRendering.styles` 只支持 `font` 与 `primaryColor`
- `MultipleChoice.maxAllowedSelections` 与 `filterable` 未实现
- `Tabs` 无切换交互，`Modal` 无弹窗交互
- 模板数组插入元素时，下标型实例 id 可能不稳定
- `a2ui-core` 的 vnode / treebuilder 仍依赖 React，尚未完全框架无关
- Server 无鉴权、限流、会话存储；适合本地开发与演示
- Mock 模式与 HTML 生成接口暂时停用

---

## 15. 后续可扩展方向

- `userAction` 协议闭环：客户端事件 → 服务端 → `dataModelUpdate`
- 表单双向绑定与本地数据写回
- 更丰富的语义枚举 / 组件 variant（Button、Card 等）与 design token
- 多 surface 同时预览
- HTML / A2UI 双输出模式切换（代码已保留）
- 将 `a2ui-core` 的 vnode 层抽象为框架无关适配器

---

## 16. 安全提示

- 不要把 `.env`、API Key 提交到仓库
- SSE 接口当前未做鉴权，请勿直接暴露到公网
- 渲染模型生成的 HTML 时必须使用沙箱（`iframe sandbox`）并禁用脚本
- 生产环境建议增加：
  - 请求鉴权
  - 速率限制
  - 输入长度 / 图片大小限制
  - CORS 白名单
