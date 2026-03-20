import { buildAsrWsUrl } from "./build-ws-url";
import {
  beginUtteranceOnOpenSocket,
  type AsrTransport,
  type AsrTransportHandlers,
} from "./asr-transport";

/** `warmConnect` 等待首包 open 的最长时间 */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * 浏览器 ↔ 自建 ASR 网关的一条长连接；进聊天页 warmConnect，每次长按 beginUtterance。
 */
export class AsrWsChannel {
  private ws: WebSocket | null = null;
  private pendingConnect: Promise<void> | null = null;

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 预连接：摊薄 TLS + 握手 RTT（海外机房效果明显） */
  warmConnect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.pendingConnect) return this.pendingConnect;

    this.pendingConnect = new Promise((resolve, reject) => {
      const ws = new WebSocket(buildAsrWsUrl());
      const timer = setTimeout(() => {
        ws.close();
        this.pendingConnect = null;
        reject(new Error("WebSocket 连接超时"));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        this.pendingConnect = null;
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        this.pendingConnect = null;
        reject(new Error("WebSocket 连接失败"));
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
      };
    });

    return this.pendingConnect;
  }

  /**
   * 在当前长连接上开始新一句：确保已连接后，交给 `beginUtteranceOnOpenSocket` 注册本轮监听。
   */
  async beginUtterance(handlers: AsrTransportHandlers): Promise<AsrTransport> {
    await this.warmConnect();
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.ws = null;
      throw new Error("WebSocket 未连接");
    }
    return beginUtteranceOnOpenSocket(socket, handlers);
  }

  /** 离开页面时关闭 */
  dispose(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.pendingConnect = null;
  }
}
