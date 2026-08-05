# Phase 1 - HESA Gift Arena POS

This PR branch contains Phase 1 scaffolding for the HESA Gift Arena POS feature work: branding placeholders, payment function stubs (Flutterwave), low-stock event support, a local SQLite queue/cache, barcode scanner component, and DB migration stubs.

What is included
- db/migrations/ddl_phase1.sql — SQL to add payments, stock_movements, low_stock_events and an rpc_decrement_inventory function.
- supabase/functions/create-payment-session — Edge function stub that creates a Flutterwave payment session (uses placeholder keys).
- supabase/functions/flutterwave-webhook — Webhook skeleton for recording payments.
- supabase/functions/notify-low-stock — Worker stub for low-stock processing.
- services/posService.ts — Client-side service scaffolding to call the edge function and record payments locally.
- services/offlineQueueSqlite.ts — Persistent offline queue backed by Expo SQLite.
- hooks/useLocalCache.ts — Lightweight product cache and search API backed by SQLite.
- components/BarcodeScanner.tsx — Expo barcode scanner wrapper component.
- constants/Colors.ts and constants/theme.ts — HESA color palette placeholders.

What I did NOT change
- I did not modify core POS screens (app/(tabs)/pos.tsx) in this initial commit to avoid breaking behavior. The next PR will wire the scanner, payments call, and cache into the POS UI.

Next steps (post-merge)
1. Add environment variables to Supabase / deployment environment:
   - FLUTTERWAVE_SECRET_KEY_TEST
   - FLUTTERWAVE_PUBLIC_KEY_TEST
   - SUPABASE_SERVICE_ROLE_KEY
   - SUPABASE_URL
   - SUPABASE_FUNCTIONS_URL
2. Run the migration db/migrations/ddl_phase1.sql against your Supabase Postgres (or adapt to your migration tooling).
3. Deploy Supabase Edge functions (create-payment-session, flutterwave-webhook, notify-low-stock) and set secrets.
4. Provide branding assets (logo/splash) so I can update app.json and the app layout.
5. I will follow up by wiring the POS screen to use BarcodeScanner, useLocalCache, offline queue, and createPaymentSession flow.

How to test locally
- Expo (mobile): use Expo CLI. Make sure you have expo-sqlite available.
- Supabase functions: deploy to a dev Supabase project and set the env vars to test keys.

If you want I can now open a PR with these files and a checklist for reviewers. Otherwise I will continue wiring the POS UI in the same branch.
