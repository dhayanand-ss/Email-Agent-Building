/**
 * POST /api/gmail/send
 * Sends the approved reply via Gmail API and logs it to Supabase.
 * Body: { replyId: number, emailId: number, finalReply: string }
 * Returns: { success: true }
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sendGmailReply, fetchEmailMetadata } from "@/lib/gmail";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { replyId, emailId, finalReply } = await request.json();
  if (!replyId || !emailId || !finalReply?.trim()) {
    return NextResponse.json(
      { error: "replyId, emailId, and finalReply are required" },
      { status: 400 }
    );
  }

  // Load email reference and Gmail tokens in parallel
  const [{ data: emailRef, error: emailError }, { data: tokenRow, error: tokenError }] =
    await Promise.all([
      supabase
        .from("emails")
        .select("id, gmail_message_id, gmail_thread_id")
        .eq("id", emailId)
        .single(),
      supabase
        .from("gmail_tokens")
        .select("access_token, refresh_token, expiry_date")
        .eq("user_id", user.id)
        .single(),
    ]);

  if (emailError || !emailRef) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }
  if (tokenError || !tokenRow) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  const tokens = {
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.expiry_date,
  };

  const onTokenRefresh = (refreshed: { access_token?: string; refresh_token?: string; expiry_date?: number }) => {
    supabase
      .from("gmail_tokens")
      .update({
        ...(refreshed.access_token && { access_token: refreshed.access_token }),
        ...(refreshed.refresh_token && { refresh_token: refreshed.refresh_token }),
        ...(refreshed.expiry_date && { expiry_date: refreshed.expiry_date }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) console.error("Failed to persist refreshed token:", error.message);
      });
  };

  // Fetch sender and subject from Gmail (not stored in Supabase)
  let sender: string;
  let subject: string;
  try {
    const meta = await fetchEmailMetadata(tokens, emailRef.gmail_message_id, onTokenRefresh);
    sender = meta.sender;
    subject = meta.subject;
  } catch (err) {
    console.error("Failed to fetch email metadata:", err);
    return NextResponse.json({ error: "Failed to fetch email from Gmail" }, { status: 502 });
  }

  try {
    // Send via Gmail API
    await sendGmailReply(
      tokens,
      {
        to: sender,
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        body: finalReply,
        threadId: emailRef.gmail_thread_id,
        inReplyToMessageId: emailRef.gmail_message_id,
      },
      onTokenRefresh
    );

    const sentAt = new Date().toISOString();

    // Update reply record with the final sent text
    await supabase
      .from("replies")
      .update({ sent_reply: finalReply, sent_at: sentAt })
      .eq("id", replyId);

    // Mark email as sent
    await supabase
      .from("emails")
      .update({ status: "sent" })
      .eq("id", emailId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send error:", err);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
