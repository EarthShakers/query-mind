# Changelog

## v1.3.0 — 知识库空间一体化 & Chat 空间选择 <sub>2026-02-21</sub>

- **知识库两级视图**：空间列表 ↔ 文档管理，支持创建、重命名、删除空间
- **Chat 知识库范围选择**：多选空间或仅查数据库，不选则禁用知识库搜索
- **加入企业审批**：管理员头像红点提示，修复审批请求不可见问题
- **权限体系完善**：超级管理员（`superAdmin`）独立于企业管理员，`/docs` 仅超管可访问

## v1.2.0 — Space 数据隔离 & 权限控制 <sub>2026-02-21</sub>

- **多空间数据隔离**：文档按 `space_id` 隔离，空间角色 admin / editor / viewer
- **企业管理**：创建企业、空间切换、成员管理、加入申请
- **三类用户**：未注册用户（公共只读）、个人用户、企业用户

## v1.1.0 — 登录注册 & 租户隔离 <sub>2026-02-21</sub>

- **邮箱密码认证**：`bcryptjs` 哈希 + `jose` JWT，HttpOnly Cookie
- **多租户隔离**：知识库上传、搜索、聊天按 `tenant_id` 过滤
- **Roadmap 可编辑**：迁移到数据库，admin 可在线增删改

## v1.0.0 — 安全加固 <sub>2026-02-20</sub>

- **上传限流**：每 IP 每分钟 3 次 + 每天 20 次
- **文件 MIME 校验**：`file-type` 检测 magic bytes
- **安全响应头**：CSP / X-Frame-Options / X-Content-Type-Options

## v0.9.0 — Chat 交互重构 <sub>2026-02-20</sub>

- **`suggest_chart` 工具**：AI 文字回答后建议图表，用户点击生成
- **思考过程折叠**：SQL、知识检索等中间步骤折叠展示
- **修复 `isLoading` 闪烁**：流式文本在 tool 挂载前的误判问题

## v0.8.0 — 知识库管理页面 <sub>2026-02-20</sub>

- **`/knowledge` 页面**：文档浏览、格式筛选、搜索、拖拽上传

## v0.7.0 — RAG 多格式文档 <sub>2026-02-20</sub>

- **PDF / Word 解析**：`pdf-parse` + `mammoth`
- **切片 Overlap**：相邻 chunk ~100 字重叠，防止语义断裂

## v0.6.0 — RAG 知识库 <sub>2026-02-16</sub>

- **`search_knowledge` Tool**：AI 自动判断查 SQL 还是查文档
- **Supabase pgvector** + 百炼 `text-embedding-v3`

## v0.5.0 — 限流 & 重构 <sub>2026-02-16</sub>

- **Upstash Redis 限流** + 每日 Token 熔断

## v0.4.0 — 安全 & 自我修复 <sub>2026-02-15</sub>

- **SQL 注入防御** + `maxSteps: 3` AI 自动修正重试

## v0.3.0 — 容器化 <sub>2026-02-15</sub>

- **Dockerfile 多阶段构建** + 全站响应式适配

## v0.2.0 — 产品化 <sub>2026-02-15</sub>

- **图表 `groupKey` 多系列** + 5 张数据表 + 官网首页

## v0.1.0 — MVP <sub>2026-02-15</sub>

- **Vercel AI SDK `streamText` + `useChat`** + Zod Tool Calling + SQLite
