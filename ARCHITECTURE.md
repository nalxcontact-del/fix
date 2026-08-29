# PersonaChat — Arquitetura e Guia de Manutenção

> Documento de referência para qualquer pessoa que precise entender, revisar ou manter o projeto sem depender do histórico das conversas que o geraram.

## 1. Visão geral

PersonaChat é uma aplicação Next.js com React/TypeScript, API server-side e SQLite persistente. A integração com o provedor de IA ocorre exclusivamente no servidor. O provedor atual é Gemini; OSINT usa Tavily exclusivamente no servidor e somente para contas Premium.

```text
Navegador
  │
  ├── UI / estado da sessão
  │
  └── fetch → /api/*
               │
               ├── autenticação / sessão
               ├── validação de origem + limites + rate limit
               ├── regras de negócio
               ├── SQLite
               └── /api/chat → provedor LLM
```

## 2. Mapa de pastas

| Caminho | Responsabilidade |
|---|---|
| `app/page.tsx` | Interface principal, autenticação no cliente, descoberta, perfil, chat e estado da UI. |
| `app/layout.tsx` | Layout raiz e metadados. |
| `app/globals.css` | Estilos globais da aplicação. |
| `app/api/auth/*` | Login, cadastro, sessão e logout. |
| `app/api/chat/route.ts` | Orquestração server-side da geração: validação, contexto, relacionamento, orçamento, LLM, qualidade e registro de uso. |
| `app/api/app-data/route.ts` | Leitura/escrita dos dados normalizados do usuário e compatibilidade com o legado JSON. |
| `app/api/community/route.ts` | Descoberta de bots da comunidade. |
| `app/api/profile/route.ts` | Perfil, username, likes e ações sociais. |
| `app/api/premium/route.ts` | Estado informativo do plano e catálogo de recursos; cobrança ainda não está ativa. |
| `lib/server/db.ts` | Único ponto de inicialização/conexão do SQLite e migrações compatíveis. |
| `lib/server/security.ts` | Hash de senha, sessão criptográfica, limites de corpo, origem e rate limiting. |
| `lib/server/session.ts` | Criação, leitura e destruição de sessões. |
| `lib/server/usage.ts` | Limites de tokens/custo e registro de consumo do LLM. |
| `lib/server/quality.ts` | Inspeção pós-geração para eco, repetição, vazamento e respostas anômalas. |
| `lib/server/evaluation.ts` | Infraestrutura de avaliação futura; não é o caminho principal de geração. |
| `lib/types.ts` | Tipos compartilhados entre cliente e servidor. |
| `lib/memory.ts` | Extração, ranking e conflitos de memória. |
| `lib/relationship.ts` | Estado relacional e contexto qualitativo. |
| `lib/storage.ts` | Cliente para carregar/salvar app-data pela API. |
| `lib/auth.ts` | Cliente para autenticação/sessão e tipo de perfil. |
| `lib/premium.ts` | Tipos mínimos de plano; não implementa cobrança. |
| `characters/index.ts` | Personagens nativos e seus metadados. |
| `scripts/` | Verificações estruturais/regressão. Não contém lógica de produção. |
| `public/` | Imagens e assets públicos. |

## 3. Regras de fronteira

### Cliente

O cliente pode conhecer personagens, estado visual e dados necessários para renderização. Ele **não** pode conhecer `GEMINI_API_KEY`, endpoints privados do provedor ou segredos.

### API

Rotas mutáveis devem, conforme aplicável:

1. aplicar rate limiting;
2. validar origem em produção;
3. limitar o corpo por bytes;
4. validar autenticação/autorização;
5. validar e normalizar campos;
6. somente então alterar o banco ou chamar serviços externos.

### Banco

Código de produção deve usar `getDb()`/`lib/server/db.ts`. A inicialização do banco é responsável por manter bancos antigos compatíveis sem apagar dados.

### LLM

Somente `app/api/chat/route.ts` chama o provedor atualmente. A chave vem de `GEMINI_API_KEY`. Limites de uso são verificados **antes** da chamada; o uso retornado pelo provedor é registrado depois.

OSINT é um recurso Premium: o servidor nunca consulta Tavily para contas Free, inclusive em desenvolvimento. Para personagens `real_person`, o contexto público é pesquisado sob demanda; perguntas explicitamente atuais podem usar a busca avançada, enquanto consultas normais usam a busca básica. Conteúdo externo é tratado como dado não confiável, filtrado por política e nunca armazenado como HTML bruto.

## 4. Fluxo de uma geração

```text
POST /api/chat
   ↓
rate limit + origem + tamanho
   ↓
autenticação
   ↓
sanitização de personagem/histórico/memória
   ↓
carrega relacionamento + plano
   ↓
monta contexto/prompt
   ↓
checkGenerationBudget()
   ↓
Gemini
   ↓
quality gate
   ├── aprovado → resposta
   └── problema → uma nova tentativa, se orçamento permitir
   ↓
recordGeneration()
```

## 5. Banco e migrações

O banco persistente padrão é `~/.personachat/personachat.db`. `PERSONACHAT_DATA_DIR` permite mudar o diretório.

O schema atual possui tabelas normalizadas para:

- `users`
- `sessions`
- `conversations`
- `messages`
- `memories`
- `relationships`
- `user_bots`
- `bot_likes`
- `profile_likes`
- `follows`
- `response_feedback`
- `generation_events`

`app_data` continua como camada de compatibilidade para dados antigos.

As migrações usam `ensureColumn()` e toleram a corrida de dois workers que observam a mesma coluna ausente. **Nunca apagar o banco para resolver uma migração.**

SQLite usa foreign keys e WAL. O `busy_timeout` é configurado antes da inicialização do WAL.

## 6. Dados e identidade

- Usuários recebem `username` público e podem alterá-lo no perfil.
- Bots criados por usuários devem exibir o criador como `@username`.
- Personagens nativos não dependem de uma linha em `user_bots`.
- O plano atual pode ser `free` ou `premium`. PersonaChat+ usa Stripe como único provedor de cobrança nesta versão; checkout e portal são server-side e a confirmação de assinatura depende dos webhooks Stripe.

## 7. Variáveis de ambiente

As principais configurações são documentadas em `.env.example`.

Segredo obrigatório para geração:

```text
GEMINI_API_KEY=...
```

Configurações de modelo e limites podem ser definidas por ambiente. Nunca colocar uma chave real no repositório, em código cliente ou em `NEXT_PUBLIC_*`.

## 8. Comandos de manutenção

```powershell
npm install
npm audit
npm run build
npm run test:all
npm run dev
npm run start
```

Para uma auditoria rápida das dependências:

```powershell
npm run audit:deps
npm run audit:prod
```

## 9. Critério de baseline

Uma alteração só deve ser considerada pronta quando, no ambiente local:

```text
npm audit       → 0 vulnerabilidades relevantes
npm run build   → sucesso
npm run test:all → todos os testes OK
```

Se um desses três falhar, a alteração não deve ser empacotada como concluída.

## 10. Áreas ainda intencionalmente incompletas

- cobrança/checkout do PersonaChat +;
- definição final de preço baseada no consumo real;
- fila de capacidade e prioridade Premium em produção;
- denúncias/reports e moderação operacional completa;
- termos e política de privacidade finais;
- infraestrutura de produção/deploy e observabilidade.

Esses itens não devem ser simulados como se já estivessem implementados.


## Reports e moderação
A rota `app/api/reports/route.ts` recebe denúncias de mensagens, bots e usuários. O banco usa a tabela `reports`, com status e prioridade separados da decisão final. O endpoint administrativo só responde para IDs configurados em `PERSONACHAT_ADMIN_USER_IDS`; essa variável é server-side e não deve ser exposta ao cliente. Denúncias não removem conteúdo automaticamente.

## Políticas
`app/policies/page.tsx` contém a estrutura inicial de Termos de Uso e Privacidade. É material de produto, não parecer jurídico. Antes do lançamento público, a identificação do controlador, retenção, subprocessadores, direitos, idade mínima, propriedade intelectual, jurisdição e demais obrigações devem ser revisados por profissional habilitado.
