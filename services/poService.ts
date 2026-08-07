// services/poService.ts
// Client-side PO service that calls the edge function wrapper for rpc_create_po

import { getSupabaseClient } from '@/template';

const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || '';

export async function createPO({ supplier_id, items, reference }: { supplier_id: string; items: any[]; reference?: string }) {
  // Prefer calling the project's edge function endpoint if available
  if (FUNCTIONS_URL) {
    const res = await fetch(`${FUNCTIONS_URL}/rpc_create_po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id, items, reference })
    });
    const json = await res.json();
    return json;
  }
  // Fallback: use Supabase client to call RPC directly (requires anon/public permission for RPC)
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('rpc_create_po', { p_supplier_id: supplier_id, p_items: items, p_reference: reference });
  if (error) throw error;
  return data;
}

export default { createPO };
