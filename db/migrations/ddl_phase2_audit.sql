-- PO audit and approval DDL

CREATE TABLE IF NOT EXISTS po_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid,
  comment text,
  created_at timestamptz DEFAULT now()
);

-- Add an approval_state column to purchase_orders if not present
ALTER TABLE IF EXISTS purchase_orders
  ADD COLUMN IF NOT EXISTS approval_state text DEFAULT 'pending'; -- pending|approved|rejected

CREATE INDEX IF NOT EXISTS idx_po_audit_po_id ON po_audit(purchase_order_id);
