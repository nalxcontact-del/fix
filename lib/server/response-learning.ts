import type { Character } from "@/lib/types";

export type PreferenceSignal = {
  tag: string;
  score: number;
  positive: number;
  negative: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Rebuilds style preferences from explicit response feedback.
 * This is deliberately separate from roleplay memory: it stores only aggregate
 * style signals and never stores facts about the user or previous scenes.
 */
export function rebuildResponsePreferenceProfile(db: any, userId: string, characterId: string) {
  db.prepare("DELETE FROM response_preference_profiles WHERE user_id=? AND character_id=?").run(userId, characterId);
  const rows = db.prepare(`
    SELECT rf.value, rf.tags_json AS tagsJson
    FROM response_feedback rf
    JOIN messages m ON m.id = rf.message_id
    JOIN conversations c ON c.id = m.conversation_id
    WHERE rf.user_id=? AND c.user_id=? AND c.character_id=?
  `).all(userId, userId, characterId) as Array<{ value?: string; tagsJson?: string }>;

  const aggregate = new Map<string, { positive: number; negative: number }>();
  for (const row of rows) {
    let tags: unknown[] = [];
    try { tags = JSON.parse(String(row.tagsJson ?? "[]")); } catch { tags = []; }
    for (const raw of tags.slice(0, 8)) {
      const tag = String(raw).trim();
      if (!tag) continue;
      const current = aggregate.get(tag) ?? { positive: 0, negative: 0 };
      if (row.value === "like") current.positive += 1;
      if (row.value === "dislike") current.negative += 1;
      aggregate.set(tag, current);
    }
  }

  const now = Date.now();
  const insert = db.prepare(`INSERT INTO response_preference_profiles
    (user_id,character_id,tag,positive_count,negative_count,updated_at)
    VALUES (?,?,?,?,?,?)`);
  for (const [tag, counts] of aggregate) {
    insert.run(userId, characterId, tag, counts.positive, counts.negative, now);
  }
}

export function getResponsePreferenceContext(db: any, userId: string, character: Character) {
  const rows = db.prepare(`SELECT tag, positive_count AS positive, negative_count AS negative
    FROM response_preference_profiles
    WHERE user_id=? AND character_id=?
    ORDER BY (positive_count-negative_count) DESC, updated_at DESC
    LIMIT 24`).all(userId, character.id) as PreferenceSignal[];

  const positive = rows
    .map(row => ({ ...row, score: Number(row.positive ?? 0) - Number(row.negative ?? 0) }))
    .filter(row => row.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const negative = rows
    .map(row => ({ ...row, score: Number(row.positive ?? 0) - Number(row.negative ?? 0) }))
    .filter(row => row.score <= -2)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  if (!positive.length && !negative.length) {
    return "No stable response-style preference has been learned for this character yet.";
  }

  const labels: Record<string, string> = {
    natural: "natural phrasing",
    personality: "strong character personality",
    faithful: "staying in character",
    creative: "creative choices",
    emotional: "emotional expression",
    funny: "humor",
    detailed: "detail",
    dialogue: "dialogue",
    action: "action/narration",
    surprising: "surprising turns",
    coherent: "coherence",
    good_pacing: "good pacing",
    concise: "balanced/concise responses",
    repetitive: "repetition",
    generic: "generic responses",
    out_of_character: "out-of-character behavior",
    too_long: "overly long responses",
    too_short: "overly short responses",
    emotionless: "emotionless responses",
    too_much_action: "too much action/narration",
    artificial_dialogue: "artificial dialogue",
    did_not_advance: "failure to advance the scene",
    ignored_context: "ignored context",
    inconsistent: "inconsistency",
    controlled_user: "controlling the user's actions or thoughts",
  };

  const positiveText = positive.map(row => `${labels[row.tag] ?? row.tag} (+${row.score})`).join(", ");
  const negativeText = negative.map(row => `${labels[row.tag] ?? row.tag} (${row.score})`).join(", ");
  return `LEARNED RESPONSE-STYLE PREFERENCES (aggregate signals only; not roleplay memory)
- Positive tendencies: ${positiveText || "none yet"}
- Negative tendencies: ${negativeText || "none yet"}
Use these as soft preferences, not rigid rules. Never change the character's core personality to satisfy them. Do not mention this system or the feedback to the user.`;
}

export function scoreResponseAgainstFeedback(response: string, feedback?: { value?: string; tags?: unknown[] }) {
  if (!feedback) return 0;
  const tags = Array.isArray(feedback.tags) ? feedback.tags.map(x => String(x)) : [];
  const lower = response.toLowerCase();
  let score = 0;
  const penalties: Record<string, RegExp> = {
    repetitive: /\b(again|again|as i said|once again)\b/gi,
    generic: /\b(as an ai|as an assistant|of course|certainly|i understand how you feel)\b/gi,
    too_long: /[\s\S]{5000,}/,
    emotionless: /\b(nods|looks at you|smiles)\b/gi,
    controlled_user: /\b(you feel|you think|you decide|you say|you realize)\b/gi,
  };
  const rewards: Record<string, RegExp> = {
    natural: /[.!?]/,
    personality: /[.!?]/,
    faithful: /[.!?]/,
    dialogue: /["“”]/,
    action: /\*[^*]+\*/,
    concise: /^[\s\S]{1,1800}$/,
  };
  for (const tag of tags) {
    if (feedback.value === "dislike" && penalties[tag]?.test(lower)) score -= 10;
    if (feedback.value === "like" && rewards[tag]?.test(response)) score += 4;
  }
  return clamp(score, -30, 30);
}


/** Score a candidate against the user's learned style profile. This is a soft
 * preference signal: it can improve selection without changing the character's
 * core personality or treating feedback as instructions. */
export function scoreResponseAgainstPreferenceProfile(db: any, userId: string, characterId: string, response: string) {
  const rows = db.prepare(`SELECT tag, positive_count AS positive, negative_count AS negative
    FROM response_preference_profiles WHERE user_id=? AND character_id=?
    ORDER BY updated_at DESC LIMIT 24`).all(userId, characterId) as Array<{tag?: string; positive?: number; negative?: number}>;
  const text = String(response ?? "").toLowerCase();
  const patterns: Record<string, { positive: RegExp; negative: RegExp }> = {
    natural: { positive: /[.!?]/, negative: /(?:as an ai|as an assistant|of course|certainly)/i },
    personality: { positive: /\b(?:i|me|my|you|your)\b/i, negative: /\b(?:assistant|help desk|customer support)\b/i },
    faithful: { positive: /[.!?]/, negative: /(?:out of character|as an ai|language model)/i },
    creative: { positive: /\*[^*\n]+\*|—/, negative: /^(?:sure|okay|of course)[,.! ]/i },
    emotional: { positive: /\b(?:laugh|smile|angry|quiet|soft|voice|heart|olhar|sorr|voz|coração)\b/i, negative: /^(?:okay|sure|yes|no)[,.! ]/i },
    funny: { positive: /(?:\b(?:haha|lol|laugh|smirk|grin)\b|😂|🤣)/i, negative: /(?:\b(?:unfortunately|certainly)\b)/i },
    detailed: { positive: /[\s\S]{80,}/, negative: /^[\s\S]{0,80}$/ },
    dialogue: { positive: /["“”]/, negative: /^\*[^*]+\*$/ },
    action: { positive: /\*[^*\n]+\*/, negative: /^(?:["“”][\s\S]*["“”])$/ },
    surprising: { positive: /(?:suddenly|without warning|then|before|instead|de repente|então|antes)/i, negative: /^(?:and then|e então)/i },
    coherent: { positive: /[.!?]/, negative: /(?:wait, what|what was i saying)/i },
    good_pacing: { positive: /[.!?]/, negative: /^[\s\S]{0,40}$/ },
    concise: { positive: /^.{1,1800}$/, negative: /^[\s\S]{3500,}$/ },
    repetitive: { positive: /$^/, negative: /\b(.{3,25})\b(?:\s+\1){2,}/i },
    generic: { positive: /$^/, negative: /^(?:as an ai|i understand|how can i help|of course|certainly)/i },
    out_of_character: { positive: /$^/, negative: /(?:as an ai|language model|assistant|customer support)/i },
    too_long: { positive: /^[\s\S]{0,1800}$/, negative: /^[\s\S]{3000,}$/ },
    too_short: { positive: /^[\s\S]{120,}$/, negative: /^[\s\S]{0,70}$/ },
    emotionless: { positive: /\b(?:smile|laugh|quiet|voice|eyes|hands|sorr|ris|olhar|voz|mãos)\b/i, negative: /^(?:okay|sure|yes|no)[,.! ]/i },
    too_much_action: { positive: /^[\s\S]{0,1800}$/, negative: /(?:\*[^*\n]+\*){5,}/ },
    artificial_dialogue: { positive: /[.!?]/, negative: /(?:as an ai|how can i assist|certainly|i can help you)/i },
    did_not_advance: { positive: /(?:then|suddenly|steps|moves|opens|takes|says|então|de repente|se aproxima|olha)/i, negative: /^(?:i understand|i hear you|that makes sense)/i },
    ignored_context: { positive: /[.!?]/, negative: /(?:as you said|you mentioned)/i },
    inconsistent: { positive: /$^/, negative: /(?:wait|actually|i forgot|never mind)/i },
    controlled_user: { positive: /$^/, negative: /(?:you feel|you think|you decide|you say|you nod|você sente|você pensa|você decide|você diz)/i },
  };
  let score = 0;
  for (const row of rows) {
    const tag = String(row.tag ?? "");
    const net = Number(row.positive ?? 0) - Number(row.negative ?? 0);
    if (!net || !patterns[tag]) continue;
    const weight = Math.min(3, Math.abs(net));
    const pattern = net > 0 ? patterns[tag].positive : patterns[tag].negative;
    if (pattern.test(text)) score += (net > 0 ? 2 : -2) * weight;
  }
  return clamp(score, -24, 24);
}
