# 16 图标查询与 Icon 组件

- 阶段：16 / 16
- 目标：验证 `list_a2ui_icons` 工具与 `Icon` 组件使用
- 自动执行：

```bash
node evaluation/run-case.mjs 16-icons
```

## 发给 AI 的提示词

```text
生成一个底部导航栏，包含首页、搜索、购物车、个人中心四个入口，每个入口需要文字和图标。
```

## 预期协议

- 使用 `Row` 作为横向导航容器
- 四个入口各有 `Text` 和 `Icon`
- `Icon.name` 只能使用：
  - `list_a2ui_icons` 工具返回的名称
  - `docs/catalog.json` 中 `Icon.name` 的 enum
- 语义匹配建议：
  - 首页：`home`
  - 搜索：`search`
  - 购物车：`shoppingCart`
  - 个人中心：`person` 或 `accountCircle`

## 检查项

- [ ] 生成了 4 个入口
- [ ] 每个入口都有文字和图标
- [ ] 使用 `Icon` 组件
- [ ] `Icon.name` 都在 Catalog 中
- [ ] 图标语义与入口匹配
- [ ] 预览能看到图标

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 20 |
| 组件正确 | 20 |
| 图标合法性 | 25 |
| 语义匹配 | 20 |
| 渲染正确 | 15 |

## 自动校验

`run-case.mjs` 会额外检查：

```text
图标名称合法
```

如果出现 Catalog 之外的图标名，直接判为 FAIL。

## 工具调用说明

Prompt 要求模型在生成 `Icon` 前调用：

```text
list_a2ui_icons
```

工具支持：

```json
{
  "query": "购物车",
  "limit": 20
}
```

返回示例：

```json
{
  "total": 1,
  "returned": 1,
  "icons": [{ "name": "shoppingCart", "category": "commerce" }]
}
```
