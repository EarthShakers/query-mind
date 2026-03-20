import { AsrWsProvider } from "@/contexts/asr-ws-context";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AsrWsProvider>{children}</AsrWsProvider>;
}
