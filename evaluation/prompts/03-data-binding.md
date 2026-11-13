# 03 数据绑定

- 阶段：3 / 9
- 目标：验证 `dataModelUpdate`、`path` 绑定与初始数据
- 自动执行：

```bash
node evaluation/run-case.mjs 03-data-binding
```

## 发给 AI 的提示词

```text
生成一个用户信息卡片，显示姓名、城市和会员状态。数据请通过 dataModelUpdate 提供，组件使用 path 绑定。
```

## 预期协议

- `dataModelUpdate` 的 `path` 为 `/user`
- `contents` 包含 `name`、`city`、`vip`
- Text 使用 `{ "path": "/user/name" }` 等绑定
- 组件结构里不要硬编码具体值

## 检查项

- [ ] 存在 `dataModelUpdate`
- [ ] 三个字段都存在
- [ ] 组件属性使用 `path`
- [ ] 预览显示姓名、城市、会员状态
- [ ] 修改数据模型后预览能重新渲染（可手动试点）
- [ ] 没有同时写 `path` 和 `literal*`

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 25 |
| 数据绑定 | 20 |
| 组件正确 | 15 |
| 渲染正确 | 15 |

## 常见失败

- 所有值都写成 `literalString`
- `dataModelUpdate` 的 path 与组件绑定路径对不上
- 使用数组但 `contents` 结构不合法
