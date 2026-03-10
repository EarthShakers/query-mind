import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SECTIONS } from "../sections";
import { parseChangelog, renderInlineMarkdown } from "../sections.server";
import { RoadmapSection } from "@/components/roadmap-section";

/* ─── Section content components ─── */

function Overview() {
  return (
    <>
      <h2>概述</h2>
      <p>
        QueryMind 让企业里的每个人都能用自然语言获取数据洞察——无需写一行
        SQL，无需等待数据分析师排期。一句话描述需求，AI
        自动查库、自动画图、自动撰写分析，生成完整的多章节数据报告。
      </p>
      <h3>产品定位</h3>
      <p>
        传统 BI 工具（Tableau、Metabase）需要使用者具备 SQL
        或拖拽建模能力，学习成本高、响应周期长。QueryMind
        将大语言模型作为中间层，提供三种核心交互模式：
      </p>
      <ul>
        <li>
          <strong>对话式分析</strong> — 用自然语言提问，AI 自动生成
          SQL、执行查询、选择最佳图表呈现
        </li>
        <li>
          <strong>Canvas 报告生成</strong> —
          一句话生成多章节数据报告（查询→图表→分析→撰写），支持导出 PDF / Word
        </li>
        <li>
          <strong>Agent 智能编辑</strong> —
          对报告任意章节下达修改指令，LangGraph Agent
          多步推理（计划→查数据→分析→重写→校验→反思），全程可视化
        </li>
        <li>
          <strong>知识库问答 (RAG)</strong> — 上传企业文档（.txt / .md / .pdf /
          .docx），AI 向量检索后精准回答
        </li>
      </ul>
      <h3>核心技术能力</h3>
      <ul>
        <li>
          <strong>Streaming</strong> — 流式传输，发出问题后 1-2
          秒即可看到响应，接近实时对话体验
        </li>
        <li>
          <strong>Generative UI</strong> — 生成式 UI，AI
          根据数据语义自动选择表格、折线图、柱状图或饼图渲染
        </li>
        <li>
          <strong>LangGraph Agent</strong> — 多步推理工作流，plan → query →
          analyze → write → validate → reflect，支持自动重试和错误修正
        </li>
        <li>
          <strong>Structured Output</strong> — 结构化输出，Zod Schema 强制约束
          AI 返回格式，杜绝幻觉式乱码
        </li>
        <li>
          <strong>RAG</strong> — 检索增强生成，pgvector 向量搜索知识库，让 AI
          回答有据可依
        </li>
      </ul>
    </>
  );
}

function Architecture() {
  return (
    <>
      <h2>架构</h2>
      <p>
        QueryMind 采用 <strong>Next.js 15 App Router</strong>{" "}
        全栈架构，前端流式渲染 + 后端 AI 编排，核心分为三条数据链路：
      </p>

      <h3>1. 对话式数据分析</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`用户提问 → useChat (流式) → POST /api/chat → streamText + Zod Tools → DashScope LLM
                                                      ↓
                                           execute_query / show_chart / suggest_chart / search_knowledge
                                                      ↓
                                           PostgreSQL 查询 / pgvector RAG 搜索 → 结果回传
                                                      ↓
                                客户端根据 toolName 渲染 <SqlResult> / <ChartResult> / <KnowledgeResult>`}</code>
      </pre>

      <h3>2. Canvas 报告生成</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`用户描述需求 → /api/chat (report mode) → write_report_section Tool × N
                                                      ↓
                                    每个 section: AI 查询数据 → 分析 → 生成图表/表格/Markdown
                                                      ↓
                                    Supabase 持久化 (reports + report_sections + report_versions)
                                                      ↓
                                客户端 <ReportCanvas> 实时渲染多章节报告，支持导出 PDF / Word`}</code>
      </pre>

      <h3>3. Agent 智能编辑（LangGraph）</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`用户对章节下指令 → POST /api/reports/[id]/edit-section → LangGraph StateGraph
                                                      ↓
                              ┌─────────────────────────────────────────────────┐
                              │  plan → query → analyze → write → validate     │
                              │    ↑                                    ↓       │
                              │    └──────────── reflect ←─────── (失败重试)    │
                              └─────────────────────────────────────────────────┘
                                                      ↓
                              SSE 实时推送各节点推理过程 → 客户端 <EditProgressPanel> 可视化`}</code>
      </pre>

      <h3>技术栈</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                层级
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                技术
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-medium">框架</td>
              <td className="px-4 py-2.5 text-slate-500">
                Next.js 15 (App Router) + React 19 + TypeScript
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">AI 对话</td>
              <td className="px-4 py-2.5 text-slate-500">
                Vercel AI SDK (<code>streamText</code> + <code>useChat</code>) +
                DashScope deepseek-v3
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">Agent 编排</td>
              <td className="px-4 py-2.5 text-slate-500">
                LangGraph (<code>StateGraph</code>) + LangChain ChatOpenAI
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">RAG</td>
              <td className="px-4 py-2.5 text-slate-500">
                Supabase pgvector + DashScope text-embedding-v4 (1024d)
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">数据库</td>
              <td className="px-4 py-2.5 text-slate-500">
                PostgreSQL（用户数据表） + Supabase（文档/报告/向量）
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">限流</td>
              <td className="px-4 py-2.5 text-slate-500">
                Upstash Redis 滑动窗口 + 每日 Token 预算
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">图表</td>
              <td className="px-4 py-2.5 text-slate-500">
                Recharts（柱状图 / 折线图 / 饼图）
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">导出</td>
              <td className="px-4 py-2.5 text-slate-500">
                html2pdf.js (PDF) + docx (Word)
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">认证</td>
              <td className="px-4 py-2.5 text-slate-500">
                bcryptjs + jose JWT + HttpOnly Cookie
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">样式</td>
              <td className="px-4 py-2.5 text-slate-500">
                Tailwind CSS + GSAP 动画
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>文件结构</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`src/
├── app/
│   ├── page.tsx                          # 产品首页
│   ├── chat/page.tsx                     # AI 对话 + Canvas 报告界面
│   ├── knowledge/page.tsx                # 知识库管理
│   ├── docs/                             # 技术文档（本页）
│   ├── api/
│   │   ├── chat/route.ts                 # AI 流式对话（核心）
│   │   ├── reports/
│   │   │   ├── route.ts                  # 报告 CRUD
│   │   │   ├── generate-title/route.ts   # LLM 生成报告标题
│   │   │   └── [id]/
│   │   │       ├── route.ts              # 报告详情/更新
│   │   │       ├── edit-section/route.ts # LangGraph Agent 编辑（SSE）
│   │   │       ├── sections/route.ts     # 章节列表
│   │   │       └── versions/             # 版本历史 & 回滚
│   │   ├── documents/route.ts            # 知识文档上传
│   │   ├── data-tables/                  # Excel/CSV 上传建表
│   │   ├── auth/                         # 注册/登录/登出/me
│   │   ├── spaces/                       # 空间 CRUD & 成员管理
│   │   └── tenants/                      # 企业管理
│   └── middleware.ts                     # JWT 鉴权 + 路由保护 + 安全头
├── lib/
│   ├── prompt.ts                         # AI 系统提示词构建
│   ├── pg.ts                             # PostgreSQL 只读查询
│   ├── rag.ts                            # 向量嵌入 + pgvector 搜索
│   ├── supabase.ts                       # Supabase 客户端
│   ├── excel-parser.ts                   # Excel/CSV 解析建表
│   ├── auth.ts                           # JWT + Session + 角色定义
│   ├── ratelimit.ts                      # Redis 限流 + Token 预算
│   ├── tier-config.ts                    # 用户权益分级
│   ├── report-types.ts                   # 报告 TypeScript 类型
│   ├── export-pdf.ts                     # PDF 导出
│   ├── export-word.ts                    # Word 导出
│   ├── parsers.ts                        # 文档解析（PDF/Word/TXT/MD）
│   └── langgraph/
│       ├── edit-section-graph.ts         # Agent StateGraph 定义
│       ├── edit-section-prompts.ts       # 各节点提示词（中文）
│       └── llm.ts                        # LangChain LLM 初始化
├── hooks/
│   ├── use-report.ts                     # 报告状态管理 + 保存反馈
│   ├── use-section-edit.ts               # Agent 编辑进度追踪
│   ├── use-version-history.ts            # 版本历史
│   └── use-chat-history.ts              # localStorage 聊天记录
└── components/
    ├── report-canvas.tsx                 # Canvas 报告面板（可编辑标题/关闭）
    ├── report-section-renderer.tsx       # 章节渲染（Markdown/图表/表格）
    ├── section-edit-popover.tsx          # 编辑指令输入弹窗
    ├── version-history-panel.tsx         # 版本历史侧边栏
    ├── sql-result.tsx                    # 数据表格组件
    ├── chart-result.tsx                  # 图表组件（Recharts）
    ├── knowledge-result.tsx              # 知识检索结果
    ├── nav-auth.tsx                      # 导航栏认证状态
    ├── demo-section.tsx                  # 首页演示区
    ├── page-animations.tsx               # GSAP 页面动画
    └── roadmap-section.tsx               # Roadmap 编辑组件`}</code>
      </pre>

      <h3>LangGraph Agent 编辑流程</h3>
      <p>
        报告章节编辑采用 <strong>LangGraph StateGraph</strong>{" "}
        实现多步推理工作流， 每个节点的推理过程通过 SSE 实时推送到客户端：
      </p>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                节点
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                职责
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                输出
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">plan</td>
              <td className="px-4 py-2.5 text-slate-500">
                分析修改意图，决定是否需要查询数据，生成 SQL
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                reasoning + suggestedSQL
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">query</td>
              <td className="px-4 py-2.5 text-slate-500">
                在 PostgreSQL 执行 SQL，获取数据
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                queryResult + rowCount
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">analyze</td>
              <td className="px-4 py-2.5 text-slate-500">
                分析数据，制定内容修改方案
              </td>
              <td className="px-4 py-2.5 text-slate-500">analysisPlan</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">write</td>
              <td className="px-4 py-2.5 text-slate-500">
                生成更新后的章节 JSON（markdown / chart / table）
              </td>
              <td className="px-4 py-2.5 text-slate-500">updatedSection</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                validate
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                校验输出结构完整性（section_id、content_type 等）
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                passed / validationErrors
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">reflect</td>
              <td className="px-4 py-2.5 text-slate-500">
                校验失败时自动修正，最多重试 3 次
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                fixedSection / retries
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>安全机制</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                防护层
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                机制
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-medium">SQL 注入防御</td>
              <td className="px-4 py-2.5 text-slate-500">
                SELECT 前缀校验 + 分号拦截 + <code>prepare().all()</code>{" "}
                只读执行
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">认证鉴权</td>
              <td className="px-4 py-2.5 text-slate-500">
                JWT HttpOnly Cookie + middleware 路由保护 + 三级角色控制
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">限流防刷</td>
              <td className="px-4 py-2.5 text-slate-500">
                Upstash Redis 滑动窗口（对话 + 上传分别限流）+ 每日 Token
                预算熔断
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">文件校验</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>file-type</code> magic bytes 检测 + 大小限制 + MIME 白名单
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">安全头</td>
              <td className="px-4 py-2.5 text-slate-500">
                X-Frame-Options / X-Content-Type-Options / CSP / Referrer-Policy
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Permissions() {
  return (
    <>
      <h2>权限体系</h2>
      <p>
        系统采用三层权限模型：<strong>系统级 → 企业级 → 空间级</strong>
        ，逐层细化控制粒度。
      </p>

      <h3>角色总览</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                层级
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                角色
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                字段
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                权限
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5" rowSpan={2}>
                系统级
              </td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                superAdmin
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user.role</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                访问 /docs 技术文档、编辑 Roadmap
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">user</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user.role</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">普通用户（默认）</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5" rowSpan={2}>
                企业级
              </td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">admin</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user.tenantRole</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                创建空间、管理成员、审批加入申请
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">member</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user.tenantRole</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                被审批通过后加入企业的普通成员
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5" rowSpan={3}>
                空间级
              </td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">admin</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>space.role</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                重命名/删除空间、管理空间成员、上传文档
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">editor</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>space.role</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">上传文档</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">viewer</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>space.role</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">查看文档（只读）</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>用户类型</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                类型
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                判断条件
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                可访问空间
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-medium">未注册用户</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user = null</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                预置文档（只读，注册后可上传）
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">个人用户</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user.tenantRole = null</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">个人空间</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">企业用户</td>
              <td className="px-4 py-2.5 text-slate-500">
                <code>user.tenantRole != null</code>
              </td>
              <td className="px-4 py-2.5 text-slate-500">企业空间</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>用户权益配置</h3>
      <p>
        所有限额集中在 <code>src/lib/tier-config.ts</code> 中定义，
        新增用户等级只需在该文件添加一项配置。
      </p>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                权益项
              </th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600">
                未注册用户
              </th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600">
                个人用户
              </th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600">
                企业用户
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 text-slate-600">文件上传上限</td>
              <td className="px-4 py-2.5 text-center text-slate-400">
                不可上传
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                10
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                50
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">
                聊天频率（次/分钟）
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                10
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                20
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                30
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">
                上传频率（次/分钟）
              </td>
              <td className="px-4 py-2.5 text-center text-slate-400">-</td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                3
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                10
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">每日上传次数</td>
              <td className="px-4 py-2.5 text-center text-slate-400">-</td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                20
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                100
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">单次输入字符数</td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                100
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                200
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                500
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">每日 Token 预算</td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                100K
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                200K
              </td>
              <td className="px-4 py-2.5 text-center font-mono text-indigo-600">
                1000K
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">预置文档</td>
              <td className="px-4 py-2.5 text-center text-slate-500">4 篇</td>
              <td className="px-4 py-2.5 text-center text-slate-500">4 篇</td>
              <td className="px-4 py-2.5 text-center text-slate-500">4 篇</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-600">空间生命周期</td>
              <td className="px-4 py-2.5 text-center text-slate-500">只读</td>
              <td className="px-4 py-2.5 text-center text-slate-500">永久</td>
              <td className="px-4 py-2.5 text-center text-slate-500">永久</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>创建超级管理员</h3>
      <p>
        超级管理员不能通过注册页面创建，需在 Supabase SQL Editor 中手动授权：
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`-- 先通过 /register 注册账号，再执行：
UPDATE users SET role = 'superAdmin' WHERE email = 'your-email';

-- 修改后需重新登录，JWT 才会包含新的 role`}</code>
      </pre>

      <h3>权限检查流程</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`请求 → middleware 解析 JWT → 注入 x-user-role / x-tenant-role 到 Headers
     → API Route 调用 getSpaceContext(req) 读取权限信息
     → 根据 role / tenantRole / spaceRole 判断是否放行

/docs/*        → middleware 检查 userRole === "superAdmin"
/admin/*       → middleware 检查 tenantRole === "admin"
空间操作       → API 检查 tenantRole === "admin" 或 space.role === "admin"
文档上传       → API 检查 space.role === "admin" 或 "editor"`}</code>
      </pre>
    </>
  );
}

function Streaming() {
  return (
    <>
      <h2>流式传输</h2>
      <p>
        <strong>问题：</strong>
        大模型生成慢（数秒到数十秒），用户需要等待全部输出完成才能看到结果。
      </p>
      <p>
        <strong>方案：</strong>Vercel AI SDK 的 <code>streamText</code>{" "}
        将模型输出拆成 token 级别的流，通过 <code>ReadableStream</code>{" "}
        逐块推送到前端。
      </p>
      <h3>服务端</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`// src/app/api/chat/route.ts
import { streamText } from "ai";

const result = await streamText({
  model: provider("model-name"),
  messages: sanitizedMessages,
  tools: { ... },
});

return result.toDataStreamResponse(); // 转为 HTTP 流响应`}</code>
      </pre>
      <h3>客户端</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`// src/app/chat/page.tsx
import { useChat } from "ai/react";

const { messages, input, handleSubmit } = useChat();
// messages 状态随流实时更新，UI 自动重渲染`}</code>
      </pre>
      <p>
        <code>useChat</code> 内部使用 <code>EventSource</code> 消费流，
        每收到一个 chunk 就更新 React 状态，实现逐字渲染效果。
      </p>
    </>
  );
}

function GenerativeUI() {
  return (
    <>
      <h2>生成式 UI</h2>
      <p>
        <strong>问题：</strong>传统 chatbot
        只能回复文字，无法展示结构化内容（表格、图表）。
      </p>
      <p>
        <strong>方案：</strong>AI 通过 Tool Calling
        机制决定调用哪个工具，客户端根据 <code>toolName</code> 渲染对应的 React
        组件。
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`AI 判断意图
├── 需要数据列表 → 调用 execute_query → 前端渲染 <SqlResult>
├── 需要可视化   → 调用 show_chart    → 前端渲染 <ChartResult>
└── 知识性问题   → 调用 search_knowledge → 文字回答`}</code>
      </pre>
      <p>
        <strong>关键点：UI 由 AI 决定，而非前端硬编码。</strong>
        同一句话，AI 可能选表格也可能选柱状图，这就是 Generative UI 的核心。
      </p>
      <h3>客户端渲染逻辑</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`// 根据 tool 调用结果渲染不同组件
{message.toolInvocations?.map((tool) => {
  if (tool.toolName === "execute_query")
    return <SqlResult data={tool.result.data} />;
  if (tool.toolName === "show_chart")
    return <ChartResult {...tool.result} />;
})}`}</code>
      </pre>
    </>
  );
}

function StructuredOutput() {
  return (
    <>
      <h2>结构化输出</h2>
      <p>
        <strong>问题：</strong>大模型输出不可控，可能返回格式错误的 JSON。
      </p>
      <p>
        <strong>方案：</strong>用 Zod Schema 定义 Tool 参数，AI SDK
        强制模型输出必须符合 schema。
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`import { z } from "zod";

// show_chart tool 的参数约束
parameters: z.object({
  sql: z.string().describe("The SQL query"),
  chartType: z.enum(["bar", "line", "pie"]),  // 只能是这三个值
  xKey: z.string(),
  yKey: z.string(),
  groupKey: z.string().optional(),            // 可选分组字段
})`}</code>
      </pre>
      <p>Zod 的双重作用：</p>
      <ol>
        <li>
          <strong>约束 AI 输出</strong> —
          模型生成的参数必须符合类型、枚举值、必填规则
        </li>
        <li>
          <strong>运行时校验</strong> — 即使模型返回异常数据，Zod parse
          抛出明确错误而非静默失败
        </li>
      </ol>
    </>
  );
}

function RAG() {
  return (
    <>
      <h2>RAG 知识检索</h2>
      <p>
        <strong>问题：</strong>传统 chatbot
        只能查结构化数据（SQL），无法回答"公司报销制度"、"请假流程"等知识性问题。
      </p>
      <p>
        <strong>方案：</strong>RAG（Retrieval-Augmented Generation）—
        先从向量数据库中检索相关文档，再让 AI 基于文档内容生成回答。
      </p>
      <h3>工作原理</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`用户提问: "公司报销制度是什么"
    ↓
AI 判断意图 → 知识性问题 → 调用 search_knowledge 工具
    ↓
1. Embedding：将问题转为 1024 维向量（百炼 text-embedding-v4）
    ↓
2. 向量搜索：在 Supabase pgvector 中找最相似的文档片段（cosine similarity）
    ↓
3. Context Injection：将搜索到的文档片段作为上下文返回给 AI
    ↓
4. AI 综合文档内容，用自己的话组织回答`}</code>
      </pre>
      <h3>文档入库流程</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`用户上传文件（.txt / .md / .pdf / .docx）
    ↓
1. 解析：根据文件类型提取纯文本（LlamaParse / pdf-parse / mammoth / 直接读取）
    ↓
2. 切片：可选三种策略——标准（Markdown 标题+递归）、精细（父子块）、语义边界（embedding 相似度）
    ↓
3. 向量化：每个切片调用 embedding API 生成 1024 维向量（可选摘要索引增强）
    ↓
4. 存储：向量 + 原文 + 元信息（section、parent_id 等）写入 Supabase documents 表
    ↓
后续搜索时通过向量相似度匹配最相关的片段`}</code>
      </pre>
      <h3>核心代码</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`// src/lib/rag.ts

// 1. 文本 → 向量
async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://dashscope.aliyuncs.com/.../embeddings", {
    body: JSON.stringify({
      model: "text-embedding-v4",
      input: text,
      dimensions: 1024,
    }),
  });
  return res.json().data[0].embedding;
}

// 2. 向量相似度搜索
async function searchDocuments(query: string, topK = 5) {
  const queryEmbedding = await embed(query);
  // Supabase RPC 调用 pgvector 的 cosine distance 搜索
  const { data } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
  });
  return data; // [{ title, content, similarity }]
}`}</code>
      </pre>
      <h3>关键设计决策</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                决策点
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                选择
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                原因
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5">路由方式</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                Tool Calling
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                复用现有架构，AI 自主决定查 SQL 还是查文档，无额外开销
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">向量存储</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                Supabase pgvector
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                免费额度够用，SQL 控制台直接管理，前端生态友好
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">Embedding</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                text-embedding-v4
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                复用百炼 API Key，中文效果好，1024 维平衡精度与性能
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">索引类型</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">HNSW</td>
              <td className="px-4 py-2.5 text-slate-500">
                小数据量下比 IVFFlat 更稳定，无需指定 lists 参数
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">切片策略</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                标准 / 精细(父子) / 语义边界
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                标准：Markdown 标题切分+Overlap；精细：父块存全文、子块 embed；语义：embedding 相似度找边界
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">切片实现</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                src/lib/chunking.ts
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                独立 chunking 模块，支持 parentChunkSize/Overlap、childChunkSize 等参数
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5">分片展示</td>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                按 metadata.section 层级
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                知识库页面分片视图递归渲染，最多 6 层，层级标题带缩进
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>后续优化（Roadmap）</h3>
      <p>
        当前 RAG 已实现 Overlap 滑动窗口切片，以下为各优化方案的对比与适用场景：
      </p>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                方案
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                解决的核心问题
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                适用规模
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                状态
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                Overlap 滑动窗口
              </td>
              <td className="px-4 py-2.5 text-slate-500">chunk 边界语义断裂</td>
              <td className="px-4 py-2.5 text-slate-500">所有规模，基础必备</td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                  已实现
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                Context Enrichment
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                同上（查询时取相邻块补上下文）
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                和 Overlap 功能重叠，二选一即可
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 rounded-full">
                  不需要
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                父子文档检索
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                小 chunk 精准但上下文不足
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                文档篇幅长、结构复杂时
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full">
                  规划中
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                混合搜索 BM25 + 向量
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                纯向量搜索漏召回精确关键词
              </td>
              <td className="px-4 py-2.5 text-slate-500">文档量 1000+</td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full">
                  规划中
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                Rerank 重排序
              </td>
              <td className="px-4 py-2.5 text-slate-500">初筛精度不够</td>
              <td className="px-4 py-2.5 text-slate-500">
                候选集大、精度要求高
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                  已实现
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>渐进式最佳实践：</strong>先把切片做好（Overlap），切片质量决定
        RAG 效果下限。 后续按业务规模渐进式叠加——文档量上百加混合搜索，上千加
        Rerank，文档结构复杂加父子文档。
      </p>
      <h4 className="text-base font-semibold">Overlap 副作用与应对</h4>
      <p>
        引入 Overlap 后，相邻 chunk 内容高度重叠，向量搜索可能同时返回这两个
        chunk， 导致给 AI 的上下文出现重复内容、浪费 Token。当前数据量小（~15
        chunks，topK=5）问题不明显， 文档量增长后可在{" "}
        <code>searchDocuments</code> 返回结果后做去重： 同文档 + 内容重叠度 &gt;
        阈值则合并或只取其一。
      </p>
      <h4 className="text-base font-semibold">混合搜索实现备注</h4>
      <p>
        Supabase 基于 PostgreSQL，原生支持 <code>tsvector / tsquery</code>{" "}
        全文检索， 无需引入 Elasticsearch 等外部引擎。未来实现混合搜索只需：在
        documents 表上添加 FTS 索引， 在 <code>match_documents</code> 中用
        RRF（Reciprocal Rank Fusion）算法融合向量搜索和关键词搜索的结果。
      </p>
    </>
  );
}

function Database() {
  return (
    <>
      <h2>数据存储</h2>
      <h3>知识文档</h3>
      <p>
        上传的文档（PDF、Word、Markdown、TXT）经过分块处理后， 使用{" "}
        <code>text-embedding-v4</code> 生成向量，存储在 Supabase 的{" "}
        <code>documents</code> 表中， 通过 pgvector 进行语义搜索。
      </p>
      <h3>数据报表</h3>
      <p>
        上传的 Excel/CSV 文件会自动解析并在 PostgreSQL
        中创建对应的数据表（表名以 <code>ud_</code> 开头），
        表结构和列信息存储在 <code>data_tables</code> 和{" "}
        <code>data_columns</code> 元数据表中。 AI
        会根据表结构自动生成查询语句来分析数据。
      </p>
    </>
  );
}

function API() {
  return (
    <>
      <h2>API 参考</h2>
      <h3>POST /api/chat</h3>
      <p>主要 API 端点，接收对话消息，返回流式响应。</p>
      <h4 className="text-base font-semibold">请求</h4>
      <pre className="not-prose overflow-x-auto">
        <code>{`POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "各部门平均薪资对比" }
  ]
}`}</code>
      </pre>
      <h4 className="text-base font-semibold">响应</h4>
      <p>
        <code>Content-Type: text/plain</code> — Vercel AI SDK Data Stream
        Protocol 格式，包含：
      </p>
      <ul>
        <li>文本 token（逐字推送）</li>
        <li>Tool call 信息（toolName, args）</li>
        <li>Tool result（执行结果数据）</li>
      </ul>
      <h3>Tools</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                Tool
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                参数
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                用途
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                execute_query
              </td>
              <td className="px-4 py-2.5 text-slate-500">sql: string</td>
              <td className="px-4 py-2.5">
                查询用户上传的数据表，返回表格数据
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                show_chart
              </td>
              <td className="px-4 py-2.5 text-slate-500">
                sql, chartType, xKey, yKey, groupKey?
              </td>
              <td className="px-4 py-2.5">查询数据并返回图表</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-indigo-600">
                search_knowledge
              </td>
              <td className="px-4 py-2.5 text-slate-500">query: string</td>
              <td className="px-4 py-2.5">搜索知识库文档</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Deploy() {
  return (
    <>
      <h2>部署</h2>
      <h3>本地开发</h3>
      <pre className="not-prose overflow-x-auto">
        <code>{`git clone <repo>
cd ai-sql-demo
pnpm install
cp .env.local.example .env.local  # 填入 API Key
pnpm dev`}</code>
      </pre>
      <h3>环境变量</h3>
      <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                变量
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">
                说明
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-mono">DASHSCOPE_API_KEY</td>
              <td className="px-4 py-2.5 text-slate-500">阿里云百炼 API Key</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>切换 AI 模型</h3>
      <p>
        修改 <code>src/app/api/chat/route.ts</code> 中的 provider 和 model
        即可：
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`// 阿里云百炼 (当前)
const provider = createOpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
model: provider("deepseek-v3")

// OpenAI
const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
model: provider("gpt-4o")

// 任何 OpenAI 兼容 API
const provider = createOpenAI({ baseURL: "https://your-api.com/v1" });`}</code>
      </pre>
    </>
  );
}

function Pitfalls() {
  return (
    <>
      <h2>踩坑记录</h2>
      <p>开发过程中遇到的典型问题和解决方案，供参考。</p>

      <h3>1. IVFFlat 索引在小数据量下搜索结果不稳定</h3>
      <p>
        <strong>现象：</strong>知识库有 4
        篇文档，首次搜索"报销制度"能找到，后续重复搜索却找不到了，其他 3
        篇文档正常返回。
      </p>
      <p>
        <strong>原因：</strong>IVFFlat 索引需要指定 <code>lists</code>{" "}
        参数（聚类数）。当 <code>lists = 100</code>{" "}
        但实际只有十几个向量时，大部分聚类为空，搜索时探测的聚类可能恰好不包含目标向量，导致结果不稳定。
      </p>
      <p>
        <strong>解决：</strong>换用 HNSW 索引。HNSW
        是基于图的近似最近邻算法，不依赖聚类数，对小数据量友好。同时将{" "}
        <code>topK</code> 从 3 提升到 5，避免文档数多于 topK 时某些文档被挤掉。
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`-- 替换索引
DROP INDEX IF EXISTS documents_embedding_idx;
CREATE INDEX documents_embedding_idx
  ON documents USING hnsw (embedding vector_cosine_ops);`}</code>
      </pre>

      <h3>2. Prompt 缺少"怎么做"导致 AI 行为失控</h3>
      <p>
        <strong>现象：</strong>
        添加了数据准确性规则"如果数据不存在，告知用户未找到"，AI
        却开始生成探测性 SQL 查询，SQL 报错后 maxSteps 循环修复失败，显示多条"AI
        正在修正..."。
      </p>
      <p>
        <strong>原因：</strong>Prompt 只说了<strong>做什么</strong>
        （告知用户不存在）和<strong>什么时候</strong>（数据不存在时），但没说
        <strong>怎么做</strong>（直接文字回复 vs 先查数据库验证）。AI
        选择了"先查再说"这条路径，生成的 SQL 失败后进入重试死循环。
      </p>
      <p>
        <strong>解决：</strong>补全 Prompt 三要素——
        <strong>什么时候 + 做什么 + 怎么做</strong>：
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`// ❌ 之前：缺少"怎么做"
"如果数据不存在，必须告知用户'未找到相关数据'"

// ✅ 之后：明确行为路径
"如果在 schema 中明显不存在，
  直接用文字回复告知用户（不要调用任何工具），
  并列出数据库中可用的选项"`}</code>
      </pre>

      <h3>3. AI 用相似数据替代用户查询目标（模型幻觉）</h3>
      <p>
        <strong>现象：</strong>
        用户问"电子烟去年卖了多少"，数据库没有电子烟产品，AI
        静默替换成"电子产品"类别并返回数据，用户以为查到了电子烟的数据。
      </p>
      <p>
        <strong>原因：</strong>
        大模型倾向于"给出答案"而非"承认不知道"，尤其是当数据库中存在语义相近的数据时。
      </p>
      <p>
        <strong>解决：</strong>在 System Prompt 中明确禁止替换，并给出具体示例：
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`"不要用相似名称的数据替代用户查询的目标
（例如用户问'电子烟'，不要替换成'电子产品'）"`}</code>
      </pre>

      <h3>
        4. <code>toDataStreamResponse()</code> 的 Content-Type
      </h3>
      <p>
        <strong>现象：</strong>文档中写了 API 响应类型是{" "}
        <code>text/event-stream</code>，但实际观察是 <code>text/plain</code>。
      </p>
      <p>
        <strong>原因：</strong>Vercel AI SDK 的{" "}
        <code>toDataStreamResponse()</code> 使用的是 Data Stream
        Protocol，Content-Type 为 <code>text/plain</code>，不是 SSE 的{" "}
        <code>text/event-stream</code>。两者格式不同。
      </p>

      <h3>
        5. <code>result.usage.totalTokens</code> 为 null 导致 Redis 报错
      </h3>
      <p>
        <strong>现象：</strong>控制台报{" "}
        <code>UpstashError: ERR null args are not supported</code>，
        <code>incrby</code> 的第二个参数是 null。
      </p>
      <p>
        <strong>原因：</strong>DashScope 某些模型的流式响应不返回 token
        用量数据，<code>result.usage</code> resolve 后 <code>totalTokens</code>{" "}
        为 null。
      </p>
      <p>
        <strong>解决：</strong>添加防御性检查{" "}
        <code>if (!totalTokens) return</code>，并在 Promise 链上加{" "}
        <code>{`.catch(() => {})`}</code> 防止 unhandledRejection。
      </p>

      <h3>
        6. <code>sanitizeMessages</code> 解决 toolInvocations 二次请求报错
      </h3>
      <p>
        <strong>现象：</strong>
        <code>useChat</code> 发送的 messages 包含 <code>toolInvocations</code>{" "}
        字段，<code>streamText</code> 无法解析导致报错。
      </p>
      <p>
        <strong>原因：</strong>
        <code>useChat</code> 的客户端状态会将 tool
        调用结果合并到消息中，再次发送时服务端不认识这些字段。
      </p>
      <p>
        <strong>解决：</strong>编写 <code>sanitizeMessages()</code> 函数，只保留{" "}
        <code>role</code> + <code>content</code> 纯文本，丢弃所有
        toolInvocations 和空内容的 assistant 消息。
      </p>

      <h3>7. 为什么切片不用 LangChain.js</h3>
      <p>
        <strong>背景：</strong>LangChain.js 提供了{" "}
        <code>RecursiveCharacterTextSplitter</code>{" "}
        等现成的切片工具，为什么不用？
      </p>
      <p>
        <strong>原因：</strong>
      </p>
      <ul>
        <li>
          <strong>依赖太重</strong> — LangChain 是大型框架，即使单独装{" "}
          <code>@langchain/textsplitters</code> 也会引入大量依赖。
        </li>
        <li>
          <strong>透明可控</strong> — 手写逻辑每一步可读，方便理解 RAG
          切片原理。<code>RecursiveCharacterTextSplitter</code>{" "}
          的核心逻辑也是按分隔符列表 <code>{`["\\n\\n", "\\n", " ", ""]`}</code>{" "}
          递归拆分 → 合并到 chunkSize → 保留 overlap，和我们的实现本质相同。
        </li>
        <li>
          <strong>文件解析用专用轻量库</strong> — PDF 用 <code>pdf-parse</code>
          （~100KB），Word 用 <code>mammoth</code>（~150KB），比引入整个
          LangChain 生态轻量得多。这两个库只负责提取纯文本，提取后的文本走统一的{" "}
          <code>splitChunks</code> 切片流程。
        </li>
      </ul>
      <h3>8. Context Precision 从 17% 提升到 93.75%（三轮修复）</h3>
      <p>
        <strong>现象：</strong>E2E 评估中 Context Precision 分数极低且不稳定，
        最低 17.4%，最高 68.7%。该指标衡量检索结果中相关 chunk
        是否排在前面（加权 precision@k），直接反映 RAG 检索质量。
      </p>
      <p>
        <strong>最终结果：</strong>经三轮修复，17% → 93.75%（+76pp），
        6 个评测样本中 4 个达到满分 1.0。各修复贡献权重：
      </p>
      <ul>
        <li>
          <strong>修复 1：断崖截断 + 下限过滤（+48pp，占 63%）</strong> — 17% → 65%
        </li>
        <li>
          <strong>修复 2：LLM Judge 0-indexed 兼容（+19pp，占 25%）</strong> — 65% → 84%
        </li>
        <li>
          <strong>修复 3：DashScope Rerank 重排序（+10pp，占 12%）</strong> — 84% → 93.75%
        </li>
      </ul>

      <h4 className="text-base font-semibold mt-6">修复 1：断崖截断 + 下限过滤（17% → 65%）</h4>
      <p>
        <strong>问题：</strong>固定返回 <code>TOP_K_FINAL=10</code> 个 chunk，
        即使只有 1-3 个相关，剩余 7-9 个噪声 chunk 严重拉低 precision@k。
        实测 6 个样本中 3 个的 10 个 chunk 全被判不相关（precision=0）。
      </p>
      <p>
        <strong>解决：</strong>在所有策略路径的输出端统一增加两层过滤：
      </p>
      <ul>
        <li>
          <strong>断崖截断</strong> — 当某 chunk 的 similarity &lt;
          前一个 × 0.7 时截断（如{" "}
          <code>[0.82, 0.80, 0.78, 0.45, ...]</code> → 只保留前 3 个）
        </li>
        <li>
          <strong>下限过滤</strong> — similarity &lt; 0.35 的 chunk
          直接丢弃，至少保留 3 个结果
        </li>
      </ul>
      <p>
        输出从固定 10 个变为动态 3-10 个。阈值可通过{" "}
        <code>RAG_SIMILARITY_FLOOR</code>、<code>RAG_DROP_RATIO</code>、
        <code>RAG_MIN_RESULTS</code> 环境变量覆盖。
      </p>

      <h4 className="text-base font-semibold mt-6">修复 2：LLM Judge 0-indexed 兼容（65% → 84%）</h4>
      <p>
        <strong>问题：</strong>评估指标用 LLM（qwen-turbo）判断每个 chunk
        是否相关，Prompt 要求返回 1-indexed 的 chunk 序号，但 LLM
        不稳定地返回 0-indexed。代码硬编码 <code>get(i + 1)</code>，
        导致 0-indexed 时所有判断错位，整个样本得分归零。
        实测「绩效考核」样本因此直接得 0 分。
      </p>
      <p>
        <strong>解决：</strong>自动检测 LLM 返回的索引方案：
      </p>
      <pre className="not-prose overflow-x-auto">
        <code>{`// 自动检测 0-indexed vs 1-indexed
const minIdx = Math.min(...judgments.map(j => j.index));
const maxIdx = Math.max(...judgments.map(j => j.index));
const isZeroIndexed = minIdx === 0 && maxIdx === contexts.length - 1;
const offset = isZeroIndexed ? 0 : 1;
return contexts.map((_, i) => relevanceMap.get(i + offset) ?? false);`}</code>
      </pre>

      <h4 className="text-base font-semibold mt-6">修复 3：DashScope Rerank 重排序（84% → 93.75%）</h4>
      <p>
        <strong>问题：</strong>置信度路由判定为「低置信」时应走 Rerank
        路径，但 Cohere Rerank API 持续返回 403（Trial Key 权限不足），
        且错误被静默捕获，<code>rerankDocs</code> 直接返回{" "}
        <code>docs.slice(0, TOP_K_FINAL)</code>，Rerank 沦为 no-op。
        「出租车费」样本因此得分仅 0.25。
      </p>
      <p>
        <strong>解决：</strong>
      </p>
      <ul>
        <li>
          替换 Cohere 为百炼 <code>qwen3-rerank</code>，直接调用 DashScope
          原生 Rerank API（非 OpenAI 兼容接口）
        </li>
        <li>
          修复 fallback 链：Rerank 失败时正确回退到 Multi-Query，
          而非静默返回未排序结果
        </li>
        <li>
          Rerank 后使用 <code>relevance_score</code> 替代原始 embedding
          similarity，确保断崖截断基于重排序分数
        </li>
      </ul>
      <p>
        效果：「出租车费」经 Rerank 后「交通费报销」chunk 排到第 1 位
        （relevance_score=0.864），断崖截断保留 3 个高质量 chunk，得分从 0.25 → 1.0。
      </p>

    </>
  );
}

function Changelog() {
  const changelog = parseChangelog();
  return (
    <>
      {changelog.map((section) => (
        <div key={section.version} className="not-prose mb-8">
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="text-base font-bold text-slate-800 m-0">
              {section.version}
            </h3>
            {section.date && (
              <span className="text-xs text-slate-400">{section.date}</span>
            )}
          </div>
          <ul className="space-y-2">
            {section.items.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-slate-600 leading-relaxed"
              >
                <span className="text-indigo-400 mt-1.5 shrink-0">•</span>
                <span>{renderInlineMarkdown(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Roadmap() {
  return <RoadmapSection />;
}

/* ─── Section map ─── */

const SECTION_CONTENT: Record<string, () => React.JSX.Element> = {
  overview: Overview,
  architecture: Architecture,
  permissions: Permissions,
  streaming: Streaming,
  "generative-ui": GenerativeUI,
  "structured-output": StructuredOutput,
  rag: RAG,
  database: Database,
  api: API,
  deploy: Deploy,
  pitfalls: Pitfalls,
  changelog: Changelog,
  roadmap: Roadmap,
};

/* ─── Prev/Next navigation ─── */

function PrevNext({ section }: { section: string }) {
  const idx = SECTIONS.findIndex((s) => s.id === section);
  const prev = idx > 0 ? SECTIONS[idx - 1] : null;
  const next = idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;

  return (
    <div className="not-prose mt-16 pt-8 border-t border-slate-100 flex items-center justify-between">
      {prev ? (
        <Link
          href={`/docs/${prev.id}`}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>
            <span className="text-xs text-slate-400 block">上一章</span>
            {prev.label}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.id}`}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors text-right"
        >
          <span>
            <span className="text-xs text-slate-400 block">下一章</span>
            {next.label}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>
      ) : (
        <Link
          href="/chat"
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <span>前往体验 →</span>
        </Link>
      )}
    </div>
  );
}

/* ─── Page component ─── */

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const Content = SECTION_CONTENT[section];
  if (!Content) notFound();

  const sectionMeta = SECTIONS.find((s) => s.id === section);

  return (
    <>
      <Content />
      <PrevNext section={section} />
    </>
  );
}
