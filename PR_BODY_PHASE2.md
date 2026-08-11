# PR_BODY_PHASE2.md

Phase 2: Inventory & Suppliers - Product lookup, Supplier search, GRN receive, PO detail, stock movement history

Summary
- Implements Phase 2 core inventory flows: product search & lookup, supplier search, PO create/view, GRN receive flow (rpc_receive_grn), stock movements history and realtime subscription, CSV export, DB indexes and sample seed data for QA.

Files added/changed (high level)
- db/migrations/ddl_phase2.sql (POs, GRNs, stock_movements, etc.)
- db/migrations/ddl_phase2_indexes.sql (indexes)
- db/seed/seed_phase2.sql (sample suppliers/products/movements)
- supabase/functions/* (rpc_create_po, rpc_receive_grn, rpc_transfer_stock, rpc_generate_barcode)
- services: productService.ts, poService.ts, grnService.ts, inventoryService.ts
- components: ProductLookupModal.tsx, SupplierLookupModal.tsx, MovementRow.tsx, MovementDetailModal.tsx, BarcodeLabel.tsx
- screens: app/(tabs)/purchase-orders.tsx (create PO, view PO, receive goods), app/(tabs)/inventory-movements.tsx

Testing & setup checklist
- [ ] Run db/migrations/ddl_phase2.sql against staging Supabase (adapt products table names if different).
- [ ] Run db/migrations/ddl_phase2_indexes.sql to add indexes.
- [ ] (Optional) Run db/seed/seed_phase2.sql to populate sample suppliers and products for QA.
- [ ] Deploy Supabase Edge functions and set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_FUNCTIONS_URL.
- [ ] Start Expo app and validate flows: Product lookup, Supplier lookup, Create PO, View PO, Receive Goods, Inventory Movements realtime and CSV export.

Notes
- Edge functions use service-role keys for RPCs — ensure keys are set in functions env and not exposed to client bundles.
- The product lookup and supplier lookup perform ILIKE search; implement additional server-side search endpoints if scale requires it.

PR Checklist
- [ ] Tests for critical RPCs (rpc_receive_grn) run in staging
- [ ] UI validation for PO -> GRN -> inventory delta
- [ ] Security review for service-role usage and RLS policies
