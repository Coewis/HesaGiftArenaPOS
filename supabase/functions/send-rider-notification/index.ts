import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const FIREBASE_SERVER_KEY = Deno.env.get('FIREBASE_SERVER_KEY') ?? '';

interface NotificationPayload {
  rider_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  notification_type: 'delivery_assigned' | 'order_updated' | 'delivery_failed' | 'general';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { rider_id, title, body, data, notification_type } = payload;

    if (!rider_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'rider_id, title, and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch rider FCM tokens from Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const tokensRes = await fetch(
      `${supabaseUrl}/rest/v1/pos_rider_fcm_tokens?rider_id=eq.${rider_id}&select=fcm_token`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const tokens: { fcm_token: string }[] = await tokensRes.json();

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'No FCM tokens found for rider' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send FCM notification to all rider tokens
    const fcmPayload = {
      registration_ids: tokens.map(t => t.fcm_token),
      notification: { title, body, sound: 'default', android_channel_id: 'rider_notifications' },
      data: {
        notification_type,
        rider_id,
        ...data,
      },
      priority: 'high',
      android: {
        priority: 'high',
        notification: {
          channel_id: 'rider_notifications',
          notification_priority: 'PRIORITY_MAX',
          sound: 'default',
          icon: 'notification_icon',
          color: '#22C55E',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FIREBASE_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
    });

    const fcmResult = await fcmRes.json();

    if (!fcmRes.ok) {
      console.error('FCM Error:', JSON.stringify(fcmResult));
      return new Response(JSON.stringify({ error: `FCM: ${fcmResult.error || 'Unknown FCM error'}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`FCM sent to ${tokens.length} token(s) for rider ${rider_id}:`, JSON.stringify(fcmResult));

    return new Response(JSON.stringify({
      success: true,
      tokens_sent: tokens.length,
      fcm_result: fcmResult,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-rider-notification error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
