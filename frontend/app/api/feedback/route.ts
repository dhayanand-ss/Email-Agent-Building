/**
 * POST /api/feedback
 * Saves star rating and optional text feedback for a sent reply.
 * Body: { replyId: number, starRating: number, textFeedback?: string }
 * Returns: { success: true }
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { replyId, starRating, textFeedback } = await request.json();

  if (!replyId || !starRating) {
    return NextResponse.json(
      { error: "replyId and starRating are required" },
      { status: 400 }
    );
  }

  if (starRating < 1 || starRating > 5) {
    return NextResponse.json(
      { error: "starRating must be between 1 and 5" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("feedback").insert({
    reply_id: replyId,
    star_rating: starRating,
    text_feedback: textFeedback?.trim() || null,
  });

  if (error) {
    console.error("Feedback insert error:", error.message);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
