import { getGmailClientForAccount } from "../config/gmail.config";
import type { IEmail } from "../models/email.model";
import type { IGmailAccount } from "../models/gmail-account.model";

export type GmailAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type MimeHeaders = Record<string, string | null | undefined>;

function normalizeReplySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isAscii(value: string): boolean {
  return !/[^\x20-\x7E]/.test(value);
}

/** Split base64 into 76-character lines so no line exceeds the RFC 5322 limit. */
function wrapBase64(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");
}

function encodeBase64Body(value: string): string {
  return wrapBase64(Buffer.from(value, "utf-8").toString("base64"));
}

/**
 * RFC 2047 encoded-word. Headers are restricted to ASCII, so any subject or
 * display name containing non-ASCII characters has to be encoded or the
 * recipient sees mojibake.
 */
function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/**
 * Address headers may only encode the display name; the addr-spec itself must
 * stay literal. Handles comma-separated lists.
 */
function encodeAddressHeader(value: string): string {
  if (isAscii(value)) return value;

  return splitAddressList(value)
    .map((address) => {
      const match = address.match(/^\s*"?(.*?)"?\s*<([^>]+)>\s*$/);
      if (!match) return address.trim();
      const [, name, addr] = match;
      if (!name) return `<${addr}>`;
      return `${encodeHeaderValue(name)} <${addr}>`;
    })
    .join(", ");
}

/** Split on commas that are not inside angle brackets or quotes. */
export function splitAddressList(raw: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  let depth = 0;
  let quoted = false;

  for (const char of raw) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "<") depth++;
    else if (!quoted && char === ">") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0 && !quoted) {
      parts.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }

  if (buffer) parts.push(buffer);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function makeBoundary(label: string): string {
  return `btsa_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function renderHeaders(headers: MimeHeaders): string[] {
  const lines: string[] = [];

  for (const [name, value] of Object.entries(headers)) {
    if (value === null || value === undefined || value === "") continue;

    const isAddressHeader = ["from", "to", "cc", "bcc", "reply-to"].includes(
      name.toLowerCase()
    );
    const encoded = isAddressHeader
      ? encodeAddressHeader(value)
      : name.toLowerCase() === "subject"
        ? encodeHeaderValue(value)
        : value;

    lines.push(`${name}: ${encoded}`);
  }

  return lines;
}

function renderAttachmentPart(boundary: string, attachment: GmailAttachment): string[] {
  const filename = attachment.filename.replace(/[\r\n"]/g, "_") || "attachment";
  return [
    `--${boundary}`,
    `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    wrapBase64(attachment.content.toString("base64")),
  ];
}

function renderTextPart(boundary: string | null, mimeType: string, body: string): string[] {
  const lines = boundary ? [`--${boundary}`] : [];
  return [
    ...lines,
    `Content-Type: ${mimeType}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Body(body),
  ];
}

/**
 * Rough HTML to text conversion for the text/plain alternative; lives in the
 * shared rich-text service. Re-exported so existing imports keep working.
 */
export { htmlToPlainText } from "./rich-text.service";
import { htmlToPlainText } from "./rich-text.service";

/**
 * Build a complete RFC 5322 message.
 *
 * HTML bodies produce a multipart/alternative pair so text-only clients still
 * get readable content; attachments wrap that in a multipart/mixed envelope.
 * All bodies use base64 so UTF-8 survives and no line breaches 998 octets.
 */
export function buildMimeMessage({
  headers,
  text,
  html,
  attachments = [],
}: {
  headers: MimeHeaders;
  text?: string | null;
  html?: string | null;
  attachments?: GmailAttachment[];
}): string {
  const baseHeaders = renderHeaders({ ...headers, "MIME-Version": "1.0" });
  const plainText = text ?? (html ? htmlToPlainText(html) : "");

  // Single text/plain body, no envelope needed.
  if (!html && attachments.length === 0) {
    return [
      ...baseHeaders,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64Body(plainText),
      "",
    ].join("\r\n");
  }

  const bodyLines: string[] = [];
  let bodyContentType: string;

  if (html) {
    const altBoundary = makeBoundary("alt");
    bodyContentType = `multipart/alternative; boundary="${altBoundary}"`;
    bodyLines.push(
      ...renderTextPart(altBoundary, "text/plain", plainText),
      ...renderTextPart(altBoundary, "text/html", html),
      `--${altBoundary}--`
    );
  } else {
    bodyContentType = "text/plain; charset=UTF-8";
  }

  if (attachments.length === 0) {
    return [...baseHeaders, `Content-Type: ${bodyContentType}`, "", ...bodyLines, ""].join(
      "\r\n"
    );
  }

  const mixedBoundary = makeBoundary("mix");
  const parts: string[] = [`--${mixedBoundary}`];

  if (html) {
    parts.push(`Content-Type: ${bodyContentType}`, "", ...bodyLines);
  } else {
    parts.push(
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64Body(plainText)
    );
  }

  for (const attachment of attachments) {
    parts.push(...renderAttachmentPart(mixedBoundary, attachment));
  }
  parts.push(`--${mixedBoundary}--`, "");

  return [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    ...parts,
  ].join("\r\n");
}

/**
 * Lowest-level send. Everything else in this module is a convenience wrapper
 * so all outbound mail shares one MIME implementation.
 */
export async function sendComposedMessage({
  account,
  threadId,
  headers,
  text,
  html,
  attachments = [],
}: {
  account: IGmailAccount;
  threadId?: string | null;
  headers: MimeHeaders;
  text?: string | null;
  html?: string | null;
  attachments?: GmailAttachment[];
}): Promise<string | null> {
  const gmail = await getGmailClientForAccount(account);
  const raw = base64UrlEncode(buildMimeMessage({ headers, text, html, attachments }));

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: threadId ? { raw, threadId } : { raw },
  });

  return res.data.id ?? null;
}

export async function sendStandaloneEmail({
  account,
  to,
  subject,
  body,
  attachments = [],
}: {
  account: IGmailAccount;
  to: string;
  subject: string;
  body: string;
  attachments?: GmailAttachment[];
}): Promise<string | null> {
  return sendComposedMessage({
    account,
    headers: {
      From: account.emailAddress,
      To: to,
      Subject: subject || "(no subject)",
    },
    text: body,
    attachments,
  });
}

function splitMessageIds(value: string | null | undefined): string[] {
  return (value ?? "").trim().split(/\s+/).filter(Boolean);
}

/**
 * RFC 5322 section 3.6.4: a reply's References is the parent's References
 * followed by the parent's Message-ID.
 *
 * The parent's In-Reply-To is normally already the final entry of its References,
 * so appending both would repeat an id. It is only useful as the starting point
 * when the parent carried no References at all, which happens with clients that
 * set In-Reply-To alone; dropping it in that case would lose the link to the
 * grandparent and break the chain.
 */
export function buildReferences(
  email: Pick<IEmail, "references" | "inReplyTo" | "rfcMessageId">
): string | undefined {
  const inherited = email.references?.trim()
    ? splitMessageIds(email.references)
    : splitMessageIds(email.inReplyTo);

  const ids = [...inherited, ...splitMessageIds(email.rfcMessageId)];

  // A malformed inbound chain can still repeat an id, so keep the first
  // occurrence of each and preserve conversation order.
  const seen = new Set<string>();
  const deduped = ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return deduped.length > 0 ? deduped.join(" ") : undefined;
}

export async function sendQuoteOnGmailThread({
  account,
  email,
  to,
  subject,
  body,
  attachments = [],
}: {
  account: IGmailAccount;
  email: IEmail;
  to: string;
  subject: string;
  body: string;
  attachments?: GmailAttachment[];
}): Promise<string | null> {
  return sendComposedMessage({
    account,
    threadId: email.threadId,
    headers: {
      From: account.emailAddress,
      To: to,
      Subject: normalizeReplySubject(subject),
      "In-Reply-To": email.rfcMessageId ?? undefined,
      References: buildReferences(email),
    },
    text: body,
    attachments,
  });
}
