// services/approvalService.ts
// Simple client wrapper to record PO approvals and audit entries

import { getSupabaseClient } from '@/template';

export async function approvePO(poId: string, performedBy: string, comment?: string) {
  const supabase = getSupabaseClient();
  // Update PO status/approval_state
  const { error: e1 } = await supabase.from('purchase_orders').update({ status: 'approved', approval_state: 'approved', updated_at: new Date().toISOString() }).eq('id', poId);
  if (e1) throw e1;
  // Insert audit
  const { error: e2 } = await supabase.from('po_audit').insert([{ purchase_order_id: poId, action: 'approve', performed_by: performedBy, comment, created_at: new Date().toISOString() }]);
  if (e2) throw e2;
  return { ok: true };
}

export async function rejectPO(poId: string, performedBy: string, comment?: string) {
  const supabase = getSupabaseClient();
  const { error: e1 } = await supabase.from('purchase_orders').update({ status: 'rejected', approval_state: 'rejected', updated_at: new Date().toISOString() }).eq('id', poId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('po_audit').insert([{ purchase_order_id: poId, action: 'reject', performed_by: performedBy, comment, created_at: new Date().toISOString() }]);
  if (e2) throw e2;
  return { ok: true };
}

export async function addPOComment(poId: string, performedBy: string, comment: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('po_audit').insert([{ purchase_order_id: poId, action: 'comment', performed_by: performedBy, comment, created_at: new Date().toISOString() }]);
  if (error) throw error;
  return { ok: true };
}

export default { approvePO, rejectPO, addPOComment };
