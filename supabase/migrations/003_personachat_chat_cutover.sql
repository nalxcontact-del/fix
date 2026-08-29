-- v82 chat cutover schema. Run after 002_personachat_postgres_core.sql.
ALTER TABLE IF EXISTS public.memories ADD COLUMN IF NOT EXISTS conversation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_conversation_status
  ON public.memories(user_id, character_id, status, conversation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.response_alternatives (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  UNIQUE(user_id, message_id, label),
  FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES public.messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_response_alternatives_message
  ON public.response_alternatives(user_id, message_id, created_at ASC);
