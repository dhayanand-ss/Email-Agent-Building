import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReplySection from "@/components/reply-section";
import { fetchEmailContent } from "@/lib/gmail";

export default async function EmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const [{ data: emailRef }, { data: existingReply }, { data: tokenRow }] =
    await Promise.all([
      supabase
        .from("emails")
        .select("id, gmail_message_id, gmail_thread_id, status, received_at")
        .eq("id", id)
        .single(),
      supabase
        .from("replies")
        .select("id, ai_draft, sent_reply, sent_at")
        .eq("email_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("gmail_tokens")
        .select("access_token, refresh_token, expiry_date")
        .eq("user_id", user.id)
        .single(),
    ]);

  if (!emailRef || !tokenRow) notFound();

  // Fetch email content from Gmail (not stored in Supabase)
  let emailContent: { sender: string; subject: string; body: string } = {
    sender: "",
    subject: "(No subject)",
    body: "",
  };
  try {
    const fetched = await fetchEmailContent(
      {
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.expiry_date,
      },
      emailRef.gmail_message_id,
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
    );
    emailContent = {
      sender: fetched.sender,
      subject: fetched.subject,
      body: fetched.body,
    };
  } catch (err) {
    console.error("Failed to fetch email content from Gmail:", err);
  }

  const email = {
    id: emailRef.id,
    gmail_message_id: emailRef.gmail_message_id,
    gmail_thread_id: emailRef.gmail_thread_id,
    status: emailRef.status,
    received_at: emailRef.received_at,
    ...emailContent,
  };

  const receivedAt = email.received_at
    ? new Date(email.received_at).toLocaleString()
    : "Unknown";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Inbox
      </Link>

      {/* Email card */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {email.subject ?? "(No subject)"}
        </h2>

        <dl className="mb-6 space-y-1 text-sm text-gray-600">
          <div className="flex gap-2">
            <dt className="font-medium text-gray-700 w-14 shrink-0">From</dt>
            <dd>{email.sender}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-700 w-14 shrink-0">Date</dt>
            <dd>{receivedAt}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-gray-700 w-14 shrink-0">Status</dt>
            <dd className="capitalize">{email.status}</dd>
          </div>
        </dl>

        <div className="border-t pt-4">
          <div
            className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all"
            dangerouslySetInnerHTML={{
              __html: (email.body || "(No body)").replace(
                /(?:<?\[?\[?)(https?:\/\/[^\s\]>]+)(?:\]?\]?>?)/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
              ),
            }}
          />
        </div>
      </div>

      {/* Reply section — Phases 4, 5, 6 */}
      <ReplySection email={email} existingReply={existingReply} />
    </div>
  );
}
