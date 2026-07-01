// HESA GIFT ARENA POS - Supabase Data Service
import { getSupabaseClient } from '@/template';
import {
  Product, Customer, SaleRecord, Category,
  InventoryMovement, RestockRequest, DamagedGoodsLog, SupplierContact,
  Order, OrderStatus, SaleItem,
} from '@/types';

const db = () => getSupabaseClient();

// ─── PRODUCTS ───────────────────────────────────────────────────────────────
export const fetchProducts = async (): Promise<Product[]> => {
  const { data, error } = await db().from('pos_products').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapProduct);
};

export const upsertProduct = async (product: Product): Promise<Product> => {
  const row = {
    id: product.id, barcode: product.barcode, name: product.name,
    description: product.description, category: product.category,
    price: product.price, buying_price: product.buyingPrice,
    stock: product.stock, min_stock: product.minStock,
    image_url: product.imageUrl, supplier: product.supplier,
    status: product.status, discount: product.discount || 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from('pos_products').upsert(row).select().single();
  if (error) throw error;
  return mapProduct(data);
};

export const updateProductStock = async (productId: string, newStock: number): Promise<void> => {
  const { error } = await db().from('pos_products').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', productId);
  if (error) throw error;
};

export const archiveProduct = async (id: string): Promise<void> => {
  const { error } = await db().from('pos_products').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
export const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await db().from('pos_categories').select('*').order('name');
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, name: r.name, icon: r.icon, color: r.color }));
};

export const seedCategories = async (cats: Category[]): Promise<void> => {
  const rows = cats.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }));
  await db().from('pos_categories').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
};

// ─── CUSTOMERS ──────────────────────────────────────────────────────────────
export const fetchCustomers = async (): Promise<Customer[]> => {
  const { data, error } = await db().from('pos_customers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapCustomer);
};

export const upsertCustomer = async (customer: Customer): Promise<Customer> => {
  const row = {
    id: customer.id, name: customer.name, phone: customer.phone,
    email: customer.email, loyalty_points: customer.loyaltyPoints,
    total_purchases: customer.totalPurchases, total_spent: customer.totalSpent,
    join_date: customer.joinDate, tier: customer.tier,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db().from('pos_customers').upsert(row).select().single();
  if (error) throw error;
  return mapCustomer(data);
};

// ─── SALES ──────────────────────────────────────────────────────────────────
export const fetchSales = async (): Promise<SaleRecord[]> => {
  const { data: salesData, error: salesErr } = await db()
    .from('pos_sales').select('*').order('timestamp', { ascending: false }).limit(200);
  if (salesErr) throw salesErr;

  const { data: itemsData, error: itemsErr } = await db()
    .from('pos_sale_items').select('*');
  if (itemsErr) throw itemsErr;

  const itemsBySale: Record<string, SaleItem[]> = {};
  (itemsData || []).forEach(i => {
    if (!itemsBySale[i.sale_id]) itemsBySale[i.sale_id] = [];
    itemsBySale[i.sale_id].push({ productId: i.product_id, name: i.name, qty: i.qty, price: Number(i.price), total: Number(i.total) });
  });

  return (salesData || []).map(s => ({
    id: s.id, receiptNo: s.receipt_no, cashier: s.cashier, cashierId: s.cashier_id,
    subtotal: Number(s.subtotal), discount: Number(s.discount), tax: Number(s.tax), total: Number(s.total),
    paymentMethod: s.payment_method, splitPayment: s.split_payment || undefined,
    status: s.status, customerId: s.customer_id || undefined,
    customerName: s.customer_name || undefined, notes: s.notes || undefined,
    timestamp: s.timestamp, items: itemsBySale[s.id] || [],
  }));
};

export const insertSale = async (sale: SaleRecord): Promise<void> => {
  const { error: saleErr } = await db().from('pos_sales').insert({
    id: sale.id, receipt_no: sale.receiptNo, cashier: sale.cashier, cashier_id: sale.cashierId,
    subtotal: sale.subtotal, discount: sale.discount, tax: sale.tax, total: sale.total,
    payment_method: sale.paymentMethod, split_payment: sale.splitPayment || null,
    status: sale.status, customer_id: sale.customerId || null,
    customer_name: sale.customerName || null, notes: sale.notes || null,
    timestamp: sale.timestamp,
  });
  if (saleErr) throw saleErr;

  if (sale.items.length > 0) {
    const items = sale.items.map(i => ({
      sale_id: sale.id, product_id: i.productId, name: i.name,
      qty: i.qty, price: i.price, total: i.total,
    }));
    const { error: itemsErr } = await db().from('pos_sale_items').insert(items);
    if (itemsErr) throw itemsErr;
  }
};

// ─── ORDERS ─────────────────────────────────────────────────────────────────
export const fetchOrders = async (): Promise<Order[]> => {
  const { data: ordersData, error: ordersErr } = await db()
    .from('pos_orders').select('*').order('created_at', { ascending: false });
  if (ordersErr) throw ordersErr;

  const { data: itemsData, error: itemsErr } = await db().from('pos_order_items').select('*');
  if (itemsErr) throw itemsErr;

  const itemsByOrder: Record<string, any[]> = {};
  (itemsData || []).forEach(i => {
    if (!itemsByOrder[i.order_id]) itemsByOrder[i.order_id] = [];
    itemsByOrder[i.order_id].push({ productId: i.product_id, name: i.name, qty: i.qty, price: Number(i.price), total: Number(i.total) });
  });

  return (ordersData || []).map(o => ({
    id: o.id, orderNo: o.order_no, type: o.type, status: o.status,
    subtotal: Number(o.subtotal), discount: Number(o.discount),
    deliveryFee: Number(o.delivery_fee), total: Number(o.total),
    customerId: o.customer_id || undefined, customerName: o.customer_name,
    customerPhone: o.customer_phone, customerAddress: o.customer_address || undefined,
    deliveryNotes: o.delivery_notes || undefined,
    reservationDate: o.reservation_date || undefined,
    paymentMethod: o.payment_method || undefined, paymentStatus: o.payment_status,
    assignedTo: o.assigned_to || undefined, notes: o.notes || undefined,
    items: itemsByOrder[o.id] || [],
    createdAt: o.created_at, updatedAt: o.updated_at,
  }));
};

export const updateOrderStatusInDB = async (id: string, status: OrderStatus): Promise<void> => {
  const { error } = await db().from('pos_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

// ─── RIDER ASSIGNMENTS ───────────────────────────────────────────────────────
export const fetchRiderAssignments = async (orderId: string) => {
  const { data, error } = await db()
    .from('pos_rider_assignments')
    .select('*')
    .eq('order_id', orderId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const insertRiderAssignment = async (assignment: {
  orderId: string; riderName: string; riderPhone: string; assignedBy: string; notes?: string;
}) => {
  const { error } = await db().from('pos_rider_assignments').insert({
    order_id: assignment.orderId, rider_name: assignment.riderName,
    rider_phone: assignment.riderPhone, assigned_by: assignment.assignedBy,
    notes: assignment.notes || null, assigned_at: new Date().toISOString(),
  });
  if (error) throw error;

  // Update order assigned_to field
  const { error: orderErr } = await db().from('pos_orders').update({
    assigned_to: `${assignment.riderName} (${assignment.riderPhone})`,
    updated_at: new Date().toISOString(),
  }).eq('id', assignment.orderId);
  if (orderErr) throw orderErr;
};

// ─── INVENTORY MOVEMENTS ────────────────────────────────────────────────────
export const fetchInventoryMovements = async (): Promise<InventoryMovement[]> => {
  const { data, error } = await db()
    .from('pos_inventory_movements').select('*').order('timestamp', { ascending: false }).limit(300);
  if (error) throw error;
  return (data || []).map(m => ({
    id: m.id, productId: m.product_id, productName: m.product_name,
    type: m.type, qty: m.qty, previousStock: m.previous_stock, newStock: m.new_stock,
    note: m.note, recordedBy: m.recorded_by, timestamp: m.timestamp,
  }));
};

export const insertInventoryMovement = async (movement: InventoryMovement): Promise<void> => {
  const { error } = await db().from('pos_inventory_movements').insert({
    id: movement.id, product_id: movement.productId, product_name: movement.productName,
    type: movement.type, qty: movement.qty, previous_stock: movement.previousStock,
    new_stock: movement.newStock, note: movement.note, recorded_by: movement.recordedBy,
    timestamp: movement.timestamp,
  });
  if (error) throw error;
};

// ─── REFUNDS ────────────────────────────────────────────────────────────────
export const insertRefund = async (refund: {
  id: string; originalSaleId: string; receiptNo: string; originalReceiptNo: string;
  cashier: string; items: any[]; refundMethod: string; totalRefunded: number;
  reason: string; timestamp: string;
}): Promise<void> => {
  const { error } = await db().from('pos_refunds').insert({
    id: refund.id, original_sale_id: refund.originalSaleId, receipt_no: refund.receiptNo,
    original_receipt_no: refund.originalReceiptNo, cashier: refund.cashier,
    items: refund.items, refund_method: refund.refundMethod,
    total_refunded: refund.totalRefunded, reason: refund.reason, timestamp: refund.timestamp,
  });
  if (error) throw error;
};

// ─── IMAGE UPLOAD ────────────────────────────────────────────────────────────
export const uploadProductImage = async (productId: string, base64: string, mimeType: string): Promise<string> => {
  const ext = mimeType.split('/')[1] || 'jpg';
  const path = `products/${productId}_${Date.now()}.${ext}`;

  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const { error } = await db().storage.from('pos-product-images').upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = db().storage.from('pos-product-images').getPublicUrl(path);
  return data.publicUrl;
};

// ─── DATA MAPPERS ────────────────────────────────────────────────────────────
function mapProduct(r: any): Product {
  return {
    id: r.id, barcode: r.barcode, name: r.name,
    description: r.description || '', category: r.category,
    price: Number(r.price), buyingPrice: Number(r.buying_price),
    stock: Number(r.stock), minStock: Number(r.min_stock),
    imageUrl: r.image_url || '', supplier: r.supplier || '',
    status: r.status, discount: Number(r.discount || 0),
  };
}

function mapCustomer(r: any): Customer {
  return {
    id: r.id, name: r.name, phone: r.phone, email: r.email || '',
    loyaltyPoints: Number(r.loyalty_points), totalPurchases: Number(r.total_purchases),
    totalSpent: Number(r.total_spent), joinDate: r.join_date, tier: r.tier,
  };
}
