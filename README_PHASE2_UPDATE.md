# Phase 2 Update: Stock Movements UI

This commit adds the Stock Movement / History UI and supporting services/hooks:

- services/inventoryService.ts — listStockMovements, getMovementById, inventoryValuation, exportMovementsCSV
- hooks/useStockMovements.ts — pagination + realtime subscription (50 rows per page)
- components/MovementRow.tsx — compact row renderer
- app/(tabs)/inventory-movements.tsx — list screen with date filters and CSV export

Notes / testing
- Ensure db/migrations/ddl_phase2.sql has been applied (stock_movements table exists).
- The screen subscribes to realtime INSERT events on stock_movements to show new movements live.
- Export CSV writes to cache directory and invokes OS share dialog where available.

Next steps
- Add movement detail modal and product join to show SKU/name instead of product_id
- Add server-side filters (by SKU/name) and search indexes for performance
- Add PDF summary export via expo-print if needed
