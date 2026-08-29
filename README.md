# PersonaChat

Plataforma de chat com personagens de IA, roleplay, memória persistente, relacionamentos e personagens da comunidade.

## Requisitos

- Node.js compatível com a versão usada pelo projeto.
- Uma chave `GEMINI_API_KEY` para geração de respostas.
- Node.js 20.9+ recomendado para desenvolvimento local.

## Instalação

```powershell
npm install
```

Crie `.env.local` a partir de `.env.example` e configure a chave do Gemini. **Nunca publique essa chave nem a coloque em `NEXT_PUBLIC_*`.**

## Beta inicial

Para o primeiro teste com poucas pessoas, use os valores de `.env.example` sem aumentar a capacidade. A configuração padrão limita a capacidade gratuita simultânea a **5 usuários** e o consumo global diário de IA a **250 mil tokens**. Quando a capacidade é atingida, novos usuários autenticados entram em uma fila FIFO e recebem posição/estimativa. No Postgres de produção, o administrador pode alterar o limite pelo painel Admin → Capacidade sem redeploy.

## Desenvolvimento

```powershell
npm run dev
```

Abra `http://localhost:3000`.

## Teste de produção local

```powershell
npm run build
npm run start
```

## Segurança do beta

O administrador pode ser configurado por `PERSONACHAT_ADMIN_EMAILS` enquanto o vínculo por ID permanece opcional. O servidor também recarrega personagens por ID a partir da fonte canônica antes de montar o prompt, evitando que uma ficha adulterada no navegador altere as instruções do personagem.

## Verificação técnica

```powershell
npm audit
npm run test:all
npm run build
```

O projeto só deve ser considerado tecnicamente aprovado quando o audit estiver limpo e build/regressão passarem.

## Documentação

- `PROJECT_STATE.md` — estado funcional atual e decisões que devem ser preservadas.
- `ARCHITECTURE.md` — mapa técnico, responsabilidades, fronteiras e fluxos.
- `docs/history/root-phase-archive/PHASE-*.md` — histórico e detalhes das fases.
- `DEPENDENCY-REMEDIATION.md` — histórico da correção das dependências.
- `docs/history/root-phase-archive/PHASE-36.md` — capacidade, fila gratuita e prioridade Premium.
- `AGENTS.md` / `CLAUDE.md` — orientações de continuidade para ferramentas/assistentes.

## Banco

O SQLite persistente fica, por padrão, em `~/.personachat/personachat.db`. Para mudar o diretório, use `PERSONACHAT_DATA_DIR`.

**Não apague o banco para resolver erros de migração.** As migrações foram projetadas para atualizar bancos existentes de forma compatível.

## Limites importantes

O plano Free/Premium, controle de consumo e cobrança Stripe possuem estrutura server-side. Reports já estão implementados. A fila de capacidade da Fase 36 está implementada e configurável. A Fase 40 conecta o OSINT a um provedor Tavily de forma server-side, com cache, expiração, filtragem, limites de custo e precedência do roleplay.
\n\n## Pré-Beta V17\n- Painel admin: Pausar/Retomar IA (modo emergência), backup manual e auditoria.\n- A pausa é persistida em `data/runtime-control.json`; chats retornam 503 amigável sem chamar o provedor.\n
## v80 Postgres migration

The current production migration phase adds a Postgres destination, a read-only SQLite-to-Postgres migrator, and a server-only Postgres client. The live application is intentionally not switched to Postgres until the dedicated runtime cutover has been tested. See `POSTGRES-CUTOVER.md`.


## v82 chat Postgres cutover

The chat data plane is opt-in via `PERSONACHAT_POSTGRES_CHAT=1`. Before enabling it, apply `supabase/migrations/003_personachat_chat_cutover.sql` and run `npm run db:migrate:chat-postgres` against a test Postgres database. The source SQLite database is copied to a temporary file for schema compatibility adjustments; the original database is not modified or deleted.


## v82.1 Postgres chat migration

Before migrating chat data into Postgres, run `npm run db:migrate:accounts-postgres` against the same test database. The chat migrator now applies migrations 001, 002, and 003 in order, then preflights that every source SQLite user exists in Postgres before writing conversations/messages/memories/alternatives.

Run `npm run db:migrate:chat-postgres` only against a test copy of the SQLite database.

## v85 production cutover

Use `PERSONACHAT_PRODUCTION_POSTGRES=1` only after phases 81–84 have been migrated and verified. In production, the guard requires all four Postgres domain flags plus a database URL and fails closed when any prerequisite is missing.

## Billing

PersonaChat+ is configured at US$14.99/month and US$119.99/year by default. Billing uses Stripe Checkout and the Stripe Customer Portal. Apply `supabase/migrations/006_personachat_billing.sql` when Postgres control-plane mode is enabled. See `PAYMENTS-STRIPE.md`.

## Deploy no Render

Para beta/testes, este projeto está preparado para Render como Web Service. Consulte `RENDER-DEPLOYMENT.md` e `render.yaml`.
