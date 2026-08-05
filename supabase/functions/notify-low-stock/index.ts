// supabase/functions/notify-low-stock/index.ts
// Worker skeleton: process low_stock_events and (for Phase 1) mark processed so clients pick it up via realtime.

import fetch from 'node-fetch';

export default async function handler(req: Request): Promise<Response> {
  try {
    // For hosted Supabase functions you may accept a POST with an event id or process in batches.
    // This skeleton simply returns OK. Implement provider-specific SMS/push in later phases.
    return new Response(JSON.stringify({ ok: true, note: 'notify-low-stock stub' }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
