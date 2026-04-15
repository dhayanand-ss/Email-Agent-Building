-- ============================================================
-- Gmail Reply Agent — Phase 3 Migration
-- Add gmail_tokens table for per-user Gmail OAuth tokens
-- Run this in the Supabase SQL Editor after setup.sql
-- ============================================================

create table if not exists gmail_tokens (
  id            bigint primary key generated always as identity,
  user_id       uuid not null references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expiry_date   bigint,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id)
);

alter table gmail_tokens enable row level security;

create policy "Users can manage their own Gmail tokens"
  on gmail_tokens for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
