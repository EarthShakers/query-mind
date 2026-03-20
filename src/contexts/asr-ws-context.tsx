"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { AsrWsChannel } from "@/lib/voice/asr-ws-channel";

const AsrWsContext = createContext<AsrWsChannel | null>(null);

export function AsrWsProvider({ children }: { children: React.ReactNode }) {
  const [channel] = useState(() => new AsrWsChannel());

  useEffect(() => {
    channel.warmConnect().catch(() => {
      /* 预连失败不阻塞；录音时会重试 */
    });
    return () => channel.dispose();
  }, [channel]);

  return (
    <AsrWsContext.Provider value={channel}>{children}</AsrWsContext.Provider>
  );
}

export function useAsrWsChannel(): AsrWsChannel | null {
  return useContext(AsrWsContext);
}
