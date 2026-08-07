# Phase 2 - Inventory & Suppliers

This branch scaffolds Phase 2 for inventory and supplier management. It includes:

- db/migrations/ddl_phase2.sql — DDL for suppliers, purchase orders, PO items, GRNs, stock transfers, stock adjustments, stock_movements ledger, barcode_labels, and hamper_templates.
- supabase/functions/ RPC wrappers: rpc_create_po, rpc_receive_grn, rpc_transfer_stock, rpc_generate_barcode.
- Client skeleton screens: app/(tabs)/suppliers.tsx, app/(tabs)/purchase-orders.tsx, app/(tabs)/grn.tsx.
- components/BarcodeLabel.tsx — simple SVG label renderer for printing.

Next steps
1. Review and run db/migrations/ddl_phase2.sql in staging Supabase. Adjust table/column names if necessary (e.g., products table schema).
2. Deploy the edge functions and set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in their environment.
3. Wire the client screens to the Supabase client and implement detailed UI flows: create PO, send PO to supplier, receive GRN (rpc_receive_grn), and update inventory.
4. Implement label printing: call rpc_generate_barcode to get SVG, render with BarcodeLabel, and print via expo-print.

Priority tasks I will implement next (per your option A):
- Stock movement/history UI and backend integration
- Purchase Order creation & approval UI

If you want I can now:
- Push further commits wiring stock_movement listing to a UI screen
- Implement a basic PO creation form that calls supabase/functions/rpc_create_po

Which would you like me to start with first?