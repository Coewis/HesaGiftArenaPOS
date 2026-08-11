// services/notificationService.ts
// Helper to create/read notifications in Supabase

import { getSupabaseClient } from '@/template';

export async function createNotification({ user_id = null, type, reference_type, reference_id = null, message, metadata = {} }:{ user_id?: string | null; type: string; reference_type: string; reference_id?: string | null; message: string; metadata?: any }) {
  const supabase = getSupabaseClient();
  const payload = { user_id, type, reference_type, reference_id, message, metadata, created_at: new Date().toISOString() };
  const { error } = await supabase.from('notifications').insert([payload]);
  if (error) throw error;
  return { ok: true };
}

export async function listNotifications(user_id: string | null = null, limit = 50) {
  const supabase = getSupabaseClient();
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
  if (user_id) q = q.eq('user_id', user_id);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export default { createNotification, listNotifications };
