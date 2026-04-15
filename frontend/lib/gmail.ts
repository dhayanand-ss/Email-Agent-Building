/**
 * Gmail API helpers — Phase 3
 * Wraps googleapis OAuth2 client and message fetching.
 */

import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

// ── OAuth2 client ─────────────────────────────────────────────────────────────

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
}

/** Returns the Google consent-screen URL for Gmail OAuth. */
export function getGmailAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always return refresh_token
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  });
}

// ── Gmail API client ──────────────────────────────────────────────────────────

export interface StoredTokens {
  access_token: string;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

export function buildGmailClient(
  tokens: StoredTokens,
  onTokenRefresh?: (refreshed: Partial<StoredTokens>) => void
) {
  const auth = getOAuth2Client();
  auth.setCredentials(tokens);

  if (onTokenRefresh) {
    auth.on("tokens", (refreshed) => {
      onTokenRefresh({
        access_token: refreshed.access_token ?? undefined,
        refresh_token: refreshed.refresh_token ?? undefined,
        expiry_date: refreshed.expiry_date ?? undefined,
      });
    });
  }

  return google.gmail({ version: "v1", auth });
}

// ── Message parsing ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeBodyData(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function findPart(
  payload: gmail_v1.Schema$MessagePart,
  mimeType: string
): gmail_v1.Schema$MessagePart | undefined {
  if (payload.mimeType === mimeType && payload.body?.data) return payload;
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPart(part, mimeType);
      if (found) return found;
    }
  }
  return undefined;
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Prefer text/plain
  const plainPart = findPart(payload, "text/plain");
  if (plainPart?.body?.data) {
    return decodeBodyData(plainPart.body.data);
  }

  // Fall back to text/html, stripped to plain text
  const htmlPart = findPart(payload, "text/html");
  if (htmlPart?.body?.data) {
    return stripHtml(decodeBodyData(htmlPart.body.data));
  }

  // Last resort: inline body (could be either)
  if (payload.body?.data) {
    const raw = decodeBodyData(payload.body.data);
    if (raw.includes("<html") || raw.includes("<div") || raw.includes("<table")) {
      return stripHtml(raw);
    }
    return raw;
  }

  return "";
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface EmailSummary {
  gmail_message_id: string;
  gmail_thread_id: string;
  sender: string;
  subject: string;
  body: string;
  snippet: string;
  received_at: string; // ISO string
}

// ── Single email fetchers ──────────────────────────────────────────────────────

/** Fetch full content (headers + body) for a single message. */
export async function fetchEmailContent(
  tokens: StoredTokens,
  messageId: string,
  onTokenRefresh?: (refreshed: Partial<StoredTokens>) => void
): Promise<EmailSummary> {
  const gmail = buildGmailClient(tokens, onTokenRefresh);

  const msgRes = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const data = msgRes.data;
  const headers = data.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? "";

  const dateStr = getHeader("Date");
  let received_at: string;
  try {
    received_at = new Date(dateStr).toISOString();
  } catch {
    received_at = new Date().toISOString();
  }

  return {
    gmail_message_id: messageId,
    gmail_thread_id: data.threadId!,
    sender: getHeader("From"),
    subject: getHeader("Subject") || "(No subject)",
    body: extractBody(data.payload ?? undefined),
    snippet: data.snippet ?? "",
    received_at,
  };
}

/** Fetch only headers (no body) for a single message — faster than full fetch. */
export async function fetchEmailMetadata(
  tokens: StoredTokens,
  messageId: string,
  onTokenRefresh?: (refreshed: Partial<StoredTokens>) => void
): Promise<{ sender: string; subject: string; received_at: string; gmail_thread_id: string }> {
  const gmail = buildGmailClient(tokens, onTokenRefresh);

  const msgRes = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Date"],
  });

  const data = msgRes.data;
  const headers = data.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? "";

  const dateStr = getHeader("Date");
  let received_at: string;
  try {
    received_at = new Date(dateStr).toISOString();
  } catch {
    received_at = new Date().toISOString();
  }

  return {
    gmail_thread_id: data.threadId!,
    sender: getHeader("From"),
    subject: getHeader("Subject") || "(No subject)",
    received_at,
  };
}

// ── Inbox fetcher ─────────────────────────────────────────────────────────────

export async function fetchInboxEmails(
  tokens: StoredTokens,
  maxResults = 20,
  onTokenRefresh?: (refreshed: Partial<StoredTokens>) => void
): Promise<EmailSummary[]> {
  const gmail = buildGmailClient(tokens, onTokenRefresh);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "in:inbox",
    maxResults,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map(async (msg): Promise<EmailSummary> => {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const data = msgRes.data;
      const headers = data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value ?? "";

      const dateStr = getHeader("Date");
      let received_at: string;
      try {
        received_at = new Date(dateStr).toISOString();
      } catch {
        received_at = new Date().toISOString();
      }

      return {
        gmail_message_id: msg.id!,
        gmail_thread_id: msg.threadId!,
        sender: getHeader("From"),
        subject: getHeader("Subject") || "(No subject)",
        body: extractBody(data.payload ?? undefined),
        snippet: data.snippet ?? "",
        received_at,
      };
    })
  );

  return emails;
}

// ── Send email ────────────────────────────────────────────────────────────────

export async function sendGmailReply(
  tokens: StoredTokens,
  options: {
    to: string;
    subject: string;
    body: string;
    threadId: string;
    inReplyToMessageId: string;
  },
  onTokenRefresh?: (refreshed: Partial<StoredTokens>) => void
): Promise<void> {
  const gmail = buildGmailClient(tokens, onTokenRefresh);

  const rawMessage = [
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    `In-Reply-To: <${options.inReplyToMessageId}>`,
    `References: <${options.inReplyToMessageId}>`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    options.body,
  ].join("\r\n");

  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      threadId: options.threadId,
    },
  });
}
