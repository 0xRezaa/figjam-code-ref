import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

import type { Mode, Snippet, ToUi, ToWidget } from "../shared/messages.ts";
import {
  fullLabel,
  isPinned,
  languageForPath,
  permalinkUrl,
} from "../shared/permalink.ts";

const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dockerfile,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};
for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language);
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}

const title = element("title");
const subtitle = element("subtitle");
const actions = element("actions");
const errorBox = element("error");
const view = element("view");
const notice = element("notice");
const gutter = element("gutter");
const code = element("code");
const form = element<HTMLFormElement>("edit-form");
const permalinkInput = element<HTMLInputElement>("permalink");
const fetchButton = element<HTMLButtonElement>("fetch");
const refreshButton = element<HTMLButtonElement>("refresh");
const tokenSet = element("token-set");
const tokenUnset = element("token-unset");
const tokenInput = element<HTMLInputElement>("token");

let snippet: Snippet | null = null;
let mode: Mode = "edit";
let busy = false;

function send(message: ToWidget) {
  parent.postMessage({ pluginMessage: message }, "*");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(text: string, path: string): string {
  const language = languageForPath(path);
  if (language === null || hljs.getLanguage(language) === undefined) {
    return escapeHtml(text);
  }
  return hljs.highlight(text, { language, ignoreIllegals: true }).value;
}

function setBusy(next: boolean) {
  busy = next;
  fetchButton.disabled = busy;
  refreshButton.disabled = busy;
  fetchButton.textContent = busy ? "Fetching…" : "Fetch";
}

function showError(message: string | null) {
  errorBox.hidden = message === null;
  errorBox.textContent = message ?? "";
}

function render() {
  const showView = mode === "view" && snippet !== null;
  view.hidden = !showView;
  form.hidden = showView;
  actions.hidden = !showView;

  if (snippet === null) {
    title.textContent = "Add a code reference";
    subtitle.textContent = "";
  } else {
    const { ref } = snippet;
    title.textContent = fullLabel(ref);
    subtitle.textContent = `${ref.owner}/${ref.repo} @ ${isPinned(ref.ref) ? ref.ref.slice(0, 7) : ref.ref}`;
  }

  if (showView && snippet !== null) {
    const lineCount = snippet.endLine - snippet.startLine + 1;
    gutter.textContent = Array.from(
      { length: lineCount },
      (_, index) => snippet!.startLine + index,
    ).join("\n");
    code.innerHTML = highlight(snippet.code, snippet.ref.path);

    const notes = [`Fetched ${new Date(snippet.fetchedAt).toLocaleString()}.`];
    if (snippet.truncated) {
      notes.push(`Showing the first ${lineCount} lines of the range.`);
    }
    if (!isPinned(snippet.ref.ref)) {
      notes.push(
        `The URL names the branch "${snippet.ref.ref}", not a commit, so Refresh shows its latest version.`,
      );
    }
    notice.hidden = false;
    notice.textContent = notes.join(" ");
  }
}

function renderToken(hasToken: boolean) {
  tokenSet.hidden = !hasToken;
  tokenUnset.hidden = hasToken;
  tokenInput.value = "";
}

window.onmessage = (event: MessageEvent) => {
  const message = (event.data as { pluginMessage?: ToUi }).pluginMessage;
  if (message === undefined) {
    return;
  }
  switch (message.type) {
    case "init":
      snippet = message.snippet;
      mode = message.mode;
      permalinkInput.value = snippet === null ? "" : permalinkUrl(snippet.ref);
      renderToken(message.hasToken);
      render();
      if (!form.hidden) {
        permalinkInput.focus();
      }
      break;
    case "snippet":
      snippet = message.snippet;
      mode = "view";
      setBusy(false);
      showError(null);
      render();
      break;
    case "token":
      renderToken(message.hasToken);
      break;
    case "error":
      setBusy(false);
      showError(message.message);
      break;
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }
  setBusy(true);
  showError(null);
  send({ type: "fetch", permalink: permalinkInput.value });
});

element("cancel").addEventListener("click", () => {
  showError(null);
  if (snippet === null) {
    send({ type: "close" });
    return;
  }
  mode = "view";
  render();
});

element("edit").addEventListener("click", () => {
  mode = "edit";
  render();
  permalinkInput.focus();
});

element("open").addEventListener("click", () => send({ type: "open" }));

refreshButton.addEventListener("click", () => {
  setBusy(true);
  showError(null);
  send({ type: "refresh" });
});

element("token-save").addEventListener("click", () => {
  const token = tokenInput.value.trim();
  if (token !== "") {
    send({ type: "set-token", token });
  }
});

element("token-clear").addEventListener("click", () => send({ type: "clear-token" }));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    send({ type: "close" });
  }
});
