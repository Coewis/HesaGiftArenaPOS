// services/approvalService.ts
// Updated: record PO approvals/rejections/comments and create notifications

import { getSupabaseClient } from '@/template';
import { createNotification } from '@/services/notificationService';

export async function approvePO(poId: string, performedBy: string, comment?: string) {
  const supabase = getSupabaseClient();
  const { error: e1 } = await supabase.from('purchase_orders').update({ status: 'approved', approval_state: 'approved', updated_at: new Date().toISOString() }).eq('id', poId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('po_audit').insert([{ purchase_order_id: poId, action: 'approve', performed_by: performedBy, comment, created_at: new Date().toISOString() }]);
  if (e2) throw e2;
  // Create a notification for the user who created the PO (or broadcast)
  try { await createNotification({ user_id: null, type: 'po_approved', reference_type: 'po', reference_id: poId, message: `Purchase order ${poId} approved`, metadata: { by: performedBy } }); } catch (err) { console.warn('create notif failed', err); }
  return { ok: true };
}

export async function rejectPO(poId: string, performedBy: string, comment?: string) {
  const supabase = getSupabaseClient();
  const { error: e1 } = await supabase.from('purchase_orders').update({ status: 'rejected', approval_state: 'rejected', updated_at: new Date().toISOString() }).eq('id', poId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('po_audit').insert([{ purchase_order_id: poId, action: 'reject', performed_by: performedBy, comment, created_at: new Date().toISOString() }]);
  if (e2) throw e2;
  try { await createNotification({ user_id: null, type: 'po_rejected', reference_type: 'po', reference_id: poId, message: `Purchase order ${poId} rejected`, metadata: { by: performedBy } }); } catch (err) { console.warn('create notif failed', err); }
  return { ok: true };
}

export async function addPOComment(poId: string, performedBy: string, comment: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('po_audit').insert([{ purchase_order_id: poId, action: 'comment', performed_by: performedBy, comment, created_at: new Date().toISOString() }]);
  if (error) throw error;
  try { await createNotification({ user_id: null, type: 'po_comment', reference_type: 'po', reference_id: poId, message: `Comment added to PO ${poId}`, metadata: { by: performedBy } }); } catch (err) { console.warn('create notif failed', err); }
  return { ok: true };
}

export default { approvePO, rejectPO, addPOComment };
