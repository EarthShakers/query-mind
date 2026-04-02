import { normalizeApiBase } from "./config.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** 常见 Next / Vite 开发端口 */
const COMMON_DEV_PORTS = [3000, 3001, 3002, 3003, 3004, 4321];

/**
 * 探测该 origin 上是否存在 App Router 的 POST /api/game（GET 多为 405）。
 */
async function probeGameRoute(origin: string): Promise<boolean> {
  const base = normalizeApiBase(origin);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 1500);
  try {
    const r = await fetch(`${base}/api/game`, {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
    });
    return r.status === 405 || r.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function isLocalApiBase(apiBase: string): boolean {
  try {
    const u = new URL(normalizeApiBase(apiBase));
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * 若 apiBase 指向本机，则依次探测「当前配置端口 + 常见端口」，找到第一个可用的 /api/game。
 * 非本机 URL 原样返回（不做扫描）。
 * 设置环境变量 SPARK_NO_AUTO_PORT=1 可关闭自动探测。
 */
export async function resolveLocalGameApiBase(apiBase: string): Promise<string> {
  const normalized = normalizeApiBase(apiBase);
  if (process.env.SPARK_NO_AUTO_PORT === "1" || !isLocalApiBase(normalized)) {
    return normalized;
  }

  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return normalized;
  }

  const protocol = u.protocol;
  const hostname = u.hostname;
  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (origin: string) => {
    const n = normalizeApiBase(origin);
    if (!seen.has(n)) {
      seen.add(n);
      candidates.push(n);
    }
  };

  push(`${protocol}//${hostname}${u.port ? `:${u.port}` : ""}`);
  for (const p of COMMON_DEV_PORTS) {
    push(`${protocol}//${hostname}:${p}`);
  }

  for (const origin of candidates) {
    if (await probeGameRoute(origin)) {
      return origin;
    }
  }

  return normalized;
}
