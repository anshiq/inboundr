import type { gmail_v1 } from "googleapis";
import { getGmailClientForAccount } from "../config/gmail.config";
import { Email } from "../models/email.model";
import type { ParsedEmail, EmailAttachment } from "../types/email.types";
import { processEmailForRFQ } from "./rfq.service";
import {
  buildRFQProcessingInput,
  hasRFQProcessableContent,
} from "./rfq-input.service";
import {
  GmailAccount,
  type IGmailAccount,
} from "../models/gmail-account.model";
import { Organization } from "../models/organization.model";
import { hasEffectiveFeature } from "./entitlement.service";

function extractEmailAddress(value: string | null | undefined): string {
  if (!value) return "";

  const angleMatch = value.match(/<([^>]+)>/);
  const email = angleMatch?.[1] ?? value;

  return email.trim().replace(/^mailto:/i, "").toLowerCase();
}

function isSelfSentEmail(
  account: IGmailAccount,
  parsed: Pick<ParsedEmail, "from" | "labels">
): boolean {
  const fromAddress = extractEmailAddress(parsed.from);
  const accountAddress = account.emailAddress.toLowerCase();
  const labels = new Set(parsed.labels);

  return fromAddress === accountAddress || (labels.has("SENT") && !labels.has("INBOX"));
}

export async function canProcessQuotationInbox(account: IGmailAccount): Promise<boolean> {
  if (!account.organizationId) return false;

  const organization = await Organization.findById(account.organizationId)
    .select("planSlug enabledFeatures disabledFeatures")
    .lean();

  return Boolean(organization && hasEffectiveFeature(organization, "rfq"));
}

/**
 * Fetches a single Gmail message and stores it, kicking off RFQ processing for
 * newly saved inbound mail. Idempotent: already-stored, self-sent and
 * duplicate messages are no-ops, so callers may safely retry after failures.
 * Throws when ingestion fails so callers can decide whether to advance their
 * sync cursor.
 */
export async function ingestInboxMessage(
  account: IGmailAccount,
  messageId: string
): Promise<boolean> {
  const exists = await Email.exists({
    gmailAccountId: account._id,
    messageId,
  }).lean();
  if (exists) return false;

  const parsed = await getEmailById(account, messageId);
  if (isSelfSentEmail(account, parsed)) {
    console.log(
      `Skipping self-sent Gmail message ${messageId} from ${parsed.from}`
    );
    return false;
  }

  const saved = await saveEmail(account, parsed);
  if (!saved) return false;
  console.log(`Saved email: ${parsed.subject} from ${parsed.from}`);

  const emailDoc = await Email.findOne({
    gmailAccountId: account._id,
    messageId,
  }).lean();
  if (emailDoc && hasRFQProcessableContent(emailDoc)) {
    const body = await buildRFQProcessingInput(account, emailDoc);
    processEmailForRFQ(
      emailDoc._id.toString(),
      body,
      messageId,
      account.userId,
      account._id.toString(),
      account.organizationId?.toString(),
      { threadId: emailDoc.threadId ?? null }
    ).catch((err) =>
      console.error(`RFQ processing failed for ${messageId}:`, err)
    );
  }

  return true;
}

export async function processHistoryUpdate(
  account: IGmailAccount,
  newHistoryId: string
): Promise<void> {
  if (!(await canProcessQuotationInbox(account))) {
    // Keep the stored cursor so the backlog is ingested if the feature is
    // re-enabled; advancing here would silently discard the mail.
    console.warn(
      `Skipping Gmail history update for ${account.emailAddress}: Quotations feature is disabled`
    );
    return;
  }

  const storedHistoryId = account.historyId;

  if (!storedHistoryId) {
    console.warn(`No stored historyId found for ${account.emailAddress}`);
    await GmailAccount.updateOne({ _id: account._id }, { historyId: newHistoryId });
    return;
  }

  if (BigInt(newHistoryId) <= BigInt(storedHistoryId)) {
    console.log("Received historyId is not newer, skipping");
    return;
  }

  const gmail = await getGmailClientForAccount(account);

  try {
    const messageIds = new Set<string>();
    let pageToken: string | undefined = undefined;

    do {
      const res: { data: gmail_v1.Schema$ListHistoryResponse } = await gmail.users.history.list({
        userId: "me",
        startHistoryId: storedHistoryId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
        pageToken,
      });

      for (const history of res.data.history ?? []) {
        for (const added of history.messagesAdded ?? []) {
          if (added.message?.id) {
            messageIds.add(added.message.id);
          }
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    let failedCount = 0;
    for (const messageId of messageIds) {
      try {
        await ingestInboxMessage(account, messageId);
      } catch (err) {
        failedCount++;
        console.error(`Failed to process message ${messageId}:`, err);
      }
    }

    // Pub/Sub has already been acked, so advancing the cursor past a failed
    // message would drop it permanently. Keep the old cursor instead: the next
    // notification (or the reconciliation job) retries from it, and ingestion
    // is idempotent so already-saved messages are skipped.
    if (failedCount > 0) {
      console.warn(
        `${failedCount} message(s) failed for ${account.emailAddress}; keeping historyId ${storedHistoryId} for retry`
      );
      return;
    }
  } catch (err: any) {
    if (err.code === 404) {
      console.warn("History ID too old, backfilling recent messages instead");
      const { failed } = await backfillInboxMessages(account, "7d");
      if (failed > 0) {
        // Leave the dead cursor in place: the next notification will 404 again
        // and re-run the (idempotent) backfill, retrying the failures.
        console.warn(
          `Backfill for ${account.emailAddress} had ${failed} failure(s); keeping historyId for retry`
        );
        return;
      }
    } else {
      throw err;
    }
  }

  await GmailAccount.updateOne({ _id: account._id }, { historyId: newHistoryId });
}

export async function getEmailById(
  account: IGmailAccount,
  messageId: string
): Promise<ParsedEmail> {
  const gmail = await getGmailClientForAccount(account);

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = res.data;
  const payload = await parseMessagePayload(gmail, message.id!, message.payload);

  return parseHeadersToEmail(message, payload);
}

/**
 * A missing or malformed Date header would fail the required Date cast on the
 * Email model and drop the message, so fall back to Gmail's internalDate
 * (delivery time in epoch ms) and finally to now.
 */
function resolveMessageDate(
  message: gmail_v1.Schema$Message,
  dateHeader: string
): string {
  if (dateHeader && !Number.isNaN(new Date(dateHeader).getTime())) {
    return dateHeader;
  }

  const internal = Number(message.internalDate);
  if (Number.isFinite(internal) && internal > 0) {
    return new Date(internal).toISOString();
  }

  return new Date().toISOString();
}

function parseHeadersToEmail(
  message: gmail_v1.Schema$Message,
  parsed: PayloadParseResult
): ParsedEmail {
  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    messageId: message.id!,
    threadId: message.threadId!,
    historyId: message.historyId!,
    rfcMessageId: getHeader("Message-ID") || null,
    references: getHeader("References") || null,
    inReplyTo: getHeader("In-Reply-To") || null,
    replyTo: getHeader("Reply-To") || null,
    from: getHeader("From"),
    to: getHeader("To"),
    cc: getHeader("Cc") || null,
    bcc: getHeader("Bcc") || null,
    subject: getHeader("Subject"),
    date: resolveMessageDate(message, getHeader("Date")),
    bodyText: parsed.bodyText,
    bodyHtml: parsed.bodyHtml,
    snippet: message.snippet ?? null,
    labels: message.labelIds ?? [],
    attachments: parsed.attachments,
  };
}

/**
 * Backfills a Gmail conversation into the local store so the thread view can
 * show messages we never ingested, including anything sent straight from Gmail.
 *
 * Deliberately does not kick off RFQ processing: the watcher owns that, and
 * running it here would create duplicate RFQs for messages already classified.
 */
export async function syncThread(
  account: IGmailAccount,
  threadId: string
): Promise<number> {
  const gmail = await getGmailClientForAccount(account);

  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  let created = 0;

  for (const message of res.data.messages ?? []) {
    if (!message.id) continue;

    const exists = await Email.exists({
      gmailAccountId: account._id,
      messageId: message.id,
    }).lean();
    if (exists) continue;

    try {
      const payload = await parseMessagePayload(gmail, message.id, message.payload);
      const parsed = parseHeadersToEmail(message, payload);
      const direction = isSelfSentEmail(account, parsed) ? "outbound" : "inbound";

      await Email.create({
        userId: account.userId,
        ...(account.organizationId ? { organizationId: account.organizationId } : {}),
        gmailAccountId: account._id,
        ...parsed,
        date: new Date(parsed.date),
        direction,
        status: "processed",
        ...(direction === "outbound" ? { sendStatus: "sent" } : {}),
      });
      created++;
    } catch (err) {
      console.error(`Failed to sync thread message ${message.id}:`, err);
    }
  }

  return created;
}

/**
 * Archiving in Gmail means dropping the INBOX label. The local rows are updated
 * to match so the inbox list, which filters on that label, reflects the change
 * without waiting for the next watcher pass.
 */
export async function archiveThread(
  account: IGmailAccount,
  threadId: string
): Promise<void> {
  const gmail = await getGmailClientForAccount(account);

  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: { removeLabelIds: ["INBOX"] },
  });

  await Email.updateMany(
    { gmailAccountId: account._id, threadId },
    { $pull: { labels: "INBOX" } }
  );
}

interface PayloadParseResult {
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: EmailAttachment[];
}

async function parseMessagePayload(
  gmail: gmail_v1.Gmail,
  messageId: string,
  payload: gmail_v1.Schema$MessagePart | undefined
): Promise<PayloadParseResult> {
  const textCandidates: string[] = [];
  const htmlCandidates: string[] = [];
  const attachments: EmailAttachment[] = [];

  if (!payload) {
    return { bodyText: null, bodyHtml: null, attachments };
  }

  async function readPartBody(
    part: gmail_v1.Schema$MessagePart
  ): Promise<string | null> {
    if (part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }

    if (!part.body?.attachmentId) return null;

    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: part.body.attachmentId,
    });

    return res.data.data
      ? Buffer.from(res.data.data, "base64url").toString("utf-8")
      : null;
  }

  async function walk(part: gmail_v1.Schema$MessagePart): Promise<void> {
    const mimeType = part.mimeType ?? "";

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType,
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
      return;
    }

    if (mimeType === "text/plain") {
      const body = await readPartBody(part);
      if (body) textCandidates.push(body);
    }

    if (mimeType === "text/html") {
      const body = await readPartBody(part);
      if (body) htmlCandidates.push(body);
    }

    if (part.parts) {
      for (const child of part.parts) {
        await walk(child);
      }
    }
  }

  await walk(payload);

  return {
    bodyText: chooseBestBody(textCandidates),
    bodyHtml: chooseBestBody(htmlCandidates),
    attachments,
  };
}

function chooseBestBody(candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) =>
    candidate.trim().length > best.trim().length ? candidate : best
  );
}

export async function getAttachment(
  account: IGmailAccount,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = await getGmailClientForAccount(account);

  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  return Buffer.from(res.data.data!, "base64url");
}

export async function saveEmail(
  account: IGmailAccount,
  parsed: ParsedEmail
): Promise<boolean> {
  try {
    await Email.create({
      userId: account.userId,
      ...(account.organizationId ? { organizationId: account.organizationId } : {}),
      gmailAccountId: account._id,
      ...parsed,
      date: new Date(parsed.date),
      status: "received",
    });
    return true;
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate — already saved, safe to ignore
      return false;
    }
    throw err;
  }
}

export async function updateEmailStatus(
  messageId: string,
  status: "processing" | "processed" | "failed",
  errorMessage?: string,
  gmailAccountId?: string
): Promise<void> {
  const update: Record<string, any> = { status };
  if (status === "processed") update.processedAt = new Date();
  if (status === "processing" || status === "processed") update.errorMessage = null;
  if (errorMessage) update.errorMessage = errorMessage;

  await Email.updateOne(
    gmailAccountId ? { messageId, gmailAccountId } : { messageId },
    { $set: update }
  );
}

const BACKFILL_PAGE_SIZE = 100;
// Bounds a single pass on very busy mailboxes; anything left over is picked up
// by the next pass since ingestion is idempotent.
const BACKFILL_MAX_MESSAGES = 1000;

export interface InboxBackfillResult {
  scanned: number;
  ingested: number;
  failed: number;
}

/**
 * Lists recent INBOX messages from Gmail and ingests any that are missing
 * locally. Serves as the recovery path when the history cursor has expired and
 * as the periodic reconciliation safety net (which also catches mail moved to
 * the inbox from Spam or a filter, invisible to the messageAdded watch).
 */
export async function backfillInboxMessages(
  account: IGmailAccount,
  newerThan: string
): Promise<InboxBackfillResult> {
  const gmail = await getGmailClientForAccount(account);

  const result: InboxBackfillResult = { scanned: 0, ingested: 0, failed: 0 };
  let pageToken: string | undefined = undefined;

  do {
    const res: { data: gmail_v1.Schema$ListMessagesResponse } =
      await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        q: `newer_than:${newerThan}`,
        maxResults: BACKFILL_PAGE_SIZE,
        pageToken,
      });

    for (const msg of res.data.messages ?? []) {
      if (!msg.id) continue;
      result.scanned++;

      try {
        if (await ingestInboxMessage(account, msg.id)) {
          result.ingested++;
        }
      } catch (err) {
        result.failed++;
        console.error(`Failed to backfill message ${msg.id}:`, err);
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && result.scanned < BACKFILL_MAX_MESSAGES);

  return result;
}
