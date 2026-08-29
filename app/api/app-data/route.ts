import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";
import type { Conversation, Memory, RelationshipState } from "@/lib/types";
import { enforceBodySize, readJsonBody, rateLimit, requireSameOrigin } from "@/lib/server/security";
import { isPostgresChatEnabled, loadPostgresChatData, upsertPostgresChatSnapshot } from "@/lib/server/postgres-chat";

function safeJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value !== "string") return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function loadNormalized(userId: string) {
  const db = getDb();
  const conversations = db.prepare(`SELECT id, character_id AS characterId, title, summary,
      summary_updated_at AS summaryUpdatedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM conversations WHERE user_id=? ORDER BY updated_at DESC`).all(userId) as any[];

  const messages = db.prepare(`SELECT id, conversation_id AS conversationId, sender, text,
      created_at AS createdAt, edited FROM messages
    WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=?)
    ORDER BY created_at ASC`).all(userId) as any[];

  const feedback = db.prepare(`SELECT message_id AS messageId, value FROM response_feedback WHERE user_id=?`).all(userId) as any[];
  const feedbackMap = new Map(feedback.map((row) => [String(row.messageId), row.value]));
  const messagesByConversation = new Map<string, any[]>();
  for (const message of messages) {
    const list = messagesByConversation.get(message.conversationId) ?? [];
    list.push({
      id: String(message.id),
      sender: message.sender === "user" ? "user" : "character",
      text: String(message.text),
      createdAt: Number(message.createdAt),
      ...(Number(message.edited) ? { edited: true } : {}),
      ...(feedbackMap.has(String(message.id)) ? { feedback: feedbackMap.get(String(message.id)) } : {}),
    });
    messagesByConversation.set(message.conversationId, list);
  }

  const normalizedConversations: Conversation[] = conversations.map((row) => ({
    id: String(row.id),
    characterId: String(row.characterId),
    title: String(row.title || "Nova conversa"),
    messages: messagesByConversation.get(String(row.id)) ?? [],
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    ...(row.summary ? { summary: String(row.summary) } : {}),
    ...(row.summaryUpdatedAt ? { summaryUpdatedAt: Number(row.summaryUpdatedAt) } : {}),
  }));

  const memories = (db.prepare(`SELECT id, character_id AS characterId, conversation_id AS conversationId, text, source, category,
      importance, status, supersedes_id AS supersedesId, message_id AS messageId,
      created_at AS createdAt, updated_at AS updatedAt
    FROM memories WHERE user_id=? ORDER BY created_at ASC`).all(userId) as any[]).map((row) => ({
      id: String(row.id),
      characterId: String(row.characterId),
      ...(row.conversationId ? { conversationId: String(row.conversationId) } : {}),
      text: String(row.text),
      source: row.source === "manual" ? "manual" : "automatic",
      ...(row.category ? { category: row.category } : {}),
      ...(row.importance != null ? { importance: Number(row.importance) } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.supersedesId ? { supersedesId: String(row.supersedesId) } : {}),
      ...(row.messageId ? { messageId: String(row.messageId) } : {}),
      createdAt: Number(row.createdAt),
      ...(row.updatedAt ? { updatedAt: Number(row.updatedAt) } : {}),
    })) as Memory[];

  const relationshipRows = db.prepare(`SELECT conversation_id AS conversationId, character_id AS characterId, familiarity, trust, warmth,
      respect, tension, interactions, updated_at AS updatedAt, mood, mood_intensity AS moodIntensity, chemistry, approach_stage AS approachStage
    FROM conversation_relationships WHERE user_id=?`).all(userId) as any[];
  const relationships: Record<string, RelationshipState> = {};
  for (const row of relationshipRows) {
    relationships[String(row.conversationId)] = {
      conversationId: String(row.conversationId),
      familiarity: Number(row.familiarity), trust: Number(row.trust), warmth: Number(row.warmth),
      respect: Number(row.respect), tension: Number(row.tension), interactions: Number(row.interactions),
      updatedAt: Number(row.updatedAt), mood: row.mood, moodIntensity: Number(row.moodIntensity), chemistry: Number(row.chemistry ?? 0), approachStage: row.approachStage === "chemistry" || row.approachStage === "warming" || row.approachStage === "familiar" ? row.approachStage : "stranger",
    };
  }
  // Legacy relationship rows were character-scoped. Do not expose them to new roleplays:
  // a new conversation must start with a clean relationship state.


  return { conversations: normalizedConversations, memories, relationships };
}

function hasNormalizedData(userId: string) {
  return Number((getDb().prepare("SELECT COUNT(*) AS count FROM conversations WHERE user_id=?").get(userId) as any)?.count ?? 0) > 0;
}

function migrateLegacyIfNeeded(userId: string) {
  if (hasNormalizedData(userId)) return;
  const db = getDb();
  const row = db.prepare("SELECT conversations_json, memories_json, relationships_json FROM app_data WHERE user_id=?").get(userId) as any;
  if (!row) return;
  const conversations = safeJson<Conversation[]>(row.conversations_json, []);
  const memories = safeJson<Memory[]>(row.memories_json, []);
  const relationships = safeJson<Record<string, RelationshipState>>(row.relationships_json, {});
  if (!conversations.length && !memories.length && !Object.keys(relationships).length) return;
  mergeNormalized(userId, conversations, memories, relationships, [], [], [], 0);
}

function validateSnapshot(conversations: Conversation[], memories: Memory[], relationships: Record<string, RelationshipState>, enforceLimits = true) {
  const serialized = JSON.stringify({ conversations, memories, relationships });
  if (enforceLimits) {
    const totalBytes = Buffer.byteLength(serialized, "utf8");
    if (totalBytes > 8 * 1024 * 1024) throw new Error("DATA_TOO_LARGE");
    if (conversations.length > 500 || memories.length > 2000) throw new Error("DATA_LIMIT");
  }
}

function serverSyncAt(userId: string) {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(value) AS value FROM (
    SELECT MAX(updated_at) AS value FROM conversations WHERE user_id=?
    UNION ALL SELECT MAX(updated_at) FROM memories WHERE user_id=?
    UNION ALL SELECT MAX(updated_at) FROM conversation_relationships WHERE user_id=?
    UNION ALL SELECT MAX(created_at) FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=?)
  )`).get(userId, userId, userId, userId) as any;
  return Number(row?.value ?? 0);
}

function mergeNormalized(
  userId: string,
  conversations: Conversation[],
  memories: Memory[],
  relationships: Record<string, RelationshipState>,
  deletedConversationIds: string[],
  deletedMemoryIds: string[],
  deletedMessageIds: string[],
  baseSyncAt: number,
) {
  validateSnapshot(conversations, memories, relationships);
  const db = getDb();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existingConversation = db.prepare("SELECT updated_at AS updatedAt FROM conversations WHERE id=? AND user_id=?");
    const upsertConversation = db.prepare(`INSERT INTO conversations
      (id,user_id,character_id,title,summary,summary_updated_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        character_id=excluded.character_id,title=excluded.title,summary=excluded.summary,
        summary_updated_at=excluded.summary_updated_at,updated_at=excluded.updated_at
      WHERE conversations.user_id=excluded.user_id AND excluded.updated_at >= conversations.updated_at`);
    const insertMessage = db.prepare(`INSERT INTO messages
      (id,conversation_id,sender,text,created_at,edited) VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET sender=excluded.sender,text=excluded.text,edited=excluded.edited
      WHERE messages.conversation_id=excluded.conversation_id AND excluded.created_at >= messages.created_at`);
    const bumpConversation = db.prepare("UPDATE conversations SET updated_at=MAX(updated_at,?) WHERE id=? AND user_id=?");

    for (const conversation of conversations) {
      const id = String(conversation.id || "");
      if (!id) continue;
      const updatedAt = Number(conversation.updatedAt) || now;
      upsertConversation.run(id, userId, String(conversation.characterId || ""), String(conversation.title || "New conversation"), conversation.summary ?? null, conversation.summaryUpdatedAt ?? null, Number(conversation.createdAt) || updatedAt, updatedAt);
      const row = existingConversation.get(id, userId) as any;
      if (!row) continue;
      for (const message of Array.isArray(conversation.messages) ? conversation.messages : []) {
        const messageId = String(message.id || "");
        if (!messageId) continue;
        const createdAt = Number(message.createdAt) || updatedAt;
        insertMessage.run(messageId, id, message.sender === "user" ? "user" : "character", String(message.text ?? ""), createdAt, message.edited ? 1 : 0);
        bumpConversation.run(createdAt, id, userId);
      }
    }

    const insertMemory = db.prepare(`INSERT INTO memories
      (id,user_id,character_id,conversation_id,text,source,category,importance,status,supersedes_id,message_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        character_id=excluded.character_id,conversation_id=excluded.conversation_id,text=excluded.text,
        source=excluded.source,category=excluded.category,importance=excluded.importance,status=excluded.status,
        supersedes_id=excluded.supersedes_id,message_id=excluded.message_id,updated_at=excluded.updated_at
      WHERE memories.user_id=excluded.user_id AND COALESCE(excluded.updated_at,excluded.created_at) >= COALESCE(memories.updated_at,memories.created_at)`);
    for (const memory of memories) {
      const id = String(memory.id || "");
      if (!id) continue;
      const createdAt = Number(memory.createdAt) || now;
      const updatedAt = Number(memory.updatedAt) || createdAt;
      insertMemory.run(id, userId, String(memory.characterId || ""), memory.conversationId ?? null, String(memory.text ?? ""), memory.source === "manual" ? "manual" : "automatic", memory.category ?? null, memory.importance ?? null, memory.status ?? "active", memory.supersedesId ?? null, memory.messageId ?? null, createdAt, updatedAt);
    }

    const insertRelationship = db.prepare(`INSERT INTO conversation_relationships
      (user_id,conversation_id,character_id,familiarity,trust,warmth,respect,tension,interactions,updated_at,mood,mood_intensity,chemistry,approach_stage)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,conversation_id) DO UPDATE SET
        character_id=excluded.character_id,familiarity=excluded.familiarity,trust=excluded.trust,warmth=excluded.warmth,
        respect=excluded.respect,tension=excluded.tension,interactions=excluded.interactions,updated_at=excluded.updated_at,
        mood=excluded.mood,mood_intensity=excluded.mood_intensity,chemistry=excluded.chemistry,approach_stage=excluded.approach_stage
      WHERE excluded.updated_at >= conversation_relationships.updated_at`);
    for (const [conversationId, relationship] of Object.entries(relationships)) {
      const conversation = conversations.find((item) => item.id === conversationId);
      if (!conversation) continue;
      insertRelationship.run(userId, conversationId, conversation.characterId, relationship.familiarity ?? 0, relationship.trust ?? 0, relationship.warmth ?? 0, relationship.respect ?? 0, relationship.tension ?? 0, relationship.interactions ?? 0, Number(relationship.updatedAt) || now, relationship.mood ?? "calm", relationship.moodIntensity ?? 35, relationship.chemistry ?? 0, relationship.approachStage ?? "stranger");
    }

    // Deletes are explicit and conditional. A stale device cannot delete a record
    // that was modified on another device after that device's last sync.
    const deleteConversation = db.prepare("DELETE FROM conversations WHERE id=? AND user_id=? AND updated_at<=?");
    const deleteMemory = db.prepare("DELETE FROM memories WHERE id=? AND user_id=? AND COALESCE(updated_at,created_at)<=?");
    const deleteMessage = db.prepare(`DELETE FROM messages WHERE id=? AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?) AND created_at<=?`);
    for (const id of deletedConversationIds.slice(0, 500)) deleteConversation.run(String(id), userId, Math.max(0, baseSyncAt));
    for (const id of deletedMemoryIds.slice(0, 2000)) deleteMemory.run(String(id), userId, Math.max(0, baseSyncAt));
    for (const id of deletedMessageIds.slice(0, 5000)) deleteMessage.run(String(id), userId, Math.max(0, baseSyncAt));

    const snapshot = loadNormalized(userId);
    db.prepare(`INSERT INTO app_data (user_id,conversations_json,memories_json,relationships_json,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET conversations_json=excluded.conversations_json,
      memories_json=excluded.memories_json,relationships_json=excluded.relationships_json,updated_at=excluded.updated_at`).run(
      userId, JSON.stringify(snapshot.conversations), JSON.stringify(snapshot.memories), JSON.stringify(snapshot.relationships), Date.now());
    db.exec("COMMIT");
    return { snapshot, syncAt: serverSyncAt(userId) };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function GET(req: Request) {
  const limit = rateLimit(req, "app-data-read", 60);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas requisições." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 },
      );
    }

    if (isPostgresChatEnabled()) {
      const sqliteRelationships = loadNormalized(user.id).relationships;
      const snapshot = await loadPostgresChatData(user.id, sqliteRelationships);
      return NextResponse.json({ ...snapshot, syncAt: Date.now() }, { headers: { "Cache-Control": "no-store" } });
    }

    migrateLegacyIfNeeded(user.id);

    const snapshot = loadNormalized(user.id);
    return NextResponse.json({ ...snapshot, syncAt: serverSyncAt(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("ERRO EM GET /api/app-data:", error);

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? `Erro interno: ${
                error instanceof Error
                  ? error.message
                  : String(error)
              }`
            : "Não foi possível carregar seus dados.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const limit = rateLimit(req, "app-data-write", 30);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas gravações em pouco tempo. Tente novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  try { requireSameOrigin(req); enforceBodySize(req, 9 * 1024 * 1024); } catch (error) {
    const status = error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 403;
    return NextResponse.json({ error: status === 413 ? "Requisição muito grande." : "Origem da requisição não permitida." }, { status });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = await readJsonBody<Record<string, unknown>>(req, 8 * 1024 * 1024);
  const conversations = Array.isArray(body.conversations) ? body.conversations : [];
  const memories = Array.isArray(body.memories) ? body.memories : [];
  const relationships = body.relationships && typeof body.relationships === "object" && !Array.isArray(body.relationships)
    ? body.relationships as Record<string, RelationshipState>
    : {};
  const deletedConversationIds = Array.isArray(body.deletedConversationIds) ? body.deletedConversationIds.map(String).filter(Boolean) : [];
  const deletedMemoryIds = Array.isArray(body.deletedMemoryIds) ? body.deletedMemoryIds.map(String).filter(Boolean) : [];
  const deletedMessageIds = Array.isArray(body.deletedMessageIds) ? body.deletedMessageIds.map(String).filter(Boolean) : [];
  const baseSyncAt = Number.isFinite(Number(body.baseSyncAt)) ? Number(body.baseSyncAt) : 0;

  try {
    if (isPostgresChatEnabled()) {
      const result = await upsertPostgresChatSnapshot(user.id, conversations as Conversation[], memories as Memory[], deletedConversationIds, deletedMemoryIds, deletedMessageIds, baseSyncAt);
      // Relationships remain on SQLite until their dedicated cutover phase.
      if (Object.keys(relationships).length) {
        const db = getDb();
        db.exec("BEGIN IMMEDIATE");
        try {
          const insertRelationship = db.prepare(`INSERT INTO conversation_relationships
            (user_id,conversation_id,character_id,familiarity,trust,warmth,respect,tension,interactions,updated_at,mood,mood_intensity,chemistry,approach_stage)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id,conversation_id) DO UPDATE SET character_id=excluded.character_id,familiarity=excluded.familiarity,trust=excluded.trust,warmth=excluded.warmth,respect=excluded.respect,tension=excluded.tension,interactions=excluded.interactions,updated_at=excluded.updated_at,mood=excluded.mood,mood_intensity=excluded.mood_intensity,chemistry=excluded.chemistry,approach_stage=excluded.approach_stage
            WHERE excluded.updated_at >= conversation_relationships.updated_at`);
          for (const [conversationId, relationship] of Object.entries(relationships)) {
            const conversation = (conversations as Conversation[]).find((item) => item.id === conversationId);
            if (!conversation) continue;
            insertRelationship.run(user.id, conversationId, conversation.characterId, relationship.familiarity ?? 0, relationship.trust ?? 0, relationship.warmth ?? 0, relationship.respect ?? 0, relationship.tension ?? 0, relationship.interactions ?? 0, Number(relationship.updatedAt) || Date.now(), relationship.mood ?? "calm", relationship.moodIntensity ?? 35, relationship.chemistry ?? 0, relationship.approachStage ?? "stranger");
          }
          db.exec("COMMIT");
        } catch (relationshipError) {
          try { db.exec("ROLLBACK"); } catch {}
          throw relationshipError;
        }
      }
      return NextResponse.json({ ok: true, ...result, relationships, syncAt: Date.now() }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = mergeNormalized(user.id, conversations as Conversation[], memories as Memory[], relationships, deletedConversationIds, deletedMemoryIds, deletedMessageIds, baseSyncAt);
    return NextResponse.json({ ok: true, ...result.snapshot, syncAt: result.syncAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_TOO_LARGE") {
      return NextResponse.json({ error: "Your chat data is too large to save in one request." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "DATA_LIMIT") {
      return NextResponse.json({ error: "Limite de conversas ou memórias atingido." }, { status: 413 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to save your data." }, { status: 500 });
  }
}
