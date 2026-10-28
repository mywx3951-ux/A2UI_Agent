# specification —— A2UI v0.8 协议与评测资料

本目录存放 [A2UI (Agent to UI) 协议](https://a2ui.org/specification/v0.8-a2ui/) **v0.8** 的官方规范，本项目（`@a2ui/core` / `@a2ui/react` / playground）的实现以它为准。

## 来源

| 项 | 值 |
| --- | --- |
| 上游仓库 | [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) |
| 路径 | `specification/v0_8/` |
| 快照 commit | `800bd982ef83b0eed7b4a946bc65b77cb59ef440` |
| 抓取时间 | 2026-10-26 |
| 许可 | Apache License 2.0 |

> 选择这个 commit 是因为它保留了一份**完整的四件套**：`README.md` + `docs` + `eval` + `json`。之后的 commit（`1189422` "delete specification-specific evals under specification/ folder"）把 `eval/` 从 spec 目录移走了。

`v0_8/` 内文件与上游逐字节一致，请勿在里面手改；需要补充说明时写到本文件。

## 四项分别是什么

```
specification/v0_8/
├── README.md    ① 版本说明：v0.8.2，已冻结（closed），不再接受改动
├── docs/        ② 协议正文（3 篇 Markdown）
├── eval/        ③ LLM 生成质量评测框架（Genkit + TypeScript）
└── json/        ④ 机器可读的 JSON Schema、组件目录（Catalog）与示例
```

### ① README.md

只说明这是 v0.8.2、属于历史版本、已停止演进。真正的协议内容在 `docs/`。

### ② docs/ —— 协议正文

| 文件 | 内容 |
| --- | --- |
| `a2ui_protocol.md` (34 KB) | **核心规范**。JSONL 流、Surface、四种服务端消息、邻接表组件模型、数据绑定、事件模型，8 个小节 |
| `a2ui_extension_specification.md` | A2A（Agent-to-Agent）扩展：A2UI 消息如何塞进 A2A 的 Message/Artifact 里传输 |
| `custom_catalog_changes.md` | v0.8 相对旧版在 **自定义 Catalog 协商**上的变更说明 |

### ③ eval/ —— 评测框架

一个独立的 TypeScript 工程（Genkit + `tsx`），作用：**让多个大模型（GPT-5 / Gemini 2.5 / Claude 4 等）分别生成 A2UI，再用 JSON Schema 验证生成结果合不合格**。

- `src/prompts.ts` —— 22 个评测场景（登录表单、商品页、音乐播放器、航班预订、旅行行程……）
- `src/models.ts` —— 参评模型清单与参数
- `src/flows.ts` —— Genkit flow，按 JSON Schema 约束模型输出
- `src/validator.ts` + 三个 `*_matcher.ts` —— 校验生成的 JSONL 是否符合 `json/` 里的 schema
- `src/index.ts` —— 跑批、统计成功率 / 延迟 / 报错，输出 Markdown 汇总表
- 运行需要 `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`（见 `.env.example`）

**对本项目的价值**：它是「协议 + 校验器」的参考实现，可以直接拿来验证自己写的 parser 是否和官方语义一致。注意它本身是**评测工具**，不是 runtime，不需要接进 web/server。

### ④ json/ —— 机器可读规范

| 文件 | 用途 | 对应本项目的模块 |
| --- | --- | --- |
| `server_to_client.json` | 服务端 → 客户端的 4 种消息（`surfaceUpdate` / `dataModelUpdate` / `beginRendering` / `deleteSurface`） | `a2ui-core/parser` |
| `client_to_server.json` | 客户端 → 服务端的 2 种消息（`userAction` / `error`） | playground 事件回传 |
| `catalog_description_schema.json` | Catalog 的元 schema（定义「怎么描述一套组件」） | `vnode` 的组件注册表 |
| `standard_catalog_definition.json` | **标准组件库**：18 个组件 + styles | `vnode` / `a2ui-react` |
| `server_to_client_with_standard_catalog.json` | 上面两个的合并版（`component` 从泛型换成 18 选 1 的 `oneOf`），**给 LLM 用最好** | Agent 提示词里的输出 schema |
| `a2ui_client_capabilities_schema.json` | 客户端能力声明（支持哪些 catalog） | 后续接通 server 时用 |
| `catalogs/basic/examples/*.json` | 35 个完整示例（简单文本 → 咖啡下单 → 完整商品页） | **现成的测试用例 / 联调样本** |
| `catalogs/minimal/*` | 5 组件极简目录 + 5 个示例，官方推荐「写渲染器时从这里起步」 | 渲染器最小闭环 |

标准 Catalog 的 18 个组件：

`Text` `Image` `Icon` `Video` `AudioPlayer` `Row` `Column` `List` `Card` `Tabs` `Divider` `Modal` `Button` `CheckBox` `TextField` `DateTimeInput` `MultipleChoice` `Slider`

Minimal Catalog 的 5 个组件：`Text` `Row` `Column` `Button` `TextField`

## 怎么用（建议顺序）

1. **先读 `docs/a2ui_protocol.md` 的 Section 1–5**，搞清楚 `surfaceUpdate` / `dataModelUpdate` / `beginRendering` 三个消息和 `BoundValue` 数据绑定，这是 parser 和 treebuilder 的输入契约。
2. 用 `json/catalogs/minimal/examples/1_simple_text.json` 这种小样本写第一版渲染器（"输入 JSONL 数组 → 输出一棵树"）。
3. 用 `json/server_to_client.json` 做运行时校验，用 `json/catalogs/basic/examples/` 里 35 个样本做回归测试。
4. 写 server 端 Agent 时，把 `json/server_to_client_with_standard_catalog.json` 作为 structured output 的 schema 喂给模型，比让它自由发挥稳定得多。

## 注意

- v0.8 已经冻结，官方当前版本是 v0.9.1（另有 v1.0 candidate）。如果后面要升版，差别见官方 [Evolution Guide](https://a2ui.org/specification/v0.9-evolution-guide/)。
- 本目录约 536 KB / 72 个文件，`eval/` 有独立 `package.json`，根 workspace 不会把它纳入构建（未列入 `workspaces`），需要单独 `yarn install`。
