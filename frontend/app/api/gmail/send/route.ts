/**
 * POST /api/gmail/send
 * Sends the approved reply via Gmail API and logs it to Supabase.
 * Body: { replyId: number, emailId: number, finalReply: string }
 * Returns: { success: true }
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sendGmailReply } from "@/lib/gmail";

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

  // Load the email
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .select("*")
    .eq("id", emailId)
    .single();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Load Gmail tokens
  const { data: tokenRow, error: tokenError } = await supabase
    .from("gmail_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", user.id)
    .single();

  if (tokenError || !tokenRow) {
    return NextResponse.json(
      { error: "Gmail not connected" },
      { status: 400 }
    );
  }

  try {
    // Send via Gmail API
    await sendGmailReply(
      {
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.expiry_date,
      },
      {
        to: email.sender,
        subject: email.subject?.startsWith("Re:")
          ? email.subject
          : `Re: ${email.subject ?? ""}`,
        body: finalReply,
        threadId: email.gmail_thread_id,
        inReplyToMessageId: email.gmail_message_id,
      },
      (refreshed) => {
        // Persist refreshed tokens back to Supabase (fire-and-forget)
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
      }
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
