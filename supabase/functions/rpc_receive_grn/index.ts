// supabase/functions/rpc_receive_grn/index.ts
// Edge function: wrapper for rpc_receive_grn

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'SUPABASE_SERVICE_ROLE_PLACEHOLDER';

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_receive_grn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ p_po_id: body.po_id, p_items: body.items, p_received_by: body.received_by })
    });
    const json = await res.json();
    return new Response(JSON.stringify(json), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
