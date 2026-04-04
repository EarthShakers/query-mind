"use client";

import { useState } from "react";
import { GameAiBuilder } from "@/components/games/game-ai-builder";

export function GamePlaygroundClient({
  gameId,
  gameTitle,
  playBase,
  isOwner,
}: {
  gameId: string;
  gameTitle: string;
  playBase: string;
  isOwner: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const src = `${playBase}/index.html?v=${revision}`;

  return (
    <div className="space-y-4">
      {isOwner ? (
        <GameAiBuilder gameId={gameId} onGenerated={() => setRevision((v) => v + 1)} />
      ) : null}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-[0_30px_120px_rgba(15,23,42,0.45)]">
        <iframe title={gameTitle} src={src} className="h-[78vh] w-full bg-slate-950" />
      </div>
    </div>
  );
}
