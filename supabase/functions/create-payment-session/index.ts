// supabase/functions/create-payment-session/index.ts
// Edge function stub: create a Flutterwave payment session and return a checkout URL.

// This function expects environment variables:
// FLUTTERWAVE_SECRET_KEY_TEST, FLUTTERWAVE_PUBLIC_KEY_TEST, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { amount, currency = 'UGX', tx_ref, customer } = body;

    const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY_TEST || 'FLW_SECRET_PLACEHOLDER';

    // Build payload for Flutterwave v3 Payments
    const payload = {
      tx_ref: tx_ref || `hesa_${Date.now()}`,
      amount: String(amount),
      currency,
      redirect_url: body.redirect_url || '',
      customer: customer || { email: 'guest@example.com', phonenumber: '', name: 'Guest' },
      meta: body.meta || {},
      payment_options: 'card,ussd,account,banktransfer,mobilemoneyuganda'
    };

    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FLW_SECRET}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'flutterwave_error', detail: json }), { status: 502 });
    }

    // Typical response contains data.link for checkout
    return new Response(JSON.stringify({ success: true, data: json }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500 });
  }
}
