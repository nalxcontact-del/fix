import type { Character } from "@/lib/types";

export type EvaluationDimension = "relevance" | "specificity" | "naturalness" | "continuity" | "persona" | "repetition";

export type EvaluationResult = {
  score: number;
  dimensions: Record<EvaluationDimension, number>;
  issues: string[];
};

function normalize(text: string) {
  return text.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(text: string) {
  return normalize(text).split(" ").filter((word) => word.length >= 4);
}

function clamp(value: number) { return Math.max(0, Math.min(100, value)); }

/**
 * Lightweight, deterministic evaluator. It is intentionally not an LLM judge:
 * it gives us stable regression signals before we consider model-based grading.
 */
export function evaluateResponse(args: {
  character: Character;
  userText: string;
  response: string;
  previousResponses?: string[];
}): EvaluationResult {
  const { character, userText, response, previousResponses = [] } = args;
  const answer = response.trim();
  const answerTokens = tokens(answer);
  const userTokens = [...new Set(tokens(userText))];
  const personaText = normalize(`${character.name} ${character.description ?? ""} ${character.personality} ${character.speechStyle ?? ""} ${character.relationshipDynamics ?? ""}`);
  const personaTokens = [...new Set(tokens(personaText))];

  const overlap = userTokens.length
    ? userTokens.filter((word) => answerTokens.includes(word)).length / userTokens.length
    : 0.35;
  // Relevance is deliberately not a pure keyword-overlap score. Too much overlap
  // usually means the model is echoing the user instead of reacting to them.
  const echoPenalty = overlap > 0.72 ? (overlap - 0.72) * 55 : 0;
  const relevance = clamp(58 + Math.min(35, overlap * 35) - echoPenalty - (answer.length < 8 ? 25 : 0));

  const specificityMarkers = [
    "*", "—", "because", "but", "then", "when", "now", "look", "smile", "voice", "hands", "silence",
    "porque", "mas", "então", "quando", "agora", "olhar", "sorrir", "voz", "mãos", "silêncio",
  ];
  const specificityHits = specificityMarkers.filter((marker) => normalize(answer).includes(normalize(marker))).length;
  const concreteDetails = answerTokens.filter((word) => word.length >= 6).length;
  const specificity = clamp(46 + specificityHits * 4 + Math.min(18, concreteDetails / 5));

  const sentenceCount = Math.max(1, answer.split(/[.!?]+/).filter(Boolean).length);
  const avgSentence = answer.length / sentenceCount;
  const paragraphCount = answer.split(/\n{2,}/).filter(Boolean).length;
  const naturalness = clamp(
    78
      - (avgSentence > 300 ? 15 : 0)
      - (avgSentence > 520 ? 15 : 0)
      - (answer.length > 5000 ? 25 : 0)
      - (answer.includes("###") ? 30 : 0)
      - (paragraphCount > 8 ? 8 : 0),
  );

  const recentAnswers = previousResponses.filter(Boolean).slice(-4);
  const recentText = normalize(recentAnswers.join(" "));
  const recentTokens = new Set(recentText.split(" ").filter((x) => x.length >= 5));
  const repeatedRecent = recentTokens.size && answerTokens.length
    ? answerTokens.filter((word) => word.length >= 5 && recentTokens.has(word)).length / Math.max(1, answerTokens.length)
    : 0;
  const continuity = clamp(84 - repeatedRecent * 34);

  // Persona matching is weighted toward distinctive phrases/terms rather than
  // rewarding generic overlap with words like "you", "feel", or "want".
  const genericPersonaTerms = new Set(["character", "personality", "natural", "with", "your", "you", "that", "this", "very", "like", "want", "feel"]);
  const distinctivePersonaTokens = personaTokens.filter((word) => !genericPersonaTerms.has(word));
  const personaHits = distinctivePersonaTokens.filter((word) => answerTokens.includes(word)).length;
  const persona = clamp(48 + Math.min(42, personaHits * 4.5));

  const repeatedWords = answerTokens.length
    ? 1 - new Set(answerTokens).size / answerTokens.length
    : 1;
  const repetition = clamp(100 - repeatedWords * 150);

  const actionLines = answer.match(/\*[^*\n]{2,240}\*/g)?.length ?? 0;
  const questionCount = (answer.match(/[?？]/g) ?? []).length;
  const userAgencyPenalty = /\b(you feel|you think|you decide|you say|you realize|you nod|you smile|you walk|you look|você sente|você pensa|você decide|você diz|você percebe|você anda|você olha)\b/i.test(answer) ? 12 : 0;
  const agency = clamp(100 - userAgencyPenalty);
  const pacing = clamp(78 + Math.min(12, actionLines * 3) - Math.max(0, questionCount - 2) * 6 - (answer.length < 30 ? 8 : 0));

  const issues: string[] = [];
  if (!answer) issues.push("empty_response");
  if (answer.length > 7000) issues.push("too_long");
  if (repetition < 55) issues.push("repetitive");
  if (naturalness < 50) issues.push("unnatural_format");
  if (relevance < 45) issues.push("low_relevance");
  if (agency < 88) issues.push("controlled_user");
  if (pacing < 62) issues.push("poor_pacing");

  const score = Math.round(
    relevance * 0.21 + specificity * 0.14 + naturalness * 0.17 + continuity * 0.14 + persona * 0.18 + repetition * 0.08 + agency * 0.04 + pacing * 0.04,
  );

  return {
    score,
    dimensions: { relevance, specificity, naturalness, continuity, persona, repetition },
    issues,
  };
}
