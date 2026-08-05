// services/posService.ts
// POS service scaffolding for payments and local ledger. This file is intentionally conservative and non-invasive.

import { Platform } from 'react-native';

const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || '';

export async function createPaymentSession({ amount, currency = 'UGX', customer, redirect_url }: { amount: number; currency?: string; customer?: any; redirect_url?: string }) {
  // Call Supabase Edge Function which will create Flutterwave session
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-payment-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency, customer, redirect_url })
  });
  return res.json();
}

export async function recordLocalPayment(orderId: string, amount: number, method: string, metadata: any = {}) {
  // Record a local pending payment object; actual persistence should go to Supabase.
  // This function is a placeholder — the app should call supabase client to insert into payments table.
  return { ok: true, orderId, amount, method, metadata };
}

export async function confirmPayment(providerReference: string) {
  // Confirm a payment (called after webhook or polling). Implement as needed.
  return { ok: true, providerReference };
}

export default {
  createPaymentSession,
  recordLocalPayment,
  confirmPayment
};
