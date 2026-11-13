# 00 连通性与流式输出

- 阶段：0 / 9
- 目标：确认 Server、模型、SSE、最小协议链路都正常
- 自动执行：

```bash
node evaluation/run-case.mjs 00-smoke
```

## 发给 AI 的提示词

```text
生成一个只包含一行文字的页面，文字内容是「Hello A2UI」。
```

## 预期协议

- 纯 JSON 数组
- 至少包含 `surfaceUpdate` 与 `beginRendering`
- 组件类型包含 `Text`

## 检查项

- [ ] 请求返回 200，无 `RUN_ERROR`
- [ ] `CUSTOM / a2ui.jsonl.chunk` 持续到达，不是一次性返回
- [ ] 右侧 JSON 面板流式增长
- [ ] 右侧预览出现「Hello A2UI」
- [ ] 根节点 id 存在
- [ ] 可以复制 JSON

## 评分

| 项 | 分值 |
| --- | --- |
| 协议合法 | 25 |
| 组件正确 | 20 |
| 流式体验 | 10 |
| 渲染正确 | 15 |

## 常见失败

- 503：`.env` 未配置或 Server 未重启
- 401 / 502：Key 或模型配置错误
- 一次性返回：SSE 被缓冲，检查 Server 的 Koa 处理方式
