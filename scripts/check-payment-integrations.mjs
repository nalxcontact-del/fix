import { readFileSync, existsSync } from "node:fs";
const root = process.cwd();
const premium = readFileSync(`${root}/app/api/premium/route.ts`, "utf8");
const stripe = readFileSync(`${root}/lib/server/stripe.ts`, "utf8");
const stripeWebhook = readFileSync(`${root}/app/api/webhooks/stripe/route.ts`, "utf8");
const paymentsDoc = readFileSync(`${root}/PAYMENTS-STRIPE.md`, "utf8");
const env = readFileSync(`${root}/.env.example`, "utf8");
const checks = [
  ["Stripe checkout is server-side", premium.includes("createCheckoutSession") && stripe.includes("Authorization:`Bearer ${getKey()}`")],
  ["Stripe monthly and yearly prices are required", premium.includes('stripeConfiguredCycle(body.billing)')],
  ["Stripe webhook verifies signature", stripe.includes("constructStripeEvent") && stripe.includes("timingSafeEqual") && stripeWebhook.includes("stripe-signature")],
  ["Stripe webhook handles checkout completion", stripeWebhook.includes('event.type === "checkout.session.completed"')],
  ["Stripe webhook handles subscription lifecycle", stripeWebhook.includes('customer.subscription.updated') && stripeWebhook.includes('customer.subscription.deleted')],
  ["Stripe has customer portal", stripe.includes("createPortalSession") && premium.includes('action === "manage"')],
  ["Only Stripe is exposed by the billing API", !premium.includes("mercadopago") && !premium.includes("Mercado Pago")],
  ["Legacy payment-provider source files are removed", !existsSync(`${root}/lib/server/mercadopago.ts`) && !existsSync(`${root}/app/api/webhooks/mercadopago/route.ts`)],
  ["Legacy payment-provider environment variables are absent", !/MERCADOPAGO|BILLING_MERCADOPAGO/.test(env)],
  ["Only Stripe is documented as configured", !premium.includes("paddle") && paymentsDoc.includes("Stripe is the only payment provider")],
];
let ok=0;
for (const [name, pass] of checks) { console.log(`${pass ? "PASS":"FAIL"} — ${name}`); if(pass) ok++; }
console.log(`Stripe-only payment checks: ${ok}/${checks.length} OK`);
if(ok!==checks.length) process.exit(1);
