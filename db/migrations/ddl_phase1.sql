-- Phase 1 DDL: payments, stock movements, low stock events, and helper RPCs

-- NOTE: Review and adapt table/column names to match your existing schema (products table name may differ).

-- Add low_stock_threshold to products if not present
ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5;

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'UGX',
  method text NOT NULL,
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Stock movements / audit
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  change integer NOT NULL,
  reason text,
  source text,
  related_id uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Low stock events queue (for in-app notifications / further processing)
CREATE TABLE IF NOT EXISTS low_stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  sku text,
  product_name text,
  quantity integer,
  threshold integer,
  triggered_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false
);

-- Simple inventory decrement RPC (atomic)
CREATE OR REPLACE FUNCTION public.rpc_decrement_inventory(p_product_id uuid, p_amount integer, p_reason text DEFAULT NULL, p_source text DEFAULT NULL)
RETURNS TABLE(product_id uuid, old_qty integer, new_qty integer) LANGUAGE plpgsql AS $$
DECLARE
  _old integer;
  _new integer;
BEGIN
  SELECT quantity INTO _old FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found';
  END IF;
  _new := _old - COALESCE(p_amount, 0);
  UPDATE products SET quantity = _new, updated_at = now() WHERE id = p_product_id;
  INSERT INTO stock_movements(product_id, change, reason, source, created_at) VALUES (p_product_id, -p_amount, p_reason, p_source, now());

  -- If threshold reached, emit a low_stock_event
  PERFORM
    CASE WHEN _new <= COALESCE((SELECT low_stock_threshold FROM products WHERE id = p_product_id), 0) AND _old > COALESCE((SELECT low_stock_threshold FROM products WHERE id = p_product_id), 0)
      THEN
        INSERT INTO low_stock_events(product_id, sku, product_name, quantity, threshold, triggered_at)
        SELECT p_product_id, sku, name, _new, low_stock_threshold, now() FROM products WHERE id = p_product_id;
    ELSE NULL;
    END;

  RETURN QUERY SELECT p_product_id, _old, _new;
END;
$$;

-- Make sure to create an index on low_stock_events for fast listening
CREATE INDEX IF NOT EXISTS idx_low_stock_events_product_id ON low_stock_events(product_id);

-- payments: simple trigger to keep updated_at
CREATE OR REPLACE FUNCTION public.payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE PROCEDURE public.payments_updated_at();
