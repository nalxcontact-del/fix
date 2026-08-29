import type { Character, RelationshipState } from "./types";

export function initialRelationship(): RelationshipState {
  return { familiarity: 0, trust: 0, warmth: 0, respect: 0, tension: 0, interactions: 0, updatedAt: Date.now(), mood: "calm", moodIntensity: 35, chemistry: 0, approachStage: "stranger" };
}

function clamp(value: number) { return Math.max(-100, Math.min(100, value)); }

function hasAny(text: string, words: string[]) { return words.some((word) => text.includes(word)); }

/**
 * A small hidden state used to give the model continuity between turns.
 * It is intentionally gradual and is not shown to the user as a score.
 */
export function updateRelationship(character: Character, previous: RelationshipState | undefined, userText: string): RelationshipState {
  const state = { ...(previous ?? initialRelationship()) };
  const text = userText.toLowerCase();
  const insult = hasAny(text, ["idiota", "burro", "imbecil", "inútil", "otário", "babaca", "cala a boca", "foda-se", "fodase", "merda", "porra", "desgraçado", "desgraçada", "vai se"]);
  const praise = hasAny(text, ["obrigado", "obrigada", "valeu", "gosto de você", "confio em você", "você é bom", "você é incrível", "você me ajudou"]);
  const apology = hasAny(text, ["desculpa", "desculpe", "foi mal", "perdão", "não queria"]);
  const personal = hasAny(text, ["meu nome é", "eu gosto de", "eu amo", "eu odeio", "eu tenho", "eu sou", "eu trabalho", "minha família"]);
  const aggression = hasAny(text, ["ameaço", "ameaçar", "te odeio", "te detesto"]);
  const romanticSignal = /\b(gosto de voce|gosto de você|acho você (bonit|lind)|bonit[oa]|lind[oa]|beij|flert|namor|atraente|atrai|saudade|quer sair comigo|quero você)\b/i.test(text);
  const reciprocalWarmth = praise || apology || /\b(foi bom falar com você|gosto da sua companhia|confio em você|senti sua falta)\b/i.test(text);
  const rejection = /\b(não quero|nao quero|para com isso|não estou interessado|nao estou interessado|só amizade|somos amigos)\b/i.test(text);

  state.interactions += 1;
  state.familiarity = clamp(state.familiarity + (personal ? 2.5 : 0.7));
  state.tension = clamp(state.tension + (insult ? 9 : aggression ? 14 : apology ? -6 : romanticSignal ? 2 : praise ? -2 : -0.5));

  state.chemistry = clamp((state.chemistry ?? 0) + (rejection ? -8 : romanticSignal ? 4 : reciprocalWarmth ? 1.5 : personal ? 0.4 : -0.1));
  if (rejection) state.chemistry = Math.max(0, state.chemistry - 4);

  // The character's own profile determines how strongly social events matter.
  const profile = `${character.personality} ${character.relationshipDynamics} ${character.description}`.toLowerCase();
  const guarded = hasAny(profile, ["desconfiad", "reservad", "frio", "fria", "cínic", "cínica", "hostil", "agressiv", "difícil de impressionar"]);
  const warm = hasAny(profile, ["caloroso", "calorosa", "leal", "carinhos", "empátic", "amigável", "amigavel", "afetuos"]);

  if (insult) {
    state.respect = clamp(state.respect + (guarded ? -7 : -3));
    state.trust = clamp(state.trust + (guarded ? -5 : -2));
    state.warmth = clamp(state.warmth + (warm ? -5 : -3));
  }
  if (praise) {
    state.respect = clamp(state.respect + 2.5);
    state.trust = clamp(state.trust + (guarded ? 1 : 3));
    state.warmth = clamp(state.warmth + (warm ? 4 : 2));
  }
  if (apology) {
    state.tension = clamp(state.tension - 4);
    state.trust = clamp(state.trust + (guarded ? 1 : 2));
  }

  // Small natural drift toward neutral prevents one event from defining a relationship forever.
  state.tension = clamp(state.tension * 0.985);

  // Humor/estado emocional: gradual, contextual e dependente da personalidade.
  // Não é uma emoção "real"; é um estado narrativo oculto usado para manter continuidade.
  const recent = text;
  const currentIntensity = Math.max(15, Math.min(90, state.moodIntensity ?? 35));
  if (insult || aggression) {
    state.mood = "irritated";
    state.moodIntensity = Math.min(90, currentIntensity + 12);
  } else if (apology) {
    state.mood = "guarded";
    state.moodIntensity = Math.max(20, currentIntensity - 8);
  } else if (praise || /\b(haha|kkkk|rsrs|engraçado|divertido|feliz|animad)/i.test(recent)) {
    state.mood = warm ? "happy" : "excited";
    state.moodIntensity = Math.min(85, currentIntensity + 7);
  } else if (/\b(triste|cansad[oa]|exaust[oa]|preocupad[oa]|medo|sozinh[oa])/i.test(recent)) {
    state.mood = "sad";
    state.moodIntensity = Math.min(80, currentIntensity + 5);
  } else {
    const decay = Math.max(10, currentIntensity - 3);
    state.moodIntensity = decay;
    if (decay < 25) state.mood = "calm";
  }
  const chemistry = state.chemistry ?? 0;
  state.approachStage = chemistry >= 45 ? "chemistry" : chemistry >= 25 ? "warming" : state.familiarity >= 15 ? "familiar" : "stranger";
  state.updatedAt = Date.now();
  return state;
}

export function relationshipContext(state: RelationshipState | undefined): string {
  if (!state) return "Relação ainda sem histórico suficiente.";
  const describe = (n: number, positive: string, negative: string) => n >= 18 ? positive : n <= -18 ? negative : "equilibrado";
  return [
    `Familiaridade: ${describe(state.familiarity, "já existe algum conhecimento mútuo", "ainda estão se conhecendo")}.`,
    `Confiança: ${describe(state.trust, "há sinais de confiança", "há cautela ou desconfiança")}.`,
    `Calor emocional: ${describe(state.warmth, "há alguma abertura emocional", "a relação permanece mais distante")}.`,
    `Respeito: ${describe(state.respect, "respeito relativamente sólido", "respeito abalado")}.`,
    `Tensão: ${describe(state.tension, "alguma tensão presente", "clima relativamente tranquilo")}.`,
    `Interações registradas: ${state.interactions}.`,
    `Química narrativa: ${describe(state.chemistry ?? 0, "há química perceptível", "ainda não há química estabelecida")}. Estágio de aproximação: ${state.approachStage ?? "stranger"}.`,
    `Humor atual do personagem: ${state.mood ?? "calm"} (intensidade narrativa ${Math.round(state.moodIntensity ?? 35)}/100). Esse estado é gradual e deve influenciar apenas o tom quando fizer sentido.`,
  ].join("\n");
}
