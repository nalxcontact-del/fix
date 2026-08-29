# Configuração do Gemini

O PersonaChat está preparado para chamar a API Gemini **somente pelo servidor**. A chave nunca é enviada para o navegador.

## 1. Crie o `.env.local`

Na raiz do projeto, no mesmo nível de `package.json`, crie:

```env
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-3.5-flash
GEMINI_MAX_OUTPUT_TOKENS=850
GEMINI_TEMPERATURE=0.82
GEMINI_TOP_P=0.92

# Opcional:
TAVILY_API_KEY=sua_chave_tavily
PERSONACHAT_DATA_DIR=C:/caminho/para/dados/personachat
```

Não use `NEXT_PUBLIC_GEMINI_API_KEY`. Chaves de API devem permanecer no servidor.

## 2. Como o fluxo funciona

O navegador continua chamando:

`POST /api/chat`

A rota do servidor monta o prompt do personagem, memórias, relacionamento, histórico e regras de segurança. Depois `lib/server/gemini.ts` converte o histórico para o formato do Gemini e faz a chamada para `generateContent`.

A chave é enviada no header `x-goog-api-key`.

## 3. Modelo

O modelo fica configurável por `GEMINI_MODEL`, então não é necessário editar código para trocar de modelo.

## 4. Custos e limites

O projeto já possui controle interno de uso, reservas de regeneração e registro de tokens/custos. A resposta do Gemini é convertida para esse sistema usando `usageMetadata`.

Se você mudar o modelo, confira os limites e preços atuais do modelo escolhido antes de liberar o app para usuários.
