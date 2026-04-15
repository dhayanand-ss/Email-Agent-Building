"use client";

import { Button } from "@/components/ui/button";

export function ConnectGmailButton() {
  return (
    <a href="/api/auth/gmail">
      <Button className="gap-2">
        {/* Gmail envelope icon */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
        Connect Gmail
      </Button>
    </a>
  );
}
