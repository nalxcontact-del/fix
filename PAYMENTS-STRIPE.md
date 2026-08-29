# PersonaChat+ — Stripe billing

This release uses **Stripe only** for PersonaChat+ billing. Stripe is the only payment provider exposed by the application.

## Stripe

Create two recurring Stripe Prices for PersonaChat+: monthly USD 14.99 and yearly USD 119.99. Put their Price IDs in `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_YEARLY_PRICE_ID`, and configure the webhook endpoint at `/api/webhooks/stripe` for checkout completion and subscription lifecycle updates.

Stripe Checkout is hosted by Stripe. The application creates subscription Checkout Sessions server-side and never exposes `STRIPE_SECRET_KEY` to the browser.

## Webhook

Production webhook URL:

`https://YOUR_DOMAIN/api/webhooks/stripe`

The webhook must send at least:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The server verifies the `Stripe-Signature` header against the raw request body and rejects stale or invalid signatures. Stripe recommends verifying webhook signatures using the endpoint secret and the raw request body. citeturn0search8turn0search12

## Customer management

Stripe subscribers use the hosted Customer Portal for payment-method changes and cancellation. PersonaChat does not implement client-side cancellation authority.

## Server authority

The browser never upgrades a plan. Stripe webhook events update `billing_subscriptions` and `users.plan` on the server. Admin accounts are Premium without payment.

## Environment variables

Required for production:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_MONTHLY_PRICE_ID`
- `STRIPE_YEARLY_PRICE_ID`

Do not prefix these with `NEXT_PUBLIC_`; Next.js only exposes prefixed variables to browser bundles. citeturn0search1turn0search0
