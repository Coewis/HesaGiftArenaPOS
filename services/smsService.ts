import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface SMSLog {
  id: string;
  customer_id?: string;
  customer_name?: string;
  phone: string;
  message_type: 'receipt' | 'tier_upgrade' | 'promotional' | 'loyalty';
  message: string;
  status: 'sent' | 'failed' | 'pending';
  africa_talking_id?: string;
  cost?: string;
  error_msg?: string;
  sent_at: string;
}

const db = getSupabaseClient();

async function invokeEdgeSMS(payload: {
  phone: string;
  message: string;
  customer_id?: string;
  customer_name?: string;
  message_type: SMSLog['message_type'];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await db.functions.invoke('send-sms', { body: payload });
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = await error.context?.text() || msg; } catch {}
      }
      return { success: false, error: msg };
    }
    return { success: (data as any)?.success ?? false, error: (data as any)?.error };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Send receipt SMS after a completed sale */
export async function sendReceiptSMS(params: {
  phone: string;
  customerName: string;
  customerId?: string;
  receiptNo: string;
  total: number;
  items: Array<{ name: string; qty: number }>;
  branchName: string;
}): Promise<{ success: boolean; error?: string }> {
  const itemsSummary = params.items.slice(0, 3).map(i => `${i.name}×${i.qty}`).join(', ') +
    (params.items.length > 3 ? ` +${params.items.length - 3} more` : '');

  const message =
    `Dear ${params.customerName}, your purchase at HESA GIFT ARENA (${params.branchName}) is confirmed!\n` +
    `Receipt: ${params.receiptNo}\n` +
    `Items: ${itemsSummary}\n` +
    `Total: UGX ${params.total.toLocaleString()}\n` +
    `Thank you for shopping with us! 🎁`;

  return invokeEdgeSMS({
    phone: params.phone,
    message,
    customer_id: params.customerId,
    customer_name: params.customerName,
    message_type: 'receipt',
  });
}

/** Send tier upgrade SMS */
export async function sendTierUpgradeSMS(params: {
  phone: string;
  customerName: string;
  customerId?: string;
  newTier: string;
  loyaltyPoints: number;
}): Promise<{ success: boolean; error?: string }> {
  const tierEmojis: Record<string, string> = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Platinum: '💎' };
  const emoji = tierEmojis[params.newTier] || '⭐';

  const message =
    `Congratulations ${params.customerName}! ${emoji}\n` +
    `You've been upgraded to ${params.newTier.toUpperCase()} tier at HESA GIFT ARENA!\n` +
    `Current points: ${params.loyaltyPoints.toLocaleString()}\n` +
    `Visit us to enjoy exclusive ${params.newTier} member benefits!`;

  return invokeEdgeSMS({
    phone: params.phone,
    message,
    customer_id: params.customerId,
    customer_name: params.customerName,
    message_type: 'tier_upgrade',
  });
}

/** Send promotional campaign SMS to multiple customers */
export async function sendBulkPromotionalSMS(params: {
  recipients: Array<{ phone: string; name: string; id?: string }>;
  campaignMessage: string;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipient of params.recipients) {
    const personalizedMsg = params.campaignMessage
      .replace('{name}', recipient.name)
      .replace('{NAME}', recipient.name.toUpperCase());

    const result = await invokeEdgeSMS({
      phone: recipient.phone,
      message: personalizedMsg,
      customer_id: recipient.id,
      customer_name: recipient.name,
      message_type: 'promotional',
    });

    if (result.success) { sent++; }
    else { failed++; if (result.error) errors.push(`${recipient.name}: ${result.error}`); }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return { sent, failed, errors };
}

/** Fetch SMS history from database */
export async function fetchSMSLogs(limit = 50): Promise<SMSLog[]> {
  const { data, error } = await db
    .from('pos_sms_log')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SMSLog[];
}

/** Fetch SMS logs for a specific customer */
export async function fetchCustomerSMSLogs(customerId: string): Promise<SMSLog[]> {
  const { data, error } = await db
    .from('pos_sms_log')
    .select('*')
    .eq('customer_id', customerId)
    .order('sent_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as SMSLog[];
}
