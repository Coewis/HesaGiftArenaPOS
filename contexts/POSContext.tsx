import React, { createContext, useState, useCallback, ReactNode, useEffect } from 'react';
import {
  Product, Customer, SaleRecord, Category,
  InventoryMovement, RestockRequest, DamagedGoodsLog, SupplierContact, Order, OrderStatus,
  ProductBundle, BundleComponent,
} from '@/types';
import {
  MOCK_PRODUCTS, MOCK_CUSTOMERS, MOCK_RECENT_SALES, MOCK_CATEGORIES,
  MOCK_INVENTORY_MOVEMENTS, MOCK_RESTOCK_REQUESTS, MOCK_DAMAGED_LOGS, MOCK_SUPPLIERS, MOCK_ORDERS,
} from '@/constants/mockData';
import * as Service from '@/services/posService';

interface RiderAssignment {
  id: string;
  orderId: string;
  riderName: string;
  riderPhone: string;
  assignedBy: string;
  assignedAt: string;
  notes?: string;
  status: string;
}

interface POSContextType {
  products: Product[];
  customers: Customer[];
  sales: SaleRecord[];
  categories: Category[];
  inventoryMovements: InventoryMovement[];
  restockRequests: RestockRequest[];
  damagedLogs: DamagedGoodsLog[];
  suppliers: SupplierContact[];
  orders: Order[];
  riderAssignments: RiderAssignment[];
  bundles: ProductBundle[];
  isCloudSynced: boolean;
  isSyncing: boolean;

  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addCustomer: (customer: Customer) => Promise<Customer>;
  updateCustomer: (customer: Customer) => Promise<void>;
  addSale: (sale: SaleRecord, pointsRedeemed?: number) => Promise<void>;
  addRefund: (refund: {
    originalSaleId: string; cashier: string; items: any[];
    refundMethod: string; totalRefunded: number; reason: string;
  }) => Promise<string>;
  getLowStockProducts: () => Product[];
  searchProducts: (query: string) => Product[];
  getProductByBarcode: (barcode: string) => Product | undefined;
  getProductsByCategory: (catId: string) => Product[];

  addInventoryMovement: (movement: InventoryMovement) => void;
  addRestockRequest: (request: RestockRequest) => void;
  updateRestockRequest: (id: string, status: RestockRequest['status']) => void;
  addDamagedLog: (log: DamagedGoodsLog) => void;
  logDamagedGoods: (productId: string, qty: number, reason: string, reportedBy: string) => void;
  restockProduct: (productId: string, qty: number, note: string, recordedBy: string) => void;

  addOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  assignRider: (orderId: string, riderName: string, riderPhone: string, assignedBy: string, notes?: string) => Promise<void>;
  getRiderHistory: (orderId: string) => RiderAssignment[];

  // Bundle methods
  addBundle: (bundle: ProductBundle) => void;
  updateBundle: (bundle: ProductBundle) => void;
  deleteBundle: (id: string) => void;
  addBundleToCart: (bundle: ProductBundle) => { product: Product; qty: number }[];

  uploadProductImage: (productId: string, base64: string, mimeType: string) => Promise<string>;
}

export const POSContext = createContext<POSContextType | undefined>(undefined);

// Create a virtual "product" from a bundle for POS compatibility
export function bundleToProduct(bundle: ProductBundle): Product {
  return {
    id: `bundle_${bundle.id}`,
    barcode: `BDL${bundle.id.slice(-4).toUpperCase()}`,
    name: `🎁 ${bundle.name}`,
    description: bundle.description,
    category: 'cat_bundles',
    price: bundle.bundlePrice,
    buyingPrice: 0,
    stock: 999, // virtual stock; real stock checked per component
    minStock: 0,
    imageUrl: bundle.imageUrl || 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
    supplier: '',
    status: 'active',
    discount: bundle.discountPct,
  };
}

export function POSProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS);
  const [sales, setSales] = useState<SaleRecord[]>(MOCK_RECENT_SALES);
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(MOCK_INVENTORY_MOVEMENTS);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>(MOCK_RESTOCK_REQUESTS);
  const [damagedLogs, setDamagedLogs] = useState<DamagedGoodsLog[]>(MOCK_DAMAGED_LOGS);
  const [suppliers] = useState<SupplierContact[]>(MOCK_SUPPLIERS);
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [riderAssignments, setRiderAssignments] = useState<RiderAssignment[]>([]);
  const [bundles, setBundles] = useState<ProductBundle[]>([]);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    syncFromCloud();
  }, []);

  const syncFromCloud = async () => {
    setIsSyncing(true);
    try {
      await Service.seedCategories(MOCK_CATEGORIES);
      const [cloudProducts, cloudCustomers, cloudSales, cloudOrders, cloudMovements, cloudBundles] = await Promise.allSettled([
        Service.fetchProducts(),
        Service.fetchCustomers(),
        Service.fetchSales(),
        Service.fetchOrders(),
        Service.fetchInventoryMovements(),
        Service.fetchBundles(),
      ]);
      if (cloudProducts.status === 'fulfilled' && cloudProducts.value.length > 0) setProducts(cloudProducts.value);
      if (cloudCustomers.status === 'fulfilled' && cloudCustomers.value.length > 0) setCustomers(cloudCustomers.value);
      if (cloudSales.status === 'fulfilled') {
        const cloudIds = new Set(cloudSales.value.map((s: any) => s.id));
        const mockOnlyS = MOCK_RECENT_SALES.filter(s => !cloudIds.has(s.id));
        setSales([...cloudSales.value, ...mockOnlyS]);
      }
      if (cloudOrders.status === 'fulfilled' && cloudOrders.value.length > 0) setOrders(cloudOrders.value);
      if (cloudMovements.status === 'fulfilled' && cloudMovements.value.length > 0) setInventoryMovements(cloudMovements.value);
      if (cloudBundles.status === 'fulfilled' && cloudBundles.value.length > 0) setBundles(cloudBundles.value);
      setIsCloudSynced(true);
    } catch {}
    finally { setIsSyncing(false); }
  };

  const addProduct = useCallback(async (product: Product) => {
    setProducts(prev => [product, ...prev]);
    try { await Service.upsertProduct(product); } catch {}
  }, []);

  const updateProduct = useCallback(async (product: Product) => {
    setProducts(prev => prev.map(p => p.id === product.id ? product : p));
    try { await Service.upsertProduct(product); } catch {}
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'archived' as const } : p));
    try { await Service.archiveProduct(id); } catch {}
  }, []);

  const addCustomer = useCallback(async (customer: Customer): Promise<Customer> => {
    setCustomers(prev => [customer, ...prev]);
    try {
      const saved = await Service.upsertCustomer(customer);
      setCustomers(prev => prev.map(c => c.id === customer.id ? saved : c));
      return saved;
    } catch { return customer; }
  }, []);

  const updateCustomer = useCallback(async (customer: Customer) => {
    setCustomers(prev => prev.map(c => c.id === customer.id ? customer : c));
    try { await Service.upsertCustomer(customer); } catch {}
  }, []);

  const addSale = useCallback(async (sale: SaleRecord, pointsRedeemed: number = 0) => {
    setSales(prev => [sale, ...prev]);
    setProducts(prev =>
      prev.map(p => {
        const item = sale.items.find(i => i.productId === p.id);
        if (item) {
          const newStock = Math.max(0, p.stock - item.qty);
          const movement: InventoryMovement = {
            id: `mov_${Date.now()}_${p.id}`,
            productId: p.id, productName: p.name,
            type: 'sale', qty: -item.qty,
            previousStock: p.stock, newStock,
            note: `Sale ${sale.receiptNo}`,
            recordedBy: sale.cashier,
            timestamp: sale.timestamp,
          };
          setInventoryMovements(m => [movement, ...m]);
          Service.insertInventoryMovement(movement).catch(() => {});
          return { ...p, stock: newStock };
        }
        return p;
      })
    );
    if (sale.customerId) {
      const pointsEarned = Math.floor(sale.total / 1000);
      setCustomers(prev => {
        const updated = prev.map(c => {
          if (c.id === sale.customerId) {
            const oldTier = c.tier;
            const netPoints = Math.max(0, c.loyaltyPoints + pointsEarned - pointsRedeemed);
            let tier: Customer['tier'] = 'Bronze';
            if (netPoints >= 2000) tier = 'Platinum';
            else if (netPoints >= 1000) tier = 'Gold';
            else if (netPoints >= 400) tier = 'Silver';
            const newCustomer = { ...c, loyaltyPoints: netPoints, totalSpent: c.totalSpent + sale.total, totalPurchases: c.totalPurchases + 1, tier };
            Service.upsertCustomer(newCustomer).catch(() => {});
            // Trigger tier upgrade SMS if tier changed
            if (tier !== oldTier && c.phone) {
              import('@/services/smsService').then(({ sendTierUpgradeSMS }) => {
                sendTierUpgradeSMS({ phone: c.phone, customerName: c.name, customerId: c.id, newTier: tier, loyaltyPoints: netPoints }).catch(() => {});
              }).catch(() => {});
            }
            return newCustomer;
          }
          return c;
        });
        return updated;
      });
    }
    try { await Service.insertSale(sale); } catch {}
  }, []);

  const addRefund = useCallback(async (refundData: {
    originalSaleId: string; cashier: string; items: any[];
    refundMethod: string; totalRefunded: number; reason: string;
  }): Promise<string> => {
    const originalSale = sales.find(s => s.id === refundData.originalSaleId);
    const receiptNo = `HGA-REFUND-${Date.now().toString().slice(-6)}`;
    setProducts(prev =>
      prev.map(p => {
        const item = refundData.items.find((i: any) => i.productId === p.id);
        if (item) {
          const newStock = p.stock + item.qty;
          const movement: InventoryMovement = {
            id: `mov_refund_${Date.now()}_${p.id}`,
            productId: p.id, productName: p.name,
            type: 'return', qty: item.qty,
            previousStock: p.stock, newStock,
            note: `Refund ${receiptNo}`,
            recordedBy: refundData.cashier,
            timestamp: new Date().toISOString(),
          };
          setInventoryMovements(m => [movement, ...m]);
          Service.insertInventoryMovement(movement).catch(() => {});
          return { ...p, stock: newStock };
        }
        return p;
      })
    );
    setSales(prev => prev.map(s => s.id === refundData.originalSaleId ? { ...s, status: 'refunded' as const } : s));
    try {
      await Service.insertRefund({
        id: `refund_${Date.now()}`,
        originalSaleId: refundData.originalSaleId, receiptNo,
        originalReceiptNo: originalSale?.receiptNo || '',
        cashier: refundData.cashier, items: refundData.items,
        refundMethod: refundData.refundMethod, totalRefunded: refundData.totalRefunded,
        reason: refundData.reason, timestamp: new Date().toISOString(),
      });
    } catch {}
    return receiptNo;
  }, [sales]);

  const getLowStockProducts = useCallback(() =>
    products.filter(p => p.stock <= p.minStock && p.status === 'active'), [products]);

  const searchProducts = useCallback((query: string) => {
    const q = query.toLowerCase();
    const bundleProds = bundles.filter(b => b.status === 'active' && b.name.toLowerCase().includes(q)).map(bundleToProduct);
    const regularProds = products.filter(p =>
      p.status === 'active' &&
      (p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
    );
    return [...regularProds, ...bundleProds];
  }, [products, bundles]);

  const getProductByBarcode = useCallback((barcode: string) =>
    products.find(p => p.barcode.toLowerCase() === barcode.toLowerCase() && p.status === 'active'),
    [products]);

  const getProductsByCategory = useCallback((catId: string) => {
    if (catId === 'cat_all') {
      const bundleProds = bundles.filter(b => b.status === 'active').map(bundleToProduct);
      return [...products.filter(p => p.status === 'active'), ...bundleProds];
    }
    if (catId === 'cat_bundles') return bundles.filter(b => b.status === 'active').map(bundleToProduct);
    return products.filter(p => p.category === catId && p.status === 'active');
  }, [products, bundles]);

  const addInventoryMovement = useCallback((movement: InventoryMovement) => {
    setInventoryMovements(prev => [movement, ...prev]);
  }, []);

  const addRestockRequest = useCallback((request: RestockRequest) => {
    setRestockRequests(prev => [request, ...prev]);
  }, []);

  const updateRestockRequest = useCallback((id: string, status: RestockRequest['status']) => {
    setRestockRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }, []);

  const addDamagedLog = useCallback((log: DamagedGoodsLog) => {
    setDamagedLogs(prev => [log, ...prev]);
  }, []);

  const logDamagedGoods = useCallback((productId: string, qty: number, reason: string, reportedBy: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const newStock = Math.max(0, product.stock - qty);
    const movement: InventoryMovement = {
      id: `mov_dmg_${Date.now()}`,
      productId, productName: product.name,
      type: 'damaged', qty: -qty,
      previousStock: product.stock, newStock,
      note: `Damaged: ${reason}`, recordedBy: reportedBy,
      timestamp: new Date().toISOString(),
    };
    const dmgLog: DamagedGoodsLog = {
      id: `dmg_${Date.now()}`, productId, productName: product.name,
      qty, reason, estimatedLoss: product.buyingPrice * qty,
      reportedBy, timestamp: new Date().toISOString(),
    };
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: newStock } : p));
    setInventoryMovements(prev => [movement, ...prev]);
    setDamagedLogs(prev => [dmgLog, ...prev]);
    Service.insertInventoryMovement(movement).catch(() => {});
    Service.updateProductStock(productId, newStock).catch(() => {});
  }, [products]);

  const restockProduct = useCallback((productId: string, qty: number, note: string, recordedBy: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const newStock = product.stock + qty;
    const movement: InventoryMovement = {
      id: `mov_rst_${Date.now()}`,
      productId, productName: product.name,
      type: 'restock', qty,
      previousStock: product.stock, newStock,
      note, recordedBy,
      timestamp: new Date().toISOString(),
    };
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: newStock } : p));
    setInventoryMovements(prev => [movement, ...prev]);
    Service.insertInventoryMovement(movement).catch(() => {});
    Service.updateProductStock(productId, newStock).catch(() => {});
  }, [products]);

  const addOrder = useCallback((order: Order) => {
    setOrders(prev => [order, ...prev]);
  }, []);

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o));
    Service.updateOrderStatusInDB(id, status).catch(() => {});
  }, []);

  const assignRider = useCallback(async (orderId: string, riderName: string, riderPhone: string, assignedBy: string, notes?: string) => {
    const assignment: RiderAssignment = {
      id: `ra_${Date.now()}`,
      orderId, riderName, riderPhone, assignedBy,
      assignedAt: new Date().toISOString(),
      notes, status: 'active',
    };
    setRiderAssignments(prev => [assignment, ...prev]);
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, assignedTo: `${riderName} (${riderPhone})`, updatedAt: new Date().toISOString() } : o
    ));
    try { await Service.insertRiderAssignment({ orderId, riderName, riderPhone, assignedBy, notes }); } catch {}
  }, []);

  const getRiderHistory = useCallback((orderId: string) =>
    riderAssignments.filter(a => a.orderId === orderId), [riderAssignments]);

  // ─── Bundle Methods ───────────────────────────────────────────────────────
  const addBundle = useCallback((bundle: ProductBundle) => {
    setBundles(prev => [bundle, ...prev]);
    // Persist to database
    Service.upsertBundle(bundle).catch(() => {});
  }, []);

  const updateBundle = useCallback((bundle: ProductBundle) => {
    setBundles(prev => prev.map(b => b.id === bundle.id ? bundle : b));
    Service.upsertBundle(bundle).catch(() => {});
  }, []);

  const deleteBundle = useCallback((id: string) => {
    setBundles(prev => prev.map(b => b.id === id ? { ...b, status: 'inactive' as const } : b));
    Service.archiveBundle(id).catch(() => {});
  }, []);

  // Returns array of {product, qty} pairs to add to cart when a bundle is sold
  const addBundleToCart = useCallback((bundle: ProductBundle): { product: Product; qty: number }[] => {
    return bundle.components.reduce((acc: { product: Product; qty: number }[], comp) => {
      const product = products.find(p => p.id === comp.productId);
      if (product) acc.push({ product, qty: comp.qty });
      return acc;
    }, []);
  }, [products]);

  const uploadProductImage = useCallback(async (productId: string, base64: string, mimeType: string): Promise<string> => {
    return await Service.uploadProductImage(productId, base64, mimeType);
  }, []);

  return (
    <POSContext.Provider value={{
      products, customers, sales, categories,
      inventoryMovements, restockRequests, damagedLogs, suppliers, orders,
      riderAssignments, bundles, isCloudSynced, isSyncing,
      addProduct, updateProduct, deleteProduct,
      addCustomer, updateCustomer, addSale, addRefund,
      getLowStockProducts, searchProducts, getProductByBarcode, getProductsByCategory,
      addInventoryMovement, addRestockRequest, updateRestockRequest,
      addDamagedLog, logDamagedGoods, restockProduct,
      addOrder, updateOrderStatus, assignRider, getRiderHistory,
      addBundle, updateBundle, deleteBundle, addBundleToCart,
      uploadProductImage,
    }}>
      {children}
    </POSContext.Provider>
  );
}
