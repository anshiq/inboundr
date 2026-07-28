import { cleanEmailText } from "./text";
import type { BodyBlock, InlineRun, ParsedBody } from "./types";

const MAX_BLOCKS = 600;

const LINK_PATTERN =
  /((?:https?:\/\/|www\.)[^\s<>()[\]{}"']+)|(?:mailto:)?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi;

/** Trailing punctuation is usually sentence punctuation, not part of the URL. */
function trimUrlTail(value: string): { url: string; tail: string } {
  const match = value.match(/[.,;:!?)\]}>'"]+$/);
  if (!match) return { url: value, tail: "" };
  return { url: value.slice(0, value.length - match[0].length), tail: match[0] };
}

function inlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) runs.push({ text: text.slice(lastIndex, index) });

    if (match[1]) {
      const { url, tail } = trimUrlTail(match[1]);
      const href = url.startsWith("www.") ? `https://${url}` : url;
      runs.push({ text: url, link: href });
      if (tail) runs.push({ text: tail });
    } else if (match[2]) {
      runs.push({ text: match[2], link: `mailto:${match[2]}` });
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex) });
  return runs.filter((run) => run.text.length > 0);
}

function isReplyTrailer(line: string): boolean {
  if (/wrote:\s*$/i.test(line)) return true;
  if (/^on\s.{5,}<[^>]+@[^>]+>\s*$/i.test(line)) return true;
  if (/^-+\s*(original|forwarded)\s+message\s*-*$/i.test(line)) return true;
  if (/^_{5,}$/.test(line)) return true;
  return false;
}

/**
 * Renders a text/plain body while keeping the shape the sender typed: hard line
 * breaks, bullet and numbered lists, horizontal rules, and quoted reply chains
 * (both ">" prefixes and the "On ... wrote:" trailer that follows them).
 */
export function parsePlainTextBody(raw: string | null | undefined): ParsedBody {
  const text = cleanEmailText(raw);
  if (!text) return { blocks: [], truncated: false, hasImages: false };

  const blocks: BodyBlock[] = [];
  let truncated = false;
  let quoteFloor = 0;
  let paragraph: { runs: InlineRun[]; quoteDepth: number } | null = null;

  const push = (block: BodyBlock) => {
    if (blocks.length >= MAX_BLOCKS) {
      truncated = true;
      return;
    }
    blocks.push(block);
  };

  const flushParagraph = () => {
    if (paragraph && paragraph.runs.length > 0) {
      push({ kind: "paragraph", runs: paragraph.runs, quoteDepth: paragraph.quoteDepth });
    }
    paragraph = null;
  };

  for (const rawLine of text.split("\n")) {
    let line = rawLine;
    let depth = quoteFloor;
    while (/^\s*>/.test(line)) {
      line = line.replace(/^\s*>\s?/, "");
      depth += 1;
    }

    const content = line.trim();
    if (!content) {
      flushParagraph();
      continue;
    }

    if (/^([-_=*])\1{2,}$/.test(content)) {
      flushParagraph();
      push({ kind: "rule", quoteDepth: depth });
      continue;
    }

    if (isReplyTrailer(content)) {
      flushParagraph();
      quoteFloor = Math.max(quoteFloor, 1);
      push({ kind: "paragraph", runs: inlineRuns(content), quoteDepth: Math.max(depth, quoteFloor) });
      continue;
    }

    const bullet = content.match(/^([-*\u2022\u00b7])\s+(.+)$/);
    const numbered = content.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      push({
        kind: "listItem",
        runs: inlineRuns(bullet ? bullet[2]! : numbered![2]!),
        marker: bullet ? "\u2022" : `${numbered![1]}.`,
        depth: Math.min(Math.floor(indent / 2), 2),
        quoteDepth: depth,
      });
      continue;
    }

    if (paragraph && paragraph.quoteDepth === depth) {
      paragraph.runs.push({ text: "\n" }, ...inlineRuns(content));
      continue;
    }

    flushParagraph();
    paragraph = { runs: inlineRuns(content), quoteDepth: depth };
  }

  flushParagraph();
  return { blocks, truncated, hasImages: false };
}
