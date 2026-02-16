import Link from "next/link";

const FEATURES = [
  {
    icon: "💬",
    title: "零 SQL 门槛",
    desc: "用自然语言提问，AI 自动生成 SQL 并执行查询，业务人员无需学习任何技术。",
  },
  {
    icon: "🎨",
    title: "智能可视化",
    desc: "AI 根据问题语义自动选择表格、折线图、柱状图或饼图，无需手动配置。",
  },
  {
    icon: "⚡",
    title: "流式响应",
    desc: "基于 Streaming 架构，发出问题后 1-2 秒即可看到响应，接近实时对话体验。",
  },
  {
    icon: "🔒",
    title: "安全防护",
    desc: "代码层强制只读执行，即使 AI 被 prompt injection 欺骗，也无法执行删表等破坏性操作。",
  },
  {
    icon: "🚀",
    title: "轻量部署",
    desc: "Docker 一键部署，10 分钟上线，对接企业现有 MySQL / PostgreSQL 数据库。",
  },
  {
    icon: "🔄",
    title: "模型灵活切换",
    desc: "支持 GPT-4、Claude、DeepSeek、通义千问等，不绑定任何单一 AI 厂商。",
  },
  {
    icon: "📱",
    title: "多端适配",
    desc: "响应式设计，手机、平板、桌面端均可流畅使用，随时随地查询数据。",
  },
];

const COMPARISONS = [
  {
    name: "QueryMind",
    nl: true,
    autoViz: true,
    stream: true,
    responsive: true,
    deploy: "极低",
    price: "¥299起",
  },
  {
    name: "Tableau Ask Data",
    nl: true,
    autoViz: false,
    stream: false,
    responsive: false,
    deploy: "高",
    price: "$70/人/月",
  },
  {
    name: "ChatBI（百度）",
    nl: true,
    autoViz: true,
    stream: false,
    responsive: false,
    deploy: "SaaS",
    price: "按量",
  },
  {
    name: "Metabase",
    nl: false,
    autoViz: false,
    stream: false,
    responsive: true,
    deploy: "中等",
    price: "开源",
  },
];

const PRICING = [
  {
    name: "免费版",
    price: "¥0",
    period: "永久",
    features: ["每天 20 次查询", "单数据库连接", "基础图表", "社区支持"],
    cta: "免费开始",
    primary: false,
  },
  {
    name: "专业版",
    price: "¥299",
    period: "/月",
    features: ["无限查询", "多数据库", "图表导出", "历史记录", "邮件支持"],
    cta: "立即订阅",
    primary: true,
  },
  {
    name: "团队版",
    price: "¥999",
    period: "/月",
    features: ["10 人协作", "权限管理", "共享看板", "API 接口", "优先支持"],
    cta: "联系销售",
    primary: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
              QueryMind
            </span>
          </div>
          <div className="flex items-center gap-4 md:gap-6 text-sm">
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
              href="/docs"
              className="hidden md:inline text-slate-500 hover:text-slate-800 transition-colors"
            >
              文档
            </Link>
            <Link
              href="/chat"
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              在线体验
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-16 pb-14 md:pt-24 md:pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium mb-6">
            AI-Powered Data Query
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            用自然语言
            <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
              查询数据库
            </span>
          </h1>
          <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            告别 SQL，让每个人都能用对话方式获取数据洞察。 AI
            自动生成查询、执行分析、智能选择可视化方式。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/chat"
              className="px-8 py-3.5 bg-indigo-500 text-white rounded-xl text-base font-medium hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
            >
              免费体验
            </Link>
            <Link
              href="/docs"
              className="px-8 py-3.5 border border-slate-200 text-slate-600 rounded-xl text-base font-medium hover:bg-slate-50 transition-colors"
            >
              查看文档
            </Link>
          </div>
        </div>
      </section>

      {/* Chat Preview */}
      <section className="pb-14 md:pb-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden bg-slate-50">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-slate-400 hidden sm:inline">
                QueryMind — AI SQL Assistant
              </span>
            </div>
            <div className="p-4 md:p-8 space-y-4">
              <div className="flex justify-end">
                <div className="px-4 py-2.5 bg-indigo-500 text-white text-sm rounded-2xl rounded-tr-sm max-w-xs">
                  各产品月度销售额趋势
                </div>
              </div>
              <div className="flex justify-start">
                <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm max-w-lg text-sm text-slate-600 space-y-3">
                  <p>好的，我来查询各产品每月的销售额数据并生成趋势图。</p>
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 h-40 flex items-center justify-center">
                    <div className="flex items-end gap-1.5 sm:gap-3 h-24">
                      {[40, 65, 50, 80, 60, 90, 55, 75, 85, 70, 95, 88].map(
                        (h, i) => (
                          <div
                            key={i}
                            className="w-3 sm:w-4 rounded-t"
                            style={{
                              height: `${h}%`,
                              backgroundColor:
                                i % 2 === 0 ? "#6366f1" : "#06b6d4",
                            }}
                          />
                        )
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">查看 SQL ▸</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-14 md:py-20 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">核心能力</h2>
            <p className="text-slate-500">让数据查询变得像聊天一样简单</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-6 bg-white rounded-2xl border border-slate-100 hover:shadow-lg hover:shadow-slate-100 transition-shadow"
              >
                <span className="text-3xl">{f.icon}</span>
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
      <section className="py-14 md:py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">工作原理</h2>
            <p className="text-slate-500">三步完成数据查询</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "用户提问",
                desc: "用自然语言描述你想查询的数据",
              },
              {
                step: "02",
                title: "AI 生成 SQL",
                desc: "大模型理解意图，生成精确的 SQL 查询语句",
              },
              {
                step: "03",
                title: "智能展示",
                desc: "执行查询，AI 自动选择最佳可视化方式呈现结果",
              },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 font-bold text-lg flex items-center justify-center mx-auto mb-4">
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
      <section id="comparison" className="py-14 md:py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">竞品对比</h2>
            <p className="text-slate-500">为什么选择 QueryMind</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 text-left font-semibold text-slate-700">
                    产品
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    自然语言
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    智能可视化
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    流式响应
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    多端适配
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    部署成本
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
                      {c.nl ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.autoViz ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.stream ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {c.responsive ? "✅" : "❌"}
                    </td>
                    <td className="px-4 py-4 text-center text-slate-500">
                      {c.deploy}
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
      <section id="pricing" className="py-14 md:py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">定价方案</h2>
            <p className="text-slate-500">选择适合你的方案</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING.map((p) => (
              <div
                key={p.name}
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
      <section className="py-14 md:py-20 px-6 bg-gradient-to-br from-indigo-600 to-cyan-500">
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            准备好告别 SQL 了吗？
          </h2>
          <p className="text-indigo-100 mb-8">
            免费体验 QueryMind，让数据说人话。
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
            <Link href="/docs">技术文档</Link>
            <a href="#pricing">定价</a>
          </div>
          <p className="text-xs text-slate-300">
            © 2024 QueryMind. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
