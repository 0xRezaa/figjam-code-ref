export interface CodeRef {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  startLine: number | null;
  endLine: number | null;
}

export interface LineSlice {
  code: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
}

const BLOB_URL =
  /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)\/blob\/([^/?#]+)\/([^?#]+)(?:\?[^#]*)?(?:#(.*))?$/;
const LINE_ANCHOR = /^L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

const LANGUAGES: { [extension: string]: string } = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "c",
  hpp: "cpp",
  html: "xml",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  kt: "kotlin",
  md: "markdown",
  mjs: "javascript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  swift: "swift",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

export function parsePermalink(input: string): CodeRef {
  const match = BLOB_URL.exec(input.trim());
  if (match === null) {
    throw new Error(
      "Expected a GitHub file URL such as https://github.com/owner/repo/blob/<commit>/path/file.ts#L10-L20",
    );
  }
  const [, owner, repo, ref, path, anchor] = match;
  return {
    owner,
    repo,
    ref: decodeURIComponent(ref),
    path: decodeURIComponent(path).replace(/\/+$/, ""),
    ...parseLineAnchor(anchor),
  };
}

function parseLineAnchor(
  anchor: string | undefined,
): Pick<CodeRef, "startLine" | "endLine"> {
  if (anchor === undefined || anchor === "") {
    return { startLine: null, endLine: null };
  }
  const match = LINE_ANCHOR.exec(anchor);
  if (match === null) {
    throw new Error(
      `Expected a line anchor such as #L10 or #L10-L20, got #${anchor}`,
    );
  }
  const first = Number(match[1]);
  const second = match[2] === undefined ? first : Number(match[2]);
  if (first < 1 || second < 1) {
    throw new Error(`Line numbers start at 1, got #${anchor}`);
  }
  return { startLine: Math.min(first, second), endLine: Math.max(first, second) };
}

export function isPinned(ref: string): boolean {
  return COMMIT_SHA.test(ref);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function permalinkUrl(ref: CodeRef): string {
  let anchor = "";
  if (ref.startLine !== null) {
    anchor =
      ref.startLine === ref.endLine
        ? `#L${ref.startLine}`
        : `#L${ref.startLine}-L${ref.endLine}`;
  }
  return `https://github.com/${ref.owner}/${ref.repo}/blob/${encodeURIComponent(ref.ref)}/${encodePath(ref.path)}${anchor}`;
}

export function contentsApiUrl(ref: CodeRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodePath(ref.path)}?ref=${encodeURIComponent(ref.ref)}`;
}

export function sliceLines(
  text: string,
  startLine: number | null,
  endLine: number | null,
  maxLines: number,
): LineSlice {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const first = startLine ?? 1;
  if (first > lines.length) {
    throw new Error(
      `The file has ${lines.length} lines; the permalink starts at line ${first}.`,
    );
  }
  const requestedLast = Math.min(endLine ?? lines.length, lines.length);
  const last = Math.min(requestedLast, first + maxLines - 1);
  return {
    code: lines.slice(first - 1, last).join("\n"),
    startLine: first,
    endLine: last,
    truncated: last < requestedLast,
  };
}

function lineSuffix(ref: CodeRef): string {
  if (ref.startLine === null) {
    return "";
  }
  return ref.startLine === ref.endLine
    ? `:${ref.startLine}`
    : `:${ref.startLine}-${ref.endLine}`;
}

export function shortLabel(ref: CodeRef): string {
  return ref.path.slice(ref.path.lastIndexOf("/") + 1) + lineSuffix(ref);
}

export function fullLabel(ref: CodeRef): string {
  return ref.path + lineSuffix(ref);
}

export function languageForPath(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === "dockerfile") {
    return "dockerfile";
  }
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return null;
  }
  return LANGUAGES[name.slice(dot + 1)] ?? null;
}

export function describeHttpFailure(status: number, hasToken: boolean): string {
  switch (status) {
    case 401:
      return "GitHub rejected the token (HTTP 401). Remove it and save a new one.";
    case 403:
    case 429:
      return hasToken
        ? `GitHub refused the request (HTTP ${status}): the rate limit is used up, or the token cannot read this repository.`
        : `GitHub refused the request (HTTP ${status}): the rate limit for requests without a token is used up. Wait, or save a token.`;
    case 404:
      return hasToken
        ? "GitHub returned 404: the file does not exist at that commit, or the token cannot read the repository."
        : "GitHub returned 404: the file does not exist at that commit, or the repository is private and needs a token.";
    default:
      return `GitHub returned HTTP ${status}.`;
  }
}
