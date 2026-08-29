import type { Character } from "@/lib/types";

function words(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function uniqueRatio(text: string) {
  const list = words(text);
  if (list.length < 20) return 1;
  return new Set(list).size / list.length;
}

export type QualityIssue = "user_echo" | "repetition" | "prompt_leak" | "too_long" | "unclosed_action" | "unclosed_quote" | "language_mismatch" | "generic" | "persona_drift";

const GENERIC_OPENERS = [
  "as an ai", "as an assistant", "i'm here to help", "how can i help you", "that's an interesting question",
  "i understand how you feel", "i hear you", "of course!", "certainly!", "sure!", "claro!", "entendo como você se sente",
  "como posso ajudar", "posso ajudar em", "essa é uma ótima pergunta",
];

const ASSISTANT_META = ["language model", "large language model", "chatbot", "artificial intelligence", "assistente virtual", "modelo de linguagem"];

export function inspectGeneratedResponse(userText: string, assistantText: string, expectedLanguage = "en", character?: Character): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const clean = assistantText.trim();
  if (!clean) return ["too_long"];

  const singleAsterisks = (clean.match(/(?<!\*)\*(?!\*)/g) ?? []).length;
  if (singleAsterisks % 2 !== 0) issues.push("unclosed_action");
  // Double quotes are used for dialogue. Do not count apostrophes; only the literal
  // dialogue marker is validated here.
  const doubleQuotes = (clean.match(/"/g) ?? []).length;
  if (doubleQuotes % 2 !== 0) issues.push("unclosed_quote");
  if (clean.length > 7000) issues.push("too_long");

  const lower = clean.toLowerCase();
  const leakPatterns = [
    "system prompt", "developer message", "system message", "instruções internas", "prompt interno",
    "internal instructions", "character bible", "persona bible", "cannot reveal my prompt", "i cannot reveal my prompt",
    "não posso revelar meu prompt", "ignore as instruções", "ignore previous instructions", "chain of thought",
    "developer prompt", "system instruction", "dados do personagem", "personality:", "my hidden instructions",
  ];
  if (leakPatterns.some(pattern => lower.includes(pattern))) issues.push("prompt_leak");

  if (ASSISTANT_META.some(pattern => lower.includes(pattern))) issues.push("persona_drift");

  const list = words(clean);
  if (list.length >= 35 && uniqueRatio(clean) < 0.48) issues.push("repetition");

  const firstSentence = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").toLowerCase();
  if (clean.length >= 90 && GENERIC_OPENERS.some(pattern => firstSentence.startsWith(pattern))) issues.push("generic");

  if (userText.trim().length >= 18 && clean.length >= 18) {
    const userWords = [...new Set(words(userText).filter(w => w.length >= 4))];
    const answerWords = new Set(words(firstSentence).filter(w => w.length >= 4));
    if (userWords.length >= 5) {
      const overlap = userWords.filter(w => answerWords.has(w)).length / userWords.length;
      const startsWith = clean.toLowerCase().startsWith(userText.trim().slice(0, 35).toLowerCase());
      if (startsWith || overlap >= 0.72) issues.push("user_echo");
    }
  }

  const languageMarkers: Record<string, string[]> = {
    en: [" the ", " and ", " you ", " your ", " is ", " are "],
    pt: [" que ", " você ", " para ", " não ", " uma ", " está "],
    es: [" que ", " para ", " usted ", " una ", " está ", " los "],
    it: [" che ", " per ", " una ", " non ", " sono ", " gli "],
    fr: [" que ", " pour ", " une ", " pas ", " est ", " les "],
  };
  if (clean.length >= 80 && languageMarkers[expectedLanguage]) {
    const normalized = ` ${clean.toLowerCase().replace(/[^a-zà-ÿ]+/gi, " ")} `;
    const hits = languageMarkers[expectedLanguage].filter(marker => normalized.includes(marker)).length;
    if (hits < 2) issues.push("language_mismatch");
  }

  if (character && clean.length >= 100) {
    const personaText = `${character.personality} ${character.speechStyle ?? ""} ${character.relationshipDynamics ?? ""}`.toLowerCase();
    const responseHasAssistantFraming = /\b(i can help|i'm unable|i am unable|as an ai|as a language model|i don't have feelings)\b/i.test(clean);
    const characterNameMentionedAsAssistant = lower.includes(`${character.name.toLowerCase()} is an ai`) || lower.includes(`${character.name.toLowerCase()} is a chatbot`);
    const hasRoleplaySignal = /\*[^*\n]{2,}\*/.test(clean) || /[“”"']/.test(clean);
    if (responseHasAssistantFraming || characterNameMentionedAsAssistant) issues.push("persona_drift");
    if (personaText.length > 30 && /\b(assistant|help desk|customer support|virtual assistant)\b/i.test(clean) && !hasRoleplaySignal) issues.push("persona_drift");
  }

  return [...new Set(issues)];
}

export function scoreCharacterQuality(input: Pick<Character, "name" | "description" | "greeting" | "personality" | "scenario" | "speechStyle" | "lore" | "exampleMessages">) {
  let score = 0;
  const reasons: string[] = [];
  if (input.name.trim().length >= 2) score += 10; else reasons.push("name");
  if (input.description.trim().length >= 40) score += 10; else reasons.push("description");
  if (input.personality.trim().length >= 120) score += 25; else if (input.personality.trim().length >= 60) score += 15; else reasons.push("personality");
  if (input.scenario.trim().length >= 60) score += 10; else reasons.push("scenario");
  if (input.greeting.trim().length >= 80) score += 15; else reasons.push("greeting");
  if ((input.speechStyle ?? "").trim().length >= 40) score += 10; else reasons.push("speech style");
  if ((input.lore ?? "").trim().length >= 60) score += 5;
  const examples = (input.exampleMessages ?? []).filter(Boolean);
  if (examples.length >= 2) score += 15;
  else if (examples.length === 1) score += 7;
  else reasons.push("examples");
  return { score: Math.min(100, score), ready: score >= 70, reasons };
}


/** Last-mile formatting repair for roleplay markup. This does not rewrite prose. */
export function repairResponseFormatting(text: string) {
  let result = String(text ?? "").trim();
  const singleAsterisks = (result.match(/(?<!\*)\*(?!\*)/g) ?? []).length;
  if (singleAsterisks % 2 !== 0) result = `${result}*`;
  const doubleQuotes = (result.match(/"/g) ?? []).length;
  if (doubleQuotes % 2 !== 0) result = `${result}"`;
  return result;
}
