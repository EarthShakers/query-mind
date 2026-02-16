# Changelog

## v0.4.0 — 安全加固 & 自我修复

- `query()` 新增 SELECT 前缀校验 + 分号拦截，defense-in-depth 防止破坏性 SQL
- `maxSteps: 3` — AI 生成的 SQL 执行报错时自动修正并重试，用户无感知
- Tool execute 增加 try/catch，错误信息回传 AI 触发 self-healing
- System prompt 新增 SQL 错误修复指示
- 前端识别 error 态，显示"SQL 执行出错，AI 正在修正..."

## v0.3.0 — 多端适配 & 部署

- 全站响应式适配（手机 / 平板 / 桌面）
- Chat 页侧边栏改为移动端抽屉式，hamburger 按钮切换
- Landing page 导航栏、Hero、各 section 移动端适配
- Docs 页内容区 padding 响应式
- 图表组件高度响应式 (`h-56 md:h-72`)
- 新增 Dockerfile（多阶段构建 + standalone 输出）
- Next.js 配置 `output: 'standalone'`
- 添加 `.dockerignore`、`.gitignore`、`.env.local.example`
- 部署到 Vercel：query-mind-kohl.vercel.app

## v0.2.0 — 产品化

- 产品官网首页（Hero / 功能介绍 / 竞品对比 / 定价方案 / CTA）
- 技术文档页（侧边栏导航 + `@tailwindcss/typography` prose 排版）
- Chat 页移至 `/chat`，首页改为 Landing Page
- 数据库扩充至 5 张表：departments (6)、employees (20)、products (5)、sales (33)、expenses (30)
- 12 个快捷提问按钮（常驻侧边栏）
- 图表 groupKey 支持：`pivot()` 函数实现多系列柱状图 / 折线图
- Chat UI 重构：气泡式消息、可折叠 SQL、多阶段 loading 状态
- 自动滚动到最新消息
- 错误恢复：请求失败时自动恢复输入框内容

## v0.1.0 — MVP

- 自然语言 → SQL → 表格 / 图表，核心流程跑通
- Vercel AI SDK `streamText` + `useChat` 流式架构
- Zod Schema 结构化输出（Tool Calling）
- 两个 Tool：`execute_query`（表格）、`show_chart`（Bar / Line / Pie）
- 内存 SQLite（`better-sqlite3`）预置示例数据
- 阿里云百炼 DashScope + DeepSeek v3.2 模型
- 消息清洗（sanitizeMessages）解决 toolInvocations 二次请求报错
- `toDataStreamResponse()` 替代 `toAIStreamResponse()` 解决工具结果不回传
- toolInvocations 去重逻辑（处理 `ai@3.4` 重复 toolCallId bug）
- 30 秒超时 AbortController
