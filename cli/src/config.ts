import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface AppConfig {
  token: string;
  apiBase: string;
}

/** 主配置；保存时只写此文件 */
const CONFIG_PATH = path.join(os.homedir(), ".spark.json");
/** 旧版文件名，仅读取兼容 */
const CONFIG_PATH_LEGACY = path.join(os.homedir(), ".sparkcraft.json");

const DEFAULT_CONFIG: AppConfig = {
  token: "",
  apiBase: "http://localhost:3000",
};

/** 去掉尾部 /，便于拼接 /api/game */
export function normalizeApiBase(base: string): string {
  const t = base.trim();
  return t.replace(/\/+$/, "") || "http://localhost:3000";
}

export function loadConfig(): AppConfig {
  for (const p of [CONFIG_PATH, CONFIG_PATH_LEGACY]) {
    try {
      const raw = fs.readFileSync(p, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      continue;
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<AppConfig>): void {
  const current = loadConfig();
  const merged = { ...current, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
}
