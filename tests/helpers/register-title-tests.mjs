import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const local = specifier.startsWith("@/")
      ? new URL(`src/${specifier.slice(2)}`, root)
      : specifier.startsWith(".") && context.parentURL?.startsWith(root.href)
        ? new URL(specifier, context.parentURL)
        : null;
    if (local?.protocol === "file:") {
      for (const suffix of ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts"]) {
        const candidate = pathToFileURL(`${fileURLToPath(local)}${suffix}`);
        if (existsSync(candidate) && /\.(?:ts|tsx|mjs|js)$/.test(candidate.pathname)) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && /\.(?:ts|tsx)$/.test(new URL(url).pathname)) {
      const { outputText } = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
