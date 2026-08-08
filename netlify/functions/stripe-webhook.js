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
      const session = stripeEvent.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      if (!userId) break;
      await patchSubscription(`user_id=eq.${userId}`, {
        status: 'active',
        stripe_customer_id: customerId,
      });
      break;
    }

    case 'customer.subscription.updated': {
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
      break;
  }

  return { statusCode: 200, body: 'OK' };
};
