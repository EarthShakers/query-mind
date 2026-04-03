import React from "react";
import { createRoot } from "react-dom/client";
import { PreviewApp } from "./preview-app";

declare global {
  interface Window {
    __SPARK_PORT__: number;
    __SPARK_INITIAL_GAME__: string;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root");
}

createRoot(rootEl).render(
  <React.StrictMode>
    <PreviewApp
      port={window.__SPARK_PORT__ || 4321}
      initialGame={window.__SPARK_INITIAL_GAME__ || "default"}
    />
  </React.StrictMode>
);

