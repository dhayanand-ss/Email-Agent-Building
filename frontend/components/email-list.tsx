import Link from "next/link";

interface Email {
  id: number;
  sender: string;
  subject: string | null;
  received_at: string | null;
  status: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function senderName(raw: string): string {
  // "Name <email>" → "Name"
  const match = raw.match(/^"?([^"<]+?)"?\s*</);
  return match ? match[1].trim() : raw;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
};

export function EmailList({ emails }: { emails: Email[] }) {
  if (emails.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-gray-400">
        <p>No emails yet. Click &ldquo;Refresh Inbox&rdquo; to sync from Gmail.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <ul className="divide-y">
        {emails.map((email) => (
          <li key={email.id}>
            <Link
              href={`/dashboard/emails/${email.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              {/* Sender avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">
                {senderName(email.sender).charAt(0).toUpperCase()}
              </div>

              {/* Email info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {senderName(email.sender)}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatDate(email.received_at)}
                  </span>
                </div>
                <p className="truncate text-sm text-gray-600">
                  {email.subject ?? "(No subject)"}
                </p>
              </div>

              {/* Status badge */}
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  statusColors[email.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {email.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
