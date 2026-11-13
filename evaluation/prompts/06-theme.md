# 06 主题样式

- 阶段：6 / 9
- 目标：验证 `beginRendering.styles` 的 `font` 与 `primaryColor`
- 自动执行：

```bash
node evaluation/run-case.mjs 06-theme
```

## 发给 AI 的提示词

```text
生成一个登录卡片，主色使用 #e8590c，字体使用 Georgia，包含用户名输入框和登录按钮。
```

## 预期协议

- `beginRendering.styles.primaryColor` 为 `#e8590c`
- `beginRendering.styles.font` 包含 `Georgia`
- 登录按钮使用 `primary: true`
- 不要在每个组件里写自定义样式字段

## 检查项

- [ ] `styles.primaryColor` 格式为 `#RRGGBB`
- [ ] `styles.font` 包含 Georgia
- [ ] 主按钮背景色为 `#e8590c`
- [ ] 页面文字字体为 Georgia
- [ ] 没有输出未支持的样式字段

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 25 |
| 主题样式 | 20 |
| 组件正确 | 15 |
| 渲染正确 | 15 |

## 验证方法

浏览器 DevTools：

```js
getComputedStyle(button).backgroundColor
getComputedStyle(button).fontFamily
```

期望：

```text
rgb(232, 89, 12)
Georgia, serif
```

## 常见失败

- `primaryColor` 写成 `#e8590` 或 `rgb(...)`
- 只在某个组件上写颜色，没有使用 `beginRendering.styles`
- 字体写在局部而不是全局主题
