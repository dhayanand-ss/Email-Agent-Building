/**
 * POST /api/ai/draft
 * Generates an AI reply draft for an email using RAG over course knowledge base.
 * Body: { emailId: string }
 * Returns: { replyId: number, draft: string }
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchEmailContent } from "@/lib/gmail";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { emailId } = await request.json();
  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }

  // Load the email reference and Gmail tokens in parallel
  const [{ data: emailRef, error: emailError }, { data: tokenRow, error: tokenError }] =
    await Promise.all([
      supabase
        .from("emails")
        .select("id, gmail_message_id")
        .eq("id", emailId)
        .single(),
      supabase
        .from("gmail_tokens")
        .select("access_token, refresh_token, expiry_date")
        .eq("user_id", user.id)
        .single(),
    ]);

  if (emailError || !emailRef) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }
  if (tokenError || !tokenRow) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  // Fetch email content from Gmail
  let email: { sender: string; subject: string; body: string };
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
    email = { sender: fetched.sender, subject: fetched.subject, body: fetched.body };
  } catch (err) {
    console.error("Failed to fetch email content:", err);
    return NextResponse.json({ error: "Failed to fetch email from Gmail" }, { status: 502 });
  }

  try {
    // Generate embedding for the email body to find relevant courses
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const queryText = `${email.subject ?? ""}\n${email.body ?? ""}`.trim();
    const embeddingResult = await embeddingModel.embedContent({
      content: { parts: [{ text: queryText }], role: "user" },
      outputDimensionality: 768,
    } as Parameters<typeof embeddingModel.embedContent>[0]);
    const queryEmbedding = embeddingResult.embedding.values;

    // RAG: retrieve top 5 relevant courses
    const { data: courses, error: ragError } = await supabase.rpc(
      "match_courses",
      {
        query_embedding: queryEmbedding,
        match_count: 5,
      }
    );

    if (ragError) {
      console.error("RAG error:", ragError.message);
    }

    const courseContext =
      courses && courses.length > 0
        ? courses
            .map(
              (c: { course_name: string; content: string }) =>
                `---\n${c.content}`
            )
            .join("\n\n")
        : "No specific course information found.";

    // Build the prompt
    const prompt = `You are a helpful customer support assistant for Vizuara, an online education platform.

A customer has sent the following email:

From: ${email.sender}
Subject: ${email.subject ?? "(No subject)"}

${email.body ?? "(No body)"}

---

Here are the most relevant courses from our catalog that may help answer this inquiry:

${courseContext}

---

Write a professional, helpful, and concise reply email to this customer.
- Address their question or concern directly.
- Reference relevant courses from the catalog if applicable (include course names and links).
- Keep the tone friendly and professional.
- Do NOT include a subject line — just the body of the reply.
- Sign off as "The Vizuara Team".`;

    const generationModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });
    const result = await generationModel.generateContent(prompt);
    const draft = result.response.text().trim();

    // Check if a reply draft already exists for this email
    const { data: existingReply } = await supabase
      .from("replies")
      .select("id")
      .eq("email_id", emailId)
      .is("sent_at", null)
      .single();

    let replyId: number;

    if (existingReply) {
      // Update existing draft
      const { data: updated, error: updateError } = await supabase
        .from("replies")
        .update({ ai_draft: draft })
        .eq("id", existingReply.id)
        .select("id")
        .single();

      if (updateError || !updated) {
        return NextResponse.json(
          { error: "Failed to save draft" },
          { status: 500 }
        );
      }
      replyId = updated.id;
    } else {
      // Create new reply record
      const { data: newReply, error: insertError } = await supabase
        .from("replies")
        .insert({ email_id: emailId, ai_draft: draft })
        .select("id")
        .single();

      if (insertError || !newReply) {
        return NextResponse.json(
          { error: "Failed to save draft" },
          { status: 500 }
        );
      }
      replyId = newReply.id;
    }

    return NextResponse.json({ replyId, draft });
  } catch (err) {
    console.error("AI draft error:", err);
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    );
  }
}
