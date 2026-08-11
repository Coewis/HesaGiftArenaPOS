// services/productService.ts
// Product lookup utilities for PO item selection and fast search

import { getSupabaseClient } from '@/template';

export async function searchProducts(term: string, limit = 50) {
  const supabase = getSupabaseClient();
  const q = `%${term}%`;
  const { data, error } = await supabase.from('products').select('id,sku,name,price,quantity,imageUrl').or(`name.ilike.${q},sku.ilike.${q}`).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getProductById(id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('products').select('id,sku,name,price,quantity,imageUrl').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export default { searchProducts, getProductById };
