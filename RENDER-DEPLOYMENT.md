# PersonaChat — Render deployment

This project is a full Next.js application with server-side API routes. Deploy it on Render as a **Web Service**, not a Static Site.

## Render settings

- Runtime: `Node`
- Plan: `Free` for beta/testing
- Node: `22.22.0`
- Build command: `npm install --no-audit --no-fund && npm run build`
- Start command: `npm start`
- Health check: `/`
- Root directory: repository root

The repository includes `render.yaml` and `.node-version` so these values can be reproduced consistently.

## Environment variables

Configure the values in Render → Environment. The `render.yaml` marks secrets as `sync: false`, so secrets are never committed to Git.

### Required for the current production Postgres cutover

- `DATABASE_POOLER_URL`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PERSONACHAT_PRODUCTION_POSTGRES=1`
- `PERSONACHAT_POSTGRES_ACCOUNTS=1`
- `PERSONACHAT_POSTGRES_CHAT=1`
- `PERSONACHAT_POSTGRES_SOCIAL=1`
- `PERSONACHAT_POSTGRES_CONTROL=1`
- `PERSONACHAT_REQUIRE_POSTGRES=1`
- `GEMINI_API_KEY`

Add Stripe, Google OAuth, Tavily and Upstash variables when those features are enabled.

## Important: do not deploy as a Static Site

The app contains API routes under `app/api`, server-side authentication, Postgres access, Gemini calls and Stripe webhooks. It therefore needs a running Node.js web service.

## GitHub flow

1. Create a GitHub repository.
2. Upload the project files from this package to the repository root.
3. Commit and push to `main`.
4. In Render choose **New → Web Service**.
5. Connect the repository.
6. Keep the build/start commands above, or let Render read `render.yaml`.
7. Add the real environment variable values.
8. Deploy.

Render automatically redeploys the linked branch after subsequent pushes.

## URLs to update after the first deploy

Use the Render URL in:

- `PERSONACHAT_PUBLIC_URL`
- `GOOGLE_REDIRECT_URI` (Google OAuth callback must match the deployed URL)
- Stripe webhook endpoint: `/api/webhooks/stripe`

For example:

`https://YOUR-SERVICE.onrender.com/api/webhooks/stripe`

After the service is stable, add the custom domain in Render and update the public URL/OAuth/Stripe configuration to the final domain.

## Free-plan caveat

Render's free web services sleep after 15 minutes without traffic. The first request after sleeping can therefore take longer. This is acceptable for a test/beta environment, but not ideal for production traffic.

The application should use the configured Postgres data plane for persistent production data. Do not rely on the local SQLite filesystem for production persistence because a free web service can be replaced/restarted.
