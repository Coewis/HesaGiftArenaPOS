import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ScrollView, Dimensions, Modal, ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import { useCart } from '@/hooks/useCart';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useShift } from '@/hooks/useShift';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Product, PaymentMethod, SaleRecord, Customer, SplitPayment, ProductBundle } from '@/types';
import { POINTS_PER_UNIT, DISCOUNT_PER_UNIT } from '@/contexts/CartContext';
import { bundleToProduct } from '@/contexts/POSContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768;
const isDesktop = SCREEN_WIDTH >= 1024;
const width = SCREEN_WIDTH;
const PRODUCT_CARD_W = isDesktop ? (SCREEN_WIDTH * 0.62 - 60) / 4 : isTablet ? (SCREEN_WIDTH * 0.58 - 48) / 3 : (SCREEN_WIDTH - 32) / 2;
const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function registerForNotifications() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch { return false; }
}

async function sendLowStockNotification(productName: string, stock: number, minStock: number) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: stock === 0 ? '🚨 Out of Stock!' : '⚠️ Low Stock Alert',
        body: stock === 0
          ? `${productName} is now OUT OF STOCK. Restock immediately.`
          : `${productName} is running low — only ${stock} unit${stock !== 1 ? 's' : ''} left (min: ${minStock}). Tap to restock.`,
        data: { productName, stock, minStock, action: 'restock' },
        categoryIdentifier: 'RESTOCK_ALERT',
        // Android action button
        ...(Platform.OS === 'android' ? {
          actions: [{ identifier: 'restock', buttonTitle: 'Restock Now', isDestructive: false, isAuthenticationRequired: false }]
        } : {}),
      },
      trigger: null,
    });
  } catch {}
}

async function setupNotificationCategory() {
  try {
    if (Platform.OS === 'ios') {
      await Notifications.setNotificationCategoryAsync('RESTOCK_ALERT', [
        { identifier: 'restock', buttonTitle: 'Restock Now', options: { opensAppToForeground: true } },
        { identifier: 'dismiss', buttonTitle: 'Dismiss', options: { isDestructive: true, opensAppToForeground: false } },
      ]);
    }
  } catch {}
}

const PAYMENT_METHODS: { key: PaymentMethod; icon: string; color: string; bg: string }[] = [
  { key: 'Cash', icon: 'payments', color: Colors.success, bg: Colors.successMuted },
  { key: 'MTN MoMo', icon: 'phone-android', color: Colors.mtnDark, bg: 'rgba(255,204,0,0.15)' },
  { key: 'Airtel Money', icon: 'phone-android', color: Colors.airtel, bg: 'rgba(232,0,30,0.12)' },
  { key: 'Card', icon: 'credit-card', color: Colors.skyBlue, bg: Colors.skyBlueMuted },
  { key: 'Split', icon: 'call-split', color: Colors.gold, bg: Colors.goldMuted },
];

const SPLIT_METHODS: { key: PaymentMethod; label: string; color: string }[] = [
  { key: 'Cash', label: 'Cash', color: Colors.success },
  { key: 'MTN MoMo', label: 'MTN MoMo', color: Colors.mtnDark },
  { key: 'Airtel Money', label: 'Airtel Money', color: Colors.airtel },
  { key: 'Card', label: 'Card', color: Colors.skyBlue },
];

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32', Silver: '#A8A8A8', Gold: '#D4AF37', Platinum: '#38B6FF',
};

export default function POSScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { currentBranch } = useBranch();
  const { activeShift, openShift, closeShift, recordSaleInShift } = useShift();
  const { isOnline, syncStatus, pendingCount, lastSyncTime, manualSync } = useOfflineSync();
  const { categories, getProductsByCategory, searchProducts, addSale, customers, getProductByBarcode, addCustomer, getLowStockProducts, bundles, addBundleToCart } = usePOS();
  const {
    items, addItem, removeItem, updateQty,
    customer, setCustomer,
    discount, setDiscount,
    pointsRedeemed, pointsDiscount, setPointsToRedeem,
    paymentMethod, setPaymentMethod,
    splitPayment, setSplitPayment,
    subtotal, totalDiscount, total, itemCount,
    clearCart, completedSale, setCompletedSale,
  } = useCart();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('cat_all');
  const [showPayModal, setShowPayModal] = useState(false);
  const [processingPay, setProcessingPay] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [earnedPoints, setEarnedPoints] = useState(0);

  // Shift management
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftMode, setShiftMode] = useState<'open' | 'close'>('open');
  const [floatInput, setFloatInput] = useState('');
  const [cashCountInput, setCashCountInput] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftProcessing, setShiftProcessing] = useState(false);
  const [closedShift, setClosedShift] = useState<any>(null);
  const [showShiftReport, setShowShiftReport] = useState(false);

  // Barcode scanner
  const [showScanner, setShowScanner] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanCooldown = useRef(false);

  // Customer
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerModalTab, setCustomerModalTab] = useState<'search' | 'new'>('search');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Loyalty
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
  const [loyaltyInput, setLoyaltyInput] = useState('');

  // Split
  const [splitAmount1, setSplitAmount1] = useState('');
  const [splitAmount2, setSplitAmount2] = useState('');
  const [splitMethod1, setSplitMethod1] = useState<PaymentMethod>('Cash');
  const [splitMethod2, setSplitMethod2] = useState<PaymentMethod>('MTN MoMo');

  useEffect(() => { registerForNotifications().then(() => setupNotificationCategory()); }, []);

  const posCategories = useMemo(() => {
    const bundleCategory = { id: 'cat_bundles', name: '🎁 Bundles', icon: 'card-giftcard', color: '#9B59B6' };
    const hasBundles = bundles.filter(b => b.status === 'active').length > 0;
    if (hasBundles && !categories.find(c => c.id === 'cat_bundles')) {
      return [...categories, bundleCategory];
    }
    return categories;
  }, [categories, bundles]);

  const filteredProducts = useMemo(() => {
    if (search.trim()) return searchProducts(search);
    return getProductsByCategory(activeCategory);
  }, [search, activeCategory, getProductsByCategory, searchProducts]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
    );
  }, [customers, customerSearch]);

  const splitTotal1 = parseFloat(splitAmount1) || 0;
  const splitTotal2 = parseFloat(splitAmount2) || 0;
  const splitSum = splitTotal1 + splitTotal2;
  const splitValid = Math.abs(splitSum - total) < 1;

  const maxRedeemablePoints = customer ? Math.floor(customer.loyaltyPoints / POINTS_PER_UNIT) * POINTS_PER_UNIT : 0;
  const maxPointsDiscount = (maxRedeemablePoints / POINTS_PER_UNIT) * DISCOUNT_PER_UNIT;

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { showAlert('Camera Permission', 'Camera access is required to scan barcodes.'); return; }
    }
    setShowScanner(true);
  };

  const handleBarcodeScan = useCallback((barcode: string) => {
    if (scanCooldown.current) return;
    scanCooldown.current = true;
    setTimeout(() => { scanCooldown.current = false; }, 2000);
    const product = getProductByBarcode(barcode);
    if (product) {
      addItem(product);
      setShowScanner(false);
      showAlert('Product Added', `${product.name} added to cart.`);
    } else {
      showAlert('Not Found', `No product found for barcode: ${barcode}`);
    }
  }, [getProductByBarcode, addItem]);

  const handleAddToCart = (product: Product) => {
    // Check if it's a bundle
    if (product.id.startsWith('bundle_')) {
      const bundleId = product.id.replace('bundle_', '');
      const bundle = bundles.find(b => b.id === bundleId);
      if (bundle) {
        // Add bundle as a single line item at bundle price
        addItem(product);
        return;
      }
    }
    addItem(product);
  };

  const selectCustomer = (c: Customer) => {
    setCustomer(c);
    setShowCustomerModal(false);
    setCustomerSearch('');
    setCustomerModalTab('search');
  };

  const handleSaveNewCustomer = async () => {
    if (!newCustName.trim() || !newCustPhone.trim()) {
      showAlert('Missing Fields', 'Name and phone are required.'); return;
    }
    setSavingCustomer(true);
    try {
      const newCustomer: Customer = {
        id: `cust_${Date.now()}`, name: newCustName.trim(), phone: newCustPhone.trim(),
        email: newCustEmail.trim(), loyaltyPoints: 0, totalPurchases: 0, totalSpent: 0,
        joinDate: new Date().toISOString().slice(0, 10), tier: 'Bronze',
      };
      const saved = await addCustomer(newCustomer);
      selectCustomer(saved);
      setNewCustName(''); setNewCustPhone(''); setNewCustEmail('');
    } catch { showAlert('Error', 'Could not save customer. Please try again.'); }
    finally { setSavingCustomer(false); }
  };

  const handleOpenLoyaltyModal = () => {
    if (!customer) return;
    setLoyaltyInput(String(pointsRedeemed || ''));
    setShowLoyaltyModal(true);
  };

  const handleApplyLoyalty = () => {
    const pts = parseInt(loyaltyInput) || 0;
    if (pts < 0) { showAlert('Invalid', 'Enter a positive number of points.'); return; }
    if (pts > customer!.loyaltyPoints) { showAlert('Insufficient Points', `Customer only has ${customer!.loyaltyPoints} loyalty points.`); return; }
    if (pts % POINTS_PER_UNIT !== 0) { showAlert('Invalid Amount', `Points must be in multiples of ${POINTS_PER_UNIT}.`); return; }
    const disc = (pts / POINTS_PER_UNIT) * DISCOUNT_PER_UNIT;
    if (disc > subtotal) { showAlert('Exceeds Total', `Points discount cannot exceed subtotal.`); return; }
    setPointsToRedeem(pts);
    setShowLoyaltyModal(false);
    showAlert('Points Applied', `${pts} points redeemed for ${formatUGX(disc)} discount.`);
  };

  const handleRemoveLoyalty = () => { setPointsToRedeem(0); setLoyaltyInput(''); };

  const handleSplitAmount1Change = (val: string) => {
    setSplitAmount1(val);
    const a1 = parseFloat(val) || 0;
    const remaining = Math.max(0, total - a1);
    setSplitAmount2(remaining > 0 ? String(remaining) : '');
  };

  // Shift management
  const handleOpenShift = async () => {
    const float = parseFloat(floatInput) || 0;
    setShiftProcessing(true);
    try {
      await openShift(user?.id || 'user', user?.name || 'Cashier', currentBranch.id, currentBranch.name, float);
      setShowShiftModal(false);
      setFloatInput('');
      showAlert('Shift Opened', `Shift started with float of ${formatUGX(float)}.`);
    } catch { showAlert('Error', 'Could not open shift.'); }
    finally { setShiftProcessing(false); }
  };

  const handleCloseShift = async () => {
    const cashCount = parseFloat(cashCountInput) || 0;
    setShiftProcessing(true);
    try {
      const closed = await closeShift(cashCount, shiftNotes || undefined, activeShift!.totalSales, activeShift!.totalTransactions);
      setClosedShift(closed);
      setShowShiftModal(false);
      setCashCountInput(''); setShiftNotes('');
      setShowShiftReport(true);
    } catch { showAlert('Error', 'Could not close shift.'); }
    finally { setShiftProcessing(false); }
  };

  const buildShiftReportHTML = (shift: any) => {
    const variance = shift.variance || 0;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#1a1a1a;}
    .header{text-align:center;border-bottom:3px solid #D4AF37;padding-bottom:16px;margin-bottom:20px;}
    .brand{font-size:24px;font-weight:900;color:#B8922E;letter-spacing:2px;}
    .kpi-grid{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
    .kpi{flex:1;min-width:120px;background:#f8f5ee;border:1px solid #E8D5A0;border-radius:8px;padding:12px;text-align:center;}
    .kpi-val{font-size:20px;font-weight:900;color:#B8922E;}
    .kpi-lbl{font-size:11px;color:#888;margin-top:3px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}
    th{background:#0A1628;color:#D4AF37;padding:9px 12px;text-align:left;font-size:13px;}
    td{padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;}
    .hi{font-weight:bold;color:#B8922E;}
    .var-pos{color:#27ae60;font-weight:bold;}
    .var-neg{color:#e74c3c;font-weight:bold;}
    </style></head><body>
    <div class="header"><div class="brand">HESA GIFT ARENA</div>
    <div style="font-size:16px;font-weight:bold;color:#0A1628;margin-top:8px;">SHIFT CLOSING REPORT</div>
    <div style="font-size:12px;color:#666;margin-top:4px;">${shift.branchName}</div></div>
    <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${shift.totalTransactions}</div><div class="kpi-lbl">Transactions</div></div>
    <div class="kpi"><div class="kpi-val">UGX ${(shift.totalSales || 0).toLocaleString()}</div><div class="kpi-lbl">Total Sales</div></div>
    <div class="kpi"><div class="kpi-val">UGX ${(shift.floatAmount || 0).toLocaleString()}</div><div class="kpi-lbl">Opening Float</div></div>
    </div>
    <table><tr><th colspan="2">Cash Reconciliation</th></tr>
    <tr><td>Opening Float</td><td class="hi">UGX ${(shift.floatAmount || 0).toLocaleString()}</td></tr>
    <tr><td>Expected Cash (Float + Cash Sales)</td><td class="hi">UGX ${(shift.expectedCash || 0).toLocaleString()}</td></tr>
    <tr><td>Actual Cash Count</td><td class="hi">UGX ${(shift.cashCount || 0).toLocaleString()}</td></tr>
    <tr><td><strong>Variance</strong></td><td class="${variance >= 0 ? 'var-pos' : 'var-neg'}">${variance >= 0 ? '+' : ''}UGX ${variance.toLocaleString()}</td></tr>
    </table>
    <table><tr><th colspan="2">Shift Details</th></tr>
    <tr><td>Cashier</td><td>${shift.cashierName}</td></tr>
    <tr><td>Branch</td><td>${shift.branchName}</td></tr>
    <tr><td>Opened</td><td>${new Date(shift.openingTime).toLocaleString('en-UG')}</td></tr>
    <tr><td>Closed</td><td>${new Date(shift.closingTime || new Date()).toLocaleString('en-UG')}</td></tr>
    ${shift.notes ? `<tr><td>Notes</td><td>${shift.notes}</td></tr>` : ''}
    </table>
    <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">HESA GIFT ARENA POS · Shift Report · Confidential</p>
    </body></html>`;
  };

  const handlePrintShiftReport = async (shift: any) => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildShiftReportHTML(shift) });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Shift Report' });
      else await Print.printAsync({ html: buildShiftReportHTML(shift) });
    } catch { showAlert('Error', 'Could not generate shift report.'); }
  };

  const handleCheckout = useCallback(async () => {
    if (items.length === 0) { showAlert('Cart Empty', 'Add products to the cart before checkout.'); return; }
    if (paymentMethod === 'Split') {
      if (!splitValid) { showAlert('Split Payment Error', `Amounts must sum to ${formatUGX(total)}.`); return; }
      if (splitMethod1 === splitMethod2) { showAlert('Split Payment Error', 'Please select two different payment methods.'); return; }
    }
    setShowPayModal(false);
    setProcessingPay(true);
    await new Promise(r => setTimeout(r, 1500));
    setProcessingPay(false);

    const receiptNo = `HGA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
    const points = customer ? Math.floor(total / 1000) : 0;
    setEarnedPoints(points);

    const activeSplit: SplitPayment | undefined = paymentMethod === 'Split'
      ? { method1: splitMethod1, amount1: splitTotal1, method2: splitMethod2, amount2: splitTotal2 }
      : undefined;

    const sale: SaleRecord = {
      id: `sale_${Date.now()}`,
      receiptNo,
      cashier: user?.name || 'Cashier',
      cashierId: user?.id || '',
      branchId: currentBranch.id,
      branchName: currentBranch.name,
      shiftId: activeShift?.id,
      items: items.map(i => ({ productId: i.product.id, name: i.product.name, qty: i.qty, price: i.unitPrice, total: i.total })),
      subtotal, discount: totalDiscount, tax: 0, total,
      paymentMethod, splitPayment: activeSplit,
      status: 'completed',
      customerId: customer?.id, customerName: customer?.name,
      pointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
      timestamp: new Date().toISOString(),
    };
    await addSale(sale, pointsRedeemed);

    // Record in active shift
    recordSaleInShift(total);

    setCompletedSale(sale);
    clearCart();
    setDiscountInput('');
    setSplitAmount1(''); setSplitAmount2('');

    const lowStockProducts = getLowStockProducts();
    for (const product of lowStockProducts) {
      const soldItem = sale.items.find(i => i.productId === product.id);
      if (soldItem) await sendLowStockNotification(product.name, product.stock, product.minStock);
    }

    setShowReceipt(true);
  }, [items, subtotal, totalDiscount, total, paymentMethod, customer, user, addSale, clearCart,
    splitValid, splitMethod1, splitMethod2, splitTotal1, splitTotal2, splitSum,
    pointsRedeemed, getLowStockProducts, activeShift, recordSaleInShift]);

  const applyDiscount = () => {
    const val = parseFloat(discountInput);
    if (!isNaN(val) && val >= 0) setDiscount(val);
  };

  // Enhanced receipt HTML with logo watermark and professional design
  const buildReceiptHTML = (sale: SaleRecord) => `
    <!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
    body{font-family:'Courier New',Courier,monospace;max-width:340px;margin:0 auto;padding:0;background:#fff;color:#1a1a1a;position:relative;}
    .receipt-wrap{padding:20px 18px;position:relative;overflow:hidden;}
    .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.04;pointer-events:none;text-align:center;z-index:0;}
    .watermark-text{font-size:72px;font-weight:900;color:#B8922E;letter-spacing:2px;white-space:nowrap;}
    .content{position:relative;z-index:1;}
    .header{text-align:center;margin-bottom:14px;}
    .logo-circle{width:72px;height:72px;border-radius:50%;border:2.5px solid #D4AF37;margin:0 auto 10px;overflow:hidden;background:#0A1628;display:flex;align-items:center;justify-content:center;}
    .logo-inner{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0A1628 0%,#1A3055 100%);}
    .logo-text{font-size:22px;font-weight:900;color:#D4AF37;letter-spacing:1px;}
    .brand{font-size:18px;font-weight:900;letter-spacing:3px;color:#B8922E;margin-bottom:2px;}
    .slogan{font-size:10px;font-style:italic;color:#888;margin-bottom:3px;}
    .addr{font-size:10px;color:#666;}
    .receipt-badge{display:inline-block;background:#0A1628;color:#D4AF37;font-size:11px;font-weight:bold;padding:3px 12px;border-radius:20px;margin-top:8px;letter-spacing:1px;}
    .divider{border:none;border-top:1px dashed #ccc;margin:12px 0;}
    .divider-solid{border:none;border-top:1.5px solid #D4AF37;margin:12px 0;}
    .info-row{display:flex;justify-content:space-between;font-size:11px;margin:2px 0;color:#444;}
    .info-label{color:#888;}
    .receipt-no{font-size:13px;font-weight:bold;color:#1A9FE8;text-align:center;margin:6px 0;}
    .items-header{display:flex;justify-content:space-between;font-size:10px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:0.5px;padding:4px 0;border-bottom:1px solid #eee;margin-bottom:4px;}
    .item-row{display:flex;justify-content:space-between;align-items:flex-start;font-size:12px;padding:4px 0;border-bottom:1px dotted #f0f0f0;}
    .item-name{flex:1;padding-right:6px;font-weight:500;}
    .item-qty{width:24px;text-align:center;color:#888;font-size:11px;}
    .item-unit{width:68px;text-align:right;color:#888;font-size:11px;}
    .item-total{width:72px;text-align:right;font-weight:600;}
    .totals{margin-top:8px;}
    .total-row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;}
    .total-label{color:#555;}
    .grand-row{display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #D4AF37;margin-top:6px;}
    .grand-label{font-size:15px;font-weight:900;color:#0A1628;}
    .grand-value{font-size:18px;font-weight:900;color:#B8922E;}
    .payment-row{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;}
    .payment-method{color:#1A9FE8;font-weight:bold;}
    .split-box{background:#f0f8ff;border:1px solid #b3d9f5;border-radius:6px;padding:8px;margin-top:6px;}
    .split-title{font-size:11px;font-weight:bold;color:#1A9FE8;margin-bottom:4px;}
    .split-row{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;}
    .loyalty-box{background:#fffbec;border:1px solid #D4AF37;border-radius:6px;padding:8px;margin-top:6px;text-align:center;}
    .loyalty-points{font-size:14px;font-weight:bold;color:#B8922E;}
    .loyalty-label{font-size:10px;color:#888;margin-top:2px;}
    .footer{text-align:center;margin-top:14px;padding-top:12px;border-top:1px dashed #ddd;}
    .footer-msg{font-size:11px;color:#555;font-style:italic;margin-bottom:6px;}
    .footer-barcode{font-family:'Courier New',monospace;font-size:28px;letter-spacing:3px;color:#333;margin:4px 0;}
    .footer-no{font-size:10px;color:#999;letter-spacing:1px;}
    .branch-badge{font-size:10px;color:#9B59B6;font-weight:bold;margin-top:4px;}
    </style></head><body>
    <div class="receipt-wrap">
    <div class="watermark"><div class="watermark-text">HGA</div></div>
    <div class="content">
    <div class="header">
      <div class="logo-circle"><div class="logo-inner"><div class="logo-text">HGA</div></div></div>
      <div class="brand">HESA GIFT ARENA</div>
      <div class="slogan">"Where Every Gift Tells a Beautiful Story."</div>
      <div class="addr">${sale.branchName || 'Kampala Road, Kampala'} · +256 700 000 001</div>
      <div class="receipt-badge">SALES RECEIPT</div>
    </div>
    <hr class="divider-solid"/>
    <div class="receipt-no">${sale.receiptNo}</div>
    <div class="info-row"><span class="info-label">Date & Time</span><span>${new Date(sale.timestamp).toLocaleString('en-UG')}</span></div>
    <div class="info-row"><span class="info-label">Cashier</span><span>${sale.cashier}</span></div>
    ${sale.customerName ? `<div class="info-row"><span class="info-label">Customer</span><span>${sale.customerName}</span></div>` : ''}
    ${sale.branchName ? `<div class="info-row"><span class="info-label">Branch</span><span>${sale.branchName}</span></div>` : ''}
    <hr class="divider"/>
    <div class="items-header"><span>Item</span><span>Qty</span><span>Price</span><span>Total</span></div>
    ${sale.items.map(i => `<div class="item-row"><span class="item-name">${i.name}</span><span class="item-qty">${i.qty}</span><span class="item-unit">${i.price.toLocaleString()}</span><span class="item-total">${i.total.toLocaleString()}</span></div>`).join('')}
    <div class="totals">
      <div class="total-row"><span class="total-label">Subtotal</span><span>UGX ${sale.subtotal.toLocaleString()}</span></div>
      ${sale.discount > 0 ? `<div class="total-row"><span class="total-label" style="color:#27ae60">Discount</span><span style="color:#27ae60">-UGX ${sale.discount.toLocaleString()}</span></div>` : ''}
      ${sale.pointsRedeemed ? `<div class="total-row"><span class="total-label" style="color:#B8922E">⭐ Points (${sale.pointsRedeemed}pts)</span><span style="color:#B8922E">-UGX ${(Math.floor(sale.pointsRedeemed / POINTS_PER_UNIT) * DISCOUNT_PER_UNIT).toLocaleString()}</span></div>` : ''}
      <div class="grand-row"><span class="grand-label">TOTAL PAID</span><span class="grand-value">UGX ${sale.total.toLocaleString()}</span></div>
    </div>
    <div class="payment-row"><span class="total-label">Payment Method</span><span class="payment-method">${sale.paymentMethod}</span></div>
    ${sale.splitPayment ? `<div class="split-box"><div class="split-title">Split Payment Breakdown</div><div class="split-row"><span>${sale.splitPayment.method1}</span><span>UGX ${sale.splitPayment.amount1.toLocaleString()}</span></div><div class="split-row"><span>${sale.splitPayment.method2}</span><span>UGX ${sale.splitPayment.amount2.toLocaleString()}</span></div></div>` : ''}
    ${sale.customerId ? `<div class="loyalty-box"><div class="loyalty-points">+${Math.floor(sale.total / 1000)} Loyalty Points</div><div class="loyalty-label">Points earned on this purchase</div></div>` : ''}
    <div class="footer">
      <div class="footer-msg">Thank you for shopping at Hesa Gift Arena!</div>
      <div class="footer-barcode">||| ${sale.receiptNo} |||</div>
      <div class="footer-no">${sale.receiptNo}</div>
      ${sale.branchName ? `<div class="branch-badge">${sale.branchName}</div>` : ''}
    </div>
    </div></div>
    </body></html>`;

  const handlePrintReceipt = async () => {
    if (!completedSale) return;
    try { await Print.printAsync({ html: buildReceiptHTML(completedSale) }); }
    catch { showAlert('Print Error', 'Could not print receipt.'); }
  };

  const handleShareReceipt = async () => {
    if (!completedSale) return;
    try {
      const { uri } = await Print.printToFileAsync({ html: buildReceiptHTML(completedSale) });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Receipt ${completedSale.receiptNo}` });
      else showAlert('Sharing Unavailable', 'Sharing is not supported on this device.');
    } catch { showAlert('Share Error', 'Could not generate PDF receipt.'); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="point-of-sale" size={20} color={Colors.gold} />
          <Text style={styles.headerTitle}>POS Terminal</Text>
        </View>
        <View style={[styles.branchBadge, { borderColor: currentBranch.color + '60', backgroundColor: currentBranch.color + '15' }]}>
          <View style={[styles.branchBadgeDot, { backgroundColor: currentBranch.color }]} />
          <Text style={[styles.branchBadgeText, { color: currentBranch.color }]}>{currentBranch.shortName}</Text>
        </View>
        {/* Offline/Sync Status Indicator */}
        <TouchableOpacity
          style={[
            styles.syncBadge,
            syncStatus === 'offline' && styles.syncBadgeOffline,
            syncStatus === 'syncing' && styles.syncBadgeSyncing,
            syncStatus === 'sync_error' && styles.syncBadgeError,
            syncStatus === 'online' && pendingCount === 0 && styles.syncBadgeOnline,
            syncStatus === 'online' && pendingCount > 0 && styles.syncBadgePending,
          ]}
          onPress={isOnline ? manualSync : undefined}
          disabled={syncStatus === 'syncing'}
        >
          {syncStatus === 'syncing' ? (
            <ActivityIndicator size={10} color={Colors.warning} />
          ) : (
            <MaterialIcons
              name={syncStatus === 'offline' ? 'wifi-off' : syncStatus === 'sync_error' ? 'sync-problem' : pendingCount > 0 ? 'sync' : 'cloud-done'}
              size={11}
              color={syncStatus === 'offline' ? Colors.danger : syncStatus === 'sync_error' ? Colors.warning : pendingCount > 0 ? Colors.warning : Colors.success}
            />
          )}
          <Text style={[
            styles.syncBadgeText,
            { color: syncStatus === 'offline' ? Colors.danger : syncStatus === 'sync_error' ? Colors.warning : pendingCount > 0 ? Colors.warning : Colors.success }
          ]}>
            {syncStatus === 'offline' ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'sync_error' ? 'Sync Error' : pendingCount > 0 ? `${pendingCount} pending` : 'Synced'}
          </Text>
        </TouchableOpacity>
        {/* Shift Badge */}
        <TouchableOpacity
          style={[styles.shiftBadge, activeShift ? styles.shiftBadgeActive : styles.shiftBadgeInactive]}
          onPress={() => { setShiftMode(activeShift ? 'close' : 'open'); setShowShiftModal(true); }}
        >
          <MaterialIcons name={activeShift ? 'lock-open' : 'lock'} size={12} color={activeShift ? Colors.success : Colors.warning} />
          <Text style={[styles.shiftBadgeText, { color: activeShift ? Colors.success : Colors.warning }]}>
            {activeShift ? 'Shift Open' : 'No Shift'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-UG', { day: 'numeric', month: 'short' })}</Text>
        <View style={styles.cashierBadge}>
          <MaterialIcons name="person" size={12} color={Colors.gold} />
          <Text style={styles.cashierText}>{user?.name?.split(' ')[0]}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* LEFT: Products */}
        <View style={styles.leftPanel}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={18} color={Colors.textMuted} />
              <TextInput style={styles.searchInput} placeholder="Search products..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} />
              {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><MaterialIcons name="close" size={16} color={Colors.textMuted} /></TouchableOpacity>}
            </View>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
              <MaterialIcons name="qr-code-scanner" size={20} color={Colors.gold} />
            </TouchableOpacity>
          </View>
          <View style={styles.categoryWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
              {posCategories.map(cat => (
                <TouchableOpacity key={cat.id} style={[styles.catChip, activeCategory === cat.id && styles.catChipActive]} onPress={() => { setActiveCategory(cat.id); setSearch(''); }}>
                  <Text style={[styles.catChipText, activeCategory === cat.id && styles.catChipTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={filteredProducts}
            keyExtractor={item => item.id}
            numColumns={isTablet ? 3 : 2}
            contentContainerStyle={styles.productGrid}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={styles.emptyProducts}><MaterialIcons name="inventory-2" size={40} color={Colors.textMuted} /><Text style={styles.emptyText}>No products found</Text></View>}
            renderItem={({ item }) => {
              const isBundle = item.id.startsWith('bundle_');
              return (
                <TouchableOpacity style={[styles.productCard, isBundle && styles.bundleProductCard]} onPress={() => handleAddToCart(item)} activeOpacity={0.7}>
                  <Image source={{ uri: item.imageUrl }} style={styles.productImg} contentFit="cover" transition={200} />
                  {item.stock <= item.minStock && !isBundle && (<View style={styles.lowStockTag}><Text style={styles.lowStockTagText}>Low</Text></View>)}
                  {isBundle && <View style={styles.bundleTag}><MaterialIcons name="card-giftcard" size={10} color={Colors.textPrimary} /><Text style={styles.bundleTagText}>Bundle</Text></View>}
                  {(item.discount || 0) > 0 && <View style={styles.discountTag}><Text style={styles.discountTagText}>{item.discount}% OFF</Text></View>}
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.productPrice}>{formatUGX(item.price)}</Text>
                    <Text style={styles.productStock}>{isBundle ? 'Gift Bundle' : `${item.stock} left`}</Text>
                  </View>
                  <View style={[styles.addBtnCircle, isBundle && { backgroundColor: '#9B59B6' }]}><MaterialIcons name="add" size={18} color={Colors.navy} /></View>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* RIGHT: Cart */}
        <View style={styles.rightPanel}>
          <View style={styles.cartHeader}>
            <MaterialIcons name="shopping-cart" size={18} color={Colors.gold} />
            <Text style={styles.cartTitle}>Cart ({itemCount})</Text>
            {items.length > 0 && (
              <TouchableOpacity onPress={() => showAlert('Clear Cart', 'Remove all items?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearCart },
              ])}>
                <MaterialIcons name="delete-sweep" size={18} color={Colors.danger} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.customerRow} onPress={() => { setShowCustomerModal(true); setCustomerModalTab('search'); }}>
            <MaterialIcons name="person-add" size={16} color={customer ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.customerText, customer && { color: Colors.gold }]}>{customer ? customer.name : 'Attach Customer'}</Text>
            {customer ? (
              <View style={[styles.customerTierBadge, { backgroundColor: TIER_COLORS[customer.tier] + '20' }]}>
                <Text style={[styles.customerTierText, { color: TIER_COLORS[customer.tier] }]}>{customer.tier}</Text>
              </View>
            ) : null}
            {customer ? (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setCustomer(null); handleRemoveLoyalty(); }}>
                <MaterialIcons name="close" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          {customer && customer.loyaltyPoints >= POINTS_PER_UNIT && (
            <TouchableOpacity style={styles.loyaltyRow} onPress={handleOpenLoyaltyModal}>
              <View style={styles.loyaltyLeft}>
                <MaterialIcons name="star" size={15} color={Colors.gold} />
                <Text style={styles.loyaltyLabel}>{customer.loyaltyPoints} pts available</Text>
                {pointsRedeemed > 0 && (
                  <View style={styles.loyaltyAppliedBadge}><Text style={styles.loyaltyAppliedText}>-{formatUGX(pointsDiscount)}</Text></View>
                )}
              </View>
              <View style={styles.loyaltyRight}>
                {pointsRedeemed > 0 ? (
                  <View style={styles.loyaltyRedeemedRow}>
                    <Text style={styles.loyaltyRedeemedText}>{pointsRedeemed} pts redeemed</Text>
                    <TouchableOpacity style={styles.loyaltyRemoveBtn} onPress={(e) => { e.stopPropagation(); handleRemoveLoyalty(); }}>
                      <MaterialIcons name="close" size={12} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.redeemBtn}>
                    <MaterialIcons name="redeem" size={12} color={Colors.navy} />
                    <Text style={styles.redeemBtnText}>Redeem</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}

          <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <View style={styles.emptyCart}><MaterialIcons name="add-shopping-cart" size={36} color={Colors.textMuted} /><Text style={styles.emptyCartText}>Tap products to add</Text></View>
            ) : (
              items.map(item => (
                <View key={item.product.id} style={styles.cartItem}>
                  <Image source={{ uri: item.product.imageUrl }} style={styles.cartItemImg} contentFit="cover" />
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName} numberOfLines={1}>{item.product.name}</Text>
                    <Text style={styles.cartItemPrice}>{formatUGX(item.unitPrice)}</Text>
                  </View>
                  <View style={styles.qtyControl}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => item.qty === 1 ? removeItem(item.product.id) : updateQty(item.product.id, item.qty - 1)}>
                      <MaterialIcons name={item.qty === 1 ? 'delete' : 'remove'} size={14} color={item.qty === 1 ? Colors.danger : Colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.product.id, item.qty + 1)}>
                      <MaterialIcons name="add" size={14} color={Colors.skyBlue} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cartItemTotal}>{formatUGX(item.total)}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.totalsArea}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{formatUGX(subtotal)}</Text></View>
            {discount > 0 && <View style={styles.totalRow}><Text style={[styles.totalLabel, { color: Colors.success }]}>Discount</Text><Text style={[styles.totalValue, { color: Colors.success }]}>-{formatUGX(discount)}</Text></View>}
            {pointsRedeemed > 0 && (
              <View style={styles.totalRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="star" size={11} color={Colors.gold} />
                  <Text style={[styles.totalLabel, { color: Colors.gold }]}>Points ({pointsRedeemed} pts)</Text>
                </View>
                <Text style={[styles.totalValue, { color: Colors.gold }]}>-{formatUGX(pointsDiscount)}</Text>
              </View>
            )}
            {customer && (
              <View style={styles.totalRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="star-border" size={11} color={Colors.skyBlue} />
                  <Text style={[styles.totalLabel, { color: Colors.skyBlue }]}>+{Math.floor(total / 1000)} pts on checkout</Text>
                </View>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalRowFinal]}>
              <Text style={styles.totalFinalLabel}>TOTAL</Text>
              <Text style={styles.totalFinalValue}>{formatUGX(total)}</Text>
            </View>
            <View style={styles.discountRow}>
              <View style={styles.discountInput}>
                <MaterialIcons name="local-offer" size={14} color={Colors.gold} />
                <TextInput style={styles.discountField} placeholder="Discount (UGX)" placeholderTextColor={Colors.textMuted} value={discountInput} onChangeText={setDiscountInput} keyboardType="numeric" />
              </View>
              <TouchableOpacity style={styles.discountApply} onPress={applyDiscount}>
                <Text style={styles.discountApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.paymentMethods}>
              {PAYMENT_METHODS.map(pm => (
                <TouchableOpacity key={pm.key} style={[styles.pmBtn, paymentMethod === pm.key && { backgroundColor: pm.bg, borderColor: pm.color }]} onPress={() => setPaymentMethod(pm.key)}>
                  <MaterialIcons name={pm.icon as any} size={14} color={paymentMethod === pm.key ? pm.color : Colors.textMuted} />
                  <Text style={[styles.pmBtnText, paymentMethod === pm.key && { color: pm.color }]}>{pm.key}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, items.length === 0 && styles.checkoutBtnDisabled]}
              onPress={() => items.length > 0 ? setShowPayModal(true) : null}
              disabled={items.length === 0}
            >
              <MaterialIcons name="shopping-bag" size={20} color={Colors.navy} />
              <Text style={styles.checkoutBtnText}>Charge {formatUGX(total)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ===== SHIFT MODAL ===== */}
      <Modal visible={showShiftModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.shiftModal}>
            <View style={styles.shiftModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name={shiftMode === 'open' ? 'lock-open' : 'lock'} size={22} color={shiftMode === 'open' ? Colors.success : Colors.warning} />
                <Text style={[styles.shiftModalTitle, { color: shiftMode === 'open' ? Colors.success : Colors.warning }]}>
                  {shiftMode === 'open' ? 'Open New Shift' : 'Close Current Shift'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowShiftModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.shiftModalBody}>
              {shiftMode === 'open' ? (
                <>
                  <View style={styles.shiftInfoCard}>
                    <View style={styles.shiftInfoRow}><MaterialIcons name="person" size={14} color={Colors.gold} /><Text style={styles.shiftInfoText}>{user?.name}</Text></View>
                    <View style={styles.shiftInfoRow}><MaterialIcons name="store" size={14} color={Colors.gold} /><Text style={styles.shiftInfoText}>{currentBranch.name}</Text></View>
                    <View style={styles.shiftInfoRow}><MaterialIcons name="schedule" size={14} color={Colors.gold} /><Text style={styles.shiftInfoText}>{new Date().toLocaleTimeString('en-UG')}</Text></View>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={styles.shiftLabel}>Opening Float (Cash in Drawer)</Text>
                    <View style={styles.shiftInputWrap}>
                      <Text style={styles.shiftCurrency}>UGX</Text>
                      <TextInput style={styles.shiftInput} placeholder="0" placeholderTextColor={Colors.textMuted} value={floatInput} onChangeText={setFloatInput} keyboardType="numeric" autoFocus />
                    </View>
                    <Text style={styles.shiftHint}>Enter the amount of cash in the drawer at shift start.</Text>
                  </View>
                  <View style={styles.floatPresets}>
                    {['50000', '100000', '200000', '500000'].map(v => (
                      <TouchableOpacity key={v} style={[styles.floatPreset, floatInput === v && styles.floatPresetActive]} onPress={() => setFloatInput(v)}>
                        <Text style={[styles.floatPresetText, floatInput === v && { color: Colors.navy }]}>{formatUGX(parseInt(v))}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.shiftSummaryCard}>
                    <Text style={styles.shiftSummaryLabel}>Current Shift Summary</Text>
                    <View style={styles.shiftSummaryRow}><Text style={styles.shiftSumLabel}>Transactions</Text><Text style={styles.shiftSumValue}>{activeShift?.totalTransactions || 0}</Text></View>
                    <View style={styles.shiftSummaryRow}><Text style={styles.shiftSumLabel}>Total Sales</Text><Text style={[styles.shiftSumValue, { color: Colors.gold }]}>{formatUGX(activeShift?.totalSales || 0)}</Text></View>
                    <View style={styles.shiftSummaryRow}><Text style={styles.shiftSumLabel}>Opening Float</Text><Text style={styles.shiftSumValue}>{formatUGX(activeShift?.floatAmount || 0)}</Text></View>
                    <View style={styles.shiftSummaryRow}><Text style={styles.shiftSumLabel}>Opened At</Text><Text style={styles.shiftSumValue}>{activeShift ? new Date(activeShift.openingTime).toLocaleTimeString('en-UG') : '-'}</Text></View>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={styles.shiftLabel}>Actual Cash Count in Drawer</Text>
                    <View style={styles.shiftInputWrap}>
                      <Text style={styles.shiftCurrency}>UGX</Text>
                      <TextInput style={styles.shiftInput} placeholder="0" placeholderTextColor={Colors.textMuted} value={cashCountInput} onChangeText={setCashCountInput} keyboardType="numeric" autoFocus />
                    </View>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={styles.shiftLabel}>Closing Notes (optional)</Text>
                    <TextInput style={[styles.shiftInputWrap, { height: 60, textAlignVertical: 'top', paddingVertical: 10, paddingHorizontal: 12 }]} placeholder="Any notes for this shift..." placeholderTextColor={Colors.textMuted} value={shiftNotes} onChangeText={setShiftNotes} multiline />
                  </View>
                </>
              )}
            </View>
            <View style={styles.shiftModalFooter}>
              <TouchableOpacity style={styles.shiftCancelBtn} onPress={() => setShowShiftModal(false)}>
                <Text style={styles.shiftCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.shiftConfirmBtn, { backgroundColor: shiftMode === 'open' ? Colors.success : Colors.warning }, shiftProcessing && { opacity: 0.7 }]}
                onPress={shiftMode === 'open' ? handleOpenShift : handleCloseShift}
                disabled={shiftProcessing}
              >
                {shiftProcessing ? <ActivityIndicator color={Colors.navy} size="small" /> : (
                  <>
                    <MaterialIcons name={shiftMode === 'open' ? 'lock-open' : 'lock'} size={16} color={Colors.navy} />
                    <Text style={styles.shiftConfirmText}>{shiftMode === 'open' ? 'Open Shift' : 'Close Shift'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Shift Report Modal */}
      <Modal visible={showShiftReport} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.shiftReportModal}>
            <View style={styles.shiftModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="summarize" size={22} color={Colors.gold} />
                <Text style={styles.shiftModalTitle}>Shift Closed</Text>
              </View>
              <TouchableOpacity onPress={() => setShowShiftReport(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {closedShift && (
              <ScrollView contentContainerStyle={styles.shiftModalBody}>
                <View style={[styles.varianceBanner, { backgroundColor: (closedShift.variance || 0) >= 0 ? Colors.successMuted : Colors.dangerMuted, borderColor: (closedShift.variance || 0) >= 0 ? Colors.success + '40' : Colors.danger + '40' }]}>
                  <MaterialIcons name={(closedShift.variance || 0) >= 0 ? 'check-circle' : 'warning'} size={24} color={(closedShift.variance || 0) >= 0 ? Colors.success : Colors.danger} />
                  <View>
                    <Text style={[styles.varianceLabel, { color: (closedShift.variance || 0) >= 0 ? Colors.success : Colors.danger }]}>
                      {(closedShift.variance || 0) >= 0 ? 'Cash Surplus' : 'Cash Shortage'}
                    </Text>
                    <Text style={[styles.varianceValue, { color: (closedShift.variance || 0) >= 0 ? Colors.success : Colors.danger }]}>
                      {(closedShift.variance || 0) >= 0 ? '+' : ''}{formatUGX(closedShift.variance || 0)}
                    </Text>
                  </View>
                </View>
                {[
                  { label: 'Total Sales', value: formatUGX(closedShift.totalSales || 0), color: Colors.gold },
                  { label: 'Transactions', value: String(closedShift.totalTransactions || 0), color: Colors.skyBlue },
                  { label: 'Opening Float', value: formatUGX(closedShift.floatAmount || 0) },
                  { label: 'Expected Cash', value: formatUGX(closedShift.expectedCash || 0) },
                  { label: 'Actual Cash Count', value: formatUGX(closedShift.cashCount || 0) },
                  { label: 'Duration', value: (() => { const mins = Math.round((new Date(closedShift.closingTime || new Date()).getTime() - new Date(closedShift.openingTime).getTime()) / 60000); return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`; })() },
                ].map(stat => (
                  <View key={stat.label} style={styles.shiftStatRow}>
                    <Text style={styles.shiftStatLabel}>{stat.label}</Text>
                    <Text style={[styles.shiftStatValue, stat.color ? { color: stat.color } : {}]}>{stat.value}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.shiftReportActions}>
              <TouchableOpacity style={styles.shiftReportBtn} onPress={() => closedShift && handlePrintShiftReport(closedShift)}>
                <MaterialIcons name="share" size={16} color={Colors.gold} />
                <Text style={styles.shiftReportBtnText}>Share Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.shiftReportBtn, { backgroundColor: Colors.gold }]} onPress={() => setShowShiftReport(false)}>
                <MaterialIcons name="check" size={16} color={Colors.navy} />
                <Text style={[styles.shiftReportBtnText, { color: Colors.navy }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* BARCODE SCANNER */}
      <Modal visible={showScanner} animationType="slide">
        <View style={styles.scannerContainer}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.scannerCloseBtn}>
              <MaterialIcons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan Product Barcode</Text>
            <View style={{ width: 40 }} />
          </View>
          <CameraView style={styles.camera} facing="back" onBarcodeScanned={({ data }) => handleBarcodeScan(data)} barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'qr', 'upc_a', 'upc_e'] }}>
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerViewfinder}>
                <View style={[styles.scannerCorner, styles.scannerCornerTL]} />
                <View style={[styles.scannerCorner, styles.scannerCornerTR]} />
                <View style={[styles.scannerCorner, styles.scannerCornerBL]} />
                <View style={[styles.scannerCorner, styles.scannerCornerBR]} />
                <View style={styles.scannerLine} />
              </View>
            </View>
          </CameraView>
          <View style={[styles.scannerFooter, { paddingBottom: insets.bottom + 20 }]}>
            <MaterialIcons name="info" size={16} color={Colors.textMuted} />
            <Text style={styles.scannerHint}>Point camera at product barcode to scan</Text>
          </View>
        </View>
      </Modal>

      {/* LOYALTY MODAL */}
      <Modal visible={showLoyaltyModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.loyaltyModal}>
            <View style={styles.loyaltyModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="star" size={22} color={Colors.gold} />
                <Text style={styles.loyaltyModalTitle}>Redeem Loyalty Points</Text>
              </View>
              <TouchableOpacity onPress={() => setShowLoyaltyModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.loyaltyModalBody}>
              <View style={styles.loyaltyInfoCard}>
                <View style={styles.loyaltyInfoRow}>
                  <MaterialIcons name="person" size={16} color={Colors.gold} />
                  <Text style={styles.loyaltyInfoName}>{customer?.name}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[customer?.tier || 'Bronze'] + '20' }]}>
                    <Text style={[styles.tierBadgeText, { color: TIER_COLORS[customer?.tier || 'Bronze'] }]}>{customer?.tier}</Text>
                  </View>
                </View>
                <View style={styles.loyaltyPointsGrid}>
                  <View style={styles.loyaltyPointsCard}><Text style={styles.loyaltyPointsValue}>{customer?.loyaltyPoints}</Text><Text style={styles.loyaltyPointsLabel}>Available Points</Text></View>
                  <View style={styles.loyaltyPointsCard}><Text style={[styles.loyaltyPointsValue, { color: Colors.gold }]}>{maxRedeemablePoints}</Text><Text style={styles.loyaltyPointsLabel}>Redeemable</Text></View>
                  <View style={styles.loyaltyPointsCard}><Text style={[styles.loyaltyPointsValue, { color: Colors.success }]}>{formatUGX(maxPointsDiscount)}</Text><Text style={styles.loyaltyPointsLabel}>Max Discount</Text></View>
                </View>
              </View>
              <View style={styles.loyaltyRateBox}>
                <MaterialIcons name="info" size={13} color={Colors.skyBlue} />
                <Text style={styles.loyaltyRateText}>{POINTS_PER_UNIT} pts = {formatUGX(DISCOUNT_PER_UNIT)} discount · Must be multiples of {POINTS_PER_UNIT}</Text>
              </View>
              <Text style={styles.loyaltyQuickLabel}>Quick Select</Text>
              <View style={styles.loyaltyQuickRow}>
                {[100, 200, 500, 1000].filter(p => p <= maxRedeemablePoints).map(p => {
                  const disc = (p / POINTS_PER_UNIT) * DISCOUNT_PER_UNIT;
                  return (
                    <TouchableOpacity key={p} style={[styles.loyaltyQuickBtn, loyaltyInput === String(p) && styles.loyaltyQuickBtnActive]} onPress={() => setLoyaltyInput(String(p))}>
                      <Text style={[styles.loyaltyQuickBtnPts, loyaltyInput === String(p) && { color: Colors.navy }]}>{p} pts</Text>
                      <Text style={[styles.loyaltyQuickBtnDisc, loyaltyInput === String(p) && { color: Colors.navy + 'cc' }]}>-{formatUGX(disc)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {maxRedeemablePoints > 0 && (
                  <TouchableOpacity style={[styles.loyaltyQuickBtn, loyaltyInput === String(maxRedeemablePoints) && styles.loyaltyQuickBtnActive]} onPress={() => setLoyaltyInput(String(maxRedeemablePoints))}>
                    <Text style={[styles.loyaltyQuickBtnPts, loyaltyInput === String(maxRedeemablePoints) && { color: Colors.navy }]}>Max</Text>
                    <Text style={[styles.loyaltyQuickBtnDisc, loyaltyInput === String(maxRedeemablePoints) && { color: Colors.navy + 'cc' }]}>{maxRedeemablePoints} pts</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.loyaltyQuickLabel}>Or Enter Custom Amount</Text>
              <View style={styles.loyaltyInputRow}>
                <View style={styles.loyaltyInputWrap}>
                  <MaterialIcons name="star" size={16} color={Colors.gold} />
                  <TextInput style={styles.loyaltyInput} placeholder={`Multiple of ${POINTS_PER_UNIT} (max ${maxRedeemablePoints})`} placeholderTextColor={Colors.textMuted} value={loyaltyInput} onChangeText={setLoyaltyInput} keyboardType="numeric" />
                </View>
                {loyaltyInput ? (
                  <View style={styles.loyaltyPreviewDisc}>
                    <Text style={styles.loyaltyPreviewDiscText}>-{formatUGX(Math.floor((parseInt(loyaltyInput) || 0) / POINTS_PER_UNIT) * DISCOUNT_PER_UNIT)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.loyaltyModalFooter}>
              <TouchableOpacity style={styles.loyaltyModalCancelBtn} onPress={() => setShowLoyaltyModal(false)}><Text style={styles.loyaltyModalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.loyaltyModalApplyBtn} onPress={handleApplyLoyalty}>
                <MaterialIcons name="redeem" size={16} color={Colors.navy} />
                <Text style={styles.loyaltyModalApplyText}>Apply Points</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOMER MODAL */}
      <Modal visible={showCustomerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.customerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customer</Text>
              <TouchableOpacity onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); setCustomerModalTab('search'); }}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.custTabRow}>
              <TouchableOpacity style={[styles.custTab, customerModalTab === 'search' && styles.custTabActive]} onPress={() => setCustomerModalTab('search')}>
                <MaterialIcons name="search" size={14} color={customerModalTab === 'search' ? Colors.navy : Colors.textMuted} />
                <Text style={[styles.custTabText, customerModalTab === 'search' && styles.custTabTextActive]}>Search</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.custTab, customerModalTab === 'new' && styles.custTabActive]} onPress={() => setCustomerModalTab('new')}>
                <MaterialIcons name="person-add" size={14} color={customerModalTab === 'new' ? Colors.navy : Colors.textMuted} />
                <Text style={[styles.custTabText, customerModalTab === 'new' && styles.custTabTextActive]}>New Customer</Text>
              </TouchableOpacity>
            </View>
            {customerModalTab === 'search' ? (
              <>
                <View style={styles.customerSearchBar}>
                  <MaterialIcons name="search" size={16} color={Colors.textMuted} />
                  <TextInput style={styles.customerSearchInput} placeholder="Search by name or phone..." placeholderTextColor={Colors.textMuted} value={customerSearch} onChangeText={setCustomerSearch} autoFocus />
                  {customerSearch.length > 0 && <TouchableOpacity onPress={() => setCustomerSearch('')}><MaterialIcons name="close" size={14} color={Colors.textMuted} /></TouchableOpacity>}
                </View>
                <ScrollView style={styles.customerList} showsVerticalScrollIndicator={false}>
                  <TouchableOpacity style={styles.customerListItem} onPress={() => { setCustomer(null); setShowCustomerModal(false); setCustomerSearch(''); }}>
                    <View style={[styles.customerListAvatar, { backgroundColor: Colors.navyLight }]}><MaterialIcons name="person-outline" size={20} color={Colors.textMuted} /></View>
                    <View style={styles.customerListInfo}><Text style={styles.customerListName}>Walk-in Customer</Text><Text style={styles.customerListPhone}>No loyalty tracking</Text></View>
                    {!customer && <MaterialIcons name="check-circle" size={18} color={Colors.success} />}
                  </TouchableOpacity>
                  {filteredCustomers.map(c => (
                    <TouchableOpacity key={c.id} style={[styles.customerListItem, customer?.id === c.id && styles.customerListItemActive]} onPress={() => selectCustomer(c)}>
                      <View style={[styles.customerListAvatar, { backgroundColor: TIER_COLORS[c.tier] + '20', borderColor: TIER_COLORS[c.tier] + '50', borderWidth: 1.5 }]}>
                        <Text style={[styles.customerListAvatarText, { color: TIER_COLORS[c.tier] }]}>{c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <View style={styles.customerListInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.customerListName}>{c.name}</Text>
                          <View style={[styles.customerListTier, { backgroundColor: TIER_COLORS[c.tier] + '20' }]}>
                            <Text style={[styles.customerListTierText, { color: TIER_COLORS[c.tier] }]}>{c.tier}</Text>
                          </View>
                        </View>
                        <Text style={styles.customerListPhone}>{c.phone}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MaterialIcons name="star" size={11} color={Colors.gold} />
                          <Text style={[styles.customerListPhone, { color: Colors.gold }]}>{c.loyaltyPoints} pts</Text>
                          <Text style={styles.customerListPhone}>· {c.totalPurchases} purchases</Text>
                        </View>
                      </View>
                      {customer?.id === c.id && <MaterialIcons name="check-circle" size={18} color={Colors.success} />}
                    </TouchableOpacity>
                  ))}
                  {filteredCustomers.length === 0 && customerSearch.trim() && (
                    <View style={styles.customerNotFound}>
                      <MaterialIcons name="person-search" size={36} color={Colors.textMuted} />
                      <Text style={styles.customerNotFoundText}>No customer found</Text>
                      <TouchableOpacity style={styles.newCustQuickBtn} onPress={() => setCustomerModalTab('new')}>
                        <MaterialIcons name="person-add" size={14} color={Colors.navy} />
                        <Text style={styles.newCustQuickBtnText}>Register New Customer</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </>
            ) : (
              <ScrollView contentContainerStyle={styles.newCustForm} showsVerticalScrollIndicator={false}>
                <View style={styles.newCustInfoBox}>
                  <MaterialIcons name="info" size={14} color={Colors.skyBlue} />
                  <Text style={styles.newCustInfoText}>Register walk-in customer and auto-attach to this sale</Text>
                </View>
                {[
                  { label: 'Full Name *', value: newCustName, onChange: setNewCustName, placeholder: 'Customer full name', keyboard: 'default' as const },
                  { label: 'Phone Number *', value: newCustPhone, onChange: setNewCustPhone, placeholder: '+256 7XX XXX XXX', keyboard: 'phone-pad' as const },
                  { label: 'Email (optional)', value: newCustEmail, onChange: setNewCustEmail, placeholder: 'email@example.com', keyboard: 'email-address' as const },
                ].map(field => (
                  <View key={field.label} style={styles.newCustFormGroup}>
                    <Text style={styles.newCustLabel}>{field.label}</Text>
                    <TextInput style={styles.newCustInput} placeholder={field.placeholder} placeholderTextColor={Colors.textMuted} value={field.value} onChangeText={field.onChange} keyboardType={field.keyboard} />
                  </View>
                ))}
                <TouchableOpacity style={[styles.newCustSaveBtn, savingCustomer && { opacity: 0.7 }]} onPress={handleSaveNewCustomer} disabled={savingCustomer}>
                  {savingCustomer ? <ActivityIndicator color={Colors.navy} size="small" /> : (
                    <><MaterialIcons name="person-add" size={16} color={Colors.navy} /><Text style={styles.newCustSaveBtnText}>Register & Attach to Sale</Text></>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* PAYMENT MODAL */}
      <Modal visible={showPayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} showsVerticalScrollIndicator={false}>
            <View style={styles.payModal}>
              <Text style={styles.payModalTitle}>Confirm Payment</Text>
              <View style={styles.payModalRow}><Text style={styles.payModalLabel}>Total Amount</Text><Text style={styles.payModalAmount}>{formatUGX(total)}</Text></View>
              {paymentMethod === 'Split' ? (
                <View style={styles.splitConfig}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="call-split" size={16} color={Colors.gold} />
                    <Text style={styles.splitConfigTitle}>Split Payment</Text>
                  </View>
                  {[
                    { label: 'Method 1', method: splitMethod1, setMethod: setSplitMethod1, amount: splitAmount1, setAmount: handleSplitAmount1Change },
                    { label: 'Method 2', method: splitMethod2, setMethod: setSplitMethod2, amount: splitAmount2, setAmount: setSplitAmount2 },
                  ].map((block, bi) => (
                    <View key={bi} style={styles.splitMethodBlock}>
                      <Text style={styles.splitMethodLabel}>{block.label}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                        {SPLIT_METHODS.map(m => (
                          <TouchableOpacity key={m.key} style={[styles.splitMethodChip, block.method === m.key && { backgroundColor: m.color + '20', borderColor: m.color }]} onPress={() => block.setMethod(m.key as PaymentMethod)}>
                            <Text style={[styles.splitMethodChipText, block.method === m.key && { color: m.color, fontWeight: Typography.bold }]}>{m.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TextInput style={styles.splitAmountInput} placeholder="Amount (UGX)" placeholderTextColor={Colors.textMuted} value={block.amount} onChangeText={block.setAmount} keyboardType="numeric" />
                    </View>
                  ))}
                  <View style={[styles.splitSummary, { borderColor: splitValid ? Colors.success + '40' : Colors.danger + '40', backgroundColor: splitValid ? Colors.successMuted : Colors.dangerMuted }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.splitSummaryLabel}>{splitMethod1}</Text><Text style={styles.splitSummaryValue}>{splitTotal1 > 0 ? formatUGX(splitTotal1) : '—'}</Text></View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.splitSummaryLabel}>{splitMethod2}</Text><Text style={styles.splitSummaryValue}>{splitTotal2 > 0 ? formatUGX(splitTotal2) : '—'}</Text></View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 6, marginTop: 4 }}>
                      <Text style={[styles.splitSummaryLabel, { fontWeight: Typography.bold }]}>Sum</Text>
                      <Text style={[styles.splitSummaryValue, { color: splitValid ? Colors.success : Colors.danger, fontWeight: Typography.bold }]}>{formatUGX(splitSum)}{splitValid ? ' ✓' : ` (need ${formatUGX(total)})`}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.payModalRow}><Text style={styles.payModalLabel}>Payment Method</Text><Text style={styles.payModalMethod}>{paymentMethod}</Text></View>
              )}
              {pointsRedeemed > 0 && (
                <View style={[styles.payModalRow, { backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.sm, padding: 8 }]}>
                  <MaterialIcons name="star" size={14} color={Colors.gold} />
                  <Text style={[styles.payModalLabel, { color: Colors.gold }]}>{pointsRedeemed} points → -{formatUGX(pointsDiscount)}</Text>
                </View>
              )}
              {customer && (
                <View style={[styles.payModalRow, { backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.sm, padding: 8 }]}>
                  <MaterialIcons name="star-border" size={14} color={Colors.skyBlue} />
                  <Text style={[styles.payModalLabel, { color: Colors.skyBlue }]}>+{Math.floor(total / 1000)} loyalty pts earned</Text>
                </View>
              )}
              <View style={styles.payModalRow}><Text style={styles.payModalLabel}>Items</Text><Text style={styles.payModalValue}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text></View>
              <View style={styles.payModalBtns}>
                <TouchableOpacity style={styles.payModalCancel} onPress={() => setShowPayModal(false)}><Text style={styles.payModalCancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.payModalConfirm, paymentMethod === 'Split' && !splitValid && styles.payModalConfirmDisabled]} onPress={handleCheckout} disabled={paymentMethod === 'Split' && !splitValid}>
                  <MaterialIcons name="check-circle" size={18} color={Colors.navy} />
                  <Text style={styles.payModalConfirmText}>Confirm & Pay</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Processing */}
      <Modal visible={processingPay} transparent animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={Colors.gold} />
            <Text style={styles.processingTitle}>Processing Payment</Text>
            <Text style={styles.processingSubtitle}>{paymentMethod} · {formatUGX(total)}</Text>
          </View>
        </View>
      </Modal>

      {/* Receipt */}
      <Modal visible={showReceipt} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.receiptModal}>
            <View style={styles.receiptSuccess}>
              <MaterialIcons name="check-circle" size={48} color={Colors.success} />
              <Text style={styles.receiptTitle}>Payment Successful!</Text>
            </View>
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptBrand}>HESA GIFT ARENA</Text>
              <Text style={styles.receiptSlogan}>"Where Every Gift Tells a Beautiful Story."</Text>
              {completedSale && <Text style={styles.receiptNo}>{completedSale.receiptNo}</Text>}
              <Text style={styles.receiptDate}>{new Date().toLocaleString('en-UG')}</Text>
              <Text style={styles.receiptCashier}>Cashier: {user?.name}</Text>
              {completedSale?.customerName && <Text style={styles.receiptCashier}>Customer: {completedSale.customerName}</Text>}
              {activeShift && <Text style={styles.receiptCashier}>Shift ID: {activeShift.id.slice(-8)}</Text>}
            </View>
            <ScrollView style={styles.receiptItems} showsVerticalScrollIndicator={false}>
              {completedSale?.items.map((item, i) => (
                <View key={i} style={styles.receiptItem}>
                  <Text style={styles.receiptItemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.receiptItemQty}>x{item.qty}</Text>
                  <Text style={styles.receiptItemTotal}>{formatUGX(item.total)}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.receiptTotals}>
              <View style={styles.receiptRow}><Text style={styles.receiptRowLabel}>Subtotal</Text><Text style={styles.receiptRowValue}>{formatUGX(completedSale?.subtotal || 0)}</Text></View>
              {(completedSale?.discount || 0) > 0 && (
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptRowLabel, { color: Colors.success }]}>Discount</Text>
                  <Text style={[styles.receiptRowValue, { color: Colors.success }]}>-{formatUGX(completedSale?.discount || 0)}</Text>
                </View>
              )}
              {completedSale?.pointsRedeemed ? (
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptRowLabel, { color: Colors.gold }]}>⭐ Points ({completedSale.pointsRedeemed} pts)</Text>
                  <Text style={[styles.receiptRowValue, { color: Colors.gold }]}>-{formatUGX(Math.floor(completedSale.pointsRedeemed / POINTS_PER_UNIT) * DISCOUNT_PER_UNIT)}</Text>
                </View>
              ) : null}
              <View style={[styles.receiptRow, styles.receiptRowFinal]}>
                <Text style={styles.receiptTotalLabel}>TOTAL PAID</Text>
                <Text style={styles.receiptTotalValue}>{formatUGX(completedSale?.total || 0)}</Text>
              </View>
              <View style={styles.receiptRow}><Text style={styles.receiptRowLabel}>Payment</Text><Text style={[styles.receiptRowValue, { color: Colors.skyBlue }]}>{completedSale?.paymentMethod}</Text></View>
            </View>
            {earnedPoints > 0 && completedSale?.customerId && (
              <View style={styles.loyaltyEarned}>
                <MaterialIcons name="star" size={16} color={Colors.gold} />
                <Text style={styles.loyaltyEarnedText}>+{earnedPoints} Loyalty Points Awarded!</Text>
              </View>
            )}
            <View style={styles.receiptActions}>
              <TouchableOpacity style={styles.receiptActionBtn} onPress={handlePrintReceipt}>
                <MaterialIcons name="print" size={16} color={Colors.skyBlue} />
                <Text style={styles.receiptActionText}>Print</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.receiptActionBtn} onPress={handleShareReceipt}>
                <MaterialIcons name="share" size={16} color={Colors.skyBlue} />
                <Text style={styles.receiptActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.receiptActionBtn, styles.receiptCloseBtn]} onPress={() => { setShowReceipt(false); setCompletedSale(null); setEarnedPoints(0); }}>
                <MaterialIcons name="close" size={16} color={Colors.navy} />
                <Text style={[styles.receiptActionText, { color: Colors.navy }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderGold, backgroundColor: Colors.navyMid },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  headerTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerDate: { fontSize: Typography.xs, color: Colors.textMuted },
  branchBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.circle, borderWidth: 1 },
  branchBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  branchBadgeText: { fontSize: 10, fontWeight: Typography.bold },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.navyCard },
  syncBadgeOnline: { borderColor: Colors.success + '40', backgroundColor: Colors.successMuted },
  syncBadgeOffline: { borderColor: Colors.danger + '40', backgroundColor: Colors.dangerMuted },
  syncBadgeSyncing: { borderColor: Colors.warning + '40', backgroundColor: Colors.warningMuted },
  syncBadgeError: { borderColor: Colors.warning + '40', backgroundColor: Colors.warningMuted },
  syncBadgePending: { borderColor: Colors.warning + '40', backgroundColor: Colors.warningMuted },
  syncBadgeText: { fontSize: 9, fontWeight: Typography.bold },
  shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: BorderRadius.circle, borderWidth: 1 },
  shiftBadgeActive: { backgroundColor: Colors.successMuted, borderColor: Colors.success + '40' },
  shiftBadgeInactive: { backgroundColor: Colors.warningMuted, borderColor: Colors.warning + '40' },
  shiftBadgeText: { fontSize: 10, fontWeight: Typography.bold },
  cashierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.goldMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.circle },
  cashierText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },
  body: { flex: 1, flexDirection: isTablet ? 'row' : 'column' },
  leftPanel: { flex: isTablet ? 6 : 1, borderRightWidth: isTablet ? 1 : 0, borderRightColor: Colors.border },
  rightPanel: { flex: isTablet ? 4 : undefined, height: isTablet ? undefined : 440, backgroundColor: Colors.navyMid, borderTopWidth: isTablet ? 0 : 1, borderTopColor: Colors.borderGold },
  searchRow: { flexDirection: 'row', gap: 8, padding: Spacing.md, paddingBottom: 0 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm },
  scanBtn: { width: 42, height: 42, borderRadius: BorderRadius.md, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.borderGold },
  categoryWrap: { height: 52 },
  categories: { paddingHorizontal: Spacing.md, paddingVertical: 8, gap: 8, alignItems: 'center' },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.goldMuted, borderColor: Colors.gold },
  catChipText: { fontSize: 12, color: Colors.textMuted, fontWeight: Typography.medium },
  catChipTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  productGrid: { padding: Spacing.md, gap: 10 },
  productCard: { width: PRODUCT_CARD_W, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginRight: 10, ...Shadows.sm },
  bundleProductCard: { borderColor: '#9B59B6' + '50', backgroundColor: Colors.navyCard },
  productImg: { width: '100%', height: 110 },
  lowStockTag: { position: 'absolute', top: 6, right: 6, backgroundColor: Colors.warningMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  lowStockTagText: { fontSize: 9, color: Colors.warning, fontWeight: Typography.bold },
  bundleTag: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#9B59B6', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  bundleTagText: { fontSize: 9, color: Colors.textPrimary, fontWeight: Typography.bold },
  discountTag: { position: 'absolute', top: 6, right: 6, backgroundColor: Colors.successMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.success + '40' },
  discountTagText: { fontSize: 9, color: Colors.success, fontWeight: Typography.bold },
  productInfo: { padding: 8 },
  productName: { fontSize: 12, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: 2 },
  productPrice: { fontSize: 13, fontWeight: Typography.bold, color: Colors.gold },
  productStock: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  addBtnCircle: { position: 'absolute', bottom: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  emptyProducts: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { color: Colors.textMuted, fontSize: Typography.sm },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cartTitle: { flex: 1, fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.goldSubtle },
  customerText: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted },
  customerTierBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.circle },
  customerTierText: { fontSize: 9, fontWeight: Typography.bold },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.goldSubtle + 'aa' },
  loyaltyLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  loyaltyLabel: { fontSize: 12, color: Colors.textSecondary },
  loyaltyAppliedBadge: { backgroundColor: Colors.gold, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  loyaltyAppliedText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.navy },
  loyaltyRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loyaltyRedeemedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  loyaltyRedeemedText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.medium },
  loyaltyRemoveBtn: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.dangerMuted, alignItems: 'center', justifyContent: 'center' },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.gold, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm },
  redeemBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  cartList: { flex: 1 },
  emptyCart: { padding: 24, alignItems: 'center', gap: 8, opacity: 0.5 },
  emptyCartText: { color: Colors.textMuted, fontSize: Typography.sm },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  cartItemImg: { width: 36, height: 36, borderRadius: 8 },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 12, fontWeight: Typography.medium, color: Colors.textPrimary },
  cartItemPrice: { fontSize: 11, color: Colors.textMuted },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  qtyBtn: { padding: 3 },
  qtyText: { fontSize: 13, fontWeight: Typography.bold, color: Colors.textPrimary, minWidth: 20, textAlign: 'center' },
  cartItemTotal: { fontSize: 12, fontWeight: Typography.bold, color: Colors.gold, minWidth: 80, textAlign: 'right' },
  totalsArea: { padding: Spacing.md, gap: 6, borderTopWidth: 1, borderTopColor: Colors.borderGold, backgroundColor: Colors.navy },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRowFinal: { paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.divider, marginTop: 4 },
  totalLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  totalValue: { fontSize: Typography.sm, color: Colors.textSecondary },
  totalFinalLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  totalFinalValue: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.gold },
  discountRow: { flexDirection: 'row', gap: 8 },
  discountInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 6 },
  discountField: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm },
  discountApply: { backgroundColor: Colors.goldMuted, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.borderGold, justifyContent: 'center' },
  discountApplyText: { fontSize: 12, fontWeight: Typography.bold, color: Colors.gold },
  paymentMethods: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  pmBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: BorderRadius.sm, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  pmBtnText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: 4, ...Shadows.gold },
  checkoutBtnDisabled: { backgroundColor: Colors.textMuted, ...Shadows.sm },
  checkoutBtnText: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.navy },
  // Shift Modal
  shiftModal: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: Colors.borderGold, alignSelf: 'center' },
  shiftReportModal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '85%', borderTopWidth: 2, borderColor: Colors.borderGold, width: '100%' },
  shiftModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  shiftModalTitle: { fontSize: Typography.lg, fontWeight: Typography.bold },
  shiftModalBody: { padding: Spacing.xl, gap: Spacing.md },
  shiftInfoCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.borderGold },
  shiftInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftInfoText: { fontSize: Typography.sm, color: Colors.textSecondary },
  shiftLabel: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.semibold },
  shiftInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  shiftCurrency: { fontSize: Typography.sm, color: Colors.textMuted, marginRight: 4 },
  shiftInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.xl, fontWeight: Typography.bold, paddingVertical: 12 },
  shiftHint: { fontSize: Typography.xs, color: Colors.textMuted },
  floatPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  floatPreset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  floatPresetActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  floatPresetText: { fontSize: 11, color: Colors.textMuted, fontWeight: Typography.medium },
  shiftSummaryCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, gap: 6, borderWidth: 1, borderColor: Colors.borderGold },
  shiftSummaryLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  shiftSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  shiftSumLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  shiftSumValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  shiftModalFooter: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  shiftCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  shiftCancelText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  shiftConfirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md },
  shiftConfirmText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // Variance Banner
  varianceBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.md },
  varianceLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  varianceValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold },
  shiftStatRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  shiftStatLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  shiftStatValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  shiftReportActions: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  shiftReportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: BorderRadius.md, backgroundColor: Colors.goldMuted, borderWidth: 1, borderColor: Colors.borderGold },
  shiftReportBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.8)' },
  scannerCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scannerTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  camera: { flex: 1 },
  scannerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scannerViewfinder: { width: 260, height: 180, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  scannerCorner: { position: 'absolute', width: 30, height: 30, borderColor: Colors.gold, borderWidth: 3 },
  scannerCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  scannerCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  scannerCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  scannerCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scannerLine: { position: 'absolute', width: '100%', height: 2, backgroundColor: Colors.gold, opacity: 0.8 },
  scannerFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingTop: 16, paddingHorizontal: Spacing.base, backgroundColor: 'rgba(0,0,0,0.8)' },
  scannerHint: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  // Loyalty Modal
  loyaltyModal: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl, width: '100%', maxWidth: 440, maxHeight: '88%', borderWidth: 1, borderColor: Colors.borderGold },
  loyaltyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  loyaltyModalTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gold },
  loyaltyModalBody: { padding: Spacing.xl, gap: Spacing.md },
  loyaltyInfoCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderGold, padding: Spacing.md, gap: Spacing.sm },
  loyaltyInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loyaltyInfoName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.circle },
  tierBadgeText: { fontSize: 10, fontWeight: Typography.bold },
  loyaltyPointsGrid: { flexDirection: 'row', gap: 8 },
  loyaltyPointsCard: { flex: 1, backgroundColor: Colors.navyLight, borderRadius: BorderRadius.sm, padding: 8, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: Colors.border },
  loyaltyPointsValue: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: Colors.textPrimary },
  loyaltyPointsLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
  loyaltyRateBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30' },
  loyaltyRateText: { flex: 1, fontSize: 11, color: Colors.skyBlue },
  loyaltyQuickLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  loyaltyQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  loyaltyQuickBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', minWidth: 72 },
  loyaltyQuickBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  loyaltyQuickBtnPts: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  loyaltyQuickBtnDisc: { fontSize: 10, color: Colors.textMuted },
  loyaltyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loyaltyInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  loyaltyInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.base, paddingVertical: 12 },
  loyaltyPreviewDisc: { backgroundColor: Colors.gold, borderRadius: BorderRadius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  loyaltyPreviewDiscText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  loyaltyModalFooter: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  loyaltyModalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  loyaltyModalCancelText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  loyaltyModalApplyBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, backgroundColor: Colors.gold, ...Shadows.gold },
  loyaltyModalApplyText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // Customer Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  customerModal: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xxl, width: '100%', maxWidth: 440, maxHeight: '85%', borderWidth: 1, borderColor: Colors.borderGold },
  custTabRow: { flexDirection: 'row', margin: Spacing.md, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: 3, borderWidth: 1, borderColor: Colors.border },
  custTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: BorderRadius.sm },
  custTabActive: { backgroundColor: Colors.gold },
  custTabText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  custTabTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  customerSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  customerSearchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 10 },
  customerList: { maxHeight: 360 },
  customerListItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.xl, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  customerListItemActive: { backgroundColor: Colors.goldSubtle },
  customerListAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  customerListAvatarText: { fontSize: Typography.sm, fontWeight: Typography.extrabold },
  customerListInfo: { flex: 1, gap: 2 },
  customerListName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  customerListTier: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: BorderRadius.circle },
  customerListTierText: { fontSize: 9, fontWeight: Typography.bold },
  customerListPhone: { fontSize: Typography.xs, color: Colors.textMuted },
  customerNotFound: { alignItems: 'center', padding: 32, gap: 10 },
  customerNotFoundText: { fontSize: Typography.base, color: Colors.textMuted },
  newCustQuickBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: BorderRadius.md, ...Shadows.gold },
  newCustQuickBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy },
  newCustForm: { padding: Spacing.xl, gap: Spacing.md },
  newCustInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30' },
  newCustInfoText: { flex: 1, fontSize: Typography.xs, color: Colors.skyBlue },
  newCustFormGroup: { gap: 5 },
  newCustLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  newCustInput: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: Typography.base, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  newCustSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: BorderRadius.md, paddingVertical: 14, marginTop: 8, ...Shadows.gold },
  newCustSaveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // Pay Modal
  payModal: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl, padding: Spacing.xl, width: '100%', maxWidth: 440, borderWidth: 1, borderColor: Colors.borderGold, gap: 12 },
  payModalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold, textAlign: 'center' },
  payModalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 8 },
  payModalLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  payModalAmount: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.gold },
  payModalMethod: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.skyBlue },
  payModalValue: { fontSize: Typography.base, color: Colors.textPrimary },
  payModalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  payModalCancel: { flex: 1, paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  payModalCancelText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  payModalConfirm: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: BorderRadius.md, backgroundColor: Colors.gold, ...Shadows.gold },
  payModalConfirmDisabled: { backgroundColor: Colors.navyCard, ...Shadows.sm },
  payModalConfirmText: { color: Colors.navy, fontWeight: Typography.bold, fontSize: Typography.base },
  splitConfig: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderGold, padding: Spacing.md, gap: Spacing.md },
  splitConfigTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  splitMethodBlock: { gap: 8 },
  splitMethodLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  splitMethodChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.sm, backgroundColor: Colors.navyLight, borderWidth: 1, borderColor: Colors.border },
  splitMethodChipText: { fontSize: 12, color: Colors.textMuted },
  splitAmountInput: { backgroundColor: Colors.navyLight, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: Typography.base, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  splitSummary: { borderRadius: BorderRadius.sm, borderWidth: 1, padding: Spacing.md, gap: 4 },
  splitSummaryLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  splitSummaryValue: { fontSize: Typography.sm, color: Colors.textPrimary },
  // Processing
  processingOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  processingCard: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl, padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderColor: Colors.borderGold },
  processingTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  processingSubtitle: { fontSize: Typography.sm, color: Colors.textMuted },
  // Receipt
  receiptModal: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl, width: '100%', maxWidth: 420, maxHeight: '90%', borderWidth: 1, borderColor: Colors.borderGold },
  receiptSuccess: { alignItems: 'center', padding: Spacing.xl, gap: 8 },
  receiptTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.success },
  receiptHeader: { alignItems: 'center', gap: 4, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  receiptBrand: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.gold, letterSpacing: 1 },
  receiptSlogan: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  receiptNo: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.skyBlue },
  receiptDate: { fontSize: Typography.xs, color: Colors.textMuted },
  receiptCashier: { fontSize: Typography.xs, color: Colors.textMuted },
  receiptItems: { maxHeight: 160, paddingHorizontal: Spacing.xl },
  receiptItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  receiptItemName: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  receiptItemQty: { fontSize: Typography.xs, color: Colors.textMuted, marginHorizontal: 8 },
  receiptItemTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  receiptTotals: { padding: Spacing.xl, gap: 4, borderTopWidth: 1, borderTopColor: Colors.divider },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  receiptRowFinal: { paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider, marginTop: 4 },
  receiptRowLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  receiptRowValue: { fontSize: Typography.sm, color: Colors.textPrimary },
  receiptTotalLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  receiptTotalValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.gold },
  loyaltyEarned: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', backgroundColor: Colors.goldSubtle, marginHorizontal: Spacing.xl, borderRadius: BorderRadius.sm, padding: 10, borderWidth: 1, borderColor: Colors.borderGold },
  loyaltyEarnedText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  receiptActions: { flexDirection: 'row', gap: 8, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider },
  receiptActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: BorderRadius.md, backgroundColor: Colors.skyBlueMuted, borderWidth: 1, borderColor: Colors.skyBlue + '40' },
  receiptCloseBtn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  receiptActionText: { fontSize: 12, fontWeight: Typography.semibold, color: Colors.skyBlue },
});
