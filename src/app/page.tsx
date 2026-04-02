import Link from "next/link";
import DemoSection from "@/components/demo-section";
import PageAnimations from "@/components/page-animations";
import { NavAuth } from "@/components/nav-auth";

const FEATURES = [
  {
    icon: "📑",
    title: "AI 一键生成数据报告",
    desc: "描述你的需求，AI 自动查询数据、生成图表、撰写分析，输出完整的多章节报告，支持导出 PDF / Word。",
  },
  {
    icon: "🤖",
    title: "Agent 智能编辑",
    desc: "对报告任意章节下达修改指令，AI Agent 自动推理→查数据→分析→重写→校验→修正，全程可视化。",
  },
  {
    icon: "💬",
    title: "对话式数据分析",
    desc: "用中文描述你想知道的，AI 自动理解意图、生成 SQL、执行查询并返回结果，业务人员零门槛使用。",
  },
  {
    icon: "📊",
    title: "上传报表即可分析",
    desc: "拖拽 Excel / CSV 上传，AI 自动识别表结构和字段含义，立即支持自然语言查询和图表生成。",
  },
  {
    icon: "📚",
    title: "企业知识库问答",
    desc: "上传公司文档、政策手册、FAQ，AI 向量检索精准回答知识问题，数据分析与知识问答双引擎驱动。",
  },
  {
    icon: "🎨",
    title: "智能图表生成",
    desc: "趋势自动折线图，对比自动柱状图，占比自动饼图——AI 根据数据语义自动选择最佳图表类型。",
  },
];

const COMPARISONS = [
  {
    name: "QueryMind",
    nl: true,
    report: true,
    agent: true,
    autoViz: true,
    excel: true,
    rag: true,
    price: "¥299起",
  },
  {
    name: "ChatBI（百度）",
    nl: true,
    report: false,
    agent: false,
    autoViz: true,
    excel: false,
    rag: false,
    price: "按量",
  },
  {
    name: "Tableau",
    nl: false,
    report: false,
    agent: false,
    autoViz: false,
    excel: true,
    rag: false,
    price: "$70/人/月",
  },
  {
    name: "ChatGPT",
    nl: true,
    report: false,
    agent: false,
    autoViz: false,
    excel: false,
    rag: false,
    price: "$20/月",
  },
];

const PRICING = [
  {
    name: "免费版",
    price: "¥0",
    period: "永久",
    features: ["每天 20 次提问", "1 个空间", "基础报告生成", "基础图表"],
    cta: "免费开始",
    primary: false,
  },
  {
    name: "专业版",
    price: "¥299",
    period: "/月",
    features: ["无限提问", "5 个空间", "完整报告生成", "Agent 编辑", "报告导出 PDF/Word"],
    cta: "立即订阅",
    primary: true,
  },
  {
    name: "团队版",
    price: "¥999",
    period: "/月",
    features: ["10 人协作", "无限空间", "角色权限管理", "API 接口", "优先支持"],
    cta: "联系销售",
    primary: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <PageAnimations />
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
              QueryMind
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-6 text-sm shrink-0">
            <a
              href="#features"
              className="hidden md:inline text-slate-500 hover:text-slate-800 transition-colors"
            >
              功能
            </a>
            <a
              href="#comparison"
              className="hidden md:inline text-slate-500 hover:text-slate-800 transition-colors"
            >
              对比
            </a>
            <a
              href="#pricing"
              className="hidden md:inline text-slate-500 hover:text-slate-800 transition-colors"
            >
              定价
            </a>
            <Link
              href="/knowledge"
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              知识库
            </Link>
            <Link
              href="/games"
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              游戏广场
            </Link>
            <Link
              href="/chat"
              className="px-4 py-2 text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              在线体验
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        data-section="hero"
        className="pt-12 pb-8 md:pt-10 md:pb-12 px-6"
      >
        <div className="max-w-4xl mx-auto text-center">
          <div
            data-hero="badge"
            className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium mb-6"
          >
            AI 生成报告 · Agent 智能编辑
          </div>
          <h1
            data-hero="title"
            className="text-3xl md:text-5xl font-bold leading-tight mb-6"
          >
            一句话生成
            <span
              data-hero="gradient"
              className="inline-block bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
            >
              完整数据报告
            </span>
          </h1>
          <p
            data-hero="desc"
            className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            QueryMind
            让 AI 自动查询数据、生成图表、撰写分析，输出多章节数据报告。不满意？对任意章节下达修改指令，Agent
            自动推理、查数据、重写、校验，全程可视化。
          </p>
          <div
            data-hero="cta"
            className="flex flex-row items-center justify-center gap-4"
          >
            <Link
              href="/chat"
              className="px-8 py-3.5 bg-indigo-500 text-white rounded-xl text-base font-medium hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
            >
              免费体验
            </Link>
            <Link
              href="/knowledge"
              className="px-8 py-3.5 border border-slate-200 text-slate-600 rounded-xl text-base font-medium hover:bg-slate-50 transition-colors"
            >
              知识库
            </Link>
          </div>
        </div>

        {/* Hero media — knowledge base card */}
        <div data-hero="stats" className="mt-10 md:mt-12 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/60 overflow-hidden bg-white">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-cyan-500">
              <h2 className="text-lg md:text-xl font-bold text-white">
                从提问到报告，全程 AI 驱动
              </h2>
              <p className="text-sm text-white/80 mt-1">
                数据报告生成 + Agent 智能编辑，一个平台搞定
              </p>
            </div>
            {/* Content */}
            <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: "📑",
                  title: "一键生成数据报告",
                  desc: "描述需求，AI 自动查询数据、生成图表、撰写分析，输出多章节完整报告",
                },
                {
                  icon: "🤖",
                  title: "Agent 智能编辑",
                  desc: "对任意章节下达修改指令，Agent 自动推理→查数据→重写→校验→修正",
                },
                {
                  icon: "💬",
                  title: "对话式数据分析",
                  desc: "用中文提问，AI 自动生成 SQL 查询并返回图表结果，零技术门槛",
                },
                {
                  icon: "👥",
                  title: "团队空间隔离",
                  desc: "不同团队独立空间，数据和文档严格隔离，权限精细管控",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {item.title}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          data-hero="scroll"
          className="mt-5 flex flex-col items-center gap-2 text-slate-400"
        >
          <span className="text-sm font-medium">向下滚动查看演示</span>
          <svg
            className="w-6 h-6 animate-bounce"
            style={{ animationDuration: "0.6s" }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </section>

      <DemoSection />

      {/* Features */}
      <section
        id="features"
        data-section="features"
        className="py-14 md:py-20 px-6 bg-slate-50"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-16" data-anim="heading">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">核心能力</h2>
            <p className="text-slate-500">AI 报告生成 + Agent 编辑 + 对话分析</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                data-anim="card"
                className="p-6 bg-white rounded-2xl border border-slate-100 hover:shadow-lg hover:shadow-slate-100 transition-shadow"
              >
                <span className="text-3xl" data-anim="icon">
                  {f.icon}
                </span>
                <h3 className="text-lg font-semibold mt-4 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section data-section="steps" className="py-14 md:py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 md:mb-16" data-anim="heading">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">怎么用？</h2>
            <p className="text-slate-500">三步完成数据报告</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "描述你的需求",
                desc: "用自然语言告诉 AI 你想分析什么，比如「生成上季度各部门销售对比报告」",
              },
              {
                step: "02",
                title: "AI 自动生成报告",
                desc: "AI 自动查询数据、生成图表、撰写分析，输出多章节完整报告",
              },
              {
                step: "03",
                title: "Agent 编辑优化",
                desc: "对任意章节下指令修改，Agent 自动推理重写，全程可视化，导出 PDF / Word",
              },
            ].map((s) => (
              <div key={s.step} className="text-center" data-anim="step">
                <div
                  data-anim="step-num"
                  className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 font-bold text-lg flex items-center justify-center mx-auto mb-4"
                >
                  {s.step}
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section
        id="comparison"
        data-section="comparison"
        className="py-14 md:py-20 px-6 bg-slate-50"
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 md:mb-16" data-anim="heading">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">竞品对比</h2>
            <p className="text-slate-500">为什么选择 QueryMind</p>
          </div>
          <div
            className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"
            data-anim="table"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 text-left font-semibold text-slate-700">
                    产品
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    AI 报告
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    Agent 编辑
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    自然语言
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    自动图表
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    Excel 分析
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    知识库
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    价格
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {COMPARISONS.map((c) => (
                  <tr
                    key={c.name}
                    className={c.name === "QueryMind" ? "bg-indigo-50/50" : ""}
                  >
                    <td className="px-6 py-4 font-medium">
                      {c.name === "QueryMind" ? (
                        <span className="text-indigo-600">{c.name}</span>
                      ) : (
                        c.name
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.report ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.agent ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.nl ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.autoViz ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.excel ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.rag ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center text-slate-500">
                      {c.price}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        data-section="pricing"
        className="py-14 md:py-20 px-6"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 md:mb-16" data-anim="heading">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">定价方案</h2>
            <p className="text-slate-500">选择适合你的方案</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING.map((p) => (
              <div
                key={p.name}
                data-anim="pricing-card"
                className={`p-8 rounded-2xl border ${
                  p.primary
                    ? "border-indigo-200 bg-indigo-50/30 shadow-lg shadow-indigo-100 ring-2 ring-indigo-500"
                    : "border-slate-200 bg-white"
                }`}
              >
                {p.primary && (
                  <span className="inline-block px-3 py-1 bg-indigo-500 text-white text-xs font-medium rounded-full mb-4">
                    推荐
                  </span>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="mt-4 mb-6">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-slate-400 text-sm">{p.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-slate-600"
                    >
                      <span className="text-indigo-500">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-colors ${
                    p.primary
                      ? "bg-indigo-500 text-white hover:bg-indigo-600"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        data-section="cta"
        className="py-14 md:py-20 px-6 bg-gradient-to-br from-indigo-600 to-cyan-500"
      >
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            一句话，生成完整数据报告
          </h2>
          <p className="text-indigo-100 mb-8">
            免费体验 QueryMind，AI 报告生成 + Agent 智能编辑，让数据为你所用。
          </p>
          <Link
            href="/chat"
            className="inline-block px-8 py-3.5 bg-white text-indigo-600 rounded-xl text-base font-medium hover:bg-indigo-50 transition-colors shadow-lg"
          >
            立即体验
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-slate-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm font-semibold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
            QueryMind
          </span>
          <div className="flex gap-6 text-sm text-slate-400">
            <Link href="/chat">在线体验</Link>
            <a href="#pricing">定价</a>
          </div>
          <p className="text-xs text-slate-300">
            © 2025 QueryMind. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
