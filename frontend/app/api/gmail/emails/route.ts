/**
 * GET /api/gmail/emails
 * Fetches emails from Gmail API and syncs them into the Supabase emails table.
 * Returns the synced emails as JSON.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchInboxEmails } from "@/lib/gmail";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load stored Gmail tokens
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
    const emails = await fetchInboxEmails(
      {
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.expiry_date,
      },
      20,
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

    // Sync only reference data into Supabase (no email content stored)
    if (emails.length > 0) {
      const { error: upsertError } = await supabase.from("emails").upsert(
        emails.map((e) => ({
          gmail_thread_id: e.gmail_thread_id,
          gmail_message_id: e.gmail_message_id,
          received_at: e.received_at,
          status: "pending",
        })),
        { onConflict: "gmail_message_id", ignoreDuplicates: true }
      );

      if (upsertError) {
        console.error("Failed to sync email refs:", upsertError.message);
      }
    }

    return NextResponse.json({ count: emails.length });
  } catch (err) {
    console.error("Failed to fetch emails:", err);
    return NextResponse.json(
      { error: "Failed to fetch emails from Gmail" },
      { status: 500 }
    );
  }
}
