import { parseDocument } from "htmlparser2";
import { toPdfSafeText } from "./text";
import type { BodyBlock, InlineMarks, InlineRun, ParsedBody, TableCell } from "./types";

/** Minimal structural view of the htmlparser2 DOM so we avoid depending on domhandler types. */
type DomNode = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
};

const CAPS = {
  blocks: 600,
  characters: 120_000,
  tableRows: 80,
  tableColumns: 8,
  cellCharacters: 600,
};

/** Elements whose content never belongs in a printed email. */
const DROPPED_TAGS = new Set([
  "script",
  "style",
  "head",
  "meta",
  "link",
  "title",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "video",
  "audio",
  "select",
  "textarea",
  "option",
  "input",
  "button",
  "map",
  "area",
  "base",
  "col",
  "colgroup",
]);

/** Elements that force a block boundary but carry no styling of their own. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "address",
  "figure",
  "figcaption",
  "form",
  "fieldset",
  "legend",
  "dl",
  "dt",
  "dd",
  "center",
  "caption",
  "summary",
  "details",
  "body",
  "html",
]);

const BOLD_TAGS = new Set(["strong", "b", "th"]);
const ITALIC_TAGS = new Set(["em", "i", "cite", "var", "dfn", "address"]);
const UNDERLINE_TAGS = new Set(["u", "ins"]);
const STRIKE_TAGS = new Set(["s", "strike", "del"]);
const MONO_TAGS = new Set(["code", "kbd", "samp", "tt"]);

const BULLETS = ["\u2022", "-", "\u2022"];

type PendingMeta =
  | { kind: "paragraph" }
  | { kind: "heading"; level: number }
  | { kind: "listItem"; marker: string; depth: number };

type ListLevel = { ordered: boolean; counter: number };

type WalkContext = {
  builder: BodyBuilder;
  marks: InlineMarks;
  listStack: ListLevel[];
};

function sameMarks(a: InlineRun, b: InlineRun): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    Boolean(a.mono) === Boolean(b.mono) &&
    (a.link ?? "") === (b.link ?? "")
  );
}

function trimRuns(runs: InlineRun[]): InlineRun[] {
  const out = runs.map((run) => ({ ...run }));
  while (out.length > 0) {
    out[0]!.text = out[0]!.text.replace(/^[\s\u00a0]+/, "");
    if (out[0]!.text) break;
    out.shift();
  }
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    last.text = last.text.replace(/[\s\u00a0]+$/, "");
    if (last.text) break;
    out.pop();
  }
  return out;
}

class BodyBuilder {
  readonly blocks: BodyBlock[] = [];
  truncated = false;
  hasImages = false;
  quoteDepth = 0;
  meta: PendingMeta = { kind: "paragraph" };

  private pending: InlineRun[] = [];
  private characters = 0;

  addText(raw: string, marks: InlineMarks): void {
    let text = toPdfSafeText(raw).replace(/\s+/g, " ");
    if (!text) return;

    const previous = this.pending.at(-1);
    const previousEnd = previous ? previous.text.slice(-1) : "";
    const atLineStart = !previous || previousEnd === "\n";

    if (text === " ") {
      if (atLineStart || previousEnd === " ") return;
    } else if (text.startsWith(" ") && (atLineStart || previousEnd === " ")) {
      text = text.slice(1);
    }
    if (!text) return;

    this.pushRun({ text, ...marks });
  }

  lineBreak(): void {
    const previous = this.pending.at(-1);
    if (!previous) return;
    if (previous.text.endsWith("\n\n")) return;
    previous.text = previous.text.replace(/ +$/, "");
    if (!previous.text) {
      this.pending.pop();
      if (this.pending.length === 0) return;
    }
    this.pushRun({ text: "\n" });
  }

  flush(): void {
    const runs = trimRuns(this.pending);
    this.pending = [];
    if (runs.length === 0) return;

    const meta = this.meta;
    if (meta.kind === "heading") {
      this.push({ kind: "heading", level: meta.level, runs, quoteDepth: this.quoteDepth });
      return;
    }
    if (meta.kind === "listItem") {
      this.push({
        kind: "listItem",
        runs,
        marker: meta.marker,
        depth: meta.depth,
        quoteDepth: this.quoteDepth,
      });
      return;
    }
    this.push({ kind: "paragraph", runs, quoteDepth: this.quoteDepth });
  }

  push(block: BodyBlock): void {
    if (this.characters >= CAPS.characters || this.blocks.length >= CAPS.blocks) {
      this.truncated = true;
      return;
    }
    this.blocks.push(block);
    this.characters += blockLength(block);
  }

  takeRuns(): InlineRun[] {
    const runs = trimRuns(this.pending);
    this.pending = [];
    return runs;
  }

  private pushRun(run: InlineRun): void {
    const previous = this.pending.at(-1);
    if (previous && sameMarks(previous, run)) {
      previous.text += run.text;
      return;
    }
    this.pending.push(run);
  }
}

function blockLength(block: BodyBlock): number {
  if (block.kind === "pre") return block.text.length;
  if (block.kind === "rule") return 1;
  if (block.kind === "table") {
    return block.rows.reduce(
      (total, row) => total + row.reduce((rowTotal, cell) => rowTotal + runsLength(cell.runs), 0),
      0
    );
  }
  return runsLength(block.runs);
}

function runsLength(runs: InlineRun[]): number {
  return runs.reduce((total, run) => total + run.text.length, 0);
}

function normalizeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim().replace(/\s+/g, "");
  if (!/^(https?:|mailto:|tel:)/i.test(trimmed)) return undefined;
  return trimmed;
}

function marksFor(element: DomNode, marks: InlineMarks): InlineMarks {
  const next: InlineMarks = { ...marks };
  const name = element.name ?? "";
  if (BOLD_TAGS.has(name)) next.bold = true;
  if (ITALIC_TAGS.has(name)) next.italic = true;
  if (UNDERLINE_TAGS.has(name)) next.underline = true;
  if (STRIKE_TAGS.has(name)) next.strike = true;
  if (MONO_TAGS.has(name)) next.mono = true;

  const style = (element.attribs?.style ?? "").toLowerCase();
  if (style) {
    if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(style)) next.bold = true;
    if (/font-weight\s*:\s*(normal|[1-5]00)/.test(style)) next.bold = false;
    if (/font-style\s*:\s*italic/.test(style)) next.italic = true;
    if (/text-decoration[a-z-]*\s*:[^;]*underline/.test(style)) next.underline = true;
    if (/text-decoration[a-z-]*\s*:[^;]*line-through/.test(style)) next.strike = true;
    if (/font-family\s*:[^;]*(mono|courier|consolas|menlo)/.test(style)) next.mono = true;
  }

  const face = (element.attribs?.face ?? "").toLowerCase();
  if (face && /mono|courier|consolas/.test(face)) next.mono = true;

  return next;
}

function isQuoteContainer(element: DomNode): boolean {
  if (element.name === "blockquote") return true;
  const classNames = element.attribs?.class ?? "";
  return /(^|[\s"])(gmail_quote|gmail_quote_container|yahoo_quoted|moz-cite-prefix|OutlookMessageHeader)([\s"]|$)/i.test(
    classNames
  );
}

function isTrackingPixel(element: DomNode): boolean {
  const width = Number(element.attribs?.width ?? NaN);
  const height = Number(element.attribs?.height ?? NaN);
  if (Number.isFinite(width) && Number.isFinite(height) && width <= 2 && height <= 2) return true;
  const style = (element.attribs?.style ?? "").toLowerCase();
  return /(width|height)\s*:\s*[01](px)?\b/.test(style);
}

function rawTextContent(node: DomNode): string {
  if (node.type === "text") return node.data ?? "";
  if (node.type !== "tag" && node.type !== "script" && node.type !== "style") {
    return (node.children ?? []).map(rawTextContent).join("");
  }
  const name = node.name ?? "";
  if (DROPPED_TAGS.has(name)) return "";
  if (name === "br") return "\n";
  return (node.children ?? []).map(rawTextContent).join("");
}

function extractRows(table: DomNode): DomNode[][] {
  const rows: DomNode[][] = [];

  const collectRow = (row: DomNode) => {
    const cells = (row.children ?? []).filter(
      (child) => child.type === "tag" && (child.name === "td" || child.name === "th")
    );
    if (cells.length > 0) rows.push(cells);
  };

  const visit = (nodes: DomNode[]) => {
    for (const node of nodes) {
      if (node.type !== "tag") continue;
      if (node.name === "tr") {
        collectRow(node);
        continue;
      }
      if (node.name === "thead" || node.name === "tbody" || node.name === "tfoot") {
        visit(node.children ?? []);
      }
    }
  };

  visit(table.children ?? []);
  return rows;
}

/**
 * Emails use tables for both data and page layout. Only grids with several rows
 * and columns are drawn as tables; anything else is flowed as normal blocks so
 * layout scaffolding stays invisible.
 */
function isDataTable(rows: DomNode[][]): boolean {
  if (rows.length < 2) return false;
  const columnCounts = rows.map((row) => row.length);
  const maxColumns = Math.max(...columnCounts);
  if (maxColumns < 2) return false;
  const multiColumnRows = columnCounts.filter((count) => count >= 2).length;
  return multiColumnRows >= 2;
}

function cellRuns(cell: DomNode, context: WalkContext): InlineRun[] {
  const nested = new BodyBuilder();
  walk(cell.children ?? [], {
    builder: nested,
    marks: cell.name === "th" ? { ...context.marks, bold: true } : context.marks,
    listStack: [],
  });
  nested.flush();
  if (nested.hasImages) context.builder.hasImages = true;

  const runs: InlineRun[] = [];
  nested.blocks.forEach((block, index) => {
    if (index > 0) runs.push({ text: "\n" });
    if (block.kind === "pre") {
      runs.push({ text: block.text, mono: true });
      return;
    }
    if (block.kind === "rule") {
      runs.push({ text: "\u2014" });
      return;
    }
    if (block.kind === "table") {
      block.rows.forEach((row, rowIndex) => {
        if (rowIndex > 0) runs.push({ text: "\n" });
        runs.push({ text: row.map((inner) => runsText(inner.runs)).join(" | ") });
      });
      return;
    }
    if (block.kind === "listItem" && block.marker) runs.push({ text: `${block.marker} ` });
    runs.push(...block.runs);
  });

  return capRuns(trimRuns(runs), CAPS.cellCharacters);
}

function runsText(runs: InlineRun[]): string {
  return runs.map((run) => run.text).join("");
}

function capRuns(runs: InlineRun[], maxCharacters: number): InlineRun[] {
  const out: InlineRun[] = [];
  let used = 0;
  for (const run of runs) {
    if (used >= maxCharacters) break;
    const remaining = maxCharacters - used;
    if (run.text.length <= remaining) {
      out.push(run);
      used += run.text.length;
      continue;
    }
    out.push({ ...run, text: `${run.text.slice(0, remaining).trimEnd()}\u2026` });
    break;
  }
  return out;
}

function walkTable(element: DomNode, context: WalkContext): void {
  const { builder } = context;
  const rows = extractRows(element);

  if (!isDataTable(rows)) {
    for (const row of rows) {
      for (const cell of row) {
        builder.flush();
        walk(cell.children ?? [], context);
        builder.flush();
      }
    }
    return;
  }

  const limitedRows = rows.slice(0, CAPS.tableRows);
  if (limitedRows.length < rows.length) builder.truncated = true;

  const columnCount = Math.min(
    Math.max(...limitedRows.map((row) => row.length)),
    CAPS.tableColumns
  );

  const tableRows: TableCell[][] = limitedRows.map((row) => {
    const cells: TableCell[] = row.slice(0, columnCount).map((cell) => ({
      runs: cellRuns(cell, context),
      header: cell.name === "th",
    }));
    while (cells.length < columnCount) cells.push({ runs: [], header: false });
    return cells;
  });

  const hasContent = tableRows.some((row) => row.some((cell) => runsText(cell.runs).trim().length > 0));
  if (!hasContent) return;

  builder.flush();
  builder.push({ kind: "table", rows: tableRows, quoteDepth: builder.quoteDepth });
}

function walkList(element: DomNode, context: WalkContext): void {
  const { builder } = context;
  builder.flush();
  const ordered = element.name === "ol";
  const start = Number(element.attribs?.start ?? 1);
  const level: ListLevel = { ordered, counter: Number.isFinite(start) ? start : 1 };
  walk(element.children ?? [], { ...context, listStack: [...context.listStack, level] });
  builder.flush();
  // A list nested inside a list item consumed that item's marker already.
  if (builder.meta.kind === "listItem") builder.meta = { ...builder.meta, marker: "" };
}

function walkListItem(element: DomNode, context: WalkContext): void {
  const { builder, listStack } = context;
  builder.flush();

  const level = listStack.at(-1);
  const depth = Math.max(listStack.length - 1, 0);
  const marker = level
    ? level.ordered
      ? `${level.counter++}.`
      : (BULLETS[depth % BULLETS.length] ?? "\u2022")
    : "\u2022";

  const previousMeta = builder.meta;
  builder.meta = { kind: "listItem", marker, depth };
  walk(element.children ?? [], context);
  builder.flush();
  builder.meta = previousMeta;
}

function walkHeading(element: DomNode, context: WalkContext, level: number): void {
  const { builder } = context;
  builder.flush();
  const previousMeta = builder.meta;
  builder.meta = { kind: "heading", level };
  walk(element.children ?? [], { ...context, marks: marksFor(element, context.marks) });
  builder.flush();
  builder.meta = previousMeta;
}

function walkQuote(element: DomNode, context: WalkContext): void {
  const { builder } = context;
  builder.flush();
  builder.quoteDepth += 1;
  walk(element.children ?? [], { ...context, marks: marksFor(element, context.marks) });
  builder.flush();
  builder.quoteDepth -= 1;
}

function walk(nodes: DomNode[], context: WalkContext): void {
  const { builder } = context;

  for (const node of nodes) {
    if (node.type === "text") {
      builder.addText(node.data ?? "", context.marks);
      continue;
    }
    if (node.type === "comment" || node.type === "directive" || node.type === "cdata") continue;
    if (node.type !== "tag" && node.type !== "script" && node.type !== "style") {
      walk(node.children ?? [], context);
      continue;
    }

    const name = node.name ?? "";
    if (DROPPED_TAGS.has(name)) continue;

    if (name === "br") {
      builder.lineBreak();
      continue;
    }

    if (name === "hr") {
      builder.flush();
      builder.push({ kind: "rule", quoteDepth: builder.quoteDepth });
      continue;
    }

    if (name === "img") {
      if (!isTrackingPixel(node)) builder.hasImages = true;
      continue;
    }

    if (name === "pre") {
      builder.flush();
      const text = toPdfSafeText(rawTextContent(node)).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (text) builder.push({ kind: "pre", text, quoteDepth: builder.quoteDepth });
      continue;
    }

    if (/^h[1-6]$/.test(name)) {
      walkHeading(node, context, Number(name.slice(1)));
      continue;
    }

    if (isQuoteContainer(node)) {
      walkQuote(node, context);
      continue;
    }

    if (name === "ul" || name === "ol") {
      walkList(node, context);
      continue;
    }

    if (name === "li") {
      walkListItem(node, context);
      continue;
    }

    if (name === "table") {
      walkTable(node, context);
      continue;
    }

    if (name === "tr" || name === "td" || name === "th" || name === "tbody" || name === "thead" || name === "tfoot") {
      // Reached without an enclosing table (malformed markup): treat as blocks.
      builder.flush();
      walk(node.children ?? [], { ...context, marks: marksFor(node, context.marks) });
      builder.flush();
      continue;
    }

    if (name === "a") {
      const href = normalizeHref(node.attribs?.href);
      walk(node.children ?? [], {
        ...context,
        marks: { ...marksFor(node, context.marks), link: href ?? context.marks.link },
      });
      continue;
    }

    if (BLOCK_TAGS.has(name)) {
      builder.flush();
      walk(node.children ?? [], { ...context, marks: marksFor(node, context.marks) });
      builder.flush();
      continue;
    }

    walk(node.children ?? [], { ...context, marks: marksFor(node, context.marks) });
  }
}

export function parseEmailHtml(html: string): ParsedBody {
  const document = parseDocument(html, { decodeEntities: true }) as unknown as { children: DomNode[] };
  const builder = new BodyBuilder();
  walk(document.children ?? [], { builder, marks: {}, listStack: [] });
  builder.flush();

  return {
    blocks: builder.blocks,
    truncated: builder.truncated,
    hasImages: builder.hasImages,
  };
}
