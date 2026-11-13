# A2UI Agent Playground

一个面向 A2UI v0.8 协议的 UI 生成与渲染实验项目。

项目包含完整的「自然语言 / 图片 → A2UI JSON 协议 → 客户端解析 → React 渲染」链路，同时提供 DeepSeek / OpenAI 兼容的模型对话与 SSE 流式输出能力。

---

## 1. 项目定位

### 1.1 主要职责

| 模块 | 职责 |
| --- | --- |
| `packages/a2ui-core` | A2UI 协议 SDK：缓冲区、解析器、状态管理、数据模型、组件树构建 |
| `packages/a2ui-react` | A2UI 的 React 渲染器：18 个标准组件 + OpenLink 扩展 + 主题容器 |
| `web/a2ui-playground` | 可视化 Playground：左侧对话、右侧渲染预览 + A2UI JSON |
| `server/a2ui-playground-server` | 模型网关与 SSE 服务：A2UI 生成、模型对话、HTML 生成 |
| `docs` | Agent 提示词、Catalog、客户端事件协议 |

### 1.2 当前能力

- 自然语言生成 A2UI 协议，并实时渲染
- 多轮增量更新：组件、数据、主题样式微调
- 图片（多模态）输入，最多 4 张
- SSE 流式返回，边接收边解析、边渲染
- 右侧同时展示「渲染预览」和「A2UI JSON」，JSON 可一键复制
- 支持 Mock 模式与真实模型模式切换
- DeepSeek / OpenAI 兼容接口
- 独立的「仅测试模型对话」模式
- A2UI 主题：`beginRendering.styles` 的 `font` 与 `primaryColor`
- 额外的 HTML + CSS 生成接口（当前前端主流程使用 A2UI JSON）

---

## 2. 技术栈

- TypeScript 5.9
- React 19 + Ant Design 6
- Vite 8
- Koa 3 + `@koa/router`
- OpenAI SDK（兼容 DeepSeek）
- zustand/vanilla
- Mocha + tsx

---

## 3. 目录结构

```text
A2UI_agent/
├── docs/                          # 提示词与协议文档
│   ├── agent-prompt.md            # A2UI Agent 提示词模板（含 {{catalog}} / {{example}}）
│   ├── html-agent-prompt.md       # HTML + CSS 生成提示词
│   ├── catalog.json               # 当前渲染器支持的组件与属性
│   └── client_to_server.json      # 客户端事件协议（userAction）
├── packages/
│   ├── a2ui-core/                 # A2UI 协议 SDK
│   │   ├── Mock/                  # 协议示例与测试数据
│   │   ├── src/
│   │   │   ├── buffer/            # JSONL / JSON 数组流式缓冲
│   │   │   ├── parser/            # 服务端消息解析
│   │   │   ├── store/             # zustand 状态与数据模型
│   │   │   ├── treebuilder/       # 组件树构建
│   │   │   └── vnode/             # 组件到虚拟节点的映射
│   │   └── test/                  # core 单元与集成测试
│   └── a2ui-react/                # React 渲染器
│       ├── src/index.tsx          # renderMap、18 个组件、A2uiSurface
│       ├── src/icons.tsx          # 内联 SVG 图标
│       └── test/render.test.tsx   # 服务端渲染测试
├── server/
│   └── a2ui-playground-server/
│       ├── src/index.ts           # Koa 接口与 SSE
│       ├── src/agent.ts           # 模型调用与流式生成
│       ├── src/prompt.ts          # 提示词模板组装
│       ├── src/mock.ts            # Mock 文件读取
│       ├── src/agui.ts            # AG-UI 事件定义
│       ├── src/a2ui.ts            # A2UI 输出解析与校验
│       └── .env.example           # 环境变量模板
├── web/
│   └── a2ui-playground/
│       └── src/
│           ├── App.tsx            # 对话、预览、JSON 面板
│           ├── agent-client.ts    # SSE 客户端
│           └── stream-fade.css    # 入场动画与光标
├── specification/v0_8/            # A2UI 官方协议快照
├── package.json                   # npm workspaces 根配置
└── README.MD
```

---

## 4. 架构与数据流

### 4.1 A2UI 主链路

```text
用户输入（文本 + 图片）
  ↓
POST /api/agent
  ↓
Server：提示词 + 模型 → A2UI JSON
  ↓
AG-UI SSE：CUSTOM / a2ui.jsonl.chunk 分块推送
  ↓
浏览器：ReadableStream 接收
  ↓
JsonlBuffer：拼接并切出完整 JSON 消息
  ↓
Parser：解析 surfaceUpdate / dataModelUpdate / beginRendering / deleteSurface
  ↓
Store：surfaceMap / hydrateNodeMap / errorMap / dataModelMap
  ↓
treeBuild：构建组件树
  ↓
a2ui-react：renderMap 渲染
```

### 4.2 两种运行模式

| 模式 | 说明 |
| --- | --- |
| `A2UI_AGENT_MODE=mock` | `/api/agent` 与 `/api/generate` 从 `packages/a2ui-core/Mock` 随机返回协议，不调用模型 |
| `A2UI_AGENT_MODE=openai` | 使用真实模型（DeepSeek / OpenAI）生成 A2UI 协议 |

> `/api/chat`、`/api/chat/stream`、`/api/html/stream` 始终调用真实模型，不受 `A2UI_AGENT_MODE` 影响。

---

## 5. 快速开始

### 5.1 环境要求

- Node.js 20 及以上（建议 20.19+ 或 22+）
- npm 10+
- 一个可用的 DeepSeek / OpenAI API Key

### 5.2 克隆项目

```bash
git clone git@github.com:mywx3951-ux/A2UI_Agent.git
cd A2UI_Agent
```

也可以使用 HTTPS：

```bash
git clone https://github.com/mywx3951-ux/A2UI_Agent.git
```

### 5.3 安装依赖

```bash
npm install
```

项目使用 npm workspaces，一次安装会同时安装：

- `packages/a2ui-core`
- `packages/a2ui-react`
- `web/a2ui-playground`
- `server/a2ui-playground-server`

### 5.4 初始化构建产物

Vite 开发时会把 `@a2ui/core`、`@a2ui/react` 别名到源码，但 TypeScript 类型检查和生产构建会读取 `dist`，所以首次建议先构建：

```bash
npm run build -w @a2ui/core
npm run build -w @a2ui/react
```

### 5.5 配置环境变量

```bash
cd server/a2ui-playground-server
cp .env.example .env
```

编辑 `.env`：

```bash
# A2UI 生成模式：mock / openai
A2UI_AGENT_MODE=openai

# Mock 模式使用：random 或具体文件名
A2UI_MOCK_FILE=random

# DeepSeek（OpenAI 兼容）
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com
# OPENAI_TIMEOUT_MS=60000

# SSE 分块
STREAM_CHUNK_SIZE=80
STREAM_INTERVAL_MS=60

PORT=3000
```

注意：

- `.env` 已被 `.gitignore` 忽略，不要提交 API Key
- 修改 `.env` 后需要重启 Server

### 5.6 启动

终端 1：

```bash
npm run dev:server
```

启动后：

```text
a2ui-playground-server listening on http://localhost:3000 (mode: openai)
```

终端 2：

```bash
npm run dev:web
```

浏览器访问：

```text
http://localhost:5173
```

### 5.7 启动后自检

```bash
curl http://localhost:3000/health
```

期望返回：

```json
{ "status": "ok", "mode": "openai" }
```

---

## 6. 使用说明

### 6.1 生成页面

1. 在左侧输入需求，例如：
   - `生成一个天气卡片，显示城市、温度和天气状况`
   - `生成一个登录卡片，主色使用 #e8590c，字体使用 Georgia`
2. 按 Enter 或点击「发送」
3. 右侧会实时展示：
   - 左栏：渲染预览
   - 右栏：流式增长的 A2UI JSON
4. 点击「复制 JSON」可复制完整协议
5. 生成完成后继续输入修改需求，例如：
   - `把刷新按钮改成蓝色`
   - `增加一个湿度字段`
   - `主色换成 #e8590c`
   
   第二次开始会基于当前协议做增量更新，页面不会重置。

### 6.2 图片输入

- 点击「添加图片」，最多 4 张
- 支持粘贴/选择本地图片，前端会转成 data URL
- 模型需具备视觉能力才能真正理解图片内容

### 6.3 仅测试模型对话

打开左上角「仅测试模型对话」开关：

- 请求走 `/api/chat/stream`
- 左侧逐字显示模型回复
- 右侧不生成 UI
- 用于单独验证模型连通性与流式能力

---

## 7. 核心模块说明

### 7.1 `@a2ui/core`

| 模块 | 文件 | 能力 |
| --- | --- | --- |
| Buffer | `src/buffer/index.ts` | 支持 JSONL 与 JSON 数组；跨分块拼接；元素闭合即输出 |
| Parser | `src/parser/index.ts` | 解析 4 种服务端消息；生成 vnode；同步数据模型 |
| Store | `src/store/index.ts` | zustand/vanilla；surfaceMap / hydrateNodeMap / errorMap / dataModelMap |
| Data Model | `src/store/model.ts` | `getModelValue` / `setModelValue`，支持数组下标 |
| VNode | `src/vnode/index.ts` | `createVNode`、`A2uiRenderMap`、`A2uiRenderContext` |
| TreeBuilder | `src/treebuilder/index.ts` | `explicitList`、`child`、`tabs`、`template` 动态列表 |

常见 API：

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

### 7.2 `@a2ui/react`

- `renderMap`：组件名 → React 渲染函数
- 18 个标准组件：
  `Text` `Image` `Icon` `Video` `AudioPlayer` `Row` `Column` `List` `Card` `Tabs` `Divider` `Modal` `Button` `CheckBox` `TextField` `DateTimeInput` `MultipleChoice` `Slider`
- 扩展组件：
  - `OpenLink`：`<a target="_blank" rel="noopener noreferrer">`
  - `Button.action.localDataModelUpdate`：本地写回数据模型
- `A2uiSurface`：把 `beginRendering.styles` 转成 CSS 变量
  - `font`
  - `primaryColor`
- `icons.tsx`：47 个内联 SVG 图标

### 7.3 Server

| 文件 | 职责 |
| --- | --- |
| `src/index.ts` | Koa 路由、SSE 响应、请求体解析 |
| `src/agent.ts` | A2UI / HTML / 对话的模型调用 |
| `src/prompt.ts` | 读取 `docs/agent-prompt.md`，注入 Catalog 与示例 |
| `src/mock.ts` | 读取 `packages/a2ui-core/Mock`，支持随机选择 |
| `src/agui.ts` | AG-UI 事件类型与 SSE 序列化 |
| `src/a2ui.ts` | 模型输出解析、A2UI 消息校验 |

### 7.4 Playground

[`web/a2ui-playground/src/App.tsx`](web/a2ui-playground/src/App.tsx)：

- 左侧对话区（30%）
- 右侧预览 + A2UI JSON（70%）
- SSE 增量解析与渲染
- 图片附件
- JSON 复制
- 模型对话测试模式

[`web/a2ui-playground/src/agent-client.ts`](web/a2ui-playground/src/agent-client.ts)：

- `streamAgent`：A2UI Agent SSE
- `streamChat`：模型对话 SSE
- `streamHtml`：HTML 生成 SSE
- 统一的 `readSseFrames`

---

## 8. 接口文档

### 8.1 健康检查

```http
GET /health
```

返回：

```json
{ "status": "ok", "mode": "openai" }
```

### 8.2 非流式 A2UI 生成

```http
POST /api/generate
Content-Type: application/json

{
  "input": "生成一个购物车页面",
  "images": []
}
```

返回：

```json
{
  "messages": [ ... ],
  "meta": {
    "model": "deepseek-chat",
    "durationMs": 1234,
    "mockFile": "shopping-cart.json"
  }
}
```

### 8.3 A2UI Agent（SSE）

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
  ]
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `input` | 是 | 用户本轮需求 |
| `images` | 否 | 图片 data URL 或 http(s) 地址，最多 4 张 |
| `currentProtocol` | 否 | 当前页面完整 A2UI 协议；传入后进入增量更新模式 |
| `history` | 否 | 最近对话，服务端最多取 8 条 |

增量更新模式下，服务端允许只返回变更的 `surfaceUpdate` / `dataModelUpdate` / `beginRendering`，甚至返回空数组表示无需修改。

事件顺序：

```text
RUN_STARTED
→ STEP_STARTED
→ TEXT_MESSAGE_START
→ CUSTOM / a2ui.jsonl.chunk × N
→ TEXT_MESSAGE_CONTENT（agent 完成说明）
→ TEXT_MESSAGE_END
→ STEP_FINISHED
→ RUN_FINISHED
```

失败时发送：

```text
RUN_ERROR
```

`CUSTOM` 事件示例：

```json
{
  "type": "CUSTOM",
  "name": "a2ui.jsonl.chunk",
  "value": "{\"surfaceUpdate\":{\"surfaceId\":\"...\"}}"
}
```

### 8.4 非流式模型对话

```http
POST /api/chat
Content-Type: application/json

{ "input": "用一句话介绍你自己" }
```

返回：

```json
{
  "reply": "你好，我是一个 AI 助手。",
  "meta": { "model": "deepseek-chat", "durationMs": 800 }
}
```

### 8.5 流式模型对话

```http
POST /api/chat/stream
```

SSE 事件：

```text
RUN_STARTED
→ STEP_STARTED
→ TEXT_MESSAGE_START
→ TEXT_MESSAGE_CONTENT × N
→ TEXT_MESSAGE_END
→ STEP_FINISHED
→ RUN_FINISHED
```

### 8.6 HTML + CSS 生成（可选）

```http
POST /api/html/stream
```

SSE 的 `TEXT_MESSAGE_CONTENT.delta` 是 HTML 源码片段。

说明：

- 该接口已实现，但当前 Playground 主流程使用 A2UI JSON 模式
- 生成的 HTML 会被前端清洗掉 Markdown 围栏与 `<script>`
- 预览建议使用 `sandbox` iframe，禁止脚本执行

### 8.7 curl 调试示例

```bash
# A2UI 非流式
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"input":"生成一个用户卡片"}'

# A2UI 流式
curl -N -X POST http://localhost:3000/api/agent \
  -H 'Content-Type: application/json' \
  -d '{"input":"生成一个天气卡片"}'

# 模型对话
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"input":"你好"}'

# 流式对话
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"input":"介绍一下杭州"}'
```

---

## 9. 提示词与协议

### 9.1 A2UI 提示词

[docs/agent-prompt.md](docs/agent-prompt.md) 是模板，包含两个占位符：

- `{{catalog}}`：由 `docs/catalog.json` 注入
- `{{example}}`：由 `packages/a2ui-core/Mock/local-update.json` 注入

组装逻辑在 [server/a2ui-playground-server/src/prompt.ts](server/a2ui-playground-server/src/prompt.ts)。

修改提示词后需要重启 Server。

### 9.2 HTML 提示词

[docs/html-agent-prompt.md](docs/html-agent-prompt.md) 用于 HTML + CSS 生成模式。

约束：

- 只输出完整 HTML 文档
- CSS 内联在 `<style>` 中
- 禁止 `<script>` 和内联事件
- 响应式、语义化、可访问性

### 9.3 Catalog

[docs/catalog.json](docs/catalog.json) 描述了当前渲染器实际支持的组件与属性，会作为系统提示词的一部分发给模型。

所有组件（含扩展组件 `OpenLink`）都支持可选的 `style` 字段，使用 camelCase CSS 属性名，渲染时与组件内置样式合并，例如 `{ "style": { "fontSize": 18, "color": "#1677ff" } }`。

新增组件时必须同步更新：

1. `docs/catalog.json`
2. `packages/a2ui-react/src/index.tsx` 的 `renderMap`
3. 必要时更新 `docs/agent-prompt.md`

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

`web/a2ui-playground/src/agent-client.ts` 中：

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
4. 确认没有代理/网关缓存
   - 响应头已设置 `Cache-Control: no-cache, no-transform`
   - `X-Accel-Buffering: no`

### 11.3 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `503 缺少 OPENAI_API_KEY` | `.env` 未配置或未重启 | 填 Key 后重启 Server |
| `401` / `502 调用 OpenAI 失败` | Key 错误、模型名错误、Base URL 错误 | 检查 `.env` |
| `EADDRINUSE :::3000` | 端口被旧进程占用 | `lsof -nP -iTCP:3000 -sTCP:LISTEN` 后结束进程 |
| `Port 5173 is in use` | 有旧 Vite 进程 | 结束旧进程或使用新端口 |
| `has no exported member` | `dist` 未更新 | 重新构建 core / react |
| 修改 `.env` 不生效 | ts-node 不热加载 env | 重启 `npm run dev:server` |
| Mock 模式忽略输入 | 设计如此 | 改成 `A2UI_AGENT_MODE=openai` |
| 图片没有效果 | 模型不支持视觉 | 换成多模态模型 |

### 11.4 如何新增一个 Mock

1. 在 `packages/a2ui-core/Mock` 新增标准 JSON 数组文件
2. `A2UI_MOCK_FILE=random` 时会被自动纳入随机列表
3. 也可以设置 `A2UI_MOCK_FILE=文件名` 固定返回

### 11.5 如何切换模型

修改 `.env`：

```bash
OPENAI_MODEL=deepseek-chat
# 或
OPENAI_MODEL=deepseek-reasoner
# 或任意 OpenAI 兼容模型
OPENAI_BASE_URL=https://api.deepseek.com
```

---

## 12. 测试

```bash
npm test
```

覆盖：

- `a2ui-core`：Buffer、Parser、Store、数据模型、TreeBuilder、模板列表、增量更新
- `a2ui-react`：18 个组件、OpenLink、本地 Action、主题容器、入场动画

Parser 专项：

```bash
npm run test:parser
```

---

## 13. 构建与部署

### 13.1 构建

```bash
npm run build -w @a2ui/core
npm run build -w @a2ui/react
npm run build -w @a2ui/playground-server
npm run build -w @a2ui/playground
```

### 13.2 启动 Server

```bash
npm run start -w @a2ui/playground-server
```

### 13.3 部署前端

`web/a2ui-playground/dist` 是纯静态资源，可部署到任意静态服务器。

注意：

- 当前 `API_BASE_URL` 是硬编码的 `http://localhost:3000`
- 正式部署时建议改成环境变量，例如 `VITE_API_BASE_URL`
- Server 已开启 CORS，但仍建议生产环境收紧来源

---

## 14. 已知限制

- 表单控件目前只读：`CheckBox` / `TextField` / `DateTimeInput` / `MultipleChoice` / `Slider`
- `userAction` 客户端到服务端事件尚未接入
- 多轮增量更新依赖模型只输出变更消息；模型偶尔返回全量组件时仍能渲染，但会失去 token 优势
- `beginRendering.styles` 只支持 `font` 与 `primaryColor`
- 组件级颜色、间距、圆角、阴影等需要扩展 Catalog
- `MultipleChoice.maxAllowedSelections` 与 `filterable` 未实现
- `Tabs` 无切换交互，`Modal` 无弹窗交互
- 模板数组插入元素时，下标型实例 id 可能不稳定
- `a2ui-core` 的 vnode / treebuilder 仍依赖 React，尚未完全框架无关
- Server 无鉴权、限流、会话存储；适合本地开发与演示
- Mock 模式会忽略用户输入

---

## 15. 后续可扩展方向

- `userAction` 协议闭环：客户端事件 → 服务端 → `dataModelUpdate`
- 表单双向绑定与本地数据写回
- 组件级样式扩展（颜色、间距、圆角、阴影）
- 多 surface 同时预览
- HTML / A2UI 双输出模式切换
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
