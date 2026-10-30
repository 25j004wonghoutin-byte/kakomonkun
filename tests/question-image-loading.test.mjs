import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
const imageModule = import.meta.resolve("next/image.js");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/image") return { url: `data:text/javascript,${encodeURIComponent(`import Image from ${JSON.stringify(imageModule)}; export default Image.default ?? Image;`)}`, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { QuestionImage } = await import("../src/components/question-image.tsx");
test("a hundred-question result does not eagerly load previews or closed dialog enlargements", () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    ...Array.from({ length: 100 }, (_, index) => React.createElement(QuestionImage, { key: index, src: `/questions/test-${index}.png`, alt: `公開問題 ${index + 1}` }))));
  const images = html.match(/<img\b[^>]*>/g) ?? [];
  assert.equal(images.length, 100, "unopened enlargements must not render any image resource");
  assert.ok(images.every(image => /loading="lazy"/.test(image)), "all offscreen previews and unopened image variants must remain lazy");
  assert.doesNotMatch(html, /loading="eager"/);
});
