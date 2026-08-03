import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Modal, ScrollView, TextInput, Linking,
  Platform, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Product, InventoryMovement, RestockRequest, SupplierContact } from '@/types';
import { MOCK_CATEGORIES } from '@/constants/mockData';

type TabKey = 'stock' | 'movements' | 'restock' | 'damaged' | 'suppliers';

const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

const MOVEMENT_COLORS: Record<string, string> = {
  sale: Colors.skyBlue,
  restock: Colors.success,
  damaged: Colors.danger,
  adjustment: Colors.warning,
  return: '#9B59B6',
};
const MOVEMENT_ICONS: Record<string, string> = {
  sale: 'shopping-cart',
  restock: 'add-circle',
  damaged: 'broken-image',
  adjustment: 'tune',
  return: 'undo',
};

const STATUS_COLORS: Record<string, string> = {
  pending: Colors.warning,
  ordered: Colors.skyBlue,
  received: Colors.success,
  cancelled: Colors.danger,
};

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { currentBranch } = useBranch();
  const {
    products, inventoryMovements, restockRequests, damagedLogs, suppliers,
    logDamagedGoods, restockProduct, addRestockRequest, updateRestockRequest,
    getProductByBarcode,
  } = usePOS();

  const [activeTab, setActiveTab] = useState<TabKey>('stock');

  // Stock tab state
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'ok' | 'out'>('all');
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockNote, setRestockNote] = useState('');

  // Damaged tab state
  const [showDamagedModal, setShowDamagedModal] = useState(false);
  const [damagedProduct, setDamagedProduct] = useState<Product | null>(null);
  const [damagedQty, setDamagedQty] = useState('');
  const [damagedReason, setDamagedReason] = useState('');

  // Restock request state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqProduct, setReqProduct] = useState<Product | null>(null);
  const [reqQty, setReqQty] = useState('');
  const [reqSupplier, setReqSupplier] = useState('');
  const [reqPhone, setReqPhone] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqNotes, setReqNotes] = useState('');

  // Supplier detail modal
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierContact | null>(null);

  // Barcode scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState<'restock' | 'damaged'>('restock');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanCooldown = useRef(false);

  // Movements filter/export state
  const [movementDateFrom, setMovementDateFrom] = useState('');
  const [movementDateTo, setMovementDateTo] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');
  const [exportingCSV, setExportingCSV] = useState(false);

  const activeProducts = useMemo(() => products.filter(p => p.status === 'active'), [products]);

  const filteredStock = useMemo(() => {
    let list = activeProducts;
    if (stockFilter === 'low') list = list.filter(p => p.stock > 0 && p.stock <= p.minStock);
    else if (stockFilter === 'ok') list = list.filter(p => p.stock > p.minStock);
    else if (stockFilter === 'out') list = list.filter(p => p.stock === 0);
    if (stockSearch.trim()) {
      const q = stockSearch.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [activeProducts, stockFilter, stockSearch]);

  const filteredMovements = useMemo(() => {
    let list = [...inventoryMovements];
    if (movementTypeFilter !== 'all') list = list.filter(m => m.type === movementTypeFilter);
    if (movementDateFrom) list = list.filter(m => m.timestamp >= movementDateFrom);
    if (movementDateTo) list = list.filter(m => m.timestamp <= movementDateTo + 'T23:59:59');
    return list;
  }, [inventoryMovements, movementTypeFilter, movementDateFrom, movementDateTo]);

  const totalStockValue = useMemo(() =>
    activeProducts.reduce((sum, p) => sum + p.stock * p.buyingPrice, 0), [activeProducts]);

  const lowStockCount = useMemo(() =>
    activeProducts.filter(p => p.stock > 0 && p.stock <= p.minStock).length, [activeProducts]);

  const outOfStockCount = useMemo(() =>
    activeProducts.filter(p => p.stock === 0).length, [activeProducts]);

  const getCategoryName = (catId: string) =>
    MOCK_CATEGORIES.find(c => c.id === catId)?.name || catId;

  const getStockStatus = (product: Product) => {
    if (product.stock === 0) return { label: 'Out of Stock', color: Colors.danger, pct: 0 };
    if (product.stock <= product.minStock) return { label: 'Low Stock', color: Colors.warning, pct: (product.stock / product.minStock) * 50 };
    const maxStock = product.minStock * 5;
    const pct = Math.min(100, (product.stock / maxStock) * 100);
    return { label: 'In Stock', color: Colors.success, pct };
  };

  const handleQuickRestock = (product: Product) => {
    setSelectedProduct(product);
    setRestockQty('');
    setRestockNote('');
    setShowRestockModal(true);
  };

  const confirmRestock = () => {
    if (!selectedProduct || !restockQty || parseInt(restockQty) < 1) {
      showAlert('Invalid Quantity', 'Enter a valid restock quantity.');
      return;
    }
    restockProduct(selectedProduct.id, parseInt(restockQty), restockNote || 'Manual restock', user?.name || 'Staff');
    setShowRestockModal(false);
    showAlert('Restocked', `${selectedProduct.name} stock updated by +${restockQty} units.`);
  };

  const handleLogDamaged = (product?: Product) => {
    setDamagedProduct(product || null);
    setDamagedQty('');
    setDamagedReason('');
    setShowDamagedModal(true);
  };

  const confirmDamaged = () => {
    if (!damagedProduct || !damagedQty || parseInt(damagedQty) < 1) {
      showAlert('Invalid Input', 'Select a product and enter quantity.');
      return;
    }
    if (!damagedReason.trim()) {
      showAlert('Reason Required', 'Please describe the reason for damage.');
      return;
    }
    if (parseInt(damagedQty) > damagedProduct.stock) {
      showAlert('Quantity Error', 'Damaged quantity cannot exceed current stock.');
      return;
    }
    logDamagedGoods(damagedProduct.id, parseInt(damagedQty), damagedReason, user?.name || 'Staff');
    setShowDamagedModal(false);
    showAlert('Logged', `Damaged goods entry recorded for ${damagedProduct.name}.`);
  };

  const handleRestockRequest = (product: Product) => {
    setReqProduct(product);
    const supplier = suppliers.find(s => s.products.includes(product.id));
    setReqQty('');
    setReqSupplier(supplier?.name || product.supplier);
    setReqPhone(supplier?.phone || '');
    setReqEmail(supplier?.email || '');
    setReqNotes('');
    setShowRequestModal(true);
  };

  const confirmRestockRequest = () => {
    if (!reqProduct || !reqQty || parseInt(reqQty) < 1) {
      showAlert('Invalid Quantity', 'Enter a valid request quantity.');
      return;
    }
    addRestockRequest({
      id: `req_${Date.now()}`,
      productId: reqProduct.id, productName: reqProduct.name,
      currentStock: reqProduct.stock, requestedQty: parseInt(reqQty),
      supplier: reqSupplier, supplierPhone: reqPhone, supplierEmail: reqEmail,
      status: 'pending', requestedBy: user?.name || 'Staff',
      requestedAt: new Date().toISOString(), notes: reqNotes,
    });
    setShowRequestModal(false);
    showAlert('Request Submitted', `Restock request for ${reqProduct.name} submitted.`);
  };

  // ─── Barcode Scanner ────────────────────────────────────────────────────────
  const openBarcodeScanner = async (target: 'restock' | 'damaged') => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showAlert('Camera Permission', 'Camera access is required to scan barcodes.');
        return;
      }
    }
    setScanTarget(target);
    setShowScanner(true);
  };

  const handleBarcodeScan = useCallback((barcode: string) => {
    if (scanCooldown.current) return;
    scanCooldown.current = true;
    setTimeout(() => { scanCooldown.current = false; }, 2000);

    const product = getProductByBarcode(barcode);
    setShowScanner(false);

    if (product) {
      if (scanTarget === 'restock') {
        setSelectedProduct(product);
        setRestockQty('');
        setRestockNote('');
        setShowRestockModal(true);
      } else {
        setDamagedProduct(product);
        setDamagedQty('');
        setDamagedReason('');
        setShowDamagedModal(true);
      }
    } else {
      showAlert('Not Found', `No product found for barcode: ${barcode}`);
    }
  }, [getProductByBarcode, scanTarget]);

  // ─── Export Movements CSV ───────────────────────────────────────────────────
  const handleExportMovementsCSV = async () => {
    if (filteredMovements.length === 0) {
      showAlert('No Data', 'No inventory movements to export.');
      return;
    }
    setExportingCSV(true);
    try {
      const headers = ['Date', 'Product', 'Type', 'Qty Change', 'Previous Stock', 'New Stock', 'Note', 'Recorded By', 'Branch'];
      const rows = filteredMovements.map(m => [
        new Date(m.timestamp).toLocaleString('en-UG'),
        m.productName,
        m.type,
        m.qty > 0 ? `+${m.qty}` : String(m.qty),
        String(m.previousStock),
        String(m.newStock),
        m.note || '',
        m.recordedBy,
        currentBranch.name,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

      const csv = [headers.join(','), ...rows].join('\n');
      const fileName = `inventory-movements-${new Date().toISOString().slice(0, 10)}.csv`;
      const path = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Inventory Movements' });
      } else {
        showAlert('Exported', `Saved as ${fileName}`);
      }
    } catch {
      showAlert('Error', 'Could not export movements.');
    } finally {
      setExportingCSV(false);
    }
  };

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'stock', label: 'Stock Levels', icon: 'inventory' },
    { key: 'movements', label: 'History', icon: 'history' },
    { key: 'restock', label: 'Restock', icon: 'assignment' },
    { key: 'damaged', label: 'Damaged', icon: 'broken-image' },
    { key: 'suppliers', label: 'Suppliers', icon: 'business' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inventory</Text>
          <Text style={styles.headerSub}>Stock value: {formatUGX(totalStockValue)}</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.scanHeaderBtn} onPress={() => openBarcodeScanner('restock')}>
            <MaterialIcons name="qr-code-scanner" size={16} color={Colors.skyBlue} />
            <Text style={styles.scanHeaderBtnText}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.damagedBtn} onPress={() => handleLogDamaged()}>
            <MaterialIcons name="broken-image" size={14} color={Colors.danger} />
            <Text style={styles.damagedBtnText}>Log Damage</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <TouchableOpacity style={[styles.summaryCard, { borderColor: Colors.success + '40' }]} onPress={() => { setActiveTab('stock'); setStockFilter('ok'); }}>
          <Text style={[styles.summaryNum, { color: Colors.success }]}>
            {activeProducts.filter(p => p.stock > p.minStock).length}
          </Text>
          <Text style={styles.summaryLabel}>Healthy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.summaryCard, { borderColor: Colors.warning + '40' }]} onPress={() => { setActiveTab('stock'); setStockFilter('low'); }}>
          <Text style={[styles.summaryNum, { color: Colors.warning }]}>{lowStockCount}</Text>
          <Text style={styles.summaryLabel}>Low Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.summaryCard, { borderColor: Colors.danger + '40' }]} onPress={() => { setActiveTab('stock'); setStockFilter('out'); }}>
          <Text style={[styles.summaryNum, { color: Colors.danger }]}>{outOfStockCount}</Text>
          <Text style={styles.summaryLabel}>Out of Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.summaryCard, { borderColor: Colors.skyBlue + '40' }]} onPress={() => setActiveTab('restock')}>
          <Text style={[styles.summaryNum, { color: Colors.skyBlue }]}>
            {restockRequests.filter(r => r.status === 'pending').length}
          </Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <MaterialIcons
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.key ? Colors.navy : Colors.textMuted}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* === STOCK LEVELS TAB === */}
      {activeTab === 'stock' && (
        <View style={styles.tabContent}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search products..."
                placeholderTextColor={Colors.textMuted}
                value={stockSearch}
                onChangeText={setStockSearch}
              />
            </View>
            <TouchableOpacity style={styles.scanInlineBtn} onPress={() => openBarcodeScanner('restock')}>
              <MaterialIcons name="qr-code-scanner" size={18} color={Colors.skyBlue} />
            </TouchableOpacity>
          </View>
          <View style={styles.filterRow}>
            {(['all', 'ok', 'low', 'out'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, stockFilter === f && styles.filterChipActive]}
                onPress={() => setStockFilter(f)}
              >
                <Text style={[styles.filterChipText, stockFilter === f && styles.filterChipTextActive]}>
                  {f === 'all' ? 'All' : f === 'ok' ? 'Healthy' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={filteredStock}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="inventory-2" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No products found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const status = getStockStatus(item);
              return (
                <View style={styles.stockCard}>
                  <Image source={{ uri: item.imageUrl }} style={styles.stockImg} contentFit="cover" />
                  <View style={styles.stockInfo}>
                    <View style={styles.stockTopRow}>
                      <Text style={styles.stockName} numberOfLines={1}>{item.name}</Text>
                      <View style={[styles.stockStatusBadge, { backgroundColor: status.color + '20' }]}>
                        <Text style={[styles.stockStatusText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.stockCat}>{getCategoryName(item.category)} · {item.barcode}</Text>
                    <View style={styles.stockMeta}>
                      <Text style={[styles.stockQty, { color: status.color }]}>{item.stock} units</Text>
                      <Text style={styles.stockMin}>Min: {item.minStock}</Text>
                      <Text style={styles.stockValue}>{formatUGX(item.stock * item.buyingPrice)}</Text>
                    </View>
                    {/* Progress Bar */}
                    <View style={styles.progressWrap}>
                      <View style={[styles.progressBar, { width: `${Math.min(100, status.pct)}%`, backgroundColor: status.color }]} />
                    </View>
                  </View>
                  <View style={styles.stockActions}>
                    <TouchableOpacity
                      style={[styles.stockActionBtn, { backgroundColor: Colors.successMuted, borderColor: Colors.success + '40' }]}
                      onPress={() => handleQuickRestock(item)}
                    >
                      <MaterialIcons name="add" size={14} color={Colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stockActionBtn, { backgroundColor: Colors.dangerMuted, borderColor: Colors.danger + '40' }]}
                      onPress={() => handleLogDamaged(item)}
                    >
                      <MaterialIcons name="remove" size={14} color={Colors.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stockActionBtn, { backgroundColor: Colors.skyBlueMuted, borderColor: Colors.skyBlue + '40' }]}
                      onPress={() => handleRestockRequest(item)}
                    >
                      <MaterialIcons name="assignment" size={14} color={Colors.skyBlue} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* === MOVEMENT HISTORY TAB === */}
      {activeTab === 'movements' && (
        <View style={styles.tabContent}>
          {/* Filter + Export bar */}
          <View style={styles.movementsToolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
              {(['all', 'sale', 'restock', 'damaged', 'adjustment', 'return'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterChip, movementTypeFilter === t && styles.filterChipActive]}
                  onPress={() => setMovementTypeFilter(t)}
                >
                  <Text style={[styles.filterChipText, movementTypeFilter === t && styles.filterChipTextActive]}>
                    {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportMovementsCSV} disabled={exportingCSV}>
              {exportingCSV ? <ActivityIndicator size="small" color={Colors.navy} /> : <MaterialIcons name="download" size={14} color={Colors.navy} />}
              <Text style={styles.exportBtnText}>CSV</Text>
            </TouchableOpacity>
          </View>
          {/* Date range */}
          <View style={styles.movementsDateRow}>
            <TextInput
              style={styles.dateInput}
              value={movementDateFrom}
              onChangeText={setMovementDateFrom}
              placeholder="From (YYYY-MM-DD)"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.dateInput}
              value={movementDateTo}
              onChangeText={setMovementDateTo}
              placeholder="To (YYYY-MM-DD)"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <Text style={styles.movementsCount}>{filteredMovements.length} records</Text>
          <FlatList
            data={filteredMovements}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="history" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No movement history</Text>
              </View>
            }
            renderItem={({ item }) => {
              const color = MOVEMENT_COLORS[item.type] || Colors.textMuted;
              const icon = MOVEMENT_ICONS[item.type] || 'swap-horiz';
              return (
                <View style={styles.movementCard}>
                  <View style={[styles.movementIcon, { backgroundColor: color + '20' }]}>
                    <MaterialIcons name={icon as any} size={18} color={color} />
                  </View>
                  <View style={styles.movementInfo}>
                    <Text style={styles.movementProduct} numberOfLines={1}>{item.productName}</Text>
                    <Text style={styles.movementNote} numberOfLines={1}>{item.note}</Text>
                    <Text style={styles.movementBy}>By {item.recordedBy} · {new Date(item.timestamp).toLocaleDateString('en-UG')}</Text>
                  </View>
                  <View style={styles.movementRight}>
                    <Text style={[styles.movementQty, { color }]}>
                      {item.qty > 0 ? '+' : ''}{item.qty}
                    </Text>
                    <Text style={styles.movementStock}>{item.previousStock} → {item.newStock}</Text>
                    <View style={[styles.movementTypeBadge, { backgroundColor: color + '15' }]}>
                      <Text style={[styles.movementTypeText, { color }]}>{item.type}</Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* === RESTOCK REQUESTS TAB === */}
      {activeTab === 'restock' && (
        <View style={styles.tabContent}>
          <View style={styles.reqSectionHeader}>
            <Text style={styles.reqSectionTitle}>Restock Requests ({restockRequests.length})</Text>
          </View>
          <FlatList
            data={restockRequests}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="assignment" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No restock requests</Text>
              </View>
            }
            renderItem={({ item }: { item: RestockRequest }) => {
              const statusColor = STATUS_COLORS[item.status] || Colors.textMuted;
              return (
                <View style={styles.reqCard}>
                  <View style={styles.reqTop}>
                    <View style={styles.reqLeft}>
                      <Text style={styles.reqProductName}>{item.productName}</Text>
                      <Text style={styles.reqMeta}>Current stock: {item.currentStock} · Requested: {item.requestedQty}</Text>
                      <Text style={styles.reqSupplier}>{item.supplier}</Text>
                    </View>
                    <View style={[styles.reqStatusBadge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.reqStatusText, { color: statusColor }]}>{item.status}</Text>
                    </View>
                  </View>
                  {item.notes ? <Text style={styles.reqNotes}>{item.notes}</Text> : null}
                  <View style={styles.reqFooter}>
                    <Text style={styles.reqDate}>
                      Requested by {item.requestedBy} · {new Date(item.requestedAt).toLocaleDateString('en-UG')}
                    </Text>
                    <View style={styles.reqActions}>
                      {item.status === 'pending' && (
                        <TouchableOpacity
                          style={[styles.reqActionBtn, { backgroundColor: Colors.skyBlueMuted }]}
                          onPress={() => updateRestockRequest(item.id, 'ordered')}
                        >
                          <Text style={[styles.reqActionText, { color: Colors.skyBlue }]}>Mark Ordered</Text>
                        </TouchableOpacity>
                      )}
                      {item.status === 'ordered' && (
                        <TouchableOpacity
                          style={[styles.reqActionBtn, { backgroundColor: Colors.successMuted }]}
                          onPress={() => {
                            updateRestockRequest(item.id, 'received');
                            restockProduct(item.productId, item.requestedQty, `Received from ${item.supplier}`, user?.name || 'Staff');
                          }}
                        >
                          <Text style={[styles.reqActionText, { color: Colors.success }]}>Mark Received</Text>
                        </TouchableOpacity>
                      )}
                      {(item.status === 'pending' || item.status === 'ordered') && (
                        <TouchableOpacity
                          style={[styles.reqActionBtn, { backgroundColor: Colors.dangerMuted }]}
                          onPress={() => updateRestockRequest(item.id, 'cancelled')}
                        >
                          <Text style={[styles.reqActionText, { color: Colors.danger }]}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* === DAMAGED GOODS TAB === */}
      {activeTab === 'damaged' && (
        <View style={styles.tabContent}>
          <View style={styles.reqSectionHeader}>
            <View style={styles.damagedSummary}>
              <MaterialIcons name="warning" size={16} color={Colors.danger} />
              <Text style={styles.damagedSummaryText}>
                Total estimated loss: {formatUGX(damagedLogs.reduce((s, d) => s + d.estimatedLoss, 0))}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.scanDamagedBtn} onPress={() => openBarcodeScanner('damaged')}>
                <MaterialIcons name="qr-code-scanner" size={13} color={Colors.skyBlue} />
                <Text style={styles.scanDamagedBtnText}>Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logDmgBtn} onPress={() => handleLogDamaged()}>
                <MaterialIcons name="add" size={14} color={Colors.navy} />
                <Text style={styles.logDmgBtnText}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
          <FlatList
            data={damagedLogs}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="check-circle" size={40} color={Colors.success} />
                <Text style={styles.emptyText}>No damaged goods logged</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.damagedCard}>
                <View style={[styles.damagedIcon, { backgroundColor: Colors.dangerMuted }]}>
                  <MaterialIcons name="broken-image" size={20} color={Colors.danger} />
                </View>
                <View style={styles.damagedInfo}>
                  <Text style={styles.damagedProduct}>{item.productName}</Text>
                  <Text style={styles.damagedReason}>{item.reason}</Text>
                  <Text style={styles.damagedBy}>
                    Reported by {item.reportedBy} · {new Date(item.timestamp).toLocaleDateString('en-UG')}
                  </Text>
                </View>
                <View style={styles.damagedRight}>
                  <Text style={[styles.damagedQty, { color: Colors.danger }]}>-{item.qty} units</Text>
                  <Text style={styles.damagedLoss}>{formatUGX(item.estimatedLoss)}</Text>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {/* === SUPPLIERS TAB === */}
      {activeTab === 'suppliers' && (
        <FlatList
          data={suppliers}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingTop: Spacing.md }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.supplierCard} onPress={() => setSelectedSupplier(item)}>
              <View style={styles.supplierAvatar}>
                <Text style={styles.supplierAvatarText}>
                  {item.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.supplierInfo}>
                <Text style={styles.supplierName}>{item.name}</Text>
                <Text style={styles.supplierPhone}>{item.phone}</Text>
                <Text style={styles.supplierProducts}>{item.products.length} product(s) supplied</Text>
              </View>
              <View style={styles.supplierActions}>
                <TouchableOpacity
                  style={styles.supplierActionBtn}
                  onPress={() => Linking.openURL(`tel:${item.phone.replace(/\s/g, '')}`)}
                >
                  <MaterialIcons name="phone" size={16} color={Colors.success} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.supplierActionBtn}
                  onPress={() => Linking.openURL(`mailto:${item.email}`)}
                >
                  <MaterialIcons name="email" size={16} color={Colors.skyBlue} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ===== BARCODE SCANNER MODAL ===== */}
      <Modal visible={showScanner} animationType="slide">
        <View style={styles.scannerContainer}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.scannerCloseBtn}>
              <MaterialIcons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>
              Scan Product Barcode — {scanTarget === 'restock' ? 'Restock' : 'Log Damage'}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={({ data }) => handleBarcodeScan(data)}
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'ean13', 'ean8', 'qr', 'upc_a', 'upc_e'] }}
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerViewfinder}>
                <View style={[styles.scannerCorner, styles.scannerCornerTL]} />
                <View style={[styles.scannerCorner, styles.scannerCornerTR]} />
                <View style={[styles.scannerCorner, styles.scannerCornerBL]} />
                <View style={[styles.scannerCorner, styles.scannerCornerBR]} />
              </View>
              <Text style={styles.scannerHint}>Point at product barcode to auto-select</Text>
            </View>
          </CameraView>
        </View>
      </Modal>

      {/* ===== QUICK RESTOCK MODAL ===== */}
      <Modal visible={showRestockModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="add-circle" size={20} color={Colors.success} />
                <Text style={styles.modalTitle}>Quick Restock</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity style={styles.scanModalBtn} onPress={() => { setShowRestockModal(false); openBarcodeScanner('restock'); }}>
                  <MaterialIcons name="qr-code-scanner" size={16} color={Colors.skyBlue} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowRestockModal(false)}>
                  <MaterialIcons name="close" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.restockProductName}>{selectedProduct?.name}</Text>
              <Text style={styles.restockCurrentStock}>Current stock: {selectedProduct?.stock} units · Min: {selectedProduct?.minStock}</Text>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Quantity to Add *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={restockQty}
                  onChangeText={setRestockQty}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Note / Source</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Received from supplier"
                  placeholderTextColor={Colors.textMuted}
                  value={restockNote}
                  onChangeText={setRestockNote}
                />
              </View>
              {/* Quick preset buttons */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['5', '10', '20', '50', '100'].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.qtyPreset, restockQty === v && styles.qtyPresetActive]}
                    onPress={() => setRestockQty(v)}
                  >
                    <Text style={[styles.qtyPresetText, restockQty === v && { color: Colors.navy }]}>+{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRestockModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={confirmRestock}>
                <MaterialIcons name="add-circle" size={16} color={Colors.navy} />
                <Text style={styles.saveBtnText}>Add Stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== DAMAGED GOODS MODAL ===== */}
      <Modal visible={showDamagedModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="broken-image" size={20} color={Colors.danger} />
                <Text style={[styles.modalTitle, { color: Colors.danger }]}>Log Damaged Goods</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity style={styles.scanModalBtn} onPress={() => { setShowDamagedModal(false); openBarcodeScanner('damaged'); }}>
                  <MaterialIcons name="qr-code-scanner" size={16} color={Colors.skyBlue} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowDamagedModal(false)}>
                  <MaterialIcons name="close" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {!damagedProduct && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Select Product</Text>
                  <ScrollView style={styles.productPicker} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {products.filter(p => p.status === 'active' && p.stock > 0).map(p => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.productPickItem, damagedProduct?.id === p.id && styles.productPickItemActive]}
                        onPress={() => setDamagedProduct(p)}
                      >
                        <Text style={[styles.productPickText, damagedProduct?.id === p.id && { color: Colors.gold }]}>
                          {p.name} ({p.stock} in stock)
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              {damagedProduct && (
                <View style={styles.selectedProductRow}>
                  <Text style={styles.selectedProductName}>{damagedProduct.name}</Text>
                  <TouchableOpacity onPress={() => setDamagedProduct(null)}>
                    <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Damaged Quantity *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  value={damagedQty}
                  onChangeText={setDamagedQty}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Reason for Damage *</Text>
                <TextInput
                  style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Describe what happened..."
                  placeholderTextColor={Colors.textMuted}
                  value={damagedReason}
                  onChangeText={setDamagedReason}
                  multiline
                />
              </View>
              {damagedProduct && damagedQty ? (
                <View style={styles.lossPreview}>
                  <MaterialIcons name="info" size={14} color={Colors.warning} />
                  <Text style={styles.lossPreviewText}>
                    Estimated loss: {formatUGX(damagedProduct.buyingPrice * (parseInt(damagedQty) || 0))}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDamagedModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.danger }]} onPress={confirmDamaged}>
                <MaterialIcons name="broken-image" size={16} color={Colors.textPrimary} />
                <Text style={[styles.saveBtnText, { color: Colors.textPrimary }]}>Log Damage</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== RESTOCK REQUEST MODAL ===== */}
      <Modal visible={showRequestModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Restock</Text>
              <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.restockProductName}>{reqProduct?.name}</Text>
              <Text style={styles.restockCurrentStock}>Current stock: {reqProduct?.stock} units</Text>
              {[
                { label: 'Quantity to Order *', value: reqQty, onChange: setReqQty, keyboard: 'numeric' as const },
                { label: 'Supplier Name *', value: reqSupplier, onChange: setReqSupplier },
                { label: 'Supplier Phone', value: reqPhone, onChange: setReqPhone, keyboard: 'phone-pad' as const },
                { label: 'Supplier Email', value: reqEmail, onChange: setReqEmail, keyboard: 'email-address' as const },
              ].map(f => (
                <View key={f.label} style={styles.formGroup}>
                  <Text style={styles.formLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={f.label.replace(' *', '')}
                    placeholderTextColor={Colors.textMuted}
                    value={f.value}
                    onChangeText={f.onChange}
                    keyboardType={f.keyboard || 'default'}
                  />
                </View>
              ))}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Notes</Text>
                <TextInput
                  style={[styles.formInput, { height: 72, textAlignVertical: 'top' }]}
                  placeholder="Additional notes for the order..."
                  placeholderTextColor={Colors.textMuted}
                  value={reqNotes}
                  onChangeText={setReqNotes}
                  multiline
                />
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRequestModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={confirmRestockRequest}>
                <MaterialIcons name="send" size={16} color={Colors.navy} />
                <Text style={styles.saveBtnText}>Submit Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== SUPPLIER DETAIL MODAL ===== */}
      <Modal visible={!!selectedSupplier} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            {selectedSupplier && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Supplier Details</Text>
                  <TouchableOpacity onPress={() => setSelectedSupplier(null)}>
                    <MaterialIcons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.supplierDetailBody}>
                  <View style={styles.supplierDetailAvatarRow}>
                    <View style={styles.supplierDetailAvatar}>
                      <Text style={styles.supplierDetailAvatarText}>
                        {selectedSupplier.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.supplierDetailName}>{selectedSupplier.name}</Text>
                  </View>
                  {[
                    { icon: 'location-on', label: 'Address', value: selectedSupplier.address },
                    { icon: 'phone', label: 'Phone', value: selectedSupplier.phone },
                    { icon: 'email', label: 'Email', value: selectedSupplier.email },
                  ].map(row => (
                    <View key={row.label} style={styles.supplierDetailRow}>
                      <MaterialIcons name={row.icon as any} size={16} color={Colors.gold} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.supplierDetailLabel}>{row.label}</Text>
                        <Text style={styles.supplierDetailValue}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                  {selectedSupplier.notes ? (
                    <View style={styles.supplierNotesBox}>
                      <Text style={styles.supplierNotesLabel}>Notes</Text>
                      <Text style={styles.supplierNotesText}>{selectedSupplier.notes}</Text>
                    </View>
                  ) : null}
                  <View style={styles.supplierContactBtns}>
                    <TouchableOpacity
                      style={[styles.supplierContactBtn, { backgroundColor: Colors.successMuted, borderColor: Colors.success + '40' }]}
                      onPress={() => Linking.openURL(`tel:${selectedSupplier.phone.replace(/\s/g, '')}`)}
                    >
                      <MaterialIcons name="phone" size={18} color={Colors.success} />
                      <Text style={[styles.supplierContactBtnText, { color: Colors.success }]}>Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.supplierContactBtn, { backgroundColor: Colors.skyBlueMuted, borderColor: Colors.skyBlue + '40' }]}
                      onPress={() => Linking.openURL(`mailto:${selectedSupplier.email}`)}
                    >
                      <MaterialIcons name="email" size={18} color={Colors.skyBlue} />
                      <Text style={[styles.supplierContactBtnText, { color: Colors.skyBlue }]}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.supplierContactBtn, { backgroundColor: 'rgba(37,211,102,0.12)', borderColor: 'rgba(37,211,102,0.3)' }]}
                      onPress={() => Linking.openURL(`whatsapp://send?phone=${selectedSupplier.phone.replace(/\s|\+/g, '')}`)}
                    >
                      <MaterialIcons name="chat" size={18} color="#25D366" />
                      <Text style={[styles.supplierContactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.borderGold,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  scanHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.skyBlueMuted, paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.skyBlue + '40',
  },
  scanHeaderBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.skyBlue },
  damagedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.dangerMuted, paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.danger + '40',
  },
  damagedBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.danger },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  summaryCard: {
    flex: 1, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: 10, alignItems: 'center', borderWidth: 1, ...Shadows.sm,
  },
  summaryNum: { fontSize: Typography.xl, fontWeight: Typography.extrabold },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  tabWrap: { height: 48, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabRow: { paddingHorizontal: Spacing.md, gap: 4, alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: BorderRadius.sm,
  },
  tabActive: { backgroundColor: Colors.gold },
  tabText: { fontSize: 12, color: Colors.textMuted, fontWeight: Typography.medium },
  tabTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  tabContent: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 10 },
  scanInlineBtn: {
    width: 42, height: 42, borderRadius: BorderRadius.md,
    backgroundColor: Colors.skyBlueMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.skyBlue + '40',
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.circle,
    backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.goldMuted, borderColor: Colors.gold },
  filterChipText: { fontSize: 12, color: Colors.textMuted },
  filterChipTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 120, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: Typography.base },
  // Stock Card
  stockCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm,
  },
  stockImg: { width: 56, height: 56, borderRadius: BorderRadius.sm },
  stockInfo: { flex: 1, gap: 2 },
  stockTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockName: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  stockStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.circle },
  stockStatusText: { fontSize: 10, fontWeight: Typography.bold },
  stockCat: { fontSize: Typography.xs, color: Colors.textMuted },
  stockMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 1 },
  stockQty: { fontSize: Typography.sm, fontWeight: Typography.bold },
  stockMin: { fontSize: Typography.xs, color: Colors.textMuted },
  stockValue: { fontSize: Typography.xs, color: Colors.textSecondary },
  progressWrap: {
    height: 5, backgroundColor: Colors.navyLight,
    borderRadius: 3, overflow: 'hidden', marginTop: 6,
  },
  progressBar: { height: '100%', borderRadius: 3 },
  stockActions: { gap: 6 },
  stockActionBtn: {
    width: 32, height: 32, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  // Movement Toolbar
  movementsToolbar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm, gap: 8,
  },
  movementsDateRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm,
  },
  dateInput: {
    flex: 1, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 11, paddingHorizontal: 8, paddingVertical: 8,
  },
  movementsCount: {
    fontSize: Typography.xs, color: Colors.textMuted,
    paddingHorizontal: Spacing.base, marginBottom: 4,
  },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: BorderRadius.sm, ...Shadows.gold, flexShrink: 0,
  },
  exportBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  // Movement Card
  movementCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  movementIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  movementInfo: { flex: 1, gap: 2 },
  movementProduct: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  movementNote: { fontSize: Typography.xs, color: Colors.textSecondary },
  movementBy: { fontSize: Typography.xs, color: Colors.textMuted },
  movementRight: { alignItems: 'flex-end', gap: 2 },
  movementQty: { fontSize: Typography.base, fontWeight: Typography.bold },
  movementStock: { fontSize: Typography.xs, color: Colors.textMuted },
  movementTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  movementTypeText: { fontSize: 10, fontWeight: Typography.bold, textTransform: 'capitalize' },
  // Restock Request
  reqSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  reqSectionTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  reqCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: 8, ...Shadows.sm,
  },
  reqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reqLeft: { flex: 1, gap: 2 },
  reqProductName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  reqMeta: { fontSize: Typography.xs, color: Colors.textSecondary },
  reqSupplier: { fontSize: Typography.xs, color: Colors.skyBlue },
  reqStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.circle },
  reqStatusText: { fontSize: 11, fontWeight: Typography.bold, textTransform: 'capitalize' },
  reqNotes: { fontSize: Typography.xs, color: Colors.textMuted, fontStyle: 'italic' },
  reqFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  reqDate: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  reqActions: { flexDirection: 'row', gap: 6 },
  reqActionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm },
  reqActionText: { fontSize: 12, fontWeight: Typography.semibold },
  // Damaged
  damagedSummary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  damagedSummaryText: { fontSize: Typography.sm, color: Colors.danger, fontWeight: Typography.medium },
  scanDamagedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.skyBlueMuted, paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30',
  },
  scanDamagedBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.skyBlue },
  logDmgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.danger, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  logDmgBtnText: { fontSize: 12, fontWeight: Typography.bold, color: Colors.textPrimary },
  damagedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  damagedIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  damagedInfo: { flex: 1, gap: 2 },
  damagedProduct: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  damagedReason: { fontSize: Typography.xs, color: Colors.textSecondary },
  damagedBy: { fontSize: Typography.xs, color: Colors.textMuted },
  damagedRight: { alignItems: 'flex-end', gap: 3 },
  damagedQty: { fontSize: Typography.base, fontWeight: Typography.bold },
  damagedLoss: { fontSize: Typography.xs, color: Colors.textMuted },
  // Suppliers
  supplierCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm,
  },
  supplierAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.borderGold,
  },
  supplierAvatarText: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.gold },
  supplierInfo: { flex: 1, gap: 2 },
  supplierName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  supplierPhone: { fontSize: Typography.xs, color: Colors.textSecondary },
  supplierProducts: { fontSize: Typography.xs, color: Colors.textMuted },
  supplierActions: { flexDirection: 'row', gap: 6 },
  supplierActionBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.navyLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  supplierDetailBody: { padding: Spacing.xl, gap: Spacing.md },
  supplierDetailAvatarRow: { alignItems: 'center', gap: 8, marginBottom: 8 },
  supplierDetailAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.borderGold,
  },
  supplierDetailAvatarText: { fontSize: 28, fontWeight: Typography.extrabold, color: Colors.gold },
  supplierDetailName: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  supplierDetailRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  supplierDetailLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  supplierDetailValue: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  supplierNotesBox: {
    backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.borderGold, padding: Spacing.md, gap: 4,
  },
  supplierNotesLabel: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
  supplierNotesText: { fontSize: Typography.sm, color: Colors.textSecondary },
  supplierContactBtns: { flexDirection: 'row', gap: 10 },
  supplierContactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1,
  },
  supplierContactBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold },
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
  },
  modal: {
    backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl,
    width: '100%', maxWidth: 440, maxHeight: '88%',
    borderWidth: 1, borderColor: Colors.borderGold, ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  modalBody: { padding: Spacing.xl, gap: Spacing.md },
  formGroup: { gap: 6 },
  formLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  formInput: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: Typography.base,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md,
    backgroundColor: Colors.gold, ...Shadows.gold,
  },
  saveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  restockProductName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  restockCurrentStock: { fontSize: Typography.sm, color: Colors.textMuted },
  productPicker: {
    maxHeight: 150, backgroundColor: Colors.navyCard,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
  },
  productPickItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  productPickItemActive: { backgroundColor: Colors.goldMuted },
  productPickText: { fontSize: Typography.sm, color: Colors.textPrimary },
  selectedProductRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.goldMuted, borderRadius: BorderRadius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderGold,
  },
  selectedProductName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold, flex: 1 },
  lossPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.warningMuted, padding: Spacing.sm,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.warning + '30',
  },
  lossPreviewText: { fontSize: Typography.sm, color: Colors.warning },
  scanModalBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.skyBlueMuted, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.skyBlue + '40',
  },
  qtyPreset: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.md,
    backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border,
  },
  qtyPresetActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  qtyPresetText: { fontSize: 12, color: Colors.textMuted, fontWeight: Typography.medium },
  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.8)',
  },
  scannerCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scannerTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center' },
  camera: { flex: 1 },
  scannerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  scannerViewfinder: { width: 260, height: 180, position: 'relative' },
  scannerCorner: { position: 'absolute', width: 30, height: 30, borderColor: Colors.gold, borderWidth: 3 },
  scannerCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  scannerCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  scannerCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  scannerCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scannerHint: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
