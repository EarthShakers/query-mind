import Link from "next/link";
import DemoSection from "@/components/demo-section";
import PageAnimations from "@/components/page-animations";
import { NavAuth } from "@/components/nav-auth";

const FEATURES = [
  {
    icon: "💬",
    title: "像聊天一样查数据",
    desc: "直接用中文提问，AI 自动理解意图、查询数据库并返回结果，业务人员无需学习任何技术。",
  },
  {
    icon: "📚",
    title: "企业知识随问随答",
    desc: "上传公司文档、政策手册、FAQ，遇到知识类问题 AI 自动检索文档精准回答，不再翻文件。",
  },
  {
    icon: "🎨",
    title: "自动生成图表",
    desc: "问到趋势自动画折线图，问到对比自动出柱状图，问到占比自动生成饼图——你只管提问。",
  },
  {
    icon: "⚡",
    title: "秒级响应",
    desc: "提出问题后 1-2 秒即可看到回答，像和真人对话一样流畅，无需等待加载。",
  },
  {
    icon: "🔒",
    title: "数据只读不可篡改",
    desc: "系统仅允许查询操作，任何情况下都无法修改或删除数据，企业数据安全有保障。",
  },
  {
    icon: "🚀",
    title: "开箱即用",
    desc: "一键部署，对接企业现有数据库即可使用，无需复杂配置和漫长实施周期。",
  },
  {
    icon: "🔄",
    title: "不绑定 AI 厂商",
    desc: "底层支持 GPT-4、Claude、DeepSeek 等多家模型自由切换，灵活选择性价比最优方案。",
  },
  {
    icon: "📱",
    title: "手机也能用",
    desc: "手机、平板、电脑均可流畅使用，出差路上也能随时查数据、看报表。",
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
    <div className="min-h-screen bg-white text-slate-800 overflow-x-hidden">
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
              href="/chat"
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
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
            不用写 SQL，不用等排期
          </div>
          <h1
            data-hero="title"
            className="text-3xl md:text-5xl font-bold leading-tight mb-6"
          >
            问一句话，
            <span
              data-hero="gradient"
              className="inline-block bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
            >
              数据和答案自动呈现
            </span>
          </h1>
          <p
            data-hero="desc"
            className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            QueryMind
            让业务人员也能自主获取数据洞察。问销售额，AI自动查库出图表；问公司政策，AI
            自动检索文档给答案——无需技术背景，无需等人帮忙。
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
                📚 企业知识库，问了就有
              </h2>
              <p className="text-sm text-white/80 mt-1">
                上传企业文档，AI 自动解析建库，对话中精准检索回答
              </p>
            </div>
            {/* Content */}
            <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: "📄",
                  title: "多格式支持",
                  desc: "PDF / Word / Markdown / TXT，拖拽即可上传",
                },
                {
                  icon: "🧠",
                  title: "AI 自动解析",
                  desc: "智能切片、向量化，无需手动整理",
                },
                {
                  icon: "🔍",
                  title: "对话即检索",
                  desc: "提问自动匹配最相关内容，标注来源出处",
                },
                {
                  icon: "👥",
                  title: "团队共享",
                  desc: "新员工入职、制度咨询，不再到处找人问",
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
            <p className="text-slate-500">让数据查询变得像聊天一样简单</p>
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
            <p className="text-slate-500">三步拿到你想要的数据</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "直接提问",
                desc: "用中文描述你想知道的内容，比如「上个月各部门销售额多少」",
              },
              {
                step: "02",
                title: "AI 自动处理",
                desc: "AI 理解你的意图，自动查数据库或检索企业文档，无需你操心过程",
              },
              {
                step: "03",
                title: "结果即时呈现",
                desc: "数据自动配上最合适的图表，知识问题直接给出精准答案",
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
                    自然语言
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    自动图表
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700">
                    秒级响应
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
