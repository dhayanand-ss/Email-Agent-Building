import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReplySection from "@/components/reply-section";

export default async function EmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: email }, { data: existingReply }] = await Promise.all([
    supabase.from("emails").select("*").eq("id", id).single(),
    supabase
      .from("replies")
      .select("id, ai_draft, sent_reply, sent_at")
      .eq("email_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!email) notFound();

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
          <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
            {email.body || "(No body)"}
          </p>
        </div>
      </div>

      {/* Reply section — Phases 4, 5, 6 */}
      <ReplySection email={email} existingReply={existingReply} />
    </div>
  );
}
