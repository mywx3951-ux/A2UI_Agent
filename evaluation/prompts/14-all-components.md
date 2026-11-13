# 14 全组件总览

- 阶段：14 / 15
- 目标：压力测试已定义组件的覆盖能力
- 自动执行：

```bash
node evaluation/run-case.mjs 14-all-components
```

## 发给 AI 的提示词

```text
生成一个组件总览页面，依次展示文本、图片、图标、视频、音频、行、列、列表、卡片、标签页、分隔线、模态框、按钮、复选框、输入框、日期时间、多选和滑块，每个组件配一个标题。
```

## 已定义组件范围

以 `docs/catalog.json` 为准：

```text
Text Image Icon Video AudioPlayer
Row Column List Card Tabs Divider Modal
Button CheckBox TextField DateTimeInput MultipleChoice Slider
```

外加扩展组件：

```text
OpenLink
```

## 检查项

- [ ] 覆盖组件种类 >= 14
- [ ] 没有出现 Catalog 之外的组件
- [ ] 每个组件都有标题
- [ ] 组件 id 唯一
- [ ] root 存在
- [ ] 预览没有报错

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 20 |
| 组件覆盖度 | 30 |
| 结构组织 | 20 |
| 渲染正确 | 20 |

## 记录方式

```text
覆盖组件：
未覆盖组件：
未定义组件（应为 0）：
```

自动脚本会额外检查「组件均在 Catalog 中」，出现未定义组件直接 FAIL。
