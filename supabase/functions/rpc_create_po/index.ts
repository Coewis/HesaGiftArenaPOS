// supabase/functions/rpc_create_po/index.ts
// Edge function: wrapper for rpc_create_po

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'SUPABASE_SERVICE_ROLE_PLACEHOLDER';

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_create_po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ p_supplier_id: body.supplier_id, p_items: body.items, p_reference: body.reference })
    });
    const json = await res.json();
    return new Response(JSON.stringify(json), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
