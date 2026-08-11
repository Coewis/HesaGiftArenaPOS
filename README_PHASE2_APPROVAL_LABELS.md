# Phase 2 - Approval workflow + label templates + seed/apply instructions

This update includes:
- db/migrations/ddl_phase2_audit.sql — PO audit table and approval_state column
- services/approvalService.ts — client helper to approve/reject and write audit entries
- components/POApprovalModal.tsx — modal UI for managers to approve/reject with comments
- services/labelService.ts and components/LabelTemplate.tsx — SVG label builder and WebView renderer for printing via expo-print

Also included earlier: seed SQL and index migrations. To apply seed data run the seed script in staging.

Instructions to apply seed (manual step)
1. In Supabase SQL editor or psql run:
   - db/migrations/ddl_phase2.sql
   - db/migrations/ddl_phase2_indexes.sql
   - db/migrations/ddl_phase2_audit.sql
2. (Optional) Run db/seed/seed_phase2.sql to create sample suppliers and products.
3. Deploy supabase functions and set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_FUNCTIONS_URL.

Printing labels (example usage)
- Use services/labelService.buildLabelSVG to create an SVG string, render it with components/LabelTemplate, then call Print.printToFileAsync({ html: services/labelService.labelHTML(svg) }) to generate a PDF for printing.
