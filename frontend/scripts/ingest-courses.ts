/**
 * Phase 2 — Knowledge Base Ingestion
 * Reads vizuara_courses_dataset.csv, generates Gemini embeddings,
 * and upserts into Supabase course_embeddings table.
 *
 * Run from the frontend/ directory:
 *   npm run ingest
 */

import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY!;
const CSV_PATH = path.resolve(process.cwd(), "../vizuara_courses_dataset.csv");

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

// ── Types ─────────────────────────────────────────────────────────────────────

interface CourseRow {
  "Course name": string;
  "Course link": string;
  "Course description": string;
  "Price": string;
  "Starting date": string;
  "Whether it is live or self-paced": string;
  "Number of lessons": string;
  "Total duration in number of hours": string;
  "Who the course is meant for": string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContentChunk(row: CourseRow): string {
  return [
    `Course: ${row["Course name"]}`,
    `Description: ${row["Course description"]}`,
    `Format: ${row["Whether it is live or self-paced"]}`,
    `Price: ₹${row["Price"]}`,
    `Start Date: ${row["Starting date"]}`,
    `Lessons: ${row["Number of lessons"]}`,
    `Duration: ${row["Total duration in number of hours"]} hours`,
    `Target Audience: ${row["Who the course is meant for"]}`,
    `Link: ${row["Course link"]}`,
  ].join("\n");
}

async function getEmbedding(text: string, retries = 5): Promise<number[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await embeddingModel.embedContent({
        content: { parts: [{ text }], role: "user" },
        outputDimensionality: 768,
      } as Parameters<typeof embeddingModel.embedContent>[0]);
      return result.embedding.values;
    } catch (err) {
      const isRateLimit =
        err instanceof Error && err.message.includes("429");
      if (isRateLimit && attempt < retries) {
        const delay = attempt * 10000; // 10s, 20s, 30s, 40s
        process.stdout.write(`(rate limit, retrying in ${delay / 1000}s) `);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📂 Reading CSV from:", CSV_PATH);
  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");

  const rows: CourseRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`📋 Found ${rows.length} courses. Starting ingestion...\n`);

  // Clear existing embeddings to avoid duplicates on re-run
  const { error: deleteError } = await supabase
    .from("course_embeddings")
    .delete()
    .neq("id", 0);

  if (deleteError) {
    console.error("❌ Failed to clear existing embeddings:", deleteError.message);
    process.exit(1);
  }

  let successCount = 0;

  for (const row of rows) {
    const courseName = row["Course name"];
    const content = buildContentChunk(row);

    try {
      process.stdout.write(`  Embedding "${courseName}"... `);
      const embedding = await getEmbedding(content);

      const { error } = await supabase.from("course_embeddings").insert({
        course_name: courseName,
        content,
        embedding,
      });

      if (error) {
        console.log("❌ DB error:", error.message);
      } else {
        console.log("✅");
        successCount++;
      }
    } catch (err) {
      console.log("❌ Embedding error:", (err as Error).message);
    }

    // Delay to avoid hitting Gemini rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n✅ Ingestion complete: ${successCount}/${rows.length} courses stored.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
