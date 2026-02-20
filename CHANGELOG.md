# Changelog

## v0.9.0 — Chat 交互重构：深度思考 & 图表建议 <sub>2026-02-20</sub>

- **新增 `suggest_chart` 工具**：AI 默认文字回答，数据适合可视化时提供「用图表展示」按钮，用户点击后在独立气泡中渲染
- **AI 多步推理过程折叠**：SQL 查询、知识库检索、自我修复等中间过程归入可折叠「思考中」区块，仅展示最终答案
- **解决 `useChat` 多步 Tool Calling 间 `isLoading` 闪烁问题**：流式文本在 `toolInvocations` 挂载前被误判为最终答案，通过延迟分类修复
- System prompt 优化：知识库回答精简至 3-8 句，新增图表建议规则（趋势→折线、对比→柱状、占比→饼图）

## v0.8.0 — 知识库管理页面 <sub>2026-02-20</sub>

- **新增 `/knowledge` 独立页面**：文档浏览、格式筛选、搜索、拖拽上传
- **新增 `GET /api/documents` 接口**：Supabase 按 title 分组查询文档列表
- 文档预览弹窗：点击卡片查看所有切片内容及统计

## v0.7.0 — RAG 增强：多格式文档 & 切片优化 <sub>2026-02-20</sub>

- **新增 PDF / Word 文档解析**：`pdf-parse` + `mammoth` 文本提取
- **切片 Overlap 策略**：相邻 chunk 保留 ~100 字重叠区，防止语义断裂
- 统一文件解析模块 `src/lib/parsers.ts`，分发 .txt / .md / .pdf / .docx

## v0.6.0 — RAG 知识库 & SQL 混合驱动 <sub>2026-02-16</sub>

- **新增 `search_knowledge` Tool**：AI 自动判断数据问题查 SQL、知识问题查文档
- **Supabase pgvector 向量存储** + 百炼 `text-embedding-v3` 嵌入模型
- 文档自动切片 + 向量化 + 入库，预置 4 篇示例文档

## v0.5.0 — 防刷限流 & 代码重构 <sub>2026-02-16</sub>

- **Upstash Redis 滑动窗口限流**：IP 级别 QPS 控制
- **每日 Token 用量熔断**：超限自动停止服务，防止 API Key 被刷爆
- 代码重构：`route.ts` 拆分为 `ratelimit.ts` / `prompt.ts` / `route.ts`

## v0.4.0 — 安全加固 & 自我修复 <sub>2026-02-15</sub>

- **SQL 注入防御**：SELECT 前缀校验 + 分号拦截，defense-in-depth
- **`maxSteps: 3` 自我修复**：SQL 执行报错时 AI 自动修正重试，用户无感知
- Tool execute try/catch，错误信息回传 AI 触发 self-healing

## v0.3.0 — 容器化部署 <sub>2026-02-15</sub>

- **Dockerfile 多阶段构建** + Next.js `standalone` 输出
- 全站响应式适配（手机 / 平板 / 桌面）

## v0.2.0 — 产品化 <sub>2026-02-15</sub>

- **图表 `groupKey` 多系列支持**：`pivot()` 函数实现分组柱状图 / 折线图
- **数据库扩充至 5 张表**：departments / employees / products / sales / expenses
- 产品官网首页、技术文档页、12 个快捷提问按钮

## v0.1.0 — MVP <sub>2026-02-15</sub>

- **Vercel AI SDK `streamText` + `useChat` 流式架构**
- **Zod Schema Tool Calling**：`execute_query`（表格）+ `show_chart`（图表）
- **内存 SQLite**（`better-sqlite3`）+ 阿里云百炼 DashScope DeepSeek v3.2
