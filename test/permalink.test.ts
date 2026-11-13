import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contentsApiUrl,
  describeHttpFailure,
  fullLabel,
  isPinned,
  languageForPath,
  parsePermalink,
  permalinkUrl,
  shortLabel,
  sliceLines,
} from "../shared/permalink.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("parsePermalink", () => {
  it("reads a line range", () => {
    assert.deepEqual(
      parsePermalink(`https://github.com/hashintel/hash/blob/${SHA}/apps/a/src/workflows.ts#L85-L103`),
      {
        owner: "hashintel",
        repo: "hash",
        ref: SHA,
        path: "apps/a/src/workflows.ts",
        startLine: 85,
        endLine: 103,
      },
    );
  });

  it("reads a single line", () => {
    const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/a.ts#L7`);
    assert.equal(ref.startLine, 7);
    assert.equal(ref.endLine, 7);
  });

  it("reads a whole file without an anchor", () => {
    const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/a.ts`);
    assert.equal(ref.startLine, null);
    assert.equal(ref.endLine, null);
  });

  it("drops column anchors and the query string", () => {
    const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/a.md?plain=1#L3C5-L9C2`);
    assert.equal(ref.path, "a.md");
    assert.equal(ref.startLine, 3);
    assert.equal(ref.endLine, 9);
  });

  it("orders a reversed range", () => {
    const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/a.ts#L20-L10`);
    assert.equal(ref.startLine, 10);
    assert.equal(ref.endLine, 20);
  });

  it("decodes encoded path segments", () => {
    const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/docs/my%20file.md#L1`);
    assert.equal(ref.path, "docs/my file.md");
  });

  it("rejects URLs that are not GitHub file URLs", () => {
    assert.throws(() => parsePermalink("https://gitlab.com/o/r/-/blob/main/a.ts"), /GitHub file URL/);
    assert.throws(() => parsePermalink(`https://github.com/o/r/tree/${SHA}/src`), /GitHub file URL/);
    assert.throws(() => parsePermalink("not a url"), /GitHub file URL/);
  });

  it("rejects anchors that are not line anchors", () => {
    assert.throws(() => parsePermalink(`https://github.com/o/r/blob/${SHA}/a.md#usage`), /line anchor/);
    assert.throws(() => parsePermalink(`https://github.com/o/r/blob/${SHA}/a.ts#L0`), /start at 1/);
  });
});

describe("URLs", () => {
  const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/docs/my%20file.md#L2-L4`);

  it("rebuilds the permalink", () => {
    assert.equal(permalinkUrl(ref), `https://github.com/o/r/blob/${SHA}/docs/my%20file.md#L2-L4`);
  });

  it("builds the contents API URL", () => {
    assert.equal(
      contentsApiUrl(ref),
      `https://api.github.com/repos/o/r/contents/docs/my%20file.md?ref=${SHA}`,
    );
  });

  it("encodes a branch name with a slash in the ref query", () => {
    const branch = { ...ref, ref: "feature/x" };
    assert.match(contentsApiUrl(branch), /\?ref=feature%2Fx$/);
  });
});

describe("isPinned", () => {
  it("accepts a full commit SHA only", () => {
    assert.equal(isPinned(SHA), true);
    assert.equal(isPinned("0123456"), false);
    assert.equal(isPinned("main"), false);
  });
});

describe("sliceLines", () => {
  const text = "one\ntwo\nthree\nfour\nfive\n";

  it("returns the requested lines", () => {
    assert.deepEqual(sliceLines(text, 2, 4, 500), {
      code: "two\nthree\nfour",
      startLine: 2,
      endLine: 4,
      truncated: false,
    });
  });

  it("returns the whole file without a range, ignoring the final newline", () => {
    const slice = sliceLines(text, null, null, 500);
    assert.equal(slice.endLine, 5);
    assert.equal(slice.code, "one\ntwo\nthree\nfour\nfive");
  });

  it("handles CRLF line endings", () => {
    assert.equal(sliceLines("a\r\nb\r\nc", 2, 3, 500).code, "b\nc");
  });

  it("clamps a range that runs past the end of the file", () => {
    const slice = sliceLines(text, 4, 99, 500);
    assert.equal(slice.endLine, 5);
    assert.equal(slice.truncated, false);
  });

  it("truncates to the line limit", () => {
    const slice = sliceLines(text, 1, 5, 2);
    assert.equal(slice.code, "one\ntwo");
    assert.equal(slice.endLine, 2);
    assert.equal(slice.truncated, true);
  });

  it("rejects a range that starts past the end of the file", () => {
    assert.throws(() => sliceLines(text, 9, 9, 500), /has 5 lines/);
  });
});

describe("labels", () => {
  it("shows the file name and lines", () => {
    const ref = parsePermalink(`https://github.com/o/r/blob/${SHA}/src/temporal/workflows.ts#L234`);
    assert.equal(shortLabel(ref), "workflows.ts:234");
    assert.equal(fullLabel(ref), "src/temporal/workflows.ts:234");
  });

  it("shows a range and a whole file", () => {
    assert.equal(shortLabel(parsePermalink(`https://github.com/o/r/blob/${SHA}/a.ts#L1-L9`)), "a.ts:1-9");
    assert.equal(shortLabel(parsePermalink(`https://github.com/o/r/blob/${SHA}/a.ts`)), "a.ts");
  });
});

describe("languageForPath", () => {
  it("maps extensions and file names", () => {
    assert.equal(languageForPath("src/a.tsx"), "typescript");
    assert.equal(languageForPath("src/parsers/classify.py"), "python");
    assert.equal(languageForPath("Cargo.toml"), "ini");
    assert.equal(languageForPath("docker/Dockerfile"), "dockerfile");
    assert.equal(languageForPath("LICENSE"), null);
    assert.equal(languageForPath("a.unknown"), null);
  });
});

describe("describeHttpFailure", () => {
  it("points at a missing token for a 404 without one", () => {
    assert.match(describeHttpFailure(404, false), /private and needs a token/);
    assert.match(describeHttpFailure(404, true), /token cannot read/);
  });

  it("names the rejected token for a 401", () => {
    assert.match(describeHttpFailure(401, true), /rejected the token/);
  });
});
