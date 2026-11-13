# 04 动态列表模板

- 阶段：4 / 9
- 目标：验证 `List.children.template` 与集合数据
- 自动执行：

```bash
node evaluation/run-case.mjs 04-list-template
```

## 发给 AI 的提示词

```text
生成一个商品列表，数据放在 /products 下，至少包含三件商品，每件显示名称和价格。列表请使用 children.template。
```

## 预期协议

- `List` 的 `children.template` 包含：
  - `componentId`：模板组件 id
  - `dataBinding`：`/products`
- `dataModelUpdate` 在 `/products` 下提供至少 3 项
- 每项包含 `name` 与 `price`
- 模板内绑定使用相对字段名或 `/name`、`/price`

## 检查项

- [ ] 使用 `children.template`，不是重复展开组件
- [ ] `dataBinding` 指向 `/products`
- [ ] 至少 3 条商品数据
- [ ] 每项都有名称和价格
- [ ] 预览渲染出 3 条列表
- [ ] 模板内绑定能解析到当前元素字段

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 20 |
| 组件正确 | 15 |
| 数据绑定 | 20 |
| 列表结构 | 15 |
| 渲染正确 | 15 |

## 常见失败

- 为每件商品复制一份组件，而不是模板
- `dataBinding` 写成数组字面量
- 模板字段路径指向画布绝对路径，导致取不到值
