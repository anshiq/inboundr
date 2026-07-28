/**
 * The bundled PDF fonts (Helvetica / Courier) are WinAnsi encoded, so anything
 * outside that range renders as a blank or broken glyph. Emails routinely carry
 * arrows, rupee signs, checkmarks and emoji, so every string that reaches the
 * renderer is normalised here first.
 */

/** Codepoints above Latin-1 that WinAnsi still encodes. */
const WINANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

const CHARACTER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00a0|\u2007|\u202f|\u2009|\u200a|\u2002|\u2003/g, " "],
  [/[\u200b-\u200f\u2028\u2029\u2060\ufeff\u00ad]/g, ""],
  [/\u20b9/g, "INR "],
  [/[\u2212\u2043\u2500-\u257f]/g, "-"],
  [/[\u25aa\u25cf\u25e6\u2043\u2023\u26ac\u30fb]/g, "\u2022"],
  [/[\u2192\u21d2\u27a1\u279c]/g, "->"],
  [/[\u2190\u21d0]/g, "<-"],
  [/[\u2713\u2714\u2611]/g, "[x]"],
  [/[\u2717\u2718\u274c]/g, "[ ]"],
  [/\u2264/g, "<="],
  [/\u2265/g, ">="],
  [/\u2260/g, "!="],
  [/\u2033/g, '"'],
  [/\u2032/g, "'"],
  [/[\u2044\u2215]/g, "/"],
  [/\u2028/g, "\n"],
];

export function toPdfSafeText(value: string): string {
  let text = value;
  for (const [pattern, replacement] of CHARACTER_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || char === "\t") {
      out += char;
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    if (code < 0x100 || WINANSI_EXTRAS.has(code)) {
      out += char;
      continue;
    }
    // Unsupported glyph: drop it rather than emitting a broken box.
  }
  return out;
}

function looksQuotedPrintable(value: string): boolean {
  return /=\r?\n/.test(value) || /=(?:3D|20|A0|C2|E2)/i.test(value);
}

function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9a-f]{2})/gi, (match, hex: string) => {
      const code = parseInt(hex, 16);
      return code >= 0x20 || code === 0x0a || code === 0x09 ? String.fromCharCode(code) : match;
    });
}

/** Normalise a raw email string: quoted-printable artefacts, control chars, excess blank lines. */
export function cleanEmailText(value: string | null | undefined): string {
  if (!value) return "";
  const decoded = looksQuotedPrintable(value) ? decodeQuotedPrintable(value) : value;
  return toPdfSafeText(decoded)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** "CATEGORY_PERSONAL" -> "Personal", "UNREAD" -> "Unread". */
export function formatEmailLabel(label: string): string {
  return label
    .replace(/^CATEGORY_/i, "")
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF document",
  "application/msword": "Word document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "application/vnd.ms-excel": "Excel sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel sheet",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS sheet",
  "application/vnd.ms-powerpoint": "Presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "Presentation",
  "application/zip": "ZIP archive",
  "application/x-zip-compressed": "ZIP archive",
  "application/rtf": "RTF document",
  "application/octet-stream": "File",
  "message/rfc822": "Email message",
  "text/csv": "CSV file",
  "text/plain": "Text file",
  "text/html": "HTML file",
};

/** Attachment MIME types are far too long to print verbatim. */
export function formatMimeType(mimeType: string | null | undefined): string {
  const value = (mimeType ?? "").trim().toLowerCase();
  if (!value) return "-";

  const known = MIME_LABELS[value];
  if (known) return known;

  const [type = "", subtype = ""] = value.split("/");
  if (type === "image" || type === "audio" || type === "video") {
    return subtype ? `${subtype.toUpperCase()} ${type}` : type;
  }

  const tail = subtype.split(/[.+]/).filter(Boolean).at(-1) ?? type;
  return limitLength(tail.toUpperCase(), 18);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type EmailAddress = { name: string; email: string };

/** Split a header value on commas that sit outside quotes and angle brackets. */
function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngles = false;

  for (const char of value) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "<") inAngles = true;
    else if (char === ">") inAngles = false;

    if ((char === "," || char === ";") && !inQuotes && !inAngles) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts.map((part) => part.trim()).filter(Boolean);
}

export function parseEmailAddresses(value: string | null | undefined): EmailAddress[] {
  if (!value) return [];
  return splitAddressList(toPdfSafeText(value).replace(/\s+/g, " ")).map((part) => {
    const match = part.match(/^(.*)<([^>]+)>\s*$/);
    if (match) {
      const name = (match[1] ?? "").trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      const email = (match[2] ?? "").trim();
      return { name: name === email ? "" : name, email };
    }
    return { name: "", email: part };
  });
}

/** Trim a display value so header rows stay readable without hiding data. */
export function limitLength(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}\u2026`;
}
