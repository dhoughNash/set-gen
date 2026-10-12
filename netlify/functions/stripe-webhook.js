const Stripe = require('stripe');

// client_reference_id comes from the checkout link, so it is untrusted. It must be a real
// UUID before it is used in a database URL.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Only Set Gen's own prices count here ($3.99/mo and $29.99/yr).
const SET_GEN_PRICES = new Set([
  'price_1U2GNxRru8MEHEIAbh36WqnR',
  'price_1U2GOiRru8MEHEIAWs9AcQr6',
]);
const isSetGenSub = sub => (sub.items?.data || []).some(i => SET_GEN_PRICES.has(i.price?.id));

async function patchSubscription(filter, fields) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscriptions?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'setgen',
      'Accept-Profile': 'setgen',
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
      const session = stripeEvent.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      if (!userId || !UUID_RE.test(userId)) break;
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      if (!items.data.some(i => SET_GEN_PRICES.has(i.price?.id))) break;
      await patchSubscription(`user_id=eq.${userId}`, {
        status: 'active',
        stripe_customer_id: customerId,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = stripeEvent.data.object;
      if (!isSetGenSub(sub)) break;
      let status = 'free';
      if (['active', 'trialing'].includes(sub.status)) status = 'active';
      else if (['past_due', 'unpaid'].includes(sub.status)) status = 'past_due';
      else if (['canceled', 'incomplete_expired'].includes(sub.status)) status = 'cancelled';
      await patchSubscription(`stripe_customer_id=eq.${encodeURIComponent(sub.customer)}`, { status });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = stripeEvent.data.object;
      if (!isSetGenSub(sub)) break;
      await patchSubscription(`stripe_customer_id=eq.${encodeURIComponent(sub.customer)}`, { status: 'cancelled' });
      break;
    }

    default:
      break;
  }

  return { statusCode: 200, body: 'OK' };
};
