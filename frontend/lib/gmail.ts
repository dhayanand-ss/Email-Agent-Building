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

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Inline body data (non-multipart)
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    // Prefer plain text part
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
    // Recurse into sub-parts (e.g. multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
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
