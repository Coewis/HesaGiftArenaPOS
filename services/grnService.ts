// services/grnService.ts
// Client-side wrapper to call rpc_receive_grn via edge function or Supabase RPC

import { getSupabaseClient } from '@/template';

const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || '';

export async function receiveGRN({ po_id, items, received_by }: { po_id: string; items: any[]; received_by: string }) {
  if (FUNCTIONS_URL) {
    const res = await fetch(`${FUNCTIONS_URL}/rpc_receive_grn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ po_id, items, received_by })
    });
    const json = await res.json();
    return json;
  }
  // Fallback to direct RPC (requires service-role or RPC permission)
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('rpc_receive_grn', { p_po_id: po_id, p_items: items, p_received_by: received_by });
  if (error) throw error;
  return data;
}

export default { receiveGRN };
