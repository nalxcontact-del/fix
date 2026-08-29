import { getPostgres, isPostgresConfigured } from "./postgres";
import type { Conversation, Memory, RelationshipState } from "@/lib/types";

export function isPostgresChatEnabled() {
  return process.env.PERSONACHAT_POSTGRES_CHAT === "1" && isPostgresConfigured();
}

function pg() {
  if (!isPostgresChatEnabled()) throw new Error("POSTGRES_CHAT_DISABLED");
  return getPostgres();
}

function parseIntSafe(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeConversation(row: any, messages: any[]): Conversation {
  return {
    id: String(row.id),
    characterId: String(row.characterId),
    title: String(row.title || "Nova conversa"),
    messages: messages.map((message) => ({
      id: String(message.id),
      conversationId: String(message.conversationId),
      sender: message.sender === "user" ? "user" : "character",
      text: String(message.text),
      createdAt: parseIntSafe(message.createdAt),
      ...(Number(message.edited) ? { edited: true } : {}),
    })),
    createdAt: parseIntSafe(row.createdAt),
    updatedAt: parseIntSafe(row.updatedAt),
    ...(row.summary ? { summary: String(row.summary) } : {}),
    ...(row.summaryUpdatedAt ? { summaryUpdatedAt: parseIntSafe(row.summaryUpdatedAt) } : {}),
  };
}

function normalizeMemory(row: any): Memory {
  return {
    id: String(row.id),
    characterId: String(row.characterId),
    ...(row.conversationId ? { conversationId: String(row.conversationId) } : {}),
    text: String(row.text),
    source: row.source === "manual" ? "manual" : "automatic",
    ...(row.category ? { category: row.category } : {}),
    ...(row.importance != null ? { importance: parseIntSafe(row.importance) as 1|2|3|4|5 } : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(row.supersedesId ? { supersedesId: String(row.supersedesId) } : {}),
    ...(row.messageId ? { messageId: String(row.messageId) } : {}),
    createdAt: parseIntSafe(row.createdAt),
    updatedAt: row.updatedAt != null ? parseIntSafe(row.updatedAt) : undefined,
  } as Memory;
}

export async function loadPostgresChatData(userId: string, relationships: Record<string, RelationshipState> = {}) {
  const sql = pg();
  const conversationRows = await sql`SELECT id, character_id AS "characterId", title, summary, summary_updated_at AS "summaryUpdatedAt", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM conversations WHERE user_id=${userId} ORDER BY updated_at DESC`;
  const messageRows = await sql`SELECT id, conversation_id AS "conversationId", sender, text, created_at AS "createdAt", edited
    FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=${userId}) ORDER BY created_at ASC`;
  const memoryRows = await sql`SELECT id, character_id AS "characterId", conversation_id AS "conversationId", text, source, category, importance, status, supersedes_id AS "supersedesId", message_id AS "messageId", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM memories WHERE user_id=${userId} ORDER BY created_at ASC`;
  const feedbackRows = await sql`SELECT message_id AS "messageId", value FROM response_feedback WHERE user_id=${userId}`;
  const feedback = new Map(feedbackRows.map((row: any) => [String(row.messageId), String(row.value)]));
  const byConversation = new Map<string, any[]>();
  for (const row of messageRows) {
    const list = byConversation.get(String(row.conversationId)) ?? [];
    list.push({ ...row, ...(feedback.has(String(row.id)) ? { feedback: feedback.get(String(row.id)) } : {}) });
    byConversation.set(String(row.conversationId), list);
  }
  const conversations = conversationRows.map((row: any) => {
    const normalized = normalizeConversation(row, byConversation.get(String(row.id)) ?? []);
    normalized.messages = normalized.messages.map((m: any) => feedback.has(m.id) ? { ...m, feedback: feedback.get(m.id) } : m);
    return normalized;
  });
  const memories = memoryRows.map(normalizeMemory);
  return { conversations, memories, relationships };
}

export async function getPostgresConversationOwnership(userId: string, conversationId: string) {
  const sql = pg();
  const rows = await sql`SELECT id, character_id AS "characterId" FROM conversations WHERE id=${conversationId} AND user_id=${userId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function upsertPostgresChatSnapshot(
  userId: string,
  conversations: Conversation[],
  memories: Memory[],
  deletedConversationIds: string[],
  deletedMemoryIds: string[],
  deletedMessageIds: string[],
  baseSyncAt: number,
) {
  const sql = pg();
  const now = Date.now();
  await sql.begin(async (tx) => {
    for (const conversation of conversations.slice(0, 500)) {
      const id = String(conversation.id || "").trim();
      if (!id) continue;
      const createdAt = parseIntSafe(conversation.createdAt, now);
      const updatedAt = parseIntSafe(conversation.updatedAt, now);
      await tx`INSERT INTO conversations (id,user_id,character_id,title,summary,summary_updated_at,created_at,updated_at)
        VALUES (${id},${userId},${String(conversation.characterId || "")},${String(conversation.title || "Nova conversa")},${conversation.summary ?? null},${conversation.summaryUpdatedAt ?? null},${createdAt},${updatedAt})
        ON CONFLICT(id) DO UPDATE SET character_id=EXCLUDED.character_id,title=EXCLUDED.title,summary=EXCLUDED.summary,summary_updated_at=EXCLUDED.summary_updated_at,updated_at=EXCLUDED.updated_at
        WHERE conversations.user_id=EXCLUDED.user_id AND EXCLUDED.updated_at >= conversations.updated_at`;
      for (const message of (Array.isArray(conversation.messages) ? conversation.messages : []).slice(0, 5000)) {
        const messageId = String(message.id || "").trim();
        if (!messageId) continue;
        await tx`INSERT INTO messages (id,conversation_id,sender,text,created_at,edited)
          VALUES (${messageId},${id},${message.sender === "user" ? "user" : "character"},${String(message.text ?? "")},${parseIntSafe(message.createdAt, updatedAt)},${message.edited ? 1 : 0})
          ON CONFLICT(id) DO UPDATE SET sender=EXCLUDED.sender,text=EXCLUDED.text,edited=EXCLUDED.edited
          WHERE messages.conversation_id=EXCLUDED.conversation_id AND EXCLUDED.created_at >= messages.created_at`;
      }
    }
    for (const memory of memories.slice(0, 2000)) {
      const id = String(memory.id || "").trim();
      if (!id) continue;
      const createdAt = parseIntSafe(memory.createdAt, now);
      const updatedAt = parseIntSafe(memory.updatedAt, createdAt);
      await tx`INSERT INTO memories (id,user_id,character_id,conversation_id,text,source,category,importance,status,supersedes_id,message_id,created_at,updated_at)
        VALUES (${id},${userId},${String(memory.characterId || "")},${memory.conversationId ?? null},${String(memory.text ?? "")},${memory.source === "manual" ? "manual" : "automatic"},${memory.category ?? null},${memory.importance ?? null},${memory.status ?? "active"},${memory.supersedesId ?? null},${memory.messageId ?? null},${createdAt},${updatedAt})
        ON CONFLICT(id) DO UPDATE SET character_id=EXCLUDED.character_id,conversation_id=EXCLUDED.conversation_id,text=EXCLUDED.text,source=EXCLUDED.source,category=EXCLUDED.category,importance=EXCLUDED.importance,status=EXCLUDED.status,supersedes_id=EXCLUDED.supersedes_id,message_id=EXCLUDED.message_id,updated_at=EXCLUDED.updated_at
        WHERE memories.user_id=EXCLUDED.user_id AND EXCLUDED.updated_at >= COALESCE(memories.updated_at,memories.created_at)`;
    }
    for (const id of deletedMessageIds.slice(0, 5000)) {
      await tx`DELETE FROM messages WHERE id=${String(id)} AND created_at <= ${Math.max(0, baseSyncAt)} AND conversation_id IN (SELECT id FROM conversations WHERE user_id=${userId})`;
    }
    for (const id of deletedMemoryIds.slice(0, 2000)) {
      await tx`DELETE FROM memories WHERE id=${String(id)} AND user_id=${userId} AND COALESCE(updated_at,created_at) <= ${Math.max(0, baseSyncAt)}`;
    }
    for (const id of deletedConversationIds.slice(0, 500)) {
      await tx`DELETE FROM conversations WHERE id=${String(id)} AND user_id=${userId} AND updated_at <= ${Math.max(0, baseSyncAt)}`;
    }
  });
  return loadPostgresChatData(userId);
}

export async function loadPostgresResponseAlternatives(userId: string, conversationId: string, messageId: string) {
  const sql = pg();
  const rows = await sql`SELECT id, conversation_id AS "conversationId", message_id AS "messageId", label, text, selected, created_at AS "createdAt"
    FROM response_alternatives WHERE user_id=${userId} AND conversation_id=${conversationId} AND message_id=${messageId} ORDER BY created_at ASC, label ASC`;
  return rows.map((row: any) => ({ ...row, id: String(row.id), conversationId: String(row.conversationId), messageId: String(row.messageId), label: String(row.label), text: String(row.text), selected: Boolean(row.selected), createdAt: parseIntSafe(row.createdAt) }));
}

export async function savePostgresResponseAlternatives(userId: string, conversationId: string, messageId: string, alternatives: Array<{label: string;text: string}>, selectedLabel?: string, append = false) {
  const sql = pg();
  await sql.begin(async (tx) => {
    if (!append) await tx`DELETE FROM response_alternatives WHERE user_id=${userId} AND message_id=${messageId}`;
    const now = Date.now();
    for (const candidate of alternatives.slice(0, 8)) {
      const label = String(candidate.label ?? "").trim().slice(0, 20);
      const text = String(candidate.text ?? "").trim().slice(0, 8000);
      if (!label || !text) continue;
      await tx`INSERT INTO response_alternatives (id,user_id,conversation_id,message_id,label,text,selected,created_at)
        VALUES (${crypto.randomUUID()},${userId},${conversationId},${messageId},${label},${text},${selectedLabel === label},${now})
        ON CONFLICT(user_id,message_id,label) DO UPDATE SET text=EXCLUDED.text,selected=EXCLUDED.selected`;
    }
  });
}

export async function selectPostgresResponseAlternative(userId: string, conversationId: string, messageId: string, label: string) {
  const sql = pg();
  const rows = await sql`SELECT text FROM response_alternatives WHERE user_id=${userId} AND conversation_id=${conversationId} AND message_id=${messageId} AND label=${label} LIMIT 1`;
  if (!rows[0]) return null;
  await sql.begin(async (tx) => {
    await tx`UPDATE response_alternatives SET selected=false WHERE user_id=${userId} AND conversation_id=${conversationId} AND message_id=${messageId}`;
    await tx`UPDATE response_alternatives SET selected=true WHERE user_id=${userId} AND conversation_id=${conversationId} AND message_id=${messageId} AND label=${label}`;
  });
  return String(rows[0].text);
}
