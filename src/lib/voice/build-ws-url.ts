/** 构造 WebSocket URL：ws:// 或 wss:// 根据当前页面协议 */
export function buildAsrWsUrl(path = "/api/asr-ws"): string {
  if (typeof location === "undefined") return `ws://localhost:3000${path}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
