import sanitizeHtml from "sanitize-html";

/**
 * Shared sanitizer for rich text authored in the app's TipTap editors (CRM
 * notes, project task descriptions). The editor schema is not a security
 * boundary — the HTML arrives over HTTP and is later rendered for every
 * teammate viewing the record. Restrict it to what the editor toolbar and
 * slash menu can actually emit.
 *
 * Uploaded images carry a `data-key` storage reference that the client
 * resolves to a short-lived signed URL at render time, so keys must survive
 * sanitization. Mention / Drive-file / form chips serialize as `<span
 * data-type="...">` with record-reference data attributes.
 */
export function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "a", "span",
      "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "hr", "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "data-key"],
      // Chips emitted by the TipTap Mention extension and the module-reference
      // nodes (Drive files, forms).
      span: ["data-type", "data-user-id", "data-label", "data-node-id", "data-form-id", "data-slug"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}

/**
 * Derives a plain-text rendering from rich HTML. Used server-side so the
 * plain body/description (search indexes, previews, legacy clients) can never
 * diverge from what the sanitized HTML actually says.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
