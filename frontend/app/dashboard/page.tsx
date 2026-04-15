import { createClient } from "@/lib/supabase/server";
import { ConnectGmailButton } from "@/components/connect-gmail-button";
import { RefreshInboxButton } from "@/components/refresh-inbox-button";
import { EmailList } from "@/components/email-list";
import { redirect } from "next/navigation";

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
    .select("id")
    .eq("user_id", user.id)
    .single();

  const isGmailConnected = !!tokenRow;

  // Fetch cached emails from Supabase
  const { data: emails } = isGmailConnected
    ? await supabase
        .from("emails")
        .select("id, sender, subject, received_at, status")
        .order("received_at", { ascending: false })
        .limit(50)
    : { data: [] };

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

      {!isGmailConnected ? (
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
