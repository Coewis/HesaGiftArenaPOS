// services/inventoryService.ts
// Service layer for stock movements and inventory valuation

import { getSupabaseClient } from '@/template';

export async function listStockMovements({ limit = 50, offset = 0, product, source_type, from, to }:
  { limit?: number; offset?: number; product?: string; source_type?: string; from?: string; to?: string }) {
  const supabase = getSupabaseClient();
  let query = supabase.from('stock_movements').select('id,product_id,source_type,source_id,change,qty_before,qty_after,created_by,created_at').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (product) {
    // allow matching by sku or name via products join
    query = query.eq('product_id', product);
  }
  if (source_type) query = query.eq('source_type', source_type);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count };
}

export async function getMovementById(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('stock_movements').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function inventoryValuation() {
  const supabase = getSupabaseClient();
  // Call RPC
  const { data, error } = await supabase.rpc('rpc_inventory_valuation');
  if (error) throw error;
  return data?.[0]?.total_value ?? 0;
}

export async function exportMovementsCSV({ from, to }: { from?: string; to?: string }) {
  const supabase = getSupabaseClient();
  let query = supabase.from('stock_movements').select('id,product_id,source_type,source_id,change,qty_before,qty_after,created_by,created_at').order('created_at', { ascending: false });
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, error } = await query;
  if (error) throw error;
  // Convert to CSV simple
  const rows = data || [];
  const headers = ['id','product_id','source_type','source_id','change','qty_before','qty_after','created_by','created_at'];
  const csv = [headers.join(',')].concat(rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))).join('\n');
  return csv;
}

export default { listStockMovements, getMovementById, inventoryValuation, exportMovementsCSV };
