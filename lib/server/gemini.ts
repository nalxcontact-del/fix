import type { Message } from "@/lib/types";

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string };
};

function toGeminiContents(history: Message[], userMessage?: string): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const message of history) {
    const text = String(message.text ?? "").trim();
    if (!text) continue;

    const role = message.sender === "user" ? "user" : "model";
    const previous = contents[contents.length - 1];

    // Gemini expects a clean alternating conversation. Merge consecutive
    // messages of the same role instead of sending invalid role sequences.
    if (previous?.role === role) {
      previous.parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (userMessage?.trim()) {
    const previous = contents[contents.length - 1];
    if (previous?.role === "user") {
      previous.parts.push({ text: userMessage.trim() });
    } else {
      contents.push({ role: "user", parts: [{ text: userMessage.trim() }] });
    }
  }

  // generateContent requires contents to contain at least one user turn.
  if (!contents.length) {
    contents.push({ role: "user", parts: [{ text: "Continue the conversation." }] });
  }

  return contents;
}

export function estimateGeminiRequestText(systemInstruction: string, history: Message[], userMessage?: string) {
  return JSON.stringify({
    systemInstruction,
    contents: toGeminiContents(history, userMessage),
  });
}

export async function requestGemini(options: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  history: Message[];
  userMessage?: string;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  responseSchema?: unknown;
}): Promise<{ response: Response; data: GeminiResponse }> {
  const model = options.model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: options.systemInstruction }],
    },
    contents: toGeminiContents(options.history, options.userMessage),
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      ...(options.responseSchema ? { responseMimeType: "application/json", responseSchema: options.responseSchema } : {}),
    },
  });

  // Gemini can temporarily return 503/429 during capacity spikes. Retry a small,
  // bounded number of times so transient provider pressure does not become a
  // user-visible chat failure. Do not retry authentication/validation errors.
  const retryDelaysMs = [1000, 2000];
  const legacyTransientStatuses = [429, 503];
  const retryableStatuses = new Set([408, 500, 502, 504, ...legacyTransientStatuses]);
  let response: Response | null = null;
  let data = {} as GeminiResponse;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": options.apiKey,
      },
      body: requestBody,
    });
    data = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (response.ok || !retryableStatuses.has(response.status) || attempt === retryDelaysMs.length) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const serverDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(10_000, retryAfter * 1000) : 0;
    const jitter = Math.floor(Math.random() * 180);
    await new Promise(resolve => setTimeout(resolve, Math.max(retryDelaysMs[attempt], serverDelay) + jitter));
  }

  return { response: response!, data };
}

export function extractGeminiText(data: GeminiResponse): string {
  return (data.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => String(part.text ?? ""))
    .join("")
    .trim();
}

export function geminiUsage(data: GeminiResponse) {
  return {
    prompt_tokens: Number(data.usageMetadata?.promptTokenCount ?? 0),
    completion_tokens: Number(data.usageMetadata?.candidatesTokenCount ?? 0),
    total_tokens: Number(data.usageMetadata?.totalTokenCount ?? 0),
  };
}
