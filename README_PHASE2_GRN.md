# Phase 2 - GRN receive flow and PO detail

This update implements the Goods Received Note (GRN) receive flow and PO detail modal:

- services/grnService.ts — wrapper that calls rpc_receive_grn (edge function or direct RPC) to create a GRN and update inventory atomically.
- app/(tabs)/purchase-orders.tsx — updated PO list with View action; PO Detail modal shows items and provides a Receive Goods action that opens a receive modal where received quantities are entered and submitted.

Behavior
- When receiving, the client builds a payload of items with product_id, qty, unit_cost, sku, name and calls receiveGRN. The RPC will create grn, grn_items, update products.quantity, and insert stock_movements as per ddl_phase2.sql.
- After successful receive, the UI reloads the PO list.

Testing
- Ensure db/migrations/ddl_phase2.sql is applied and rpc_receive_grn exists (deployed via supabase functions or available via RPC).
- Create a PO (via UI or RPC), then open it and use Receive Goods to submit received quantities. Verify products quantities increase and stock_movements rows are created.
