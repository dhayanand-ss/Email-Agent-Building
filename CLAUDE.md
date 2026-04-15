# Gmail Reply Agent — Project Guide

## Project Overview

An AI-powered email reply agent for Gmail that fetches emails, drafts replies using AI (with RAG over a course knowledge base), allows the user to review/edit before sending, and logs everything to Supabase.

## Key Constraints

- **Never send an email automatically.** Every reply requires explicit user approval via a single button click.
- **Owner-only access.** Authentication is via Google Login (OAuth). Only the account owner can access the app.
- **Human-in-the-loop always.** The user can modify the AI-drafted reply before sending.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, deployed on Vercel |
| Backend (if needed) | Railway |
| Database | Supabase (Postgres + pgvector) |
| Auth | Supabase Auth with Google OAuth |
| Email | Gmail API |
| AI | OpenAI or Gemini API |
| Vector Search | Supabase pgvector (RAG) |

## Architecture

### Knowledge Base
- Source: `vizuara_courses_dataset.csv` (course name, link, description, price, start date, format, lessons, duration, target audience)
- Convert CSV rows to vector embeddings and store in Supabase pgvector table
- Use RAG to retrieve relevant course info when drafting replies

### Email Flow
1. Fetch emails from Gmail primary inbox via Gmail API
2. For each unread/pending email, retrieve relevant course info via RAG
3. Draft a reply using OpenAI/Gemini, grounded in the retrieved course context
4. Present the draft in the UI — user can edit it
5. User clicks "Send" to approve → email is sent via Gmail API
6. Both the AI draft and the final sent reply are stored in Supabase

### Feedback
- After each sent reply, the user can give a star rating (1–5) and optional text feedback
- Feedback is stored in Supabase linked to the reply record

## Database Schema (Supabase)

### `emails`
- `id`, `gmail_thread_id`, `gmail_message_id`
- `received_at`, `status` (pending | approved | sent)
- **No email content stored** — sender/subject/body are fetched from Gmail API on demand

### `replies`
- `id`, `email_id` (FK)
- `ai_draft` (original AI-generated reply)
- `sent_reply` (final reply after user edits)
- `sent_at`

### `feedback`
- `id`, `reply_id` (FK)
- `star_rating` (1–5)
- `text_feedback`
- `created_at`

### `course_embeddings`
- `id`, `course_name`, `content` (text chunk), `embedding` (vector)
- Populated by ingesting `vizuara_courses_dataset.csv`

## Implementation Phases

Follow a phased approach — plan each phase, confirm preferences, then execute:

1. **Phase 1 — Foundation**: Supabase setup, auth (Google login), basic Next.js scaffold
2. **Phase 2 — Knowledge Base**: Ingest CSV → generate embeddings → store in pgvector
3. **Phase 3 — Gmail Integration**: OAuth scopes, fetch inbox, display emails in UI
4. **Phase 4 — AI Reply Drafting**: RAG retrieval + OpenAI/Gemini prompt → draft reply
5. **Phase 5 — Review & Send UI**: Edit draft, approve button, send via Gmail API
6. **Phase 6 — Logging & Feedback**: Store ai_draft + sent_reply, star rating + text feedback UI
7. **Phase 7 — Deployment**: Deploy frontend to Vercel, backend services to Railway

## Development Rules

- Ask for user preferences before starting each phase
- Do not auto-send emails under any circumstance
- Keep API keys and secrets in environment variables (`.env.local`), never hardcode
- All sensitive credentials must be excluded from git (`.gitignore`)
- Backend API routes handle Gmail API calls and AI inference (never expose keys to the browser)
