# 15 已定义属性约束

- 阶段：15 / 15
- 目标：验证模型只使用 Catalog 中已定义的属性值
- 自动执行：

```bash
node evaluation/run-case.mjs 15-component-props
```

## 发给 AI 的提示词

```text
生成一个横向排列的卡片列表，图片使用 avatar 尺寸并 cover 填充，标题使用 h2，列表水平排列，滑块范围 0-10。
```

## 预期协议

- `Image.usageHint`: `avatar`
- `Image.fit`: `cover`
- `Text.usageHint`: `h2`
- `List.direction`: `horizontal`
- `Slider.minValue`: `0`
- `Slider.maxValue`: `10`
- 不出现 Catalog 之外的属性值

## 检查项

- [ ] `Image.usageHint` 为 avatar
- [ ] `Image.fit` 为 cover
- [ ] `Text.usageHint` 为 h2
- [ ] `List.direction` 为 horizontal
- [ ] `Slider.minValue` / `maxValue` 正确
- [ ] 没有编造新属性
- [ ] 预览渲染正常

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 20 |
| 属性正确 | 30 |
| 组件正确 | 20 |
| 渲染正确 | 20 |

## 说明

如果模型输出了 Catalog 中不存在的枚举值，例如 `usageHint: "avatar-large"`，应记录为属性约束问题。
