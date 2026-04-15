"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RefreshInboxButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/gmail/emails");
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Failed to refresh inbox.");
      } else {
        setMessage(`Synced ${data.count} email(s).`);
        router.refresh();
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className="text-sm text-gray-500">{message}</span>
      )}
      <Button
        variant="outline"
        onClick={handleRefresh}
        disabled={loading}
        className="gap-2"
      >
        <svg
          className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {loading ? "Refreshing…" : "Refresh Inbox"}
      </Button>
    </div>
  );
}
