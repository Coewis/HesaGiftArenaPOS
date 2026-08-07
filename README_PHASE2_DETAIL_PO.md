# Phase 2 - Movement detail and PO creation

This commit implements the movement detail modal (joins product metadata) and a basic Purchase Order creation UI that calls the edge function wrapper for rpc_create_po.

Files added/updated:
- components/MovementDetailModal.tsx
- components/MovementRow.tsx (existing)
- services/poService.ts (new)
- app/(tabs)/inventory-movements.tsx (updated to open detail modal)
- app/(tabs)/purchase-orders.tsx (updated with Create PO flow)

Notes:
- The PO creation UI is intentionally minimal: it accepts a supplier ID and manual item entries (SKU, name, qty, unit cost). In a later pass we can add product lookup, supplier search, and templating.
- The createPO action calls the edge function at SUPABASE_FUNCTIONS_URL/rpc_create_po when SUPABASE_FUNCTIONS_URL is set; otherwise it falls back to calling the Postgres RPC via the Supabase client.
- MovementDetailModal fetches product name/sku/image from the products table; ensure products table uses 'id' and 'imageUrl' fields or adapt accordingly.

Next steps:
- Add product lookup in PO item add form, supplier search/select, and PO detail page.
- Add GRN creation flow that calls rpc_receive_grn and automatically creates stock_movements (we scaffolded rpc_receive_grn earlier).
