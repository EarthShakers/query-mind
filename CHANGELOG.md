# Changelog

## v0.9.0 — Chat 交互重构：深度思考 & 图表建议

- AI 回答流程重构：中间过程（SQL 查询、知识库检索、自我修复）归入可折叠「思考中」区块，仅展示最终答案
- 思考状态持续显示：从用户发送消息到最终答案生成，全程显示「思考中...」，完成后切换为「已深度思考」
- 新增 `suggest_chart` 工具 — AI 默认用文字回答，数据适合可视化时提供「用图表展示」按钮，用户点击后在独立气泡中渲染图表
- `show_chart` 仅在用户明确要求图表时调用，避免不必要的图表生成
- SQL 查询结果表格作为正式答案展示（非折叠），AI 分析文字渲染在表格下方
- 图表生成增加 loading 过渡动画（600ms），避免瞬间渲染的突兀感
- 图表建议按钮在 AI 回答完成后才展示，避免流式渲染期间提前出现
- 消息气泡宽度自适应内容（表格 / 图表 / 文字），移动端全宽
- System prompt 优化：知识库回答限制在 3-8 句话，提取核心信息而非照搬文档
- System prompt 新增图表建议规则（趋势→折线图、对比→柱状图、占比→饼图）

## v0.8.0 — 知识库管理页面

- 新增 `/knowledge` 独立页面 — 文档浏览、格式筛选、搜索、上传管理一站式操作
- 拖拽上传 & 点击上传，明确展示支持格式（.txt / .md / .pdf / .docx）和大小限制
- 格式筛选标签（全部 / PDF / Word / Markdown / TXT），实时统计各格式文档数
- 文档卡片网格展示：标题、格式图标、片段数、上传时间
- 文档预览弹窗：点击卡片查看所有切片内容，支持片段数 & 总字数统计
- 新增 `GET /api/documents` — 按 title 分组查询文档列表（title、chunk 数、格式、上传时间）
- Chat 页侧边栏底部改为「知识库管理」链接入口
- 首页 & 文档页导航栏新增「知识库」链接
- Hero 区域展示知识库统计数据（文档数、片段数、格式数）
- 全页面移动端响应式适配（单列卡片、可滚动筛选标签、弹窗自适应）

## v0.7.0 — RAG 增强：多格式文档 & 切片优化

- 新增 PDF 文档上传支持（`pdf-parse` 文本提取）
- 新增 Word (.docx) 文档上传支持（`mammoth` 文本提取）
- 新增 `src/lib/parsers.ts` 文件解析模块，统一分发 .txt / .md / .pdf / .docx 解析逻辑
- 文件大小上限从 1MB 提升至 5MB（适配 PDF/Word 文件）
- 扫描件 PDF / 空 Word 文档上传时给出明确提示
- 切片策略优化：相邻 chunk 保留 ~100 字 Overlap 重叠区，防止语义断裂
- 文档新增 RAG 优化方案对比表（Overlap / Context Enrichment / 父子文档 / 混合搜索 / Rerank）
- 文档新增 QA：为什么不用 LangChain.js

## v0.6.0 — RAG 知识库 & SQL 混合驱动

- 新增 `search_knowledge` 工具 — AI 自动判断：数据问题查 SQL，知识问题查文档
- Supabase pgvector 向量存储 + 百炼 text-embedding-v3 嵌入模型
- 知识库文档上传功能（.txt / .md），自动切片 + 向量化 + 入库
- 预置 4 篇示例文档（报销制度 / 员工手册 / 产品指南 / FAQ）
- System prompt 升级：新增知识库路由规则，AI 三选一（SQL 表格 / SQL 图表 / 知识搜索）

## v0.5.0 — 防刷限流 & 代码重构

- Upstash Redis + `@upstash/ratelimit` 实现 IP 级滑动窗口限流
- 每日 Token 用量熔断机制（超限自动停止服务，防止 API Key 被刷爆）
- 单条消息长度限制（500 字），防止超长 prompt 消耗大量 token
- 流结束后异步记录 token 用量，不阻塞用户响应
- 前端错误提示优化：限流 / 熔断 / 超长等场景展示具体错误信息
- 代码重构：`route.ts` 拆分为三个模块
  - `lib/ratelimit.ts` — 限流、熔断、用量记录
  - `lib/prompt.ts` — System prompt 独立维护
  - `route.ts` — 仅保留路由骨架（190 行 → 111 行）

## v0.4.0 — 安全加固 & 自我修复

- `query()` 新增 SELECT 前缀校验 + 分号拦截，defense-in-depth 防止破坏性 SQL
- `maxSteps: 3` — AI 生成的 SQL 执行报错时自动修正并重试，用户无感知
- Tool execute 增加 try/catch，错误信息回传 AI 触发 self-healing
- System prompt 新增 SQL 错误修复指示, 优化提示词防止大模型错误行为
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
