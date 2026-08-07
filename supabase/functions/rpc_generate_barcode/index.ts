// supabase/functions/rpc_generate_barcode/index.ts
// Edge function: generate barcode label data (PDF/SVG) for a product

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    // For Phase 2 we return JSON containing label SVG or simple data. Label rendering will be client-side using this data.
    const label = {
      sku: body.sku,
      name: body.name,
      price: body.price,
      svg: `<svg width="400" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><text x="16" y="28" font-size="18" font-family="Arial" fill="#111">${body.name}</text><text x="16" y="52" font-size="14" fill="#333">${body.sku}</text><text x="16" y="76" font-size="16" fill="#B8922E">UGX ${body.price}</text></svg>`
    };
    return new Response(JSON.stringify({ ok: true, label }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
