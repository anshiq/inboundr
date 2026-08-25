import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import type { IEmail } from "../models/email.model";

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
});

const DEFAULT_DRAFT_MODEL = "moonshotai/kimi-k2.6";

function draftModel() {
  return openrouter.chat(
    process.env.EMAIL_DRAFT_MODEL ?? process.env.CHAT_MODEL ?? DEFAULT_DRAFT_MODEL
  );
}

/** Newest messages carry the context a reply actually responds to. */
const THREAD_MESSAGE_LIMIT = 10;
/** Long marketing footers and quoted chains add cost without adding signal. */
const MESSAGE_TEXT_LIMIT = 4000;
export const GUIDANCE_MAX_LENGTH = 2000;

type ThreadContextMessage = Pick<
  IEmail,
  "from" | "to" | "subject" | "date" | "bodyText" | "bodyHtml" | "snippet" | "direction"
>;

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (entity) => HTML_ENTITIES[entity] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function messageText(message: ThreadContextMessage): string {
  const text = message.bodyText?.trim() || (message.bodyHtml ? htmlToText(message.bodyHtml) : "");
  return (text || message.snippet || "").slice(0, MESSAGE_TEXT_LIMIT);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );
}

/** Converts the model's plain-text reply into the simple HTML TipTap expects. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function formatTranscript(messages: ThreadContextMessage[], accountAddress: string): string {
  return messages
    .map((message) => {
      const isOwn =
        message.direction === "outbound" ||
        message.from.toLowerCase().includes(accountAddress.toLowerCase());
      const header = [
        `From: ${message.from}${isOwn ? " (the user, who you are writing as)" : ""}`,
        `To: ${message.to || "(unknown)"}`,
        message.date ? `Date: ${new Date(message.date).toUTCString()}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return `${header}\n\n${messageText(message) || "(no text content)"}`;
    })
    .join("\n\n---\n\n");
}

const SYSTEM_PROMPT = `You draft replies to business emails on behalf of the user.

Rules:
- Write only the body of the reply, as plain text paragraphs separated by blank lines.
- Reply to the most recent message in the conversation, using the full thread for context.
- Match the language and tone of the conversation; default to professional and concise.
- Do not include a subject line, quoted original text, or a signature block — the user's signature is appended automatically. End after the final paragraph of the message (a short closing line like "Best regards," is fine, but no name or contact details).
- Do not invent facts, prices, dates, or commitments that are not supported by the thread or the user's notes. If information is missing, phrase around it or ask for it.
- Never use placeholders like [Name] or [Date].`;

export interface GenerateReplyInput {
  /** Thread messages sorted oldest to newest. */
  messages: ThreadContextMessage[];
  subject: string;
  to: string;
  accountAddress: string;
  guidance?: string;
}

export async function generateReplyDraft(
  input: GenerateReplyInput
): Promise<{ bodyText: string; bodyHtml: string }> {
  const recent = input.messages.slice(-THREAD_MESSAGE_LIMIT);

  const sections = [
    `The user (${input.accountAddress}) is replying to the email conversation below. The reply will be sent to: ${input.to || "(not set yet)"}.`,
    `Subject: ${input.subject || "(no subject)"}`,
    `Conversation, oldest first:\n\n${formatTranscript(recent, input.accountAddress)}`,
  ];

  const guidance = input.guidance?.trim();
  if (guidance) {
    sections.push(
      `The user has started writing or left notes for this reply. Incorporate their points and intent — treat this as the direction the reply must take:\n\n${guidance.slice(0, GUIDANCE_MAX_LENGTH)}`
    );
  }

  sections.push("Write the reply now.");

  const result = await generateText({
    model: draftModel(),
    system: SYSTEM_PROMPT,
    prompt: sections.join("\n\n"),
  });

  const bodyText = result.text.trim();
  return { bodyText, bodyHtml: textToHtml(bodyText) };
}
