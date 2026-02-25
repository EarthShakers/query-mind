export interface Turn {
  id: string;
  userContent: string;
  assistantMessages: any[];
}

export function groupTurns(messages: any[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      turns.push({ id: m.id, userContent: m.content, assistantMessages: [] });
    } else if (m.role === "assistant" && turns.length > 0) {
      turns[turns.length - 1].assistantMessages.push(m);
    }
  }
  return turns;
}
