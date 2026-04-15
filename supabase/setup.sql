-- ============================================================
-- Gmail Reply Agent — Supabase Setup
-- Run this in the Supabase SQL Editor (Project: dhayanand-ss)
-- ============================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. course_embeddings — knowledge base for RAG
create table if not exists course_embeddings (
  id          bigint primary key generated always as identity,
  course_name text    not null,
  content     text    not null,
  embedding   vector(768),          -- gemini-embedding-001 with outputDimensionality=768
  created_at  timestamptz default now()
);

create index if not exists course_embeddings_embedding_idx
  on course_embeddings using hnsw (embedding vector_cosine_ops);

-- 3. emails — inbox snapshot
create table if not exists emails (
  id                bigint primary key generated always as identity,
  gmail_thread_id   text not null,
  gmail_message_id  text not null unique,
  sender            text not null,
  subject           text,
  body              text,
  received_at       timestamptz,
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'sent')),
  created_at        timestamptz default now()
);

-- 4. replies — AI draft + final sent reply
create table if not exists replies (
  id          bigint primary key generated always as identity,
  email_id    bigint not null references emails(id) on delete cascade,
  ai_draft    text,
  sent_reply  text,
  sent_at     timestamptz,
  created_at  timestamptz default now()
);

-- 5. feedback — star rating + text per reply
create table if not exists feedback (
  id            bigint primary key generated always as identity,
  reply_id      bigint not null references replies(id) on delete cascade,
  star_rating   smallint check (star_rating between 1 and 5),
  text_feedback text,
  created_at    timestamptz default now()
);

-- 6. RLS — enable but allow authenticated users full access
alter table course_embeddings enable row level security;
alter table emails             enable row level security;
alter table replies            enable row level security;
alter table feedback           enable row level security;

create policy "Authenticated users can read course_embeddings"
  on course_embeddings for select using (auth.role() = 'authenticated');

create policy "Authenticated users can manage emails"
  on emails for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage replies"
  on replies for all using (auth.role() = 'authenticated');

create policy "Authenticated users can manage feedback"
  on feedback for all using (auth.role() = 'authenticated');

-- 7. match_courses — vector similarity search function for RAG
create or replace function match_courses(
  query_embedding vector(768),
  match_count     int default 5
)
returns table (
  id          bigint,
  course_name text,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    id,
    course_name,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from course_embeddings
  order by embedding <=> query_embedding
  limit match_count;
$$;
