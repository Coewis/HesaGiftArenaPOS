-- Phase 2 seed data for QA (suppliers, sample products, sample stock movements)

-- Suppliers
INSERT INTO suppliers (id, name, phone, email, address, bank_account, default_lead_time, created_at)
VALUES
  (gen_random_uuid(), 'Acme Wholesale', '0700123456', 'orders@acme.example', 'Kampala Road, Kampala', 'UGX-000-111', 7, now()),
  (gen_random_uuid(), 'Elegant Gifts LTD', '0700987654', 'supply@elegantgifts.ug', 'Nakasero, Kampala', 'UGX-222-333', 5, now())
ON CONFLICT DO NOTHING;

-- Sample products (adapt fields to your schema if different)
INSERT INTO products (id, sku, name, price, quantity, imageUrl, created_at)
VALUES
  (gen_random_uuid(), 'HGA-001', 'Signature Gift Box - Rose', 75000, 25, 'https://placehold.co/200x200', now()),
  (gen_random_uuid(), 'HGA-002', 'Luxury Candle - Vanilla', 25000, 60, 'https://placehold.co/200x200', now()),
  (gen_random_uuid(), 'HGA-003', 'Greeting Card - Happy Birthday', 5000, 120, 'https://placehold.co/200x200', now())
ON CONFLICT DO NOTHING;

-- Sample stock movements
INSERT INTO stock_movements (product_id, source_type, change, qty_before, qty_after, created_by, created_at)
SELECT p.id, 'initial', p.quantity, 0, p.quantity, NULL, now() FROM products p
ON CONFLICT DO NOTHING;
