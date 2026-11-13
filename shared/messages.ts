import type { CodeRef, LineSlice } from "./permalink.ts";

export interface Snippet extends LineSlice {
  ref: CodeRef;
  fetchedAt: string;
}

export type Mode = "view" | "edit";

export type ToUi =
  | { type: "init"; mode: Mode; snippet: Snippet | null; hasToken: boolean }
  | { type: "snippet"; snippet: Snippet }
  | { type: "token"; hasToken: boolean }
  | { type: "error"; message: string };

export type ToWidget =
  | { type: "fetch"; permalink: string }
  | { type: "refresh" }
  | { type: "open" }
  | { type: "set-token"; token: string }
  | { type: "clear-token" }
  | { type: "close" };
