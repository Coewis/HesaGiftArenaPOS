// supabase/functions/rpc_transfer_stock/index.ts
// Edge function: wrapper for rpc_transfer_stock

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'SUPABASE_SERVICE_ROLE_PLACEHOLDER';

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_transfer_stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ p_product_id: body.product_id, p_from: body.from, p_to: body.to, p_qty: body.qty, p_by: body.by })
    });
    const json = await res.json();
    return new Response(JSON.stringify(json), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
