import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";
function secretKey() { const key = String(process.env.STRIPE_SECRET_KEY || "").trim(); return key || null; }
function getKey() { const key = secretKey(); if (!key) throw new Error("STRIPE_NOT_CONFIGURED"); return key; }
export function isStripeConfigured() { return !!secretKey(); }
export function stripeWebhookSecret() { return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(); }
export function stripePriceId(cycle: "monthly" | "yearly") { return String(cycle === "monthly" ? process.env.STRIPE_MONTHLY_PRICE_ID || "" : process.env.STRIPE_YEARLY_PRICE_ID || "").trim() || null; }
export function stripeConfiguredCycle(cycle: "monthly" | "yearly") { return !!stripePriceId(cycle); }

function encodeForm(input: Record<string,string|string[]|number|undefined|null>) {
  const body = new URLSearchParams();
  for (const [key,value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) body.append(key, item);
    else body.set(key, String(value));
  }
  return body;
}

async function stripeFetch(path:string, init:RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization:`Bearer ${getKey()}`, ...(init.headers || {}) }, cache:"no-store" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(String(data?.error?.message || data?.message || `STRIPE_${response.status}`));
  return data;
}

export async function createCheckoutSession(input:{userId:string;email:string;billing:"monthly"|"yearly";successUrl:string;cancelUrl:string}) {
  const price = stripePriceId(input.billing); if (!price) throw new Error(`STRIPE_${input.billing.toUpperCase()}_PRICE_NOT_CONFIGURED`);
  const form = encodeForm({
    mode:"subscription",
    "line_items[0][price]":price,
    "line_items[0][quantity]":1,
    customer_email:input.email,
    client_reference_id:input.userId,
    success_url:input.successUrl,
    cancel_url:input.cancelUrl,
    locale:"auto",
    allow_promotion_codes:"true",
    "metadata[userId]":input.userId,
    "metadata[billing]":input.billing,
    "subscription_data[metadata][userId]":input.userId,
    "subscription_data[metadata][billing]":input.billing,
  });
  return await stripeFetch("/checkout/sessions", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:form.toString() }) as { id?:string; url?:string; subscription?:string; customer?:string };
}

export async function createPortalSession(customerId:string, returnUrl:string) {
  const form = encodeForm({ customer:customerId, return_url:returnUrl });
  return await stripeFetch("/billing_portal/sessions", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:form.toString() }) as { url?:string };
}

export async function retrieveSubscription(id:string) { return await stripeFetch(`/subscriptions/${encodeURIComponent(id)}`) as any; }

export function constructStripeEvent(rawBody:string, signature:string) {
  const secret = stripeWebhookSecret(); if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED");
  const parts = signature.split(",").map((part) => part.trim().split("=",2)).filter(([k,v]) => k && v);
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1] || 0);
  const versions = parts.filter(([k]) => k === "v1").map(([,v]) => v);
  if (!timestamp || !versions.length) throw new Error("INVALID_STRIPE_SIGNATURE");
  if (Math.abs(Date.now()/1000 - timestamp) > 300) throw new Error("STRIPE_SIGNATURE_EXPIRED");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const ok = versions.some((value) => { const a=Buffer.from(expected,"utf8"), b=Buffer.from(value,"utf8"); return a.length === b.length && timingSafeEqual(a,b); });
  if (!ok) throw new Error("INVALID_STRIPE_SIGNATURE");
  return JSON.parse(rawBody) as { id:string; type:string; data:{object:unknown} };
}
