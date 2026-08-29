# Free vs Premium — product contract

## Free

Free remains a useful daily product. It keeps normal conversations, basic memory, a moderate daily/monthly token budget, limited regenerations and normal capacity priority.

Current default server limits:
- 50,000 tokens/day
- 500,000 tokens/month
- 4 regenerations/hour
- 12 regenerations/day
- no live OSINT for real-person characters

The user-facing UI should describe these as messages, memory and research limits rather than raw tokens.

## Premium — PersonaChat+

PersonaChat+ is US$14.99/month or US$119.99/year by default. Premium gets expanded memory/context, higher message/token limits, more regenerations, queue priority, advanced character controls when available, and live public context/deep OSINT for real-person characters.

## Admin

Configured administrators are automatically treated as Premium by the server and never need to pay.

## Billing principle

The frontend is not the authority for access. Server-side user plan and admin status determine entitlement. Stripe Checkout is used for recurring subscriptions. Stripe is the only payment provider exposed by this release; cancellation and payment-method management use the hosted Stripe Customer Portal.
