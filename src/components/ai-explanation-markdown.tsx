import type { ReactNode } from "react";

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export function AiExplanationMarkdown({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks = parseMarkdown(text);

  return (
    <div className={`space-y-3 text-sm font-medium leading-7 text-slate-800 ${className}`.trim()}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function parseMarkdown(text: string) {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  let activeList: { ordered: boolean; items: string[] } | null = null;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ").trim() });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!activeList) return;
    blocks.push({ type: "list", ordered: activeList.ordered, items: activeList.items });
    activeList = null;
  }

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const unorderedItem = /^[-*]\s+(.+)$/.exec(trimmed);
    const orderedItem = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    const listMatch = unorderedItem ?? orderedItem;

    if (listMatch) {
      flushParagraph();
      const ordered = Boolean(orderedItem);

      if (!activeList || activeList.ordered !== ordered) {
        flushList();
        activeList = { ordered, items: [] };
      }

      activeList.items.push(listMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderBlock(block: MarkdownBlock, index: number) {
  switch (block.type) {
    case "heading":
      return renderHeading(block.level, block.text, index);
    case "list":
      return block.ordered ? (
        <ol key={index} className="ml-5 list-decimal space-y-1">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={index} className="ml-5 list-disc space-y-1">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "paragraph":
      return <p key={index}>{renderInline(block.text)}</p>;
  }
}

function renderHeading(level: number, text: string, index: number) {
  const content = renderInline(text);

  if (level <= 1) {
    return (
      <h3 key={index} className="pt-1 text-base font-black text-slate-950">
        {content}
      </h3>
    );
  }

  return (
    <h4 key={index} className="pt-1 text-sm font-black text-slate-900">
      {content}
    </h4>
  );
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={nodes.length} className="font-black text-slate-950">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={nodes.length} className="rounded bg-white/70 px-1 py-0.5 text-[0.95em] font-bold text-slate-900">
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
