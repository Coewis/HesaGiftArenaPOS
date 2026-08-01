import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const AT_API_KEY = Deno.env.get('AFRICA_TALKING_API_KEY') ?? '';
const AT_USERNAME = Deno.env.get('AFRICA_TALKING_USERNAME') ?? '';

interface SMSPayload {
  phone: string;
  message: string;
  customer_id?: string;
  customer_name?: string;
  message_type: 'receipt' | 'tier_upgrade' | 'promotional' | 'loyalty';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: SMSPayload = await req.json();
    const { phone, message, customer_id, customer_name, message_type } = payload;

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Format phone for Africa's Talking (needs +256 format)
    let formattedPhone = phone.trim().replace(/\s/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+256' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('256') && !formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    let atResult: any = null;
    let status = 'failed';
    let atId: string | null = null;
    let cost: string | null = null;
    let errorMsg: string | null = null;

    // Send via Africa's Talking API
    if (AT_API_KEY && AT_USERNAME) {
      try {
        const atBody = new URLSearchParams({
          username: AT_USERNAME,
          to: formattedPhone,
          message: message,
          from: 'HesaGift',
        });

        const atRes = await fetch('https://api.africastalking.com/version1/messaging', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'apiKey': AT_API_KEY,
          },
          body: atBody.toString(),
        });

        atResult = await atRes.json();

        const recipient = atResult?.SMSMessageData?.Recipients?.[0];
        if (recipient?.status === 'Success' || recipient?.statusCode === '101') {
          status = 'sent';
          atId = recipient.messageId || null;
          cost = recipient.cost || null;
        } else {
          errorMsg = recipient?.status || 'SMS delivery failed';
        }
      } catch (err) {
        errorMsg = `Africa's Talking: ${String(err)}`;
      }
    } else {
      // Sandbox mode — log but mark as sent for testing
      console.log(`[SMS SANDBOX] To: ${formattedPhone} | Type: ${message_type} | Message: ${message}`);
      status = 'sent';
      atId = `sandbox_${Date.now()}`;
    }

    // Log to pos_sms_log
    const logId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await fetch(`${supabaseUrl}/rest/v1/pos_sms_log`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: logId,
        customer_id: customer_id || null,
        customer_name: customer_name || null,
        phone: formattedPhone,
        message_type,
        message,
        status,
        africa_talking_id: atId,
        cost,
        error_msg: errorMsg,
        sent_at: new Date().toISOString(),
      }),
    });

    return new Response(JSON.stringify({
      success: status === 'sent',
      status,
      at_result: atResult,
      log_id: logId,
      error: errorMsg,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-sms error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
