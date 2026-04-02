/** 探测本机是否已有 spark 预览壳（/spark 可访问） */
export async function probeSparkPreviewShell(port: number): Promise<boolean> {
  const url = `http://127.0.0.1:${port}/spark`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 500);
    const r = await fetch(url, { method: "GET", signal: ac.signal, redirect: "manual" });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** 读取预览服务报告的游戏根目录（用于与 spark game 对齐，避免串目录） */
export async function fetchSparkPreviewGameRoot(
  port: number
): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 500);
    const r = await fetch(`http://127.0.0.1:${port}/__spark/meta`, {
      method: "GET",
      signal: ac.signal,
      redirect: "manual",
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { gameRoot?: string };
    if (typeof j.gameRoot !== "string" || !j.gameRoot.trim()) return null;
    return j.gameRoot.trim();
  } catch {
    return null;
  }
}
