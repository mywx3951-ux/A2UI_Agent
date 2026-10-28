## 项目介绍
实现一个 A2UI-playground，用户通过 web 应用生成对应的 UI 界面。

## 项目架构

项目使用 monorepo 组织代码
包含以下几个核心模块

### packages
- **a2ui-core**: 包含 UI 组件库和渲染引擎，包含以下模块：
  - parser 用来解析 a2ui 协议
  - vnode，用来映射管理 a2ui 协议生成的组件
  - treebuilder，用来根据 a2ui 协议生成调用 a2ui 渲染器，并生成最终的渲染树

- **a2ui-react**: 基于 react 的 a2ui 协议渲染引擎

**package主要职责**：维护 a2ui 相关的 sdk，并支持支持生产对应的 npm 包

### web
- **a2ui-playground**: 包含 A2UI-playground 的 web 应用
  
  主要职责及详细功能：
  1. 可以通过对话的方式，让 AI Agent 生成对应的 UI 界面
  2. 可以预览对应的 AI 界面
  3. 可以支持多轮对话对生成的 UI 进行调整
  4. 可以预览 a2ui-react 定义的基础 a2ui 组件
  5. 可以支持协议调试

### server
- **a2ui-playground-server**: 包含 A2UI-playground 的 server 端应用

  主要职责及详细功能：
  1. 基于 openAI，实现 a2ui agent
  2. 实现 a2ui-server，支持 a2ui 协议的生成及缓存

---

### 基础依赖

所有的项目需要支持 typescript

**web**: 使用 vite 构建 playground

**server**: 
- 使用koa实现服务接口
-agent基于openAi搭建
-使用ts-node运行