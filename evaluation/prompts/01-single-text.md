# 01 单组件与根节点

- 阶段：1 / 9
- 目标：验证最小可渲染协议与 `Text.usageHint`
- 自动执行：

```bash
node evaluation/run-case.mjs 01-single-text
```

## 发给 AI 的提示词

```text
生成一个只有一行标题的页面，标题是「用户中心」，使用 h3 样式。
```

## 预期协议

- `surfaceUpdate` 中只有 `Text`
- `Text.usageHint` 为 `h3`
- `beginRendering.root` 指向该 Text 组件
- 不需要 `dataModelUpdate`

## 检查项

- [ ] 消息数量合理（通常 2 条）
- [ ] 核心组件是 Text（允许必要的容器）
- [ ] `usageHint` 为 h3
- [ ] root 存在
- [ ] 预览显示「用户中心」
- [ ] 没有多余组件

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 25 |
| 组件正确 | 20 |
| 布局还原 | 15 |
| 渲染正确 | 15 |

## 常见失败

- 输出多个 Text 或多余容器
- `usageHint` 拼写错误
- `beginRendering.root` 指向不存在的 id
