import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Modal, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Order, OrderStatus, OrderType } from '@/types';

const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;

const STATUS_CONFIG: Record<OrderStatus, { color: string; bg: string; icon: string; next?: OrderStatus; nextLabel?: string }> = {
  pending:    { color: Colors.warning,   bg: Colors.warningMuted,   icon: 'schedule',      next: 'confirmed',  nextLabel: 'Confirm' },
  confirmed:  { color: Colors.skyBlue,   bg: Colors.skyBlueMuted,   icon: 'check-circle',  next: 'processing', nextLabel: 'Start Processing' },
  processing: { color: '#9B59B6',        bg: 'rgba(155,89,182,0.15)', icon: 'autorenew',   next: 'completed',  nextLabel: 'Mark Complete' },
  completed:  { color: Colors.success,   bg: Colors.successMuted,   icon: 'task-alt' },
  cancelled:  { color: Colors.danger,    bg: Colors.dangerMuted,    icon: 'cancel' },
};

const TYPE_CONFIG: Record<OrderType, { color: string; icon: string; label: string }> = {
  'in-store':    { color: Colors.skyBlue,  icon: 'store',            label: 'In-Store' },
  'online':      { color: Colors.gold,     icon: 'language',         label: 'Online' },
  'delivery':    { color: '#9B59B6',       icon: 'delivery-dining',  label: 'Delivery' },
  'reservation': { color: Colors.success,  icon: 'event-available',  label: 'Reservation' },
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  paid: Colors.success, pending: Colors.warning, failed: Colors.danger,
};

type FilterStatus = 'all' | OrderStatus;
type FilterType = 'all' | OrderType;

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { orders, updateOrderStatus, assignRider, getRiderHistory } = usePOS();
  const { hasPermission, user } = useAuth();
  const { showAlert } = useAlert();

  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Receipt search state
  const [showReceiptSearch, setShowReceiptSearch] = useState(false);
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('');
  const [receiptSearchResult, setReceiptSearchResult] = useState<Order | null>(null);
  const [receiptSearchDone, setReceiptSearchDone] = useState(false);

  // Rider assignment modal state
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [riderOrderId, setRiderOrderId] = useState('');
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderNotes, setRiderNotes] = useState('');
  const [assigningRider, setAssigningRider] = useState(false);
  const [riderRosterSearch, setRiderRosterSearch] = useState('');
  const [ridersRoster, setRidersRoster] = useState<Array<{ id: string; name: string; phone: string }>>([]);

  // Rider history modal
  const [showRiderHistory, setShowRiderHistory] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState('');

  const filtered = useMemo(() => {
    let list = [...orders];
    if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter(o => o.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, statusFilter, typeFilter, search]);

  const counts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    processing: orders.filter(o => o.status === 'processing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders]);

  const openDetail = (order: Order) => { setSelectedOrder(order); setShowDetail(true); };

  const handleReceiptSearch = () => {
    const q = receiptSearchQuery.trim().toLowerCase();
    if (!q) return;
    const found = orders.find(o =>
      o.orderNo.toLowerCase().includes(q) ||
      o.customerPhone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
      o.customerName.toLowerCase().includes(q)
    );
    setReceiptSearchResult(found || null);
    setReceiptSearchDone(true);
  };

  useEffect(() => {
    if (!showRiderModal) return;
    (async () => {
      try {
        const { getSupabaseClient } = await import('@/template');
        const { data } = await getSupabaseClient()
          .from('pos_riders')
          .select('id, name, phone')
          .eq('status', 'active')
          .order('name');
        setRidersRoster((data || []) as Array<{ id: string; name: string; phone: string }>);
      } catch {}
    })();
  }, [showRiderModal]);

  const filteredRosterRiders = useMemo(() => {
    if (!riderRosterSearch.trim()) return ridersRoster;
    const q = riderRosterSearch.toLowerCase();
    return ridersRoster.filter(r => r.name.toLowerCase().includes(q) || r.phone.includes(q));
  }, [ridersRoster, riderRosterSearch]);

  const openRiderAssignment = (orderId: string) => {
    setRiderOrderId(orderId);
    setRiderName(''); setRiderPhone(''); setRiderNotes('');
    setRiderRosterSearch('');
    setShowRiderModal(true);
  };

  const openRiderHistory = (orderId: string) => {
    setHistoryOrderId(orderId);
    setShowRiderHistory(true);
  };

  const handleAssignRider = async () => {
    if (!riderName.trim() || !riderPhone.trim()) {
      showAlert('Missing Fields', 'Rider name and phone are required.');
      return;
    }
    setAssigningRider(true);
    try {
      await assignRider(riderOrderId, riderName.trim(), riderPhone.trim(), user?.name || 'Manager', riderNotes.trim() || undefined);
      setShowRiderModal(false);
      // Update selected order if open
      if (selectedOrder?.id === riderOrderId) {
        setSelectedOrder(prev => prev ? { ...prev, assignedTo: `${riderName} (${riderPhone})` } : null);
      }
      showAlert('Rider Assigned', `${riderName} assigned to the delivery.`);
    } catch {
      showAlert('Error', 'Could not assign rider. Please try again.');
    } finally {
      setAssigningRider(false);
    }
  };

  const handleStatusUpdate = (order: Order, newStatus: OrderStatus) => {
    if (!hasPermission('pos') && !hasPermission('dashboard')) {
      showAlert('Permission Denied', 'You do not have permission to update order status.');
      return;
    }
    const cfg = STATUS_CONFIG[order.status];
    showAlert(
      `${cfg.nextLabel || 'Update'} Order`,
      `Update order ${order.orderNo} to "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            updateOrderStatus(order.id, newStatus);
            if (selectedOrder?.id === order.id) setSelectedOrder({ ...order, status: newStatus });
          },
        },
      ]
    );
  };

  const handleCancel = (order: Order) => {
    showAlert('Cancel Order', `Cancel order ${order.orderNo}? This cannot be undone.`, [
      { text: 'Keep Order', style: 'cancel' },
      {
        text: 'Cancel Order',
        style: 'destructive',
        onPress: () => {
          updateOrderStatus(order.id, 'cancelled');
          if (selectedOrder?.id === order.id) setSelectedOrder({ ...order, status: 'cancelled' });
        },
      },
    ]);
  };

  const getTimeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const STATUS_FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' }, { key: 'processing', label: 'Processing' },
    { key: 'completed', label: 'Done' }, { key: 'cancelled', label: 'Cancelled' },
  ];

  const TYPE_FILTERS: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All Types', icon: 'list' }, { key: 'online', label: 'Online', icon: 'language' },
    { key: 'delivery', label: 'Delivery', icon: 'delivery-dining' },
    { key: 'reservation', label: 'Reserve', icon: 'event-available' },
    { key: 'in-store', label: 'In-Store', icon: 'store' },
  ];

  const riderHistory = showRiderHistory ? getRiderHistory(historyOrderId) : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Orders</Text>
          <Text style={styles.headerSub}>{counts.pending} pending · {counts.processing} processing · {counts.completed} completed</Text>
        </View>
        <View style={[styles.pendingBadge, counts.pending > 0 && styles.pendingBadgeAlert]}>
          <MaterialIcons name="notifications" size={16} color={counts.pending > 0 ? Colors.warning : Colors.textMuted} />
          {counts.pending > 0 && <Text style={styles.pendingBadgeText}>{counts.pending}</Text>}
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search order, customer, phone..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><MaterialIcons name="close" size={14} color={Colors.textMuted} /></TouchableOpacity>}
        </View>
        <TouchableOpacity
          style={styles.receiptSearchBtn}
          onPress={() => { setReceiptSearchQuery(''); setReceiptSearchResult(null); setReceiptSearchDone(false); setShowReceiptSearch(true); }}
        >
          <MaterialIcons name="receipt" size={18} color={Colors.skyBlue} />
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_FILTERS.map(f => {
            const cfg = f.key !== 'all' ? STATUS_CONFIG[f.key as OrderStatus] : null;
            const isActive = statusFilter === f.key;
            const count = counts[f.key];
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.statusChip, isActive && { backgroundColor: cfg ? cfg.bg : Colors.goldMuted, borderColor: cfg ? cfg.color : Colors.gold }]}
                onPress={() => setStatusFilter(f.key)}
              >
                {cfg && <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />}
                <Text style={[styles.statusChipText, isActive && { color: cfg ? cfg.color : Colors.gold, fontWeight: Typography.bold }]}>{f.label}</Text>
                {count > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: isActive ? (cfg?.color || Colors.gold) : Colors.navyLight }]}>
                    <Text style={[styles.countBadgeText, { color: isActive ? Colors.navy : Colors.textMuted }]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Type Filter */}
      <View style={styles.typeWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {TYPE_FILTERS.map(f => {
            const cfg = f.key !== 'all' ? TYPE_CONFIG[f.key as OrderType] : null;
            const isActive = typeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.typeChip, isActive && { backgroundColor: cfg ? cfg.color + '20' : Colors.goldMuted, borderColor: cfg ? cfg.color : Colors.gold }]}
                onPress={() => setTypeFilter(f.key)}
              >
                <MaterialIcons name={f.icon as any} size={13} color={isActive ? (cfg?.color || Colors.gold) : Colors.textMuted} />
                <Text style={[styles.typeChipText, isActive && { color: cfg?.color || Colors.gold, fontWeight: Typography.semibold }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Order List */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="receipt-long" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const sc = STATUS_CONFIG[item.status];
          const tc = TYPE_CONFIG[item.type];
          const canAdvance = sc.next && (hasPermission('pos') || hasPermission('dashboard'));
          const isDelivery = item.type === 'delivery';
          const hasRider = !!item.assignedTo;

          return (
            <TouchableOpacity style={styles.orderCard} onPress={() => openDetail(item)} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={[styles.typeIcon, { backgroundColor: tc.color + '20' }]}>
                    <MaterialIcons name={tc.icon as any} size={16} color={tc.color} />
                  </View>
                  <View>
                    <Text style={styles.orderNo}>{item.orderNo}</Text>
                    <Text style={styles.orderType}>{tc.label}</Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <MaterialIcons name={sc.icon as any} size={11} color={sc.color} />
                    <Text style={[styles.statusText, { color: sc.color }]}>{item.status}</Text>
                  </View>
                  <Text style={styles.timeAgo}>{getTimeAgo(item.createdAt)}</Text>
                </View>
              </View>

              <View style={styles.cardMid}>
                <View style={styles.customerRow}>
                  <MaterialIcons name="person" size={14} color={Colors.textMuted} />
                  <Text style={styles.customerName}>{item.customerName}</Text>
                  <Text style={styles.customerPhone}>{item.customerPhone}</Text>
                </View>
                <Text style={styles.itemSummary} numberOfLines={1}>
                  {item.items.map(i => `${i.name} ×${i.qty}`).join(', ')}
                </Text>
                {/* Rider Assigned Badge */}
                {isDelivery && (
                  <View style={styles.riderRow}>
                    {hasRider ? (
                      <View style={styles.riderAssignedBadge}>
                        <MaterialIcons name="delivery-dining" size={12} color={Colors.success} />
                        <Text style={styles.riderAssignedText}>Rider: {item.assignedTo}</Text>
                      </View>
                    ) : (
                      <View style={styles.riderUnassignedBadge}>
                        <MaterialIcons name="person-search" size={12} color={Colors.warning} />
                        <Text style={styles.riderUnassignedText}>No rider assigned</Text>
                      </View>
                    )}
                    {(hasPermission('pos') || hasPermission('dashboard')) && (
                      <TouchableOpacity
                        style={styles.assignRiderBtn}
                        onPress={(e) => { e.stopPropagation(); openRiderAssignment(item.id); }}
                      >
                        <MaterialIcons name="person-add" size={12} color={Colors.skyBlue} />
                        <Text style={styles.assignRiderBtnText}>{hasRider ? 'Reassign' : 'Assign'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.cardFooterLeft}>
                  <Text style={styles.totalAmount}>{formatUGX(item.total)}</Text>
                  <View style={[styles.payStatusBadge, { backgroundColor: PAYMENT_STATUS_COLOR[item.paymentStatus] + '20' }]}>
                    <Text style={[styles.payStatusText, { color: PAYMENT_STATUS_COLOR[item.paymentStatus] }]}>{item.paymentStatus}</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  {item.status !== 'completed' && item.status !== 'cancelled' && (
                    <TouchableOpacity style={styles.cancelBtn} onPress={(e) => { e.stopPropagation(); handleCancel(item); }}>
                      <MaterialIcons name="close" size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                  {canAdvance && sc.next && (
                    <TouchableOpacity style={styles.advanceBtn} onPress={(e) => { e.stopPropagation(); handleStatusUpdate(item, sc.next!); }}>
                      <MaterialIcons name="arrow-forward" size={13} color={Colors.navy} />
                      <Text style={styles.advanceBtnText}>{sc.nextLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ===== ORDER DETAIL MODAL ===== */}
      <Modal visible={showDetail && !!selectedOrder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            {selectedOrder && (() => {
              const sc = STATUS_CONFIG[selectedOrder.status];
              const tc = TYPE_CONFIG[selectedOrder.type];
              const isDelivery = selectedOrder.type === 'delivery';
              const hasRider = !!selectedOrder.assignedTo;
              return (
                <>
                  <View style={styles.detailHeader}>
                    <View>
                      <Text style={styles.detailOrderNo}>{selectedOrder.orderNo}</Text>
                      <View style={styles.detailBadgeRow}>
                        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                          <MaterialIcons name={sc.icon as any} size={11} color={sc.color} />
                          <Text style={[styles.statusText, { color: sc.color }]}>{selectedOrder.status}</Text>
                        </View>
                        <View style={[styles.typeChip, { backgroundColor: tc.color + '20', borderColor: tc.color + '40' }]}>
                          <MaterialIcons name={tc.icon as any} size={12} color={tc.color} />
                          <Text style={[styles.typeChipText, { color: tc.color }]}>{tc.label}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setShowDetail(false)}>
                      <MaterialIcons name="close" size={22} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
                    {/* Customer Info */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Customer</Text>
                      <View style={styles.detailInfoCard}>
                        <View style={styles.detailRow}><MaterialIcons name="person" size={16} color={Colors.gold} /><Text style={styles.detailValue}>{selectedOrder.customerName}</Text></View>
                        <View style={styles.detailRow}><MaterialIcons name="phone" size={16} color={Colors.gold} /><Text style={styles.detailValue}>{selectedOrder.customerPhone}</Text></View>
                        {selectedOrder.customerAddress && (<View style={styles.detailRow}><MaterialIcons name="location-on" size={16} color={Colors.gold} /><Text style={styles.detailValue}>{selectedOrder.customerAddress}</Text></View>)}
                        {selectedOrder.reservationDate && (<View style={styles.detailRow}><MaterialIcons name="event" size={16} color={Colors.success} /><Text style={[styles.detailValue, { color: Colors.success }]}>{new Date(selectedOrder.reservationDate).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View>)}
                      </View>
                    </View>

                    {/* Rider Assignment Section (Delivery only) */}
                    {isDelivery && (
                      <View style={styles.detailSection}>
                        <View style={styles.riderSectionHeader}>
                          <Text style={styles.detailSectionTitle}>Delivery Rider</Text>
                          <TouchableOpacity style={styles.historyBtn} onPress={() => openRiderHistory(selectedOrder.id)}>
                            <MaterialIcons name="history" size={13} color={Colors.skyBlue} />
                            <Text style={styles.historyBtnText}>History</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.detailInfoCard}>
                          {hasRider ? (
                            <View style={styles.riderAssignedRow}>
                              <View style={styles.riderAvatar}>
                                <MaterialIcons name="delivery-dining" size={20} color={Colors.success} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.riderAssignedName}>{selectedOrder.assignedTo}</Text>
                                <Text style={styles.riderAssignedSub}>Currently assigned</Text>
                              </View>
                              {(hasPermission('pos') || hasPermission('dashboard')) && (
                                <TouchableOpacity style={styles.reassignBtn} onPress={() => openRiderAssignment(selectedOrder.id)}>
                                  <Text style={styles.reassignBtnText}>Reassign</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : (
                            <View style={styles.noRiderRow}>
                              <MaterialIcons name="person-search" size={20} color={Colors.warning} />
                              <Text style={styles.noRiderText}>No rider assigned yet</Text>
                              {(hasPermission('pos') || hasPermission('dashboard')) && (
                                <TouchableOpacity style={styles.assignNowBtn} onPress={() => openRiderAssignment(selectedOrder.id)}>
                                  <MaterialIcons name="person-add" size={14} color={Colors.navy} />
                                  <Text style={styles.assignNowBtnText}>Assign Rider</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    )}

                    {/* Order Items */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Items ({selectedOrder.items.length})</Text>
                      <View style={styles.detailInfoCard}>
                        {selectedOrder.items.map((item, i) => (
                          <View key={i} style={[styles.itemRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 10, marginTop: 10 }]}>
                            <View style={styles.itemLeft}>
                              <Text style={styles.itemName}>{item.name}</Text>
                              <Text style={styles.itemQty}>× {item.qty} @ {formatUGX(item.price)}</Text>
                            </View>
                            <Text style={styles.itemTotal}>{formatUGX(item.total)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Payment Summary */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Payment</Text>
                      <View style={styles.detailInfoCard}>
                        {[
                          { label: 'Subtotal', value: formatUGX(selectedOrder.subtotal) },
                          ...(selectedOrder.discount > 0 ? [{ label: 'Discount', value: `-${formatUGX(selectedOrder.discount)}`, color: Colors.success }] : []),
                          ...(selectedOrder.deliveryFee > 0 ? [{ label: 'Delivery Fee', value: formatUGX(selectedOrder.deliveryFee) }] : []),
                        ].map(r => (
                          <View key={r.label} style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>{r.label}</Text>
                            <Text style={[styles.summaryValue, r.color ? { color: r.color } : {}]}>{r.value}</Text>
                          </View>
                        ))}
                        <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                          <Text style={styles.summaryTotalLabel}>TOTAL</Text>
                          <Text style={styles.summaryTotalValue}>{formatUGX(selectedOrder.total)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Method</Text>
                          <Text style={[styles.summaryValue, { color: Colors.skyBlue }]}>{selectedOrder.paymentMethod}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Payment Status</Text>
                          <View style={[styles.payStatusBadge, { backgroundColor: PAYMENT_STATUS_COLOR[selectedOrder.paymentStatus] + '20' }]}>
                            <Text style={[styles.payStatusText, { color: PAYMENT_STATUS_COLOR[selectedOrder.paymentStatus] }]}>{selectedOrder.paymentStatus}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.timestampRow}>
                      <Text style={styles.timestampText}>Created: {new Date(selectedOrder.createdAt).toLocaleString('en-UG')}</Text>
                      <Text style={styles.timestampText}>Updated: {new Date(selectedOrder.updatedAt).toLocaleString('en-UG')}</Text>
                    </View>
                  </ScrollView>

                  {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                    <View style={styles.detailActions}>
                      <TouchableOpacity style={styles.detailCancelBtn} onPress={() => handleCancel(selectedOrder)}>
                        <MaterialIcons name="cancel" size={16} color={Colors.danger} />
                        <Text style={styles.detailCancelBtnText}>Cancel Order</Text>
                      </TouchableOpacity>
                      {sc.next && (hasPermission('pos') || hasPermission('dashboard')) && (
                        <TouchableOpacity
                          style={[styles.detailAdvanceBtn, { backgroundColor: sc.color }]}
                          onPress={() => handleStatusUpdate(selectedOrder, sc.next!)}
                        >
                          <MaterialIcons name="arrow-forward" size={16} color={Colors.navy} />
                          <Text style={styles.detailAdvanceBtnText}>{sc.nextLabel}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ===== RECEIPT SEARCH MODAL ===== */}
      <Modal visible={showReceiptSearch} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.riderModal, { maxHeight: '80%' }]}>
            <View style={styles.riderModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="receipt" size={20} color={Colors.skyBlue} />
                <Text style={[styles.riderModalTitle, { color: Colors.skyBlue }]}>Receipt / Order Lookup</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReceiptSearch(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
              <Text style={{ fontSize: Typography.xs, color: Colors.textMuted }}>Search by order number, customer name, or phone to resolve complaints.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[styles.searchBox, { flex: 1 }]}>
                  <MaterialIcons name="search" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Order no., name or phone..."
                    placeholderTextColor={Colors.textMuted}
                    value={receiptSearchQuery}
                    onChangeText={setReceiptSearchQuery}
                    onSubmitEditing={handleReceiptSearch}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: Colors.skyBlue, paddingHorizontal: 14, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' }}
                  onPress={handleReceiptSearch}
                >
                  <Text style={{ color: Colors.navy, fontWeight: Typography.bold, fontSize: Typography.sm }}>Find</Text>
                </TouchableOpacity>
              </View>
              {receiptSearchResult ? (
                <View style={{ backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.skyBlue + '50', overflow: 'hidden' }}>
                  <View style={{ backgroundColor: Colors.skyBlueMuted, paddingHorizontal: Spacing.md, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="check-circle" size={16} color={Colors.skyBlue} />
                    <Text style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.skyBlue }}>Order Found</Text>
                  </View>
                  <View style={{ padding: Spacing.md, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold }}>{receiptSearchResult.orderNo}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[receiptSearchResult.status].bg }]}>
                        <Text style={[styles.statusText, { color: STATUS_CONFIG[receiptSearchResult.status].color }]}>{receiptSearchResult.status}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: Typography.sm, color: Colors.textPrimary }}>{receiptSearchResult.customerName}</Text>
                    <Text style={{ fontSize: Typography.xs, color: Colors.textMuted }}>{receiptSearchResult.customerPhone}</Text>
                    <Text style={{ fontSize: Typography.xs, color: Colors.textSecondary }} numberOfLines={2}>
                      {receiptSearchResult.items.map(i => `${i.name} ×${i.qty}`).join(', ')}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.divider }}>
                      <Text style={{ fontSize: Typography.sm, color: Colors.textMuted }}>Total</Text>
                      <Text style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold }}>{formatUGX(receiptSearchResult.total)}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: Colors.textMuted }}>{new Date(receiptSearchResult.createdAt).toLocaleString('en-UG')}</Text>
                    <TouchableOpacity
                      style={{ backgroundColor: Colors.gold, borderRadius: BorderRadius.sm, paddingVertical: 8, alignItems: 'center', marginTop: 4 }}
                      onPress={() => { setShowReceiptSearch(false); openDetail(receiptSearchResult); }}
                    >
                      <Text style={{ fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.navy }}>View Full Order Details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : receiptSearchDone && receiptSearchQuery.trim().length > 0 ? (
                <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
                  <MaterialIcons name="search-off" size={40} color={Colors.textMuted} />
                  <Text style={{ fontSize: Typography.sm, color: Colors.textMuted }}>No order found for "{receiptSearchQuery}"</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== ASSIGN RIDER MODAL ===== */}
      <Modal visible={showRiderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.riderModal, { maxHeight: '88%' }]}>
            <View style={styles.riderModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="delivery-dining" size={22} color={Colors.gold} />
                <Text style={styles.riderModalTitle}>Assign Delivery Rider</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRiderModal(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={[styles.riderModalBody, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
              {/* Rider Roster Picker from pos_riders */}
              {ridersRoster.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.riderFormLabel}>Pick from Registered Riders</Text>
                  <View style={[styles.searchBox, { marginBottom: 4 }]}>
                    <MaterialIcons name="search" size={14} color={Colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search riders..."
                      placeholderTextColor={Colors.textMuted}
                      value={riderRosterSearch}
                      onChangeText={setRiderRosterSearch}
                    />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {filteredRosterRiders.map(r => {
                      const isSelected = riderName === r.name && riderPhone === r.phone;
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[
                            { paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1.5, borderColor: isSelected ? Colors.gold : Colors.border, gap: 2 },
                            isSelected && { backgroundColor: Colors.goldMuted },
                          ]}
                          onPress={() => { setRiderName(r.name); setRiderPhone(r.phone); }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <MaterialIcons name="delivery-dining" size={13} color={isSelected ? Colors.gold : Colors.textMuted} />
                            <Text style={{ fontSize: Typography.sm, fontWeight: Typography.semibold, color: isSelected ? Colors.gold : Colors.textPrimary }}>{r.name}</Text>
                          </View>
                          <Text style={{ fontSize: 10, color: Colors.textMuted }}>{r.phone}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: Colors.divider }} />
                    <Text style={{ fontSize: 10, color: Colors.textMuted }}>or enter manually</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: Colors.divider }} />
                  </View>
                </View>
              )}
              {[
                { label: 'Rider Name *', value: riderName, onChange: setRiderName, placeholder: 'Full name of rider', keyboard: 'default' as const },
                { label: 'Rider Phone *', value: riderPhone, onChange: setRiderPhone, placeholder: '+256 7XX XXX XXX', keyboard: 'phone-pad' as const },
                { label: 'Notes (optional)', value: riderNotes, onChange: setRiderNotes, placeholder: 'Special instructions...', keyboard: 'default' as const },
              ].map(field => (
                <View key={field.label} style={{ gap: 5 }}>
                  <Text style={styles.riderFormLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.riderFormInput}
                    placeholder={field.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType={field.keyboard}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.riderModalFooter}>
              <TouchableOpacity style={styles.riderCancelBtn} onPress={() => setShowRiderModal(false)}>
                <Text style={styles.riderCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.riderAssignBtn, assigningRider && { opacity: 0.7 }]}
                onPress={handleAssignRider}
                disabled={assigningRider}
              >
                {assigningRider ? (
                  <ActivityIndicator color={Colors.navy} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="delivery-dining" size={16} color={Colors.navy} />
                    <Text style={styles.riderAssignBtnText}>Assign Rider</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== RIDER HISTORY MODAL ===== */}
      <Modal visible={showRiderHistory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.historyModal}>
            <View style={styles.riderModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="history" size={20} color={Colors.gold} />
                <Text style={styles.riderModalTitle}>Rider Assignment History</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRiderHistory(false)}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }} showsVerticalScrollIndicator={false}>
              {riderHistory.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialIcons name="delivery-dining" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No rider assignments yet</Text>
                </View>
              ) : (
                riderHistory.map((a, i) => (
                  <View key={a.id} style={styles.historyCard}>
                    <View style={styles.historyCardTop}>
                      <View style={styles.historyAvatar}>
                        <MaterialIcons name="delivery-dining" size={18} color={Colors.skyBlue} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyRiderName}>{a.riderName}</Text>
                        <Text style={styles.historyRiderPhone}>{a.riderPhone}</Text>
                      </View>
                      {i === 0 && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>Current</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ gap: 3, marginTop: 6 }}>
                      <Text style={styles.historyMeta}>Assigned by: {a.assignedBy}</Text>
                      <Text style={styles.historyMeta}>At: {new Date(a.assignedAt).toLocaleString('en-UG')}</Text>
                      {a.notes ? <Text style={styles.historyNote}>{a.notes}</Text> : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderGold },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.navyCard, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.border },
  pendingBadgeAlert: { borderColor: Colors.warning + '50', backgroundColor: Colors.warningMuted },
  pendingBadgeText: { fontSize: 12, fontWeight: Typography.bold, color: Colors.warning },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: Typography.sm, paddingVertical: 10 },
  receiptSearchBtn: { width: 42, height: 42, backgroundColor: Colors.skyBlueMuted, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.skyBlue + '40' },
  filterWrap: { height: 48 },
  filterRow: { paddingHorizontal: Spacing.base, alignItems: 'center', gap: 8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontSize: 12, color: Colors.textMuted, fontWeight: Typography.medium },
  countBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countBadgeText: { fontSize: 10, fontWeight: Typography.bold },
  typeWrap: { height: 44 },
  typeRow: { paddingHorizontal: Spacing.base, alignItems: 'center', gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  typeChipText: { fontSize: 11, color: Colors.textMuted },
  list: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: 12, paddingBottom: 120 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: Typography.base, color: Colors.textMuted, fontWeight: Typography.semibold },
  orderCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadows.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  orderNo: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  orderType: { fontSize: Typography.xs, color: Colors.textMuted },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.circle },
  statusText: { fontSize: 11, fontWeight: Typography.bold, textTransform: 'capitalize' },
  timeAgo: { fontSize: 10, color: Colors.textMuted },
  cardMid: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, flex: 1 },
  customerPhone: { fontSize: Typography.xs, color: Colors.textMuted },
  itemSummary: { fontSize: Typography.xs, color: Colors.textSecondary },
  // Rider badge
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  riderAssignedBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.successMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.success + '30' },
  riderAssignedText: { fontSize: 11, color: Colors.success, fontWeight: Typography.medium, flex: 1 },
  riderUnassignedBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.warning + '30' },
  riderUnassignedText: { fontSize: 11, color: Colors.warning, fontWeight: Typography.medium },
  assignRiderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.skyBlueMuted, paddingHorizontal: 8, paddingVertical: 5, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30' },
  assignRiderBtnText: { fontSize: 11, color: Colors.skyBlue, fontWeight: Typography.semibold },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.navy + '80' },
  cardFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalAmount: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.gold },
  payStatusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.circle },
  payStatusText: { fontSize: 10, fontWeight: Typography.bold, textTransform: 'capitalize' },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cancelBtn: { width: 32, height: 32, borderRadius: BorderRadius.sm, backgroundColor: Colors.dangerMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.danger + '30' },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.sm, ...Shadows.gold },
  advanceBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  detailModal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '92%', borderTopWidth: 2, borderColor: Colors.borderGold },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  detailOrderNo: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.gold },
  detailBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  detailBody: { padding: Spacing.xl, gap: Spacing.lg },
  detailSection: { gap: Spacing.sm },
  detailSectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  detailInfoCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailValue: { fontSize: Typography.sm, color: Colors.textPrimary, flex: 1 },
  // Rider section
  riderSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.skyBlueMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30' },
  historyBtnText: { fontSize: 11, color: Colors.skyBlue, fontWeight: Typography.semibold },
  riderAssignedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.successMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.success + '40' },
  riderAssignedName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  riderAssignedSub: { fontSize: Typography.xs, color: Colors.success },
  reassignBtn: { backgroundColor: Colors.skyBlueMuted, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.skyBlue + '30' },
  reassignBtnText: { fontSize: 11, color: Colors.skyBlue, fontWeight: Typography.semibold },
  noRiderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noRiderText: { flex: 1, fontSize: Typography.sm, color: Colors.warning },
  assignNowBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.sm },
  assignNowBtnText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.navy },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemLeft: { flex: 1 },
  itemName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  itemQty: { fontSize: Typography.xs, color: Colors.textMuted },
  itemTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  summaryLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  summaryValue: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  summaryRowTotal: { paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.divider },
  summaryTotalLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  summaryTotalValue: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.gold },
  timestampRow: { gap: 4 },
  timestampText: { fontSize: Typography.xs, color: Colors.textMuted },
  detailActions: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  detailCancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.danger + '40', backgroundColor: Colors.dangerMuted },
  detailCancelBtnText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.danger },
  detailAdvanceBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, ...Shadows.gold },
  detailAdvanceBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // Rider Modal
  riderModal: { backgroundColor: Colors.navyMid, borderRadius: BorderRadius.xl, width: '90%', maxWidth: 420, borderWidth: 1, borderColor: Colors.borderGold, alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
  riderModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  riderModalTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.gold },
  riderModalBody: { padding: Spacing.xl, gap: Spacing.md },
  riderFormLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  riderFormInput: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: Typography.base, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  riderModalFooter: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  riderCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  riderCancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  riderAssignBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, backgroundColor: Colors.gold, ...Shadows.gold },
  riderAssignBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  // History Modal
  historyModal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '70%', borderTopWidth: 2, borderColor: Colors.borderGold },
  historyCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  historyCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.skyBlueMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.skyBlue + '40' },
  historyRiderName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  historyRiderPhone: { fontSize: Typography.xs, color: Colors.textMuted },
  currentBadge: { backgroundColor: Colors.successMuted, paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.circle },
  currentBadgeText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.success },
  historyMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  historyNote: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic' },
});
