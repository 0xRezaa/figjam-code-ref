import { mkdir, readFile, writeFile } from "node:fs/promises";

import { build } from "esbuild";

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["widget-src/code.tsx"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  jsxFactory: "figma.widget.h",
  jsxFragment: "figma.widget.Fragment",
  minify: true,
});

const ui = await build({
  entryPoints: ["ui-src/ui.ts"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
  minify: true,
});

// The script is inlined into a <script> element, which ends at the first "</script".
const script = ui.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const styles = await readFile("ui-src/ui.css", "utf8");
const template = await readFile("ui-src/index.html", "utf8");

await writeFile(
  "dist/index.html",
  template
    .replace("/* STYLES */", () => styles)
    .replace("/* SCRIPT */", () => script),
);
