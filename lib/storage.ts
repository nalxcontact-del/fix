import type { Conversation, Memory, RelationshipState } from "./types";

type Snapshot = { conversations: Conversation[]; memories: Memory[]; relationships: Record<string, RelationshipState> };
let cache: Snapshot = { conversations: [], memories: [], relationships: {} };
let serverSnapshot: Snapshot = { conversations: [], memories: [], relationships: {} };
let serverSyncAt = 0;
let saveQueue: Promise<void> = Promise.resolve();
let pendingWrites = 0;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function diffIds<T extends { id: string }>(before: T[], after: T[]) {
  const next = new Set(after.map(item => item.id));
  return before.filter(item => !next.has(item.id)).map(item => item.id);
}

export async function loadAppData() {
  const res = await fetch("/api/app-data", { credentials: "include", cache: "no-store", headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error("Unable to load your data.");
  const data = await res.json();
  const snapshot: Snapshot = { conversations: data.conversations ?? [], memories: data.memories ?? [], relationships: data.relationships ?? {} };
  cache = snapshot;
  serverSnapshot = clone(snapshot);
  serverSyncAt = Number(data.syncAt ?? 0);
  return cache;
}

export function loadConversations() { return cache.conversations; }
export function loadMemories() { return cache.memories; }
export function isSavePending() { return pendingWrites > 0; }

export function saveAppData(conversations: Conversation[], memories: Memory[], relationships: Record<string, RelationshipState> = cache.relationships) {
  const snapshot: Snapshot = { conversations, memories, relationships };
  cache = snapshot;
  pendingWrites += 1;
  saveQueue = saveQueue.then(async () => {
    const deletedConversationIds = diffIds(serverSnapshot.conversations, snapshot.conversations);
    const deletedMemoryIds = diffIds(serverSnapshot.memories, snapshot.memories);
    const beforeMessages = serverSnapshot.conversations.flatMap(c => c.messages);
    const afterMessages = new Set(snapshot.conversations.flatMap(c => c.messages).map(m => m.id));
    const deletedMessageIds = beforeMessages.filter(m => !afterMessages.has(m.id)).map(m => m.id);
    const res = await fetch("/api/app-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...snapshot, baseSyncAt: serverSyncAt, deletedConversationIds, deletedMemoryIds, deletedMessageIds }),
    });
    if (!res.ok) throw new Error("Unable to save your data.");
    const data = await res.json();
    const merged: Snapshot = { conversations: data.conversations ?? snapshot.conversations, memories: data.memories ?? snapshot.memories, relationships: data.relationships ?? snapshot.relationships };
    serverSnapshot = clone(merged);
    serverSyncAt = Number(data.syncAt ?? serverSyncAt);
    if (cache === snapshot) cache = merged;
  }).catch(error => {
    console.error("PersonaChat save failed:", error);
  }).finally(() => {
    pendingWrites = Math.max(0, pendingWrites - 1);
  });
  return saveQueue;
}

export async function syncAppData() {
  if (isSavePending()) return null;
  return loadAppData();
}

function makeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function createConversation(characterId: string, greeting: string): Conversation {
  const now = Date.now();
  return { id: makeId(), characterId, title: "New conversation", createdAt: now, updatedAt: now, messages: [{ id: makeId(), sender: "character", text: greeting, createdAt: now }] };
}
