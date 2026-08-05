// supabase/functions/flutterwave-webhook/index.ts
// Minimal webhook skeleton to validate and record incoming payment events.

// Environment variables: FLUTTERWAVE_SECRET_KEY_TEST, SUPABASE_SERVICE_ROLE_KEY

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // TODO: validate signature / event authenticity per Flutterwave docs
    // For now we accept the body and insert/update payments via Supabase REST or directly using service role key.

    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'SUPABASE_SERVICE_ROLE_PLACEHOLDER';

    // Example: upsert into payments table based on provider_reference/tx_ref
    const payment = {
      provider: 'flutterwave',
      provider_reference: body.data?.id || null,
      provider_payload: body,
      status: body.data?.status || 'unknown'
    };

    await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`
      },
      body: JSON.stringify(payment)
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
