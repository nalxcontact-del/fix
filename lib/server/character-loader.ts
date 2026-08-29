import { getCharacter } from "@/characters";
import type { Character, CharacterType } from "@/lib/types";
import type { ServerUser } from "./session";
import { getDb } from "./db";

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function rowToCharacter(row: any): Character {
  return {
    id: String(row.id),
    type: (row.bot_type === "real_person" || row.bot_type === "existing_character" ? row.bot_type : "original") as CharacterType,
    name: String(row.name ?? ""),
    image: String(row.image ?? ""),
    description: String(row.description ?? ""),
    greeting: String(row.greeting ?? ""),
    personality: String(row.personality ?? ""),
    scenario: String(row.scenario ?? ""),
    speechStyle: String(row.speech_style ?? ""),
    lore: String(row.lore ?? ""),
    relationshipDynamics: "",
    visibility: row.visibility === "private" ? "private" : "public",
    exampleMessages: parseJsonArray(row.example_messages_json),
    creator: row.creatorUsername ? `@${row.creatorUsername}` : "@person",
    creatorId: String(row.owner_id ?? ""),
    createdAt: Number(row.created_at ?? 0),
    tags: parseJsonArray(row.tags_json),
  };
}

/**
 * The browser may send a full character for rendering, but the server never
 * trusts that payload as prompt authority. The canonical character is loaded
 * from built-in content or the database using the character id.
 */
export function loadCanonicalCharacterForUser(characterId: string, user: ServerUser): Character | null {
  const id = String(characterId ?? "").trim();
  if (!id || id.length > 160) return null;

  // Editorial characters may also be mirrored into user_bots so the admin can
  // edit them. Prefer the database row when it exists; otherwise fall back to
  // the immutable built-in catalogue. This is what makes Naruto/Luffy/Revy
  // editable without creating a second character with the same id.
  const row = getDb().prepare(`
    SELECT b.*, u.username AS creatorUsername, u.blocked_at AS ownerBlockedAt
    FROM user_bots b
    JOIN users u ON u.id=b.owner_id
    WHERE b.id=?
  `).get(id) as any;

  if (row && !row.ownerBlockedAt) {
    const isOwner = String(row.owner_id) === String(user.id);
    const isPublic = row.visibility !== "private";
    if (isOwner || isPublic) return rowToCharacter(row);
  }

  const builtIn = getCharacter(id);
  if (builtIn) return builtIn;
  return null;
}

export function isCanonicalCharacterAvailable(characterId: string, user: ServerUser) {
  return Boolean(loadCanonicalCharacterForUser(characterId, user));
}
