// HESA GIFT ARENA POS - Type Definitions

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  price: number;
  buyingPrice: number;
  stock: number;
  minStock: number;
  imageUrl: string;
  supplier: string;
  status: 'active' | 'inactive' | 'archived';
  discount?: number;
}

export interface CartItem {
  product: Product;
  qty: number;
  unitPrice: number;
  total: number;
  discount: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  totalPurchases: number;
  totalSpent: number;
  joinDate: string;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface SplitPayment {
  method1: PaymentMethod;
  amount1: number;
  method2: PaymentMethod;
  amount2: number;
}

export interface SaleRecord {
  id: string;
  receiptNo: string;
  cashier: string;
  cashierId: string;
  branchId?: string;
  branchName?: string;
  shiftId?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  splitPayment?: SplitPayment;
  status: 'completed' | 'pending' | 'cancelled' | 'refunded';
  customerId?: string;
  customerName?: string;
  pointsRedeemed?: number;
  timestamp: string;
  notes?: string;
}

export type PaymentMethod = 'Cash' | 'MTN MoMo' | 'Airtel Money' | 'Card' | 'Split';

export type UserRole = 'Super Admin' | 'Manager' | 'Cashier' | 'Inventory Officer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin?: string;
}

export interface DashboardStats {
  today: {
    revenue: number;
    transactions: number;
    avgOrderValue: number;
    newCustomers: number;
  };
  yesterday: {
    revenue: number;
    transactions: number;
    avgOrderValue: number;
    newCustomers: number;
  };
  thisWeek: { revenue: number; transactions: number };
  thisMonth: { revenue: number; transactions: number };
  weeklyRevenue: number[];
  topProducts: { name: string; sold: number; revenue: number }[];
}

// Inventory-specific types
export type InventoryMovementType = 'sale' | 'restock' | 'damaged' | 'adjustment' | 'return';

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  branchId?: string;
  type: InventoryMovementType;
  qty: number;
  previousStock: number;
  newStock: number;
  note: string;
  recordedBy: string;
  timestamp: string;
}

export interface RestockRequest {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  requestedQty: number;
  supplier: string;
  supplierPhone: string;
  supplierEmail: string;
  status: 'pending' | 'ordered' | 'received' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  notes: string;
}

export interface DamagedGoodsLog {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  reason: string;
  estimatedLoss: number;
  reportedBy: string;
  timestamp: string;
}

export interface SupplierContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  products: string[];
  notes: string;
}

// Order types
export type OrderType = 'in-store' | 'online' | 'delivery' | 'reservation';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  orderNo: string;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryNotes?: string;
  reservationDate?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'paid' | 'pending' | 'failed';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface RefundRecord {
  id: string;
  originalSaleId: string;
  receiptNo: string;
  originalReceiptNo: string;
  cashier: string;
  items: { productId: string; name: string; qty: number; price: number; total: number }[];
  refundMethod: string;
  totalRefunded: number;
  reason: string;
  timestamp: string;
}

// Bundle types
export interface BundleComponent {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
}

export interface ProductBundle {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  bundlePrice: number;
  originalPrice: number;
  discountPct: number;
  components: BundleComponent[];
  status: 'active' | 'inactive';
}

// Shift management types
export interface Shift {
  id: string;
  cashierId: string;
  cashierName: string;
  branchId: string;
  branchName: string;
  floatAmount: number;
  openingTime: string;
  closingTime?: string;
  cashCount?: number;
  expectedCash?: number;
  variance?: number;
  totalSales: number;
  totalTransactions: number;
  status: 'open' | 'closed';
  notes?: string;
}

// App Settings type
export interface AppSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail: string;
  receiptFooter: string;
  receiptLogoUrl: string;
  taxRate: number;
  sessionTimeout: number;
  currency: string;
}
