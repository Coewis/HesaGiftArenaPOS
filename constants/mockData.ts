// HESA GIFT ARENA POS - Mock Data
import { Product, Customer, SaleRecord, Category, InventoryMovement, RestockRequest, DamagedGoodsLog, SupplierContact, Order } from '@/types';

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat_all', name: 'All Items', icon: 'grid-view', color: '#38B6FF' },
  { id: 'cat_bouquets', name: 'Bouquets', icon: 'local-florist', color: '#E8537A' },
  { id: 'cat_hampers', name: 'Gift Hampers', icon: 'redeem', color: '#D4AF37' },
  { id: 'cat_chocolates', name: 'Chocolates', icon: 'cake', color: '#8B4513' },
  { id: 'cat_perfumes', name: 'Perfumes', icon: 'spa', color: '#9B59B6' },
  { id: 'cat_cards', name: 'Gift Cards', icon: 'card-giftcard', color: '#2ECC71' },
  { id: 'cat_plush', name: 'Plush & Toys', icon: 'toys', color: '#E74C3C' },
  { id: 'cat_jewelry', name: 'Jewelry', icon: 'diamond', color: '#FFD700' },
  { id: 'cat_balloons', name: 'Balloons', icon: 'celebration', color: '#38B6FF' },
  { id: 'cat_custom', name: 'Custom Gifts', icon: 'star', color: '#F39C12' },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod_001', barcode: 'HGA001', name: 'Premium Rose Bouquet',
    description: '24 red roses with baby breath and premium wrapping',
    category: 'cat_bouquets', price: 85000, buyingPrice: 45000,
    stock: 15, minStock: 5,
    imageUrl: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=400',
    supplier: 'Kampala Flowers Ltd', status: 'active',
  },
  {
    id: 'prod_002', barcode: 'HGA002', name: 'Luxury Gift Hamper - Gold',
    description: 'Premium assortment: chocolates, wine, nuts, and accessories',
    category: 'cat_hampers', price: 250000, buyingPrice: 140000,
    stock: 8, minStock: 3,
    imageUrl: 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400',
    supplier: 'Premium Gifts UG', status: 'active',
  },
  {
    id: 'prod_003', barcode: 'HGA003', name: 'Ferrero Rocher Box (24)',
    description: 'Ferrero Rocher assorted box, 24 pieces',
    category: 'cat_chocolates', price: 55000, buyingPrice: 32000,
    stock: 30, minStock: 10,
    imageUrl: 'https://images.unsplash.com/photo-1548907040-4baa42d10919?w=400',
    supplier: 'Uchumi Supermarket', status: 'active',
  },
  {
    id: 'prod_004', barcode: 'HGA004', name: 'Chanel No. 5 Perfume 50ml',
    description: 'Original Chanel No. 5 EDP 50ml - luxurious floral fragrance',
    category: 'cat_perfumes', price: 320000, buyingPrice: 210000,
    stock: 6, minStock: 3,
    imageUrl: 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400',
    supplier: 'Luxury Imports UG', status: 'active',
  },
  {
    id: 'prod_005', barcode: 'HGA005', name: 'Personalized Gift Card',
    description: 'Custom message gift card with premium envelope',
    category: 'cat_cards', price: 15000, buyingPrice: 5000,
    stock: 100, minStock: 20,
    imageUrl: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
    supplier: 'Print Masters Kampala', status: 'active',
  },
  {
    id: 'prod_006', barcode: 'HGA006', name: 'Giant Teddy Bear (60cm)',
    description: 'Soft premium teddy bear, 60cm tall, in gift box',
    category: 'cat_plush', price: 120000, buyingPrice: 65000,
    stock: 12, minStock: 4,
    imageUrl: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=400',
    supplier: 'Toy Kingdom UG', status: 'active',
  },
  {
    id: 'prod_007', barcode: 'HGA007', name: 'Gold Bracelet - Heart Charm',
    description: 'Elegant 18K gold-plated bracelet with heart charm',
    category: 'cat_jewelry', price: 185000, buyingPrice: 95000,
    stock: 10, minStock: 4,
    imageUrl: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400',
    supplier: 'Jewelry Palace Kampala', status: 'active',
  },
  {
    id: 'prod_008', barcode: 'HGA008', name: 'Birthday Balloon Bundle (10pcs)',
    description: 'Premium latex balloons, 10 pieces, assorted colors',
    category: 'cat_balloons', price: 25000, buyingPrice: 10000,
    stock: 50, minStock: 15,
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
    supplier: 'Party Supplies UG', status: 'active',
  },
  {
    id: 'prod_009', barcode: 'HGA009', name: 'Sunflower Bouquet (12pcs)',
    description: '12 fresh sunflowers with green foliage and kraft wrap',
    category: 'cat_bouquets', price: 65000, buyingPrice: 35000,
    stock: 20, minStock: 6,
    imageUrl: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400',
    supplier: 'Kampala Flowers Ltd', status: 'active',
  },
  {
    id: 'prod_010', barcode: 'HGA010', name: 'Custom Photo Frame Gift',
    description: 'Personalized photo frame with custom message engraving',
    category: 'cat_custom', price: 95000, buyingPrice: 45000,
    stock: 3, minStock: 5,
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400',
    supplier: 'Creative Gifts UG', status: 'active',
  },
  {
    id: 'prod_011', barcode: 'HGA011', name: 'Lindt Excellence Dark Box',
    description: 'Lindt Excellence dark chocolate assortment, premium box',
    category: 'cat_chocolates', price: 42000, buyingPrice: 25000,
    stock: 25, minStock: 8,
    imageUrl: 'https://images.unsplash.com/photo-1481391243133-f96216dcb5d2?w=400',
    supplier: 'Uchumi Supermarket', status: 'active',
  },
  {
    id: 'prod_012', barcode: 'HGA012', name: 'Silver Necklace - Infinity',
    description: 'Sterling silver infinity necklace with gift box',
    category: 'cat_jewelry', price: 145000, buyingPrice: 75000,
    stock: 8, minStock: 3,
    imageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400',
    supplier: 'Jewelry Palace Kampala', status: 'active',
  },
];

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'cust_001', name: 'Sarah Nakamura', phone: '+256772123456',
    email: 'sarah.n@gmail.com', loyaltyPoints: 1250, totalPurchases: 12,
    totalSpent: 1850000, joinDate: '2024-01-15', tier: 'Gold',
  },
  {
    id: 'cust_002', name: 'James Okafor', phone: '+256704567890',
    email: 'james.o@yahoo.com', loyaltyPoints: 430, totalPurchases: 5,
    totalSpent: 620000, joinDate: '2024-03-22', tier: 'Silver',
  },
  {
    id: 'cust_003', name: 'Grace Atim', phone: '+256756789012',
    email: 'grace.atim@gmail.com', loyaltyPoints: 2800, totalPurchases: 28,
    totalSpent: 4250000, joinDate: '2023-09-10', tier: 'Platinum',
  },
  {
    id: 'cust_004', name: 'David Mugisha', phone: '+256782345678',
    email: 'david.m@outlook.com', loyaltyPoints: 180, totalPurchases: 2,
    totalSpent: 190000, joinDate: '2025-01-05', tier: 'Bronze',
  },
  {
    id: 'cust_005', name: 'Aisha Nalubega', phone: '+256700234567',
    email: 'aisha.n@gmail.com', loyaltyPoints: 950, totalPurchases: 9,
    totalSpent: 1120000, joinDate: '2024-06-18', tier: 'Gold',
  },
  {
    id: 'cust_006', name: 'Peter Ssekandi', phone: '+256752891234',
    email: 'peter.s@gmail.com', loyaltyPoints: 640, totalPurchases: 7,
    totalSpent: 875000, joinDate: '2024-08-12', tier: 'Silver',
  },
  {
    id: 'cust_007', name: 'Winnie Nabirungi', phone: '+256701456789',
    email: 'winnie.n@yahoo.com', loyaltyPoints: 120, totalPurchases: 1,
    totalSpent: 85000, joinDate: '2025-04-20', tier: 'Bronze',
  },
];

export const MOCK_RECENT_SALES: SaleRecord[] = [
  {
    id: 'sale_001', receiptNo: 'HGA-20250521-001',
    cashier: 'Ruth Namukasa', cashierId: 'user_cashier',
    items: [
      { productId: 'prod_001', name: 'Premium Rose Bouquet', qty: 2, price: 85000, total: 170000 },
      { productId: 'prod_005', name: 'Personalized Gift Card', qty: 1, price: 15000, total: 15000 },
    ],
    subtotal: 185000, discount: 0, tax: 0, total: 185000,
    paymentMethod: 'MTN MoMo', status: 'completed',
    customerId: 'cust_001', customerName: 'Sarah Nakamura',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'sale_002', receiptNo: 'HGA-20250521-002',
    cashier: 'Ruth Namukasa', cashierId: 'user_cashier',
    items: [
      { productId: 'prod_002', name: 'Luxury Gift Hamper - Gold', qty: 1, price: 250000, total: 250000 },
    ],
    subtotal: 250000, discount: 25000, tax: 0, total: 225000,
    paymentMethod: 'Cash', status: 'completed',
    customerId: 'cust_003', customerName: 'Grace Atim',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'sale_003', receiptNo: 'HGA-20250521-003',
    cashier: 'John Sserwanga', cashierId: 'user_manager',
    items: [
      { productId: 'prod_004', name: 'Chanel No. 5 Perfume', qty: 1, price: 320000, total: 320000 },
      { productId: 'prod_007', name: 'Gold Bracelet - Heart Charm', qty: 1, price: 185000, total: 185000 },
    ],
    subtotal: 505000, discount: 50000, tax: 0, total: 455000,
    paymentMethod: 'Card', status: 'completed',
    customerId: 'cust_002', customerName: 'James Okafor',
    timestamp: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: 'sale_004', receiptNo: 'HGA-20250521-004',
    cashier: 'Ruth Namukasa', cashierId: 'user_cashier',
    items: [
      { productId: 'prod_006', name: 'Giant Teddy Bear (60cm)', qty: 1, price: 120000, total: 120000 },
      { productId: 'prod_008', name: 'Birthday Balloon Bundle', qty: 2, price: 25000, total: 50000 },
    ],
    subtotal: 170000, discount: 0, tax: 0, total: 170000,
    paymentMethod: 'Split',
    splitPayment: { method1: 'Cash', amount1: 100000, method2: 'MTN MoMo', amount2: 70000 },
    status: 'completed',
    customerId: 'cust_005', customerName: 'Aisha Nalubega',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: 'sale_005', receiptNo: 'HGA-20250521-005',
    cashier: 'John Sserwanga', cashierId: 'user_manager',
    items: [
      { productId: 'prod_012', name: 'Silver Necklace - Infinity', qty: 1, price: 145000, total: 145000 },
    ],
    subtotal: 145000, discount: 0, tax: 0, total: 145000,
    paymentMethod: 'Airtel Money', status: 'completed',
    timestamp: new Date(Date.now() - 18000000).toISOString(),
  },
];

export const DASHBOARD_STATS = {
  today: {
    revenue: 1245000,
    transactions: 18,
    avgOrderValue: 69167,
    newCustomers: 3,
  },
  yesterday: {
    revenue: 987000,
    transactions: 14,
    avgOrderValue: 70500,
    newCustomers: 2,
  },
  thisWeek: {
    revenue: 7820000,
    transactions: 112,
  },
  thisMonth: {
    revenue: 28450000,
    transactions: 412,
  },
  weeklyRevenue: [620000, 780000, 945000, 830000, 1120000, 1050000, 1245000],
  topProducts: [
    { name: 'Luxury Gift Hamper - Gold', sold: 28, revenue: 6300000 },
    { name: 'Chanel No. 5 Perfume 50ml', sold: 15, revenue: 4800000 },
    { name: 'Premium Rose Bouquet', sold: 42, revenue: 3570000 },
    { name: 'Gold Bracelet - Heart Charm', sold: 18, revenue: 3330000 },
    { name: 'Giant Teddy Bear (60cm)', sold: 22, revenue: 2640000 },
  ],
};

export const MOCK_USERS = [
  { id: 'user_admin', name: 'Admin User', email: 'admin@hesagift.ug', password: 'admin123', role: 'Super Admin', pin: '1234' },
  { id: 'user_manager', name: 'John Sserwanga', email: 'manager@hesagift.ug', password: 'manager123', role: 'Manager', pin: '2345' },
  { id: 'user_cashier', name: 'Ruth Namukasa', email: 'cashier@hesagift.ug', password: 'cashier123', role: 'Cashier', pin: '3456' },
];

export const MOCK_INVENTORY_MOVEMENTS: InventoryMovement[] = [
  {
    id: 'mov_001', productId: 'prod_001', productName: 'Premium Rose Bouquet',
    type: 'sale', qty: -2, previousStock: 17, newStock: 15,
    note: 'Sale HGA-20250521-001', recordedBy: 'Ruth Namukasa',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'mov_002', productId: 'prod_001', productName: 'Premium Rose Bouquet',
    type: 'restock', qty: 10, previousStock: 7, newStock: 17,
    note: 'Weekly restock from Kampala Flowers Ltd', recordedBy: 'John Sserwanga',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'mov_003', productId: 'prod_010', productName: 'Custom Photo Frame Gift',
    type: 'damaged', qty: -2, previousStock: 5, newStock: 3,
    note: 'Broken glass during delivery', recordedBy: 'Admin User',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'mov_004', productId: 'prod_003', productName: 'Ferrero Rocher Box (24)',
    type: 'restock', qty: 15, previousStock: 15, newStock: 30,
    note: 'Monthly reorder from Uchumi Supermarket', recordedBy: 'John Sserwanga',
    timestamp: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: 'mov_005', productId: 'prod_004', productName: 'Chanel No. 5 Perfume 50ml',
    type: 'sale', qty: -1, previousStock: 7, newStock: 6,
    note: 'Sale HGA-20250521-003', recordedBy: 'John Sserwanga',
    timestamp: new Date(Date.now() - 10800000).toISOString(),
  },
];

export const MOCK_RESTOCK_REQUESTS: RestockRequest[] = [
  {
    id: 'req_001', productId: 'prod_010', productName: 'Custom Photo Frame Gift',
    currentStock: 3, requestedQty: 10,
    supplier: 'Creative Gifts UG', supplierPhone: '+256 414 235 678',
    supplierEmail: 'orders@creativegifts.ug',
    status: 'pending', requestedBy: 'Admin User',
    requestedAt: new Date(Date.now() - 86400000).toISOString(),
    notes: 'Urgent - stock critically low',
  },
  {
    id: 'req_002', productId: 'prod_004', productName: 'Chanel No. 5 Perfume 50ml',
    currentStock: 6, requestedQty: 12,
    supplier: 'Luxury Imports UG', supplierPhone: '+256 772 890 123',
    supplierEmail: 'imports@luxuryug.com',
    status: 'ordered', requestedBy: 'John Sserwanga',
    requestedAt: new Date(Date.now() - 172800000).toISOString(),
    notes: 'High season demand - order extra',
  },
];

export const MOCK_DAMAGED_LOGS: DamagedGoodsLog[] = [
  {
    id: 'dmg_001', productId: 'prod_010', productName: 'Custom Photo Frame Gift',
    qty: 2, reason: 'Broken glass frame during delivery',
    estimatedLoss: 190000, reportedBy: 'Admin User',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'dmg_002', productId: 'prod_001', productName: 'Premium Rose Bouquet',
    qty: 3, reason: 'Wilted flowers due to refrigeration failure',
    estimatedLoss: 135000, reportedBy: 'Ruth Namukasa',
    timestamp: new Date(Date.now() - 432000000).toISOString(),
  },
];

export const MOCK_SUPPLIERS: SupplierContact[] = [
  {
    id: 'sup_001', name: 'Kampala Flowers Ltd',
    phone: '+256 414 234 567', email: 'orders@kampalaflowers.ug',
    address: 'Plot 12, Kampala Road, Kampala',
    products: ['prod_001', 'prod_009'],
    notes: 'Reliable supplier. Minimum order: 5 bouquets. Delivery: same day.',
  },
  {
    id: 'sup_002', name: 'Premium Gifts UG',
    phone: '+256 772 456 789', email: 'sales@premiumgifts.ug',
    address: 'Garden City Mall, 3rd Floor, Kampala',
    products: ['prod_002'],
    notes: 'Best hamper supplier. Lead time: 2 business days.',
  },
  {
    id: 'sup_003', name: 'Luxury Imports UG',
    phone: '+256 772 890 123', email: 'imports@luxuryug.com',
    address: 'Acacia Mall, Kololo, Kampala',
    products: ['prod_004'],
    notes: 'Import agent for Chanel, Dior. MOQ: 6 units. Payment: 50% upfront.',
  },
  {
    id: 'sup_004', name: 'Uchumi Supermarket',
    phone: '+256 414 312 000', email: 'wholesale@uchumi.ug',
    address: 'Nakumatt Oasis, Nakasero, Kampala',
    products: ['prod_003', 'prod_011'],
    notes: 'Wholesale account. Net 30 payment terms.',
  },
  {
    id: 'sup_005', name: 'Jewelry Palace Kampala',
    phone: '+256 756 123 456', email: 'wholesale@jewelrypalace.ug',
    address: 'Nakasero Market, Stall 45-47, Kampala',
    products: ['prod_007', 'prod_012'],
    notes: 'Authentic gold/silver only. Certificate of authenticity included.',
  },
  {
    id: 'sup_006', name: 'Creative Gifts UG',
    phone: '+256 414 235 678', email: 'orders@creativegifts.ug',
    address: 'Industrial Area, Plot 8B, Kampala',
    products: ['prod_010'],
    notes: 'Custom orders available. Lead time: 3-5 days for personalized items.',
  },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord_001', orderNo: 'HGA-ORD-001',
    type: 'online', status: 'pending',
    items: [
      { productId: 'prod_002', name: 'Luxury Gift Hamper - Gold', qty: 1, price: 250000, total: 250000 },
      { productId: 'prod_001', name: 'Premium Rose Bouquet', qty: 1, price: 85000, total: 85000 },
    ],
    subtotal: 335000, discount: 0, deliveryFee: 15000, total: 350000,
    customerName: 'Sarah Nakamura', customerPhone: '+256772123456',
    customerId: 'cust_001',
    customerAddress: 'Kololo, Kampala',
    paymentMethod: 'MTN MoMo', paymentStatus: 'paid',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    notes: 'Please add a birthday card',
  },
  {
    id: 'ord_002', orderNo: 'HGA-ORD-002',
    type: 'delivery', status: 'confirmed',
    items: [
      { productId: 'prod_004', name: 'Chanel No. 5 Perfume 50ml', qty: 1, price: 320000, total: 320000 },
    ],
    subtotal: 320000, discount: 0, deliveryFee: 20000, total: 340000,
    customerName: 'Grace Atim', customerPhone: '+256756789012',
    customerId: 'cust_003',
    customerAddress: 'Nakasero, Kampala',
    deliveryNotes: 'Call before delivery. Fragile item.',
    paymentMethod: 'Cash', paymentStatus: 'pending',
    assignedTo: 'Delivery Rider A',
    createdAt: new Date(Date.now() - 5400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'ord_003', orderNo: 'HGA-ORD-003',
    type: 'reservation', status: 'processing',
    items: [
      { productId: 'prod_007', name: 'Gold Bracelet - Heart Charm', qty: 1, price: 185000, total: 185000 },
      { productId: 'prod_005', name: 'Personalized Gift Card', qty: 2, price: 15000, total: 30000 },
    ],
    subtotal: 215000, discount: 15000, deliveryFee: 0, total: 200000,
    customerName: 'James Okafor', customerPhone: '+256704567890',
    customerId: 'cust_002',
    reservationDate: new Date(Date.now() + 86400000).toISOString(),
    paymentMethod: 'Card', paymentStatus: 'paid',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    notes: 'Anniversary gift - wrap elegantly',
  },
  {
    id: 'ord_004', orderNo: 'HGA-ORD-004',
    type: 'online', status: 'completed',
    items: [
      { productId: 'prod_003', name: 'Ferrero Rocher Box (24)', qty: 2, price: 55000, total: 110000 },
      { productId: 'prod_008', name: 'Birthday Balloon Bundle', qty: 1, price: 25000, total: 25000 },
    ],
    subtotal: 135000, discount: 0, deliveryFee: 10000, total: 145000,
    customerName: 'Aisha Nalubega', customerPhone: '+256700234567',
    customerId: 'cust_005',
    customerAddress: 'Ntinda, Kampala',
    paymentMethod: 'Airtel Money', paymentStatus: 'paid',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 82800000).toISOString(),
  },
  {
    id: 'ord_005', orderNo: 'HGA-ORD-005',
    type: 'delivery', status: 'cancelled',
    items: [
      { productId: 'prod_006', name: 'Giant Teddy Bear (60cm)', qty: 1, price: 120000, total: 120000 },
    ],
    subtotal: 120000, discount: 0, deliveryFee: 15000, total: 135000,
    customerName: 'David Mugisha', customerPhone: '+256782345678',
    customerId: 'cust_004',
    customerAddress: 'Mengo, Kampala',
    paymentMethod: 'MTN MoMo', paymentStatus: 'failed',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 169200000).toISOString(),
    notes: 'Customer cancelled - out of delivery zone',
  },
  {
    id: 'ord_006', orderNo: 'HGA-ORD-006',
    type: 'reservation', status: 'pending',
    items: [
      { productId: 'prod_012', name: 'Silver Necklace - Infinity', qty: 1, price: 145000, total: 145000 },
      { productId: 'prod_011', name: 'Lindt Excellence Dark Box', qty: 1, price: 42000, total: 42000 },
    ],
    subtotal: 187000, discount: 0, deliveryFee: 0, total: 187000,
    customerName: 'Winnie Nabirungi', customerPhone: '+256701456789',
    customerId: 'cust_007',
    reservationDate: new Date(Date.now() + 172800000).toISOString(),
    paymentMethod: 'Cash', paymentStatus: 'pending',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    notes: 'Gift for graduation ceremony',
  },
];
