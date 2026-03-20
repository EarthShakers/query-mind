/*
 * ASR 网关 WebSocket 地址（与当前页面协议、主机一致）。
 */

/**
 * 构造与当前页面同主机的 ASR WebSocket URL（HTTPS 页用 wss，避免混合内容）。
 * SSR / 无 `location` 时回退本地开发地址。
 */
export function buildAsrWsUrl(path = "/api/asr-ws"): string {
  if (typeof location === "undefined") return `ws://localhost:3000${path}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
