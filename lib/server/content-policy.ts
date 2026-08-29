export type SafetySignal =
  | "sexual_minor"
  | "nonconsensual_intimate_content"
  | "doxxing"
  | "fraud_or_impersonation"
  | "crime_facilitation"
  | "self_harm_instruction"
  | "none";

const patterns: Array<[SafetySignal, RegExp[]]> = [
  ["sexual_minor", [/(?:menor|criança|crianca|adolescente|underage|minor|child|teen)\b[\s\S]{0,100}\b(?:sexo|sexual|nude|naked|nudes|porn|erotic|erotico|erótica)/i]],
  ["nonconsensual_intimate_content", [/(?:nude|nudes|nudez|sexo|sexual)\b[\s\S]{0,80}\b(?:vazad|leaked|sem consentimento|without consent|revenge porn|deepfake)/i]],
  ["doxxing", [/(?:endereço|endereco|telefone|cpf|rg|documento|senha|password|home address|phone number)\b[\s\S]{0,80}\b(?:de|da|do|for|of|real|pessoa|person)/i]],
  ["fraud_or_impersonation", [/(?:fingir ser|se passar por|impersonat|phishing|golpe|scam)\b/i]],
  ["crime_facilitation", [/(?:como fabricar|como invadir|como roubar|how to hack|how to steal|how to make a bomb)\b/i]],
  ["self_harm_instruction", [/(?:como me matar|como se matar|como cortar|how to kill myself|how to self harm)\b/i]],
];

export function classifySafetySignal(text: string): SafetySignal {
  const clean = String(text ?? "").slice(0, 12000);
  for (const [signal, regexes] of patterns) {
    if (regexes.some((regex) => regex.test(clean))) return signal;
  }
  return "none";
}

export function buildContentSafetyPrompt() {
  return `SEGURANÇA E POLÍTICA DE CONTEÚDO\n- Não sexualize menores nem participe de conteúdo sexual envolvendo menores.\n- Não gere, edite ou facilite conteúdo íntimo não consensual, incluindo deepfakes íntimos de pessoas reais.\n- Não exponha ou ajude a descobrir dados pessoais privados, documentos, credenciais, endereços ou localização de pessoas.\n- Não facilite fraude, impersonação enganosa, invasão, violência real ou instruções para cometer crimes.\n- Não incentive nem forneça instruções para autolesão ou suicídio.\n- Romance, conflito, linguagem adulta, terror e violência claramente ficcionais podem existir quando não caírem nas categorias proibidas e quando forem coerentes com o contexto.\n- Para pessoas reais, deixe a interação claramente no campo da simulação e não apresente ficção como declaração factual sobre a pessoa.\n- O contexto importa: não trate uma menção educativa, jornalística, crítica ou narrativa como se fosse automaticamente um pedido de prática ilícita.`;
}
