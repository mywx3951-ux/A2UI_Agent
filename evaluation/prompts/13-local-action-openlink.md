# 13 本地 Action 与 OpenLink

- 阶段：13 / 15
- 目标：覆盖协议扩展 `Button.action.localDataModelUpdate` 与 `OpenLink`
- 自动执行：

```bash
node evaluation/run-case.mjs 13-local-action-openlink
```

## 发给 AI 的提示词

```text
生成一个演示卡片，包含一行文字「初始文案」、一个按钮「修改文案」和一个链接「打开 A2UI 官网」。按钮点击后把文字改成「已更新」，链接指向 https://a2ui.org。
```

## 预期协议

- `Text` 绑定 `/demo/line`，初始值「初始文案」
- `Button.action.localDataModelUpdate`：
  - `surfaceId` 与当前画布一致
  - `path` 指向 `/demo`
  - `contents` 将 `line` 改为「已更新」
- `OpenLink.url` 为 `https://a2ui.org`
- `OpenLink.text` 为「打开 A2UI 官网」

## 检查项

- [ ] 存在 `localDataModelUpdate`
- [ ] 初始文案正确
- [ ] 点击按钮后文案变为「已更新」
- [ ] `OpenLink` 存在且 URL 正确
- [ ] 点击链接在新标签页打开
- [ ] 没有使用未定义组件

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 20 |
| 扩展使用正确 | 25 |
| 数据绑定 | 20 |
| 交互效果 | 20 |

## 常见失败

- 把本地更新写成 `type: local + updates`
- `contents` 结构与 `dataModelUpdate` 不一致
- `OpenLink` 写成普通 `Text`
