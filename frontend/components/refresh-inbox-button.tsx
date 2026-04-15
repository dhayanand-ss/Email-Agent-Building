"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RefreshInboxButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshed, setRefreshed] = useState(false);

  function handleRefresh() {
    setRefreshed(false);
    startTransition(() => {
      router.refresh();
      setRefreshed(true);
    });
  }

  return (
    <div className="flex items-center gap-3">
      {refreshed && !isPending && (
        <span className="text-sm text-gray-500">Refreshed.</span>
      )}
      <Button
        variant="outline"
        onClick={handleRefresh}
        disabled={isPending}
        className="gap-2"
      >
        <svg
          className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
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
        {isPending ? "Refreshing…" : "Refresh Inbox"}
      </Button>
    </div>
  );
}
