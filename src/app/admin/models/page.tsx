"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { NavAuth } from "@/components/nav-auth";
import { SearchableSelect } from "@/components/searchable-select";

interface ModelConfig {
  modelChat: string;
  modelLight: string;
  modelAgent: string;
  modelGame: string;
  modelRerank: string;
  modelEmbedding: string;
  embeddingDimensions: number;
  modelAsr: string;
  modelTts: string;
  modelImageGen: string;
  modelVideoGen: string;
}

interface ModelsByCategory {
  chat: string[];
  rerank: string[];
  embedding: string[];
  audioAsr: string[];
  audioTts: string[];
  imageGen: string[];
  videoGen: string[];
}

const CONFIG_FIELDS: {
  key: keyof ModelConfig;
  label: string;
  hint: string;
  category: keyof ModelsByCategory | "number";
}[] = [
  { key: "modelChat", label: "主对话模型", hint: "Chat、Report 生成", category: "chat" },
  { key: "modelLight", label: "轻量任务模型", hint: "Self-Query、Multi-Query、摘要、标题、ASR 语音纠错", category: "chat" },
  { key: "modelAgent", label: "Agent 模型", hint: "LangGraph 规划与执行", category: "chat" },
  { key: "modelGame", label: "游戏代码模型", hint: "spark game 代码生成与修改", category: "chat" },
  { key: "modelRerank", label: "Rerank 模型", hint: "检索重排序", category: "rerank" },
  { key: "modelEmbedding", label: "Embedding 模型", hint: "向量化", category: "embedding" },
  { key: "embeddingDimensions", label: "Embedding 维度", hint: "256–4096", category: "number" },
  { key: "modelAsr", label: "语音输入模型", hint: "ASR 语音转文字", category: "audioAsr" },
  { key: "modelTts", label: "语音输出模型", hint: "TTS 文字转语音", category: "audioTts" },
  { key: "modelImageGen", label: "图像生成模型", hint: "文生图、图生图、图像编辑", category: "imageGen" },
  { key: "modelVideoGen", label: "视频生成模型", hint: "文生视频、图生视频", category: "videoGen" },
];

export default function AdminModelsPage() {
  const { user, loading } = useAuth();
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [models, setModels] = useState<ModelsByCategory | null>(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      const [configRes, modelsRes] = await Promise.all([
        fetch("/api/models/config"),
        fetch("/api/models/list"),
      ]);
      if (configRes.ok) setConfig(await configRes.json());
      else setConfig(null);
      if (modelsRes.ok) setModels(await modelsRes.json());
      else setModels(null);
    } catch {
      setConfig(null);
      setModels(null);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "superAdmin") fetchData();
  }, [loading, user?.role, fetchData]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/models/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig(data);
        setMessage({ type: "success", text: "配置已保存" });
      } else {
        setMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role !== "superAdmin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">需要超级管理员权限</p>
          <Link href="/" className="text-indigo-600 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/spaces"
              className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              空间管理
            </Link>
            <NavAuth />
          </div>
        </div>
      </nav>

      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 text-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10A10 10 0 0 1 12 2z" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h1 className="text-xl md:text-2xl font-bold">模型配置</h1>
          </div>
          <p className="text-indigo-100 text-sm mt-1">
            动态配置各场景使用的百炼模型，保存后立即生效
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 md:px-6 -mt-4">
        {fetching ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mr-3" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : config ? (
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">模型参数</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                参考{" "}
                <a
                  href="https://help.aliyun.com/zh/model-studio/getting-started/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline"
                >
                  百炼模型列表
                </a>
              </p>
            </div>
            <div className="p-5 space-y-4">
              {CONFIG_FIELDS.map(({ key, label, hint, category }) => {
                const isNumber = category === "number";
                const options = !isNumber && models?.[category]
                  ? [...new Set([config[key] as string, ...(models[category] ?? [])].filter(Boolean))]
                  : [];

                return (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {label}
                    </label>
                    {isNumber ? (
                      <input
                        type="number"
                        value={config[key] ?? ""}
                        onChange={(e) =>
                          setConfig((c) =>
                            c
                              ? {
                                  ...c,
                                  [key]: parseInt(e.target.value, 10) || 1024,
                                }
                              : c
                          )
                        }
                        min={256}
                        max={4096}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="1024"
                      />
                    ) : (
                      <SearchableSelect
                        value={config[key] as string}
                        options={options}
                        onChange={(v) =>
                          setConfig((c) => (c ? { ...c, [key]: v } : c))
                        }
                        placeholder="请选择或搜索模型"
                      />
                    )}
                    <p className="text-xs text-slate-400 mt-1">{hint}</p>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
              {message && (
                <span
                  className={`text-sm ${
                    message.type === "success" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {message.text}
                </span>
              )}
              <div className="ml-auto" />
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-indigo-500 to-cyan-500 text-white rounded-xl hover:shadow-md hover:shadow-indigo-200/50 disabled:opacity-50 transition-all"
              >
                {saving ? "保存中..." : "保存配置"}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-slate-500 text-sm">加载配置失败</p>
            <p className="text-slate-400 text-xs mt-1">
              请确认已执行 scripts/app-settings-setup.sql
            </p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              重试
            </button>
          </div>
        )}
        <div className="h-12" />
      </div>
    </div>
  );
}
