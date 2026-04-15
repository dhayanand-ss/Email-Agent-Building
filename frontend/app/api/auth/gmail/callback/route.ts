/**
 * GET /api/auth/gmail/callback
 * Handles the Google OAuth callback: exchanges code for tokens and stores
 * them in the gmail_tokens table linked to the current Supabase user.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/gmail";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${origin}/dashboard?error=gmail_auth_failed`
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    const { error: dbError } = await supabase.from("gmail_tokens").upsert(
      {
        user_id: user.id,
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token ?? null,
        expiry_date: tokens.expiry_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (dbError) {
      console.error("Failed to store Gmail tokens:", dbError.message);
      return NextResponse.redirect(
        `${origin}/dashboard?error=gmail_token_store_failed`
      );
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(
      `${origin}/dashboard?error=gmail_auth_failed`
    );
  }
}
