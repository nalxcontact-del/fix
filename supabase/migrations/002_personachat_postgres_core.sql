-- Generated from PersonaChat SQLite schema for the v80 cutover.
-- JSON blobs intentionally remain TEXT at the first cutover; they can be
-- normalized later without changing application semantics.

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "username" TEXT UNIQUE,
  "password_hash" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL,
  "avatar" TEXT,
  "gender" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "blocked_at" BIGINT,
  "blocked_reason" TEXT NOT NULL DEFAULT '',
  "google_sub" TEXT
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "token_hash" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "expires_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "app_data" (
  "user_id" TEXT PRIMARY KEY,
  "conversations_json" TEXT NOT NULL DEFAULT '[]',
  "memories_json" TEXT NOT NULL DEFAULT '[]',
  "relationships_json" TEXT NOT NULL DEFAULT '{}',
  "updated_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "bot_likes" (
  "user_id" TEXT NOT NULL,
  "bot_id" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL
,
  PRIMARY KEY (user_id, bot_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "profile_likes" (
  "user_id" TEXT NOT NULL,
  "profile_user_id" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL
,
  PRIMARY KEY (user_id, profile_user_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(profile_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "follows" (
  "follower_id" TEXT NOT NULL,
  "following_id" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL
,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "user_bots" (
  "id" TEXT PRIMARY KEY,
  "owner_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bot_type" TEXT NOT NULL DEFAULT 'original',
  "description" TEXT NOT NULL DEFAULT '',
  "image" TEXT NOT NULL DEFAULT '',
  "greeting" TEXT NOT NULL DEFAULT '',
  "personality" TEXT NOT NULL DEFAULT '',
  "scenario" TEXT NOT NULL DEFAULT '',
  "speech_style" TEXT NOT NULL DEFAULT '',
  "lore" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "real_person_safety" BIGINT NOT NULL DEFAULT 0,
  "example_messages_json" TEXT NOT NULL DEFAULT '[]',
  "tags_json" TEXT NOT NULL DEFAULT '[]',
  "created_at" BIGINT NOT NULL
,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "response_preference_profiles" (
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "positive_count" BIGINT NOT NULL DEFAULT 0,
  "negative_count" BIGINT NOT NULL DEFAULT 0,
  "updated_at" BIGINT NOT NULL
,
  PRIMARY KEY(user_id, character_id, tag),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "response_feedback" (
  "user_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL
,
  PRIMARY KEY (user_id, message_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "generation_events" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "model" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'gemini',
  "plan" TEXT NOT NULL DEFAULT 'free',
  "prompt_tokens" BIGINT NOT NULL DEFAULT 0,
  "completion_tokens" BIGINT NOT NULL DEFAULT 0,
  "total_tokens" BIGINT NOT NULL DEFAULT 0,
  "estimated_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "generation_reservations" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL,
  "expires_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "quality_events" (
  "id" TEXT PRIMARY KEY,
  "issue_type" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "created_at" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_feedback" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "reports" (
  "id" TEXT PRIMARY KEY,
  "reporter_id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "message_id" TEXT,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "evidence_json" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "resolution_note" TEXT NOT NULL DEFAULT '',
  "resolved_by" TEXT,
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT NOT NULL,
  "resolved_at" BIGINT
,
  FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" TEXT PRIMARY KEY,
  "admin_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "details_json" TEXT NOT NULL DEFAULT '{}',
  "created_at" BIGINT NOT NULL
,
  FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "capacity_leases" (
  "user_id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL CHECK(status IN ('waiting', 'active')),
  "joined_at" BIGINT NOT NULL,
  "granted_at" BIGINT,
  "last_seen_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "system_migrations" (
  "name" TEXT PRIMARY KEY,
  "applied_at" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "osint_facts" (
  "id" TEXT PRIMARY KEY,
  "subject_id" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL CHECK(subject_type IN ('real_public_figure')),
  "category" TEXT NOT NULL,
  "fact_text" TEXT NOT NULL,
  "confidence" TEXT NOT NULL CHECK(confidence IN ('high','medium','low')),
  "source_count" BIGINT NOT NULL DEFAULT 0,
  "source_last_verified_at" BIGINT,
  "expires_at" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','blocked','superseded')),
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "osint_sources" (
  "id" TEXT PRIMARY KEY,
  "fact_id" TEXT NOT NULL,
  "source_domain" TEXT NOT NULL,
  "source_kind" TEXT NOT NULL,
  "reliability" TEXT NOT NULL CHECK(reliability IN ('high','medium','low'))
,
  checked_at BIGINT NOT NULL,
  FOREIGN KEY(fact_id) REFERENCES osint_facts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "osint_refresh_log" (
  "subject_id" TEXT PRIMARY KEY,
  "last_attempt_at" BIGINT NOT NULL DEFAULT 0,
  "last_success_at" BIGINT,
  "credits_used" BIGINT NOT NULL DEFAULT 0,
  "last_error" TEXT
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Nova conversa',
  "summary" TEXT,
  "summary_updated_at" BIGINT,
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT NOT NULL
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT PRIMARY KEY,
  "conversation_id" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL,
  "edited" BIGINT NOT NULL DEFAULT 0
,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "memories" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "text" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'automatic',
  "category" TEXT,
  "importance" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "supersedes_id" TEXT,
  "message_id" TEXT,
  "created_at" BIGINT NOT NULL,
  "updated_at" BIGINT
,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "relationships" (
  "user_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "familiarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trust" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "warmth" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "respect" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tension" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interactions" BIGINT NOT NULL DEFAULT 0,
  "updated_at" BIGINT NOT NULL,
  "mood" TEXT NOT NULL DEFAULT 'calm',
  "mood_intensity" DOUBLE PRECISION NOT NULL DEFAULT 0
,
  PRIMARY KEY(user_id, character_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "conversation_relationships" (
  "user_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "familiarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trust" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "warmth" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "respect" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tension" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interactions" BIGINT NOT NULL DEFAULT 0,
  "updated_at" BIGINT NOT NULL,
  "mood" TEXT NOT NULL DEFAULT 'calm',
  "mood_intensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "chemistry" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "approach_stage" TEXT NOT NULL DEFAULT 'stranger'
,
  PRIMARY KEY(user_id, conversation_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes ported from the SQLite runtime schema.
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_unique" ON "users" (google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_response_preferences_user_character" ON "response_preference_profiles" (user_id, character_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS "idx_generation_reservations_user_expiry" ON "generation_reservations" (user_id, expires_at);
CREATE INDEX IF NOT EXISTS "idx_quality_events_created" ON "quality_events" (created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_product_feedback_created" ON "product_feedback" (created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_reports_status_created" ON "reports" (status, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_reports_target" ON "reports" (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_admin_audit_created" ON "admin_audit_log" (created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_capacity_status_queue" ON "capacity_leases" (status, joined_at);
CREATE INDEX IF NOT EXISTS "idx_osint_facts_subject_status" ON "osint_facts" (subject_id, status, expires_at);
CREATE INDEX IF NOT EXISTS "idx_osint_sources_fact" ON "osint_sources" (fact_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS "idx_osint_refresh_log_attempt" ON "osint_refresh_log" (last_attempt_at);
CREATE INDEX IF NOT EXISTS "idx_conversations_user_updated" ON "conversations" (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS "idx_conversations_user_character_updated" ON "conversations" (user_id, character_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created" ON "messages" (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS "idx_memories_user_character_status" ON "memories" (user_id, character_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS "idx_memories_conversation_status" ON "memories" (user_id, character_id, status, conversation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS "idx_quality_events_created_issue" ON "quality_events" (created_at DESC, issue_type);
CREATE INDEX IF NOT EXISTS "idx_conversations_user_updated" ON "conversations" (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS "idx_conversations_character" ON "conversations" (user_id, character_id);
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created" ON "messages" (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS "idx_memories_user_character" ON "memories" (user_id, character_id, status);
CREATE INDEX IF NOT EXISTS "idx_relationships_user" ON "relationships" (user_id);
CREATE INDEX IF NOT EXISTS "idx_conversation_relationships_user_character" ON "conversation_relationships" (user_id, character_id);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_username" ON "users" (username) WHERE username IS NOT NULL; CREATE INDEX IF NOT EXISTS idx_generation_events_user_provider_created ON generation_events(user_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_generation_events_provider_created" ON "generation_events" (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_generation_events_user_created" ON "generation_events" (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_generation_events_kind_created" ON "generation_events" (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_generation_events_character_created" ON "generation_events" (character_id, created_at DESC);


CREATE TABLE IF NOT EXISTS "response_alternatives" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "selected" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" BIGINT NOT NULL,
  UNIQUE(user_id, message_id, label),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_response_alternatives_message" ON "response_alternatives" (user_id, message_id, created_at ASC);
