# 12 日期时间组件

- 阶段：12 / 15
- 目标：验证 `DateTimeInput` 的 `enableDate` / `enableTime`
- 自动执行：

```bash
node evaluation/run-case.mjs 12-datetime
```

## 发给 AI 的提示词

```text
生成一个预约表单，包含日期选择、时间选择和日期时间选择三个控件，以及一个提交按钮。
```

## 预期协议

- 至少 3 个 `DateTimeInput`
- 日期控件：`enableDate: true`、`enableTime: false`
- 时间控件：`enableDate: false`、`enableTime: true`
- 日期时间控件：两者都为 `true`
- 提交按钮为 `Button`

## 检查项

- [ ] 三个控件都存在
- [ ] `enableDate` / `enableTime` 组合正确
- [ ] 每个控件有绑定值 `path`
- [ ] 提交按钮存在
- [ ] 预览渲染出对应输入类型
- [ ] 没有使用未定义组件

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 20 |
| 组件正确 | 20 |
| 属性组合 | 20 |
| 数据绑定 | 15 |
| 渲染正确 | 15 |

## 说明

表单控件当前只读，只评结构。
