/**
 * GET /api/auth/gmail
 * Redirects the authenticated user to the Google Gmail OAuth consent screen.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/gmail";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL)
    );
  }

  return NextResponse.redirect(getGmailAuthUrl());
}
