/**
 * POST /api/ai/draft
 * Generates an AI reply draft for an email using RAG over course knowledge base.
 * Body: { emailId: string }
 * Returns: { replyId: number, draft: string }
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

  // Load the email
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .select("*")
    .eq("id", emailId)
    .single();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
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
      model: "gemini-1.5-flash",
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
