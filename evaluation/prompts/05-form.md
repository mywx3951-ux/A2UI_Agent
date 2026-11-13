# 05 表单类组件

- 阶段：5 / 9
- 目标：验证表单组件覆盖与结构还原
- 自动执行：

```bash
node evaluation/run-case.mjs 05-form
```

## 发给 AI 的提示词

```text
生成一个注册表单，包含用户名输入框、密码输入框、同意协议复选框、一个选择器和一个提交按钮。
```

## 预期协议

- 包含 `TextField`（短文本 / 密码）
- 包含 `CheckBox`
- 包含 `MultipleChoice` 或 `Slider`
- 包含 `Button`
- 组件通过 `children.explicitList` 组织

## 检查项

- [ ] 两个输入框存在，密码框使用 `textFieldType: obscured`
- [ ] 复选框有 label
- [ ] 选择器有 options
- [ ] 提交按钮存在
- [ ] 预览结构完整
- [ ] 没有编造不存在的表单组件

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 25 |
| 组件正确 | 25 |
| 布局还原 | 15 |
| 渲染正确 | 15 |

## 说明

当前表单控件是只读展示，本用例只评“结构是否正确”，不要评输入交互。

## 常见失败

- 使用 HTML 原生 `<input>` 字段名
- 缺少 `label`
- `textFieldType` 使用了未支持的枚举值
