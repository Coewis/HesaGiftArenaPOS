-- Phase 2 DDL: suppliers, purchase orders, GRNs, stock movements, barcode labels, hamper templates

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  bank_account text,
  currency text DEFAULT 'UGX',
  default_lead_time integer DEFAULT 7,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  reference text,
  status text DEFAULT 'draft', -- draft|sent|received|cancelled
  total_amount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'UGX',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid,
  sku text,
  name text,
  qty integer DEFAULT 0,
  unit_cost numeric(12,2) DEFAULT 0,
  total_cost numeric(12,2) GENERATED ALWAYS AS (qty * unit_cost) STORED
);

-- Goods Received Notes (GRN)
CREATE TABLE IF NOT EXISTS goods_received_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  reference text,
  received_by uuid,
  received_at timestamptz DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS grn_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid REFERENCES goods_received_notes(id) ON DELETE CASCADE,
  product_id uuid,
  sku text,
  name text,
  qty_received integer DEFAULT 0,
  unit_cost numeric(12,2) DEFAULT 0
);

-- Stock transfers and adjustments
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_location text,
  to_location text,
  reference text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  change integer,
  reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Stock movements (ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  source_type text, -- sale|po|grn|transfer|adjustment
  source_id uuid,
  change integer NOT NULL,
  qty_before integer,
  qty_after integer,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Barcode/label data (for PDF generation)
CREATE TABLE IF NOT EXISTS barcode_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  sku text,
  label_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Hamper templates
CREATE TABLE IF NOT EXISTS hamper_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  items jsonb, -- [{product_id, qty, price}]
  base_price numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Helpful RPC: create PO
CREATE OR REPLACE FUNCTION public.rpc_create_po(p_supplier_id uuid, p_items jsonb, p_reference text DEFAULT NULL)
RETURNS TABLE(po_id uuid) LANGUAGE plpgsql AS $$
DECLARE
  _po uuid;
  _item jsonb;
BEGIN
  INSERT INTO purchase_orders(supplier_id, reference, status, created_at) VALUES (p_supplier_id, COALESCE(p_reference, 'PO-'||now()::text), 'draft', now()) RETURNING id INTO _po;
  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO purchase_order_items(purchase_order_id, product_id, sku, name, qty, unit_cost)
    VALUES (_po, (_item->>'product_id')::uuid, _item->>'sku', _item->>'name', (_item->>'qty')::int, (_item->>'unit_cost')::numeric);
  END LOOP;
  RETURN QUERY SELECT _po;
END; $$;

-- RPC: receive GRN (attach to PO and create stock_movements)
CREATE OR REPLACE FUNCTION public.rpc_receive_grn(p_po_id uuid, p_items jsonb, p_received_by uuid)
RETURNS TABLE(grn_id uuid) LANGUAGE plpgsql AS $$
DECLARE
  _grn uuid;
  _it jsonb;
  _before integer;
  _after integer;
BEGIN
  INSERT INTO goods_received_notes(purchase_order_id, reference, received_by, received_at) VALUES (p_po_id, 'GRN-'||now()::text, p_received_by, now()) RETURNING id INTO _grn;
  FOR _it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO grn_items(grn_id, product_id, sku, name, qty_received, unit_cost)
    VALUES (_grn, (_it->>'product_id')::uuid, _it->>'sku', _it->>'name', (_it->>'qty')::int, (_it->>'unit_cost')::numeric);

    SELECT quantity INTO _before FROM products WHERE id = (_it->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN _before := 0; END IF;
    _after := COALESCE(_before,0) + (_it->>'qty')::int;
    UPDATE products SET quantity = _after, updated_at = now() WHERE id = (_it->>'product_id')::uuid;
    INSERT INTO stock_movements(product_id, source_type, source_id, change, qty_before, qty_after, created_by, created_at)
    VALUES (((_it->>'product_id')::uuid), 'grn', _grn, (_it->>'qty')::int, _before, _after, p_received_by, now());
  END LOOP;
  RETURN QUERY SELECT _grn;
END; $$;

-- RPC: transfer stock (simple stub)
CREATE OR REPLACE FUNCTION public.rpc_transfer_stock(p_product_id uuid, p_from text, p_to text, p_qty integer, p_by uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  _before integer;
  _after integer;
BEGIN
  SELECT quantity INTO _before FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;
  _after := COALESCE(_before,0) - p_qty;
  UPDATE products SET quantity = _after, updated_at = now() WHERE id = p_product_id;
  INSERT INTO stock_movements(product_id, source_type, source_id, change, qty_before, qty_after, created_by, created_at)
  VALUES (p_product_id, 'transfer', NULL, -p_qty, _before, _after, p_by, now());
END; $$;

-- RPC: inventory valuation (example)
CREATE OR REPLACE FUNCTION public.rpc_inventory_valuation()
RETURNS TABLE(total_value numeric) LANGUAGE sql AS $$
  SELECT SUM((price::numeric * quantity::numeric)) FROM products;
$$;
