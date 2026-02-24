# Changelog

## v1.5.0 — 报告交互重构 & 聊天历史 <sub>2026-02-24</sub>

- **报告面板可关闭**：支持收起/展开，新对话一键重置全部状态
- **章节编辑推理可视化**：LangGraph 各节点推理过程实时展示，替代静态 loading
- **聊天历史**：左侧边栏改为 localStorage 聊天记录，支持切换/删除历史会话
- **LLM 生成报告标题**：新增 `/api/reports/generate-title`，自动生成名词性标题

## v1.4.0 — Excel 数据报表 & 双数据库查询 <sub>2026-02-22</sub>

- **Excel/CSV 上传建表**：上传文件自动解析表头、推断列类型、在 PostgreSQL 中动态建表
- **双数据库路由**：Chat 查询自动识别表名，演示数据走 SQLite、用户上传表走 PostgreSQL
- **数据报表预览**：知识库页面新增"数据报表"tab，点击卡片可预览前 50 行数据
- **动态 Schema 注入**：用户上传表的元数据自动注入 AI System Prompt，支持自然语言查询
- **AI Schema 描述**：列名 + 采样数据生成自然语言描述，提升 Text-to-SQL 准确率

## v1.3.0 — 知识库空间一体化 & Chat 空间选择 <sub>2026-02-21</sub>

- **知识库两级视图**：空间列表 ↔ 文档管理，支持创建、重命名、删除空间
- **Chat 知识库范围选择**：顶部多选空间下拉，不选则仅查数据库
- **加入企业审批**：管理员头像红点提示，轮询刷新待审批数量
- **权限体系完善**：超级管理员（`superAdmin`）独立于企业管理员，`/docs` 仅超管可访问
- **公共数据空间**：所有用户（含未注册）可见，只读提示引导注册

## v1.2.0 — Space 数据隔离 & 权限控制 <sub>2026-02-21</sub>

- **多空间数据隔离**：`spaces` + `space_members` 表，文档按 `space_id` 隔离
- **空间角色权限**：admin / editor / viewer 三级角色，上传需 editor+
- **空间切换**：`POST /api/spaces/[spaceId]/switch` 切换活跃空间，刷新 JWT
- **企业管理**：创建企业、空间切换、成员管理、加入申请
- **三类用户**：未注册用户（公共只读）、个人用户、企业用户

## v1.1.0 — 登录注册 & 权限控制 & 租户隔离 <sub>2026-02-21</sub>

- **邮箱密码认证**：`bcryptjs` 密码哈希 + `jose` JWT，HttpOnly Cookie，7 天有效期
- **角色权限控制**：admin / user 二级角色，middleware 路由级保护
- **多租户数据隔离**：知识库上传、搜索、聊天均按 `tenant_id` 过滤
- **Roadmap 可编辑**：迁移到数据库，admin 可在线增删改

## v1.0.0 — 安全加固：上传限流 & 文件校验 & 安全头 <sub>2026-02-20</sub>

- **知识库上传限流**：每 IP 每分钟 3 次 + 每天 20 次，Upstash Redis 滑动窗口
- **文件 MIME 校验**：`file-type` 检测 magic bytes，防止改名伪造文件上传
- **安全响应头 middleware**：`X-Frame-Options` / `X-Content-Type-Options` / `CSP`
- IP 提取优化：优先 `x-forwarded-for` 首段，fallback `x-real-ip`

## v0.9.0 — Chat 交互重构：深度思考 & 图表建议 <sub>2026-02-20</sub>

- **新增 `suggest_chart` 工具**：AI 默认文字回答，数据适合可视化时提供「用图表展示」按钮
- **AI 多步推理过程折叠**：SQL 查询、知识库检索等中间过程归入可折叠「思考中」区块
- **修复 `isLoading` 闪烁**：流式文本在 `toolInvocations` 挂载前被误判为最终答案
- System prompt 优化：知识库回答精简，新增图表建议规则

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

- **SQL 注入防御**：SELECT 前缀校验 + 分号拦截
- **`maxSteps: 3` 自我修复**：SQL 执行报错时 AI 自动修正重试
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
