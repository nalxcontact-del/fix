import { getDb } from "./db";

export type StoredResponseAlternative = {
  id: string;
  conversationId: string;
  messageId: string;
  label: string;
  text: string;
  selected: boolean;
  createdAt: number;
};

function ensureSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS response_alternatives (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, message_id, label),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_response_alternatives_message
      ON response_alternatives(user_id, message_id, created_at ASC);
  `);
}

export function saveResponseAlternatives(userId: string, conversationId: string, messageId: string, alternatives: Array<{ label: string; text: string }>, selectedLabel?: string, append = false) {
  ensureSchema();
  const db = getDb();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!append) db.prepare("DELETE FROM response_alternatives WHERE user_id=? AND message_id=?").run(userId, messageId);
    const insert = db.prepare(`INSERT INTO response_alternatives
      (id,user_id,conversation_id,message_id,label,text,selected,created_at) VALUES(?,?,?,?,?,?,?,?)`);
    for (const candidate of alternatives.slice(0, 8)) {
      const text = String(candidate.text ?? "").trim().slice(0, 8000);
      const label = String(candidate.label ?? "").trim().slice(0, 20);
      if (!text || !label) continue;
      insert.run(crypto.randomUUID(), userId, conversationId, messageId, label, text, selectedLabel === label ? 1 : 0, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

export function getResponseAlternatives(userId: string, conversationId: string, messageId: string) {
  ensureSchema();
  const rows = getDb().prepare(`SELECT id, conversation_id AS conversationId, message_id AS messageId,
      label, text, selected, created_at AS createdAt
    FROM response_alternatives
    WHERE user_id=? AND conversation_id=? AND message_id=?
    ORDER BY created_at ASC, label ASC`).all(userId, conversationId, messageId) as any[];
  return rows.map((row) => ({
    id: String(row.id), conversationId: String(row.conversationId), messageId: String(row.messageId),
    label: String(row.label), text: String(row.text), selected: Number(row.selected) === 1, createdAt: Number(row.createdAt),
  })) as StoredResponseAlternative[];
}

export function selectResponseAlternative(userId: string, conversationId: string, messageId: string, label: string) {
  ensureSchema();
  const db = getDb();
  const row = db.prepare(`SELECT text FROM response_alternatives
    WHERE user_id=? AND conversation_id=? AND message_id=? AND label=?`).get(userId, conversationId, messageId, label) as { text?: string } | undefined;
  if (!row?.text) return null;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE response_alternatives SET selected=0 WHERE user_id=? AND message_id=?").run(userId, messageId);
    db.prepare("UPDATE response_alternatives SET selected=1 WHERE user_id=? AND message_id=? AND label=?").run(userId, messageId, label);
    db.exec("COMMIT");
    return String(row.text);
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}
