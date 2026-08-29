# Admin Analytics & Finance — v88

The admin panel now has three operational layers:

- **Analytics:** 24h/30d active users, tokens/request, cost/user, P95 latency, OSINT cache efficiency, plan/model breakdown, and top-cost users.
- **Finance:** provider cost assumptions, observed Premium variable cost, break-even/potential floor, and a monthly planning calculator for users, Premium share, and price.
- **Recommendations:** server-generated operational advice based on current telemetry, with focus on token efficiency, OSINT cache reuse, latency, and model selection.

## Reference prices used as panel defaults

These are planning defaults only. Environment variables can override the model/provider values.

- Gemini 3.5 Flash: $1.50 / 1M input tokens; $9.00 / 1M output tokens.
- Gemini 3.5 Flash-Lite: $0.30 / 1M input; $2.50 / 1M output.
- Tavily Pay As You Go: $0.008 / credit.
- Supabase Pro baseline: $25/month.
- Upstash Redis Pay As You Go: $0.20 / 100K commands.

Sources: Google Gemini API pricing, Tavily pricing, Supabase pricing, Upstash Redis pricing. These defaults should be rechecked before a commercial launch because providers may change prices.
