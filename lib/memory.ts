import type { Memory, MemoryCategory } from "./types";

type Rule = { pattern: RegExp; category: MemoryCategory; importance: 1|2|3|4|5 };

const rules: Rule[] = [
  { pattern: /\bmeu nome é ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\beu gosto de ([^.!?\n]+)/i, category: "preference", importance: 3 },
  { pattern: /\beu amo ([^.!?\n]+)/i, category: "preference", importance: 4 },
  { pattern: /\beu odeio ([^.!?\n]+)/i, category: "preference", importance: 4 },
  { pattern: /\beu prefiro ([^.!?\n]+)/i, category: "preference", importance: 4 },
  { pattern: /\beu tenho ([^.!?\n]+)/i, category: "fact", importance: 3 },
  { pattern: /\beu sou ([^.!?\n]+)/i, category: "fact", importance: 4 },
  { pattern: /\beu trabalho (?:como|em) ([^.!?\n]+)/i, category: "fact", importance: 4 },
  { pattern: /\bminha família ([^.!?\n]+)/i, category: "person", importance: 4 },
  { pattern: /\bmeu aniversário (?:é|é) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\b(?:não esquece|não se esqueça|lembra que|lembre que) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\beu moro (?:em|no|na) ([^.!?\n]+)/i, category: "fact", importance: 4 },
  { pattern: /\beu estudo (?:em|na|no|como) ([^.!?\n]+)/i, category: "fact", importance: 4 },
  { pattern: /\beu quero ([^.!?\n]+)/i, category: "promise", importance: 3 },
  { pattern: /\beu preciso ([^.!?\n]+)/i, category: "fact", importance: 3 },
  { pattern: /\b(?:combinado|prometo|prometemos|vamos fazer) ([^.!?\n]+)/i, category: "promise", importance: 4 },
  { pattern: /\b(?:aconteceu|aconteceu comigo|ontem|hoje eu) ([^.!?\n]+)/i, category: "event", importance: 3 },
  { pattern: /\bmy name is ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\bi (?:like|love|hate|prefer|have|am|want|need) ([^.!?\n]+)/i, category: "preference", importance: 3 },
  { pattern: /\b(?:remember that|don't forget that|please remember) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\bmy birthday is ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\bi live (?:in|at) ([^.!?\n]+)/i, category: "fact", importance: 4 },
  { pattern: /\b(?:mi nombre es) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\b(?:me gusta|amo|prefiero|odio|tengo|soy) ([^.!?\n]+)/i, category: "preference", importance: 3 },
  { pattern: /\b(?:recuerda que|no olvides que) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\b(?:il mio nome e|mi chiamo) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\b(?:mi piace|amo|preferisco|odio|ho) ([^.!?\n]+)/i, category: "preference", importance: 3 },
  { pattern: /\b(?:ricorda che|non dimenticare che) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\b(?:mon nom est|je m'appelle) ([^.!?\n]+)/i, category: "fact", importance: 5 },
  { pattern: /\b(?:j'aime|j'adore|je préfère|je déteste|j'ai) ([^.!?\n]+)/i, category: "preference", importance: 3 },
  { pattern: /\b(?:souviens-toi que|n'oublie pas que) ([^.!?\n]+)/i, category: "fact", importance: 5 },
];

function normalize(text: string) {
  return text.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function keyFor(text: string) {
  return normalize(text).replace(/^(eu|meu|minha|nao esquece|lembra que|i|my|remember that|dont forget that|me|mi|il|mon|je|j|recuerda que|no olvides que|ricorda che|non dimenticare che|souviens-toi que|noublie pas que)\s+/, "").slice(0, 100);
}

function detectContradiction(text: string, existing: Memory[]) {
  const normalized = normalize(text);
  const preference = /\b(eu gosto|eu amo|eu odeio|eu prefiro|nao gosto|nao amo|nao prefiro)\b/i.test(normalized);
  if (!preference) return undefined;
  const key = keyFor(text).replace(/^(gosto de|amo|odeio|prefiro|nao gosto de|nao amo|nao prefiro)\s+/, "");
  if (!key) return undefined;
  return existing.find(m => m.category === "preference" && normalize(m.text).includes(key) && normalize(m.text) !== normalized && m.status !== "superseded");
}

export function extractMemories(characterId: string, text: string, messageId?: string, existing: Memory[] = []): Memory[] {
  const memories: Memory[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const match = text.match(rule.pattern);
    const value = match?.[0]?.trim();
    if (!value || value.length < 4 || value.length > 220) continue;
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key);
    const conflict = detectContradiction(value, existing);
    memories.push({
      id: crypto.randomUUID(), characterId, text: value, source: "automatic",
      category: rule.category, importance: rule.importance, status: "active",
      supersedesId: conflict?.id, createdAt: Date.now(), updatedAt: Date.now(), messageId,
    });
  }
  return memories;
}

export function rankMemories(memories: Memory[], limit = 60, query = "") {
  const terms = normalize(query).split(/\s+/).filter(term => term.length >= 4);
  return [...memories]
    .filter(m => m.status !== "superseded")
    .map((m) => {
      const text = normalize(m.text);
      const relevance = terms.length ? terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) : 0;
      const importance = m.importance ?? 3;
      const recency = Math.min(1, Math.max(0, (m.updatedAt ?? m.createdAt) / Math.max(Date.now(), 1))) * 0.001;
      return { m, score: relevance * 5 + importance + recency };
    })
    .sort((a,b) => b.score - a.score || ((b.m.updatedAt ?? b.m.createdAt) - (a.m.updatedAt ?? a.m.createdAt)))
    .slice(0, limit)
    .map(({ m }) => m);
}

export function supersedeConflicts(memories: Memory[], additions: Memory[]) {
  const ids = new Set(additions.map(m => m.supersedesId).filter(Boolean) as string[]);
  if (!ids.size) return memories;
  return memories.map(m => ids.has(m.id) ? { ...m, status: "superseded" as const, updatedAt: Date.now() } : m);
}
