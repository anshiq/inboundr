import type { ReactNode } from "react";
import { Link, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BodyBlock, InlineRun } from "./types";

const COLORS = {
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  soft: "#f9fafb",
};

const HEADING_SIZES: Record<number, number> = { 1: 14, 2: 12.5, 3: 11.5, 4: 10.5, 5: 10, 6: 10 };

/** Long unbroken tokens (URLs, tracking ids) would otherwise overflow the page. */
const MAX_TOKEN_LENGTH = 48;

const styles = StyleSheet.create({
  paragraph: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 7 },
  heading: { fontFamily: "Helvetica-Bold", lineHeight: 1.35, marginTop: 8, marginBottom: 5 },
  listRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 2 },
  listMarker: { width: 16, fontSize: 9.5, lineHeight: 1.5, color: COLORS.muted },
  listText: { flex: 1, fontSize: 9.5, lineHeight: 1.5 },
  pre: {
    fontFamily: "Courier",
    fontSize: 8.5,
    lineHeight: 1.4,
    backgroundColor: COLORS.soft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  rule: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 6, marginBottom: 10 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border,
    paddingLeft: 10,
    marginTop: 2,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginTop: 2,
    marginBottom: 10,
  },
  tableRow: { flexDirection: "row" },
  tableRowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  tableHeaderRow: { backgroundColor: COLORS.soft },
  tableCell: { paddingVertical: 5, paddingHorizontal: 7, borderLeftWidth: 1, borderLeftColor: COLORS.border },
  tableCellFirst: { borderLeftWidth: 0 },
  tableCellText: { fontSize: 8.5, lineHeight: 1.4 },
});

function runFontFamily(run: InlineRun): string {
  if (run.mono) {
    if (run.bold && run.italic) return "Courier-BoldOblique";
    if (run.bold) return "Courier-Bold";
    if (run.italic) return "Courier-Oblique";
    return "Courier";
  }
  if (run.bold && run.italic) return "Helvetica-BoldOblique";
  if (run.bold) return "Helvetica-Bold";
  if (run.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function breakLongTokens(text: string): string {
  return text.replace(/\S{49,}/g, (token) => {
    const chunks: string[] = [];
    for (let index = 0; index < token.length; index += MAX_TOKEN_LENGTH) {
      chunks.push(token.slice(index, index + MAX_TOKEN_LENGTH));
    }
    return chunks.join("\n");
  });
}

type RunOptions = {
  accent: string;
  muted?: boolean;
};

function renderRuns(runs: InlineRun[], options: RunOptions): ReactNode {
  if (runs.length === 0) return " ";

  return runs.map((run, index) => {
    const style = {
      fontFamily: runFontFamily(run),
      textDecoration: run.underline
        ? ("underline" as const)
        : run.strike
          ? ("line-through" as const)
          : undefined,
      color: run.link ? options.accent : options.muted ? COLORS.muted : COLORS.text,
    };
    const text = breakLongTokens(run.text);

    if (run.link) {
      return (
        <Link key={index} src={run.link} style={style}>
          {text}
        </Link>
      );
    }
    return (
      <Text key={index} style={style}>
        {text}
      </Text>
    );
  });
}

function BlockView({ block, options }: { block: BodyBlock; options: RunOptions }) {
  const baseColor = options.muted ? COLORS.muted : COLORS.text;

  if (block.kind === "rule") return <View style={styles.rule} />;

  if (block.kind === "pre") {
    return <Text style={[styles.pre, { color: baseColor }]}>{breakLongTokens(block.text)}</Text>;
  }

  if (block.kind === "heading") {
    return (
      <Text style={[styles.heading, { fontSize: HEADING_SIZES[block.level] ?? 11, color: baseColor }]}>
        {renderRuns(block.runs, options)}
      </Text>
    );
  }

  if (block.kind === "listItem") {
    return (
      <View style={[styles.listRow, { marginLeft: block.depth * 12 }]}>
        <Text style={styles.listMarker}>{block.marker}</Text>
        <Text style={[styles.listText, { color: baseColor }]}>{renderRuns(block.runs, options)}</Text>
      </View>
    );
  }

  if (block.kind === "table") {
    const columnCount = Math.max(1, block.rows[0]?.length ?? 1);
    const columnWidth = `${100 / columnCount}%`;

    return (
      <View style={styles.table}>
        {block.rows.map((row, rowIndex) => {
          const isHeader = row.some((cell) => cell.header);
          return (
            <View
              key={rowIndex}
              style={[
                styles.tableRow,
                rowIndex > 0 ? styles.tableRowDivider : {},
                isHeader ? styles.tableHeaderRow : {},
              ]}
              wrap={false}
            >
              {row.map((cell, cellIndex) => (
                <View
                  key={cellIndex}
                  style={[
                    styles.tableCell,
                    cellIndex === 0 ? styles.tableCellFirst : {},
                    { width: columnWidth },
                  ]}
                >
                  <Text style={[styles.tableCellText, { color: baseColor }]}>
                    {renderRuns(cell.runs, options)}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <Text style={[styles.paragraph, { color: baseColor }]}>{renderRuns(block.runs, options)}</Text>
  );
}

/**
 * Blocks carry their quote depth flat, so consecutive deeper blocks are
 * regrouped here into nested quote containers.
 */
function renderBlocks(blocks: BodyBlock[], depth: number, accent: string): ReactNode[] {
  const output: ReactNode[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index]!;
    if (block.quoteDepth > depth) {
      const start = index;
      while (index < blocks.length && (blocks[index]?.quoteDepth ?? 0) > depth) index += 1;
      output.push(
        <View key={`quote-${start}`} style={styles.quote}>
          {renderBlocks(blocks.slice(start, index), depth + 1, accent)}
        </View>
      );
      continue;
    }

    output.push(
      <BlockView
        key={`block-${index}`}
        block={block}
        options={{ accent, muted: depth > 0 }}
      />
    );
    index += 1;
  }

  return output;
}

export function RichBody({ blocks, accent }: { blocks: BodyBlock[]; accent: string }) {
  return <View>{renderBlocks(blocks, 0, accent)}</View>;
}
