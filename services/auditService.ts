import { getSupabaseClient } from '@/template';

export interface AuditLog {
  id: string;
  action_type: string;
  user_id: string;
  user_name: string;
  user_role: string;
  branch_id: string;
  branch_name: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  details: Record<string, any>;
  amount?: number;
  timestamp: string;
}

const db = () => getSupabaseClient();

export async function logAction(params: {
  action_type: string;
  user_id: string;
  user_name: string;
  user_role: string;
  branch_id: string;
  branch_name: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  details?: Record<string, any>;
  amount?: number;
}): Promise<void> {
  try {
    await db().from('pos_audit_logs').insert({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action_type: params.action_type,
      user_id: params.user_id,
      user_name: params.user_name,
      user_role: params.user_role,
      branch_id: params.branch_id,
      branch_name: params.branch_name,
      entity_type: params.entity_type || null,
      entity_id: params.entity_id || null,
      entity_name: params.entity_name || null,
      details: params.details || {},
      amount: params.amount || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Non-blocking — never throw from audit logging
    console.log('Audit log error:', err);
  }
}

export async function fetchAuditLogs(filters?: {
  user_id?: string;
  action_type?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  let query = db().from('pos_audit_logs').select('*').order('timestamp', { ascending: false });

  if (filters?.user_id && filters.user_id !== 'all') {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters?.action_type && filters.action_type !== 'all') {
    query = query.eq('action_type', filters.action_type);
  }
  if (filters?.branch_id && filters.branch_id !== 'all') {
    query = query.eq('branch_id', filters.branch_id);
  }
  if (filters?.date_from) {
    query = query.gte('timestamp', filters.date_from);
  }
  if (filters?.date_to) {
    query = query.lte('timestamp', filters.date_to + 'T23:59:59Z');
  }

  query = query.limit(filters?.limit || 200);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as AuditLog[];
}

export async function fetchAuditStaffList(): Promise<Array<{ id: string; name: string; role: string }>> {
  const { data, error } = await db()
    .from('pos_audit_logs')
    .select('user_id, user_name, user_role')
    .order('timestamp', { ascending: false });
  if (error) return [];

  const seen = new Set<string>();
  const result: Array<{ id: string; name: string; role: string }> = [];
  for (const row of data || []) {
    if (!seen.has(row.user_id)) {
      seen.add(row.user_id);
      result.push({ id: row.user_id, name: row.user_name, role: row.user_role });
    }
  }
  return result;
}
