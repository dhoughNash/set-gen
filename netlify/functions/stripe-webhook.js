// netlify/functions/stripe-webhook.js
//
// Receives Stripe (Managed Payments) subscription events and updates the
// matching Supabase user's subscription status. This replaces the earlier
// lemon-webhook.js — that file can be deleted/ignored.
//
// Required Netlify environment variables:
//   STRIPE_SECRET_KEY        — Stripe Dashboard → Developers → API keys (secret key)
//   STRIPE_WEBHOOK_SECRET    — shown when you create the webhook endpoint (Step 4 below)
//   SUPABASE_URL             — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase → Project Settings → API (service_role, secret)
//
// Also add "stripe" as a dependency: run `npm install stripe` in the same
// directory as your netlify/functions folder (or repo root, if that's where
// your package.json lives) before deploying.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function patchSubscription(filter, fields) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscriptions?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    console.error('Supabase update failed:', res.status, await res.text());
  }
}

exports.handler = async function (event) {
  const signature = event.headers['stripe-signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      // Fired once, right after a successful Payment Link checkout.
      const session = stripeEvent.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      if (!userId) break; // shouldn't happen if the Payment Link URL always includes it
      await patchSubscription(`user_id=eq.${userId}`, {
        status: 'active',
        stripe_customer_id: customerId,
      });
      break;
    }

    case 'customer.subscription.updated': {
      // Fired on renewals, plan changes, payment failures, etc.
      const sub = stripeEvent.data.object;
      let status = 'free';
      if (['active', 'trialing'].includes(sub.status)) status = 'active';
      else if (['past_due', 'unpaid'].includes(sub.status)) status = 'past_due';
      else if (['canceled', 'incomplete_expired'].includes(sub.status)) status = 'cancelled';
      await patchSubscription(`stripe_customer_id=eq.${sub.customer}`, { status });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = stripeEvent.data.object;
      await patchSubscription(`stripe_customer_id=eq.${sub.customer}`, { status: 'cancelled' });
      break;
    }

    default:
      // Unhandled event type — acknowledge and ignore.
      break;
  }

  return { statusCode: 200, body: 'OK' };
};
