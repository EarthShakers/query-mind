"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Build a looping chat animation timeline for a scenario (paused by default) */
function buildChatTimeline(container: HTMLElement) {
  const tl = gsap.timeline({
    repeat: -1,
    repeatDelay: 1.5,
    paused: true,
  });

  // Scene label (badge + heading)
  const label = container.querySelector("[data-anim='label']");
  if (label) {
    tl.fromTo(label, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0);
  }

  // Window frame slides up
  const frame = container.querySelector("[data-anim='frame']");
  if (frame) {
    tl.fromTo(
      frame,
      { y: 60, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" },
      0.2
    );
  }

  // User message
  const userMsg = container.querySelector("[data-anim='user-msg']");
  if (userMsg) {
    tl.fromTo(
      userMsg,
      { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.5, ease: "back.out(1.4)" },
      0.6
    );
  }

  // Typing dots — appear, bounce, then fade
  const typing = container.querySelector("[data-anim='typing']");
  if (typing) {
    tl.fromTo(
      typing,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.3 },
      1.0
    );
    tl.to(typing, { opacity: 0, duration: 0.2 }, 1.8);
  }

  // AI reply bubble
  const aiReply = container.querySelector("[data-anim='ai-reply']");
  if (aiReply) {
    tl.fromTo(
      aiReply,
      { x: -40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.5, ease: "back.out(1.4)" },
      2.0
    );
  }

  // Bars (chart) — grow from bottom with stagger
  const bars = container.querySelectorAll("[data-anim='bar']");
  if (bars.length) {
    tl.fromTo(
      bars,
      { scaleY: 0, transformOrigin: "bottom" },
      {
        scaleY: 1,
        duration: 0.5,
        stagger: 0.06,
        ease: "elastic.out(1, 0.6)",
      },
      2.4
    );
  }

  // Table rows — slide in with stagger
  const rows = container.querySelectorAll("[data-anim='row']");
  if (rows.length) {
    tl.fromTo(
      rows,
      { x: -20, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.35,
        stagger: 0.12,
        ease: "power2.out",
      },
      2.4
    );
  }

  // Extra elements (footer text, buttons, source) — fade in with stagger
  const extras = container.querySelectorAll("[data-anim='extra']");
  if (extras.length) {
    tl.fromTo(
      extras,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.15, ease: "power2.out" },
      "-=0.2"
    );
  }

  return tl;
}

export default function DemoSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      // Build looping timeline for each scenario, controlled by scroll visibility
      const scenarios = sectionRef.current!.querySelectorAll("[data-scenario]");
      scenarios.forEach((s) => {
        const tl = buildChatTimeline(s as HTMLElement);

        ScrollTrigger.create({
          trigger: s,
          start: "top 75%",
          end: "bottom 25%",
          onEnter: () => tl.play(),
          onLeave: () => tl.pause(),
          onEnterBack: () => tl.play(),
          onLeaveBack: () => tl.pause(),
        });
      });

      // Feature cards — stagger fade in on scroll
      const cards = sectionRef.current!.querySelectorAll("[data-anim='card']");
      if (cards.length) {
        gsap.from(cards, {
          y: 40,
          opacity: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: cards[0],
            start: "top 85%",
          },
        });
      }
    }, sectionRef);

    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <section ref={sectionRef} className="pb-14 md:pb-20 px-4 md:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Two scenarios side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10 items-start">
          {/* Scenario 1: Desktop — Data Query */}
          <div data-scenario="desktop">
            <div className="mb-4 md:mb-6" data-anim="label">
              <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium mb-2">
                场景一
              </span>
              <h3 className="text-lg md:text-xl font-bold text-slate-800">
                在办公室，用对话代替写报表
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                上传 Excel，问一句话，数据自动查、图表自动画
              </p>
            </div>
            <div
              className="rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden bg-slate-50"
              data-anim="frame"
            >
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-3 text-xs text-slate-400">QueryMind</span>
              </div>
              <div className="p-4 md:p-6 space-y-3">
                {/* Typing dots */}
                <div className="flex justify-start" data-anim="typing">
                  <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
                {/* User message */}
                <div className="flex justify-end" data-anim="user-msg">
                  <div className="px-4 py-2.5 bg-indigo-500 text-white text-sm rounded-2xl rounded-tr-sm">
                    各产品月度销售额趋势
                  </div>
                </div>
                {/* AI reply */}
                <div className="flex justify-start" data-anim="ai-reply">
                  <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm text-sm text-slate-600 space-y-3 w-full max-w-md">
                    <p>
                      好的，我来查询各产品每月的销售额数据并生成趋势图。
                    </p>
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 h-36 flex items-center justify-center">
                      <div className="flex items-end gap-1.5 sm:gap-2.5 h-20">
                        {[40, 65, 50, 80, 60, 90, 55, 75, 85, 70, 95, 88].map(
                          (h, i) => (
                            <div
                              key={i}
                              data-anim="bar"
                              className="w-2.5 sm:w-3.5 rounded-t"
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
                    <p className="text-xs text-slate-300" data-anim="extra">
                      查看 SQL ▸
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scenario 2: Mobile Phone — On the go */}
          <div data-scenario="mobile">
            <div className="mb-4 md:mb-6" data-anim="label">
              <span className="inline-block px-3 py-1 bg-cyan-50 text-cyan-600 rounded-full text-xs font-medium mb-2">
                场景二
              </span>
              <h3 className="text-lg md:text-xl font-bold text-slate-800">
                在路上，手机随时查数据
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                出差途中、会议间隙，打开手机就能用
              </p>
            </div>
            {/* iPhone 17 Pro Max mockup */}
            <div className="flex justify-center" data-anim="frame">
              <div className="relative w-[300px] overflow-hidden">
                {/* Titanium frame */}
                <div className="rounded-[3.2rem] border-[5px] border-[#2a2a2c] bg-[#2a2a2c] shadow-2xl shadow-slate-400/30 overflow-hidden relative">
                  {/* Screen */}
                  <div className="rounded-[2.7rem] overflow-hidden bg-white relative">
                    {/* Status bar with Dynamic Island */}
                    <div className="relative h-[52px] bg-white px-6 flex items-end pb-1.5 justify-between">
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90px] h-[25px] bg-[#1d1d1f] rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#3a3a3c] mr-5" />
                      </div>
                      <span className="text-[13px] font-semibold text-[#1d1d1f] tracking-tight">
                        9:41
                      </span>
                      <div className="flex items-center gap-1.5">
                        <svg width="16" height="12" viewBox="0 0 16 12" className="text-[#1d1d1f]">
                          <rect x="0" y="9" width="3" height="3" rx="0.5" fill="currentColor" />
                          <rect x="4" y="6" width="3" height="6" rx="0.5" fill="currentColor" />
                          <rect x="8" y="3" width="3" height="9" rx="0.5" fill="currentColor" />
                          <rect x="12" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
                        </svg>
                        <svg width="14" height="12" viewBox="0 0 14 12" className="text-[#1d1d1f]">
                          <path d="M7 10.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5z" fill="currentColor" />
                          <path d="M3.5 8.5a5 5 0 017 0" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                          <path d="M1 5.5a8.5 8.5 0 0112 0" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        </svg>
                        <div className="flex items-center gap-px">
                          <div className="w-[22px] h-[11px] rounded-[3px] border-[1.5px] border-[#1d1d1f] flex items-center p-[1.5px]">
                            <div className="w-[14px] h-full bg-[#34c759] rounded-[1px]" />
                          </div>
                          <div className="w-[1.5px] h-[4px] bg-[#1d1d1f] rounded-r-full" />
                        </div>
                      </div>
                    </div>

                    {/* App header */}
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </svg>
                      <span className="text-[14px] font-semibold text-indigo-600">
                        QueryMind
                      </span>
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-[10px] text-indigo-600 font-bold">Q</span>
                      </div>
                    </div>

                    {/* Chat content */}
                    <div className="px-3.5 py-3 min-h-[480px] relative bg-white space-y-3">
                      {/* Time stamp */}
                      <div className="text-center" data-anim="extra">
                        <span className="text-[10px] text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full">
                          今天 09:38
                        </span>
                      </div>
                      {/* User message */}
                      <div className="flex justify-end" data-anim="user-msg">
                        <div className="px-3.5 py-2.5 bg-indigo-500 text-white text-[12px] rounded-2xl rounded-tr-sm max-w-[200px] leading-relaxed">
                          上季度销售额最高的 3 个部门
                        </div>
                      </div>
                      {/* Typing indicator */}
                      <div className="flex justify-start gap-2" data-anim="typing">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shrink-0">
                          <span className="text-[9px] text-white font-bold">AI</span>
                        </div>
                        <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                      {/* AI response */}
                      <div className="flex justify-start gap-2" data-anim="ai-reply">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[9px] text-white font-bold">AI</span>
                        </div>
                        <div className="px-3.5 py-3 bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm text-[12px] text-slate-600 space-y-2.5 max-w-[225px]">
                          <p className="leading-relaxed">
                            为您查询到上季度销售额 Top 3：
                          </p>
                          <div className="bg-white rounded-lg border border-slate-100 text-[11px] overflow-hidden">
                            <div className="grid grid-cols-2 gap-px bg-slate-100">
                              <div className="bg-slate-50 px-2.5 py-1.5 font-medium text-slate-500" data-anim="row">
                                部门
                              </div>
                              <div className="bg-slate-50 px-2.5 py-1.5 font-medium text-right text-slate-500" data-anim="row">
                                销售额
                              </div>
                              <div className="bg-white px-2.5 py-2" data-anim="row">华东事业部</div>
                              <div className="bg-white px-2.5 py-2 text-right text-indigo-600 font-semibold" data-anim="row">¥328 万</div>
                              <div className="bg-white px-2.5 py-2" data-anim="row">华南事业部</div>
                              <div className="bg-white px-2.5 py-2 text-right text-indigo-600 font-semibold" data-anim="row">¥275 万</div>
                              <div className="bg-white px-2.5 py-2" data-anim="row">华北事业部</div>
                              <div className="bg-white px-2.5 py-2 text-right text-indigo-600 font-semibold" data-anim="row">¥241 万</div>
                            </div>
                          </div>
                          <p className="text-slate-400 leading-relaxed" data-anim="extra">
                            华东事业部以 ¥328 万领先，建议重点关注其增长策略。
                          </p>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 text-indigo-600 text-[10px] font-medium w-fit" data-anim="extra">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="12" width="4" height="9" rx="1" />
                              <rect x="10" y="6" width="4" height="15" rx="1" />
                              <rect x="17" y="2" width="4" height="19" rx="1" />
                            </svg>
                            用图表展示
                          </div>
                        </div>
                      </div>
                      {/* Input bar */}
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full">
                          <span className="text-[12px] text-slate-300">
                            输入你的问题...
                          </span>
                          <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" />
                              <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Home indicator */}
                    <div className="flex justify-center py-2">
                      <div className="w-32 h-[5px] bg-[#1d1d1f] rounded-full opacity-20" />
                    </div>
                  </div>
                </div>
                {/* Side button — power */}
                <div className="absolute -right-[8px] top-[120px] w-[4px] h-[60px] rounded-r-md bg-gradient-to-r from-[#3a3a3c] via-[#5a5a5e] to-[#3a3a3c] shadow-[2px_0_3px_rgba(0,0,0,0.3)]" />
                {/* Side buttons — volume */}
                <div className="absolute -left-[8px] top-[100px] w-[4px] h-[28px] rounded-l-md bg-gradient-to-l from-[#3a3a3c] via-[#5a5a5e] to-[#3a3a3c] shadow-[-2px_0_3px_rgba(0,0,0,0.3)]" />
                <div className="absolute -left-[8px] top-[136px] w-[4px] h-[28px] rounded-l-md bg-gradient-to-l from-[#3a3a3c] via-[#5a5a5e] to-[#3a3a3c] shadow-[-2px_0_3px_rgba(0,0,0,0.3)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Scenario 3: Knowledge Base */}
        <div className="mt-10 md:mt-16" data-scenario="knowledge">
          <div className="text-center mb-6 md:mb-8" data-anim="label">
            <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-medium mb-2">
              场景三
            </span>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">
              企业知识库：政策、制度、手册，问了就有
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              上传企业文档，新员工入职、制度咨询再也不用到处找人问
            </p>
          </div>
          <div
            className="max-w-4xl mx-auto rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden bg-slate-50"
            data-anim="frame"
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-slate-400">
                QueryMind — 知识库问答
              </span>
            </div>
            <div className="p-4 md:p-6 space-y-3">
              {/* User message */}
              <div className="flex justify-end" data-anim="user-msg">
                <div className="px-4 py-2.5 bg-indigo-500 text-white text-sm rounded-2xl rounded-tr-sm max-w-xs">
                  公司年假制度是怎样的？工作满 3 年有几天？
                </div>
              </div>
              {/* Typing dots */}
              <div className="flex justify-start" data-anim="typing">
                <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
              {/* AI reply */}
              <div className="flex justify-start" data-anim="ai-reply">
                <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm text-sm text-slate-600 space-y-2.5 max-w-xl">
                  <p>
                    根据《员工休假管理制度 v2.3》，年假天数与工龄挂钩：
                  </p>
                  <div className="bg-slate-50 rounded-lg border border-slate-100 p-3 text-[13px] space-y-1.5">
                    <div className="flex justify-between" data-anim="row">
                      <span className="text-slate-500">工龄 1-3 年</span>
                      <span className="font-medium">5 天</span>
                    </div>
                    <div
                      className="flex justify-between bg-indigo-50 -mx-3 px-3 py-1 rounded"
                      data-anim="row"
                    >
                      <span className="text-indigo-600 font-medium">
                        工龄 3-5 年
                      </span>
                      <span className="text-indigo-600 font-bold">
                        10 天 ← 您当前档位
                      </span>
                    </div>
                    <div className="flex justify-between" data-anim="row">
                      <span className="text-slate-500">工龄 5-10 年</span>
                      <span className="font-medium">15 天</span>
                    </div>
                    <div className="flex justify-between" data-anim="row">
                      <span className="text-slate-500">工龄 10 年以上</span>
                      <span className="font-medium">20 天</span>
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs" data-anim="extra">
                    工作满 3 年可享受 10 天年假，需提前 3 个工作日在 OA
                    系统提交申请。
                  </p>
                  <div
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                    data-anim="extra"
                  >
                    <span>📄</span>
                    <span>
                      来源：员工休假管理制度 v2.3 — 第三章第二节
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
