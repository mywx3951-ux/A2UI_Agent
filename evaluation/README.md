# A2UI Agent 评测手册

本目录用于对 A2UI Agent 进行**分级、可重复**的评测。

评测对象：

- A2UI 协议生成是否正确
- 组件、布局、数据绑定是否合理
- 主题样式是否生效
- 流式返回是否正常
- 多模态输入是否可用
- 多轮更新能力现状

---

## 1. 前置条件

1. 已按根目录 `README.MD` 完成安装与构建
2. Server 已启动：

```bash
npm run dev:server
```

3. `.env` 中：

```bash
OPENAI_API_KEY=sk-xxxx
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com
```

4. 自检：

```bash
curl http://localhost:3000/health
```

期望：

```json
{ "status": "ok", "mode": "openai" }
```

5. 前端已启动：

```bash
npm run dev:web
```

访问 `http://localhost:5173`。

---

## 2. 目录说明

```text
evaluation/
├── README.md                 # 本文件
├── cases.json                # 机器可读用例清单
├── run-case.mjs              # 单个用例自动执行与基础校验
├── results-template.md       # 人工评分记录模板
├── prompts/                  # 逐步评测的提示词与检查项
│   ├── 00-smoke.md
│   ├── 01-single-text.md
│   ├── 02-layout.md
│   ├── 03-data-binding.md
│   ├── 04-list-template.md
│   ├── 05-form.md
│   ├── 06-theme.md
│   ├── 07-complex-page.md
│   ├── 08-image.md
│   ├── 09-multi-turn-update.md
│   ├── 10-media.md
│   ├── 11-containers.md
│   ├── 12-datetime.md
│   ├── 13-local-action-openlink.md
│   ├── 14-all-components.md
│   ├── 15-component-props.md
│   └── 16-icons.md
└── results/                  # 自动执行结果输出目录
```

---

## 3. 评测阶段

| 阶段 | 用例 | 重点 |
| --- | --- | --- |
| 0 | `00-smoke` | 连通性、SSE 分块、最小协议 |
| 1 | `01-single-text` | 单组件、根节点合法 |
| 2 | `02-layout` | Row / Column 布局 |
| 3 | `03-data-binding` | `dataModelUpdate` + `path` 绑定 |
| 4 | `04-list-template` | `children.template` 动态列表 |
| 5 | `05-form` | 表单类组件覆盖 |
| 6 | `06-theme` | `beginRendering.styles` 的 font / primaryColor |
| 7 | `07-complex-page` | 复杂页面组合能力 |
| 8 | `08-image` | 多模态图片输入（需手动上传） |
| 9 | `09-multi-turn-update` | 多轮增量更新（组件 / 数据 / 主题微调） |
| 10 | `10-media` | Image / Icon / Video / AudioPlayer |
| 11 | `11-containers` | Tabs / Divider / Modal |
| 12 | `12-datetime` | DateTimeInput 的日期 / 时间组合 |
| 13 | `13-local-action-openlink` | 本地 Action 与 OpenLink 扩展 |
| 14 | `14-all-components` | 全组件总览与覆盖度 |
| 15 | `15-component-props` | 已定义属性枚举约束 |
| 16 | `16-icons` | 图标查询工具与 Icon 组件 |

建议严格按阶段顺序执行，前一阶段通过后再进入下一阶段。

### 组件范围约定

所有评测用例只允许使用：

- `docs/catalog.json` 中已定义的 18 个标准组件
- 扩展组件 `OpenLink`

自动脚本会读取 `docs/catalog.json` 做白名单校验，出现未定义组件直接判为 FAIL。

---

## 4. 手工评测流程

1. 打开 `http://localhost:5173`
2. 确认左上角「仅测试模型对话」处于关闭状态
3. 打开 `prompts/` 中当前阶段的文件
4. 把「发给 AI 的提示词」原样粘贴到左侧输入框
5. 点击发送，观察：
   - 左侧是否显示 `正在生成页面…`
   - 右侧预览是否逐步出现组件
   - 右侧 A2UI JSON 是否流式增长
6. 生成完成后：
   - 点击「复制 JSON」
   - 对照该用例的检查项逐条打分
7. 把结果记录到 `results-template.md`
8. 进入下一阶段

---

## 5. 自动执行

自动脚本会：

- 调用 `/api/agent`
- 收集 `CUSTOM / a2ui.jsonl.chunk`
- 解析 JSONL 消息
- 做基础协议校验
- 输出组件类型、根节点、流式分块数
- 把结果保存到 `results/`

用法：

```bash
node evaluation/run-case.mjs 00-smoke
node evaluation/run-case.mjs 01-single-text
node evaluation/run-case.mjs 06-theme
```

指定 Server 地址：

```bash
A2UI_SERVER_URL=http://localhost:3000 node evaluation/run-case.mjs 07-complex-page
```

查看所有用例：

```bash
node evaluation/run-case.mjs --list
```

自动脚本只做基础校验，以下内容仍需人工确认：

- 视觉布局是否合理
- 数据绑定是否符合预期
- 文案是否准确
- 多模态图片理解是否正确
- 多轮更新是否保留了上一版

自动脚本会强制校验：所有组件都必须存在于 `docs/catalog.json`（外加 `OpenLink`），否则直接 FAIL。

---

## 6. 评分标准（100 分）

| 维度 | 分值 | 说明 |
| --- | --- | --- |
| 协议合法性 | 25 | 纯 JSON、单顶层字段、消息类型合法、根节点存在 |
| 组件正确性 | 20 | 使用了正确/完整的组件，没有编造组件 |
| 数据绑定 | 15 | 动态数据进入 dataModelUpdate，组件使用 path |
| 布局还原 | 15 | 层级、方向、分组符合需求 |
| 主题样式 | 10 | font / primaryColor 正确生效 |
| 流式体验 | 10 | 分块持续到达，预览与 JSON 同步增长 |
| 稳定性 | 5 | 无报错、无空页面、可重复生成 |

等级建议：

- 90-100：优秀
- 75-89：通过
- 60-74：有条件通过
- 0-59：不通过

---

## 7. 每个用例的通用检查项

- [ ] 输出是 JSON，不含 Markdown 代码围栏和解释文字
- [ ] 每条消息只有一个顶层字段
- [ ] `surfaceId` 一致
- [ ] `beginRendering.root` 指向已存在的组件
- [ ] 动态数据放在 `dataModelUpdate`，没有大量硬编码
- [ ] 右侧预览渲染正常
- [ ] 右侧 JSON 与预览一致
- [ ] 生成过程中有可见的流式效果
- [ ] 没有控制台报错

---

## 8. 结果记录

复制 `results-template.md` 的内容，为每个用例填写：

- 用例 id
- 是否通过
- 得分
- 主要问题
- 截图或 JSON 文件路径
- 备注

自动执行的结果 JSON 会写入 `results/`，可以配合人工评分一起保存。

---

## 9. 当前已知预期

### 9.1 多轮更新（09）

当前前端每次发送都会清空 Store 重新生成，**不会基于上一版修改**。

因此 `09-multi-turn-update` 目前应记录为：

```text
能力未实现：第二次请求不会保留上一版页面
```

不要把它算作模型能力问题。

### 9.2 图片输入（08）

需要手动上传图片：

1. 点击「添加图片」
2. 选择一张页面截图或设计稿
3. 再发送提示词

图片能否被理解取决于模型是否具备视觉能力。

### 9.3 表单（05）

当前表单控件为只读展示，只评测“结构是否正确”，不要评测输入交互。

---

## 10. 常见问题

| 现象 | 排查 |
| --- | --- |
| `503 缺少 OPENAI_API_KEY` | `.env` 未配置或 Server 未重启 |
| `401` / `502` | Key、模型名、Base URL 错误 |
| 右侧一直空白 | 查看 Network 是否收到 `CUSTOM` 事件；查看控制台错误 |
| JSON 有内容但预览为空 | 检查 `beginRendering.root` 是否指向存在的组件 |
| 没有流式效果 | 查看 DevTools 的 EventStream；确认 Server 未缓冲 |
| 生成的组件不在预览中 | 检查组件名是否在 `docs/catalog.json` 和 `renderMap` 中 |
| 主题色不生效 | 检查 `beginRendering.styles.primaryColor` 是否为 `#RRGGBB` |

---

## 11. 扩展评测

新增用例时：

1. 在 `cases.json` 增加一条记录
2. 在 `prompts/` 增加对应的 Markdown 说明
3. 如有需要，在 `run-case.mjs` 增加专项校验
4. 在 `results-template.md` 增加一行

建议保持用例：

- 单一目标
- 提示词稳定
- 有明确的检查项
- 可重复执行
