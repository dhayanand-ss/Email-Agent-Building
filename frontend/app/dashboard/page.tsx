import { createClient } from "@/lib/supabase/server";
import { ConnectGmailButton } from "@/components/connect-gmail-button";
import { RefreshInboxButton } from "@/components/refresh-inbox-button";
import { EmailList } from "@/components/email-list";
import { redirect } from "next/navigation";
import { fetchInboxEmails } from "@/lib/gmail";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;

  // Check if Gmail is connected
  const { data: tokenRow } = await supabase
    .from("gmail_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", user.id)
    .single();

  const isGmailConnected = !!tokenRow;

  // Fetch emails from Gmail and sync refs to Supabase
  let emails: Array<{
    id: number | undefined;
    sender: string;
    subject: string;
    received_at: string;
    status: string;
    gmail_message_id: string;
  }> = [];
  let gmailTokenExpired = false;

  if (isGmailConnected) {
    const gmailEmails = await fetchInboxEmails(
      {
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.expiry_date,
      },
      20,
      (refreshed) => {
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
    ).catch(async (err) => {
      console.error("Failed to fetch Gmail emails:", err);
      // If token is invalid/revoked, clear stale tokens so user can reconnect
      const errMsg = String(err?.message ?? err);
      if (errMsg.includes("invalid_grant") || errMsg.includes("Token has been expired or revoked")) {
        gmailTokenExpired = true;
        await supabase
          .from("gmail_tokens")
          .delete()
          .eq("user_id", user.id);
      }
      return [];
    });

    if (gmailEmails.length > 0) {
      // Sync only reference data to Supabase (fire-and-forget)
      supabase
        .from("emails")
        .upsert(
          gmailEmails.map((e) => ({
            gmail_thread_id: e.gmail_thread_id,
            gmail_message_id: e.gmail_message_id,
            received_at: e.received_at,
            status: "pending",
          })),
          { onConflict: "gmail_message_id", ignoreDuplicates: true }
        )
        .then(({ error }) => {
          if (error) console.error("Failed to sync email refs:", error.message);
        });

      // Look up Supabase IDs and statuses for these messages
      const messageIds = gmailEmails.map((e) => e.gmail_message_id);
      const { data: refs } = await supabase
        .from("emails")
        .select("id, gmail_message_id, status")
        .in("gmail_message_id", messageIds);

      emails = gmailEmails.map((e) => {
        const ref = refs?.find((r) => r.gmail_message_id === e.gmail_message_id);
        return {
          id: ref?.id,
          gmail_message_id: e.gmail_message_id,
          sender: e.sender,
          subject: e.subject,
          received_at: e.received_at,
          status: ref?.status ?? "pending",
        };
      });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Error banner */}
      {params.error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error === "gmail_auth_failed"
            ? "Gmail authorization failed. Please try again."
            : params.error === "gmail_token_store_failed"
            ? "Failed to save Gmail credentials. Please try again."
            : "Something went wrong. Please try again."}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Inbox</h2>
        {isGmailConnected && <RefreshInboxButton />}
      </div>

      {gmailTokenExpired && (
        <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          Your Gmail authorization has expired. Please reconnect your account below.
        </div>
      )}

      {!isGmailConnected || gmailTokenExpired ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <svg
              className="h-7 w-7 text-indigo-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </div>
          <h3 className="mb-2 text-base font-semibold text-gray-900">
            Connect your Gmail
          </h3>
          <p className="mb-6 text-sm text-gray-500">
            Authorize read &amp; send access so the agent can draft replies for
            you.
          </p>
          <ConnectGmailButton />
        </div>
      ) : (
        <EmailList emails={emails ?? []} />
      )}
    </div>
  );
}
