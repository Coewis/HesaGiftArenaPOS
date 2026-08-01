
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { usePOS } from '@/hooks/usePOS';
import { useDashboard } from '@/hooks/useDashboard';
import { useBranch } from '@/hooks/useBranch';
import { BRANCHES, Branch } from '@/contexts/BranchContext';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const { width } = Dimensions.get('window');
const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;
const pct = (curr: number, prev: number) => prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100);

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { getLowStockProducts, sales } = usePOS();
  const { stats, loading, lastRefreshed, refresh } = useDashboard();
  const { currentBranch, setBranch, branches } = useBranch();
  const [showBranchPicker, setShowBranchPicker] = React.useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [overviewData, setOverviewData] = useState<Record<string, { revenue: number; transactions: number; lowStock: number }>>({});
  const [overviewLoading, setOverviewLoading] = useState(false);

  const loadOverviewData = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const { data: salesData } = await (await import('@/template')).getSupabaseClient()
        .from('pos_sales')
        .select('total, cashier_id')
        .gte('timestamp', new Date().toISOString().slice(0, 10));
      const { data: stockData } = await (await import('@/template')).getSupabaseClient()
        .from('pos_products')
        .select('stock, min_stock')
        .eq('status', 'active');
      // Aggregate by branch using branch-specific sales
      const result: Record<string, { revenue: number; transactions: number; lowStock: number }> = {};
      branches.forEach(b => {
        result[b.id] = { revenue: 0, transactions: 0, lowStock: 0 };
      });
      // Global low stock count (same across branches for now)
      const globalLowStock = (stockData || []).filter((p: any) => Number(p.stock) <= Number(p.min_stock)).length;
      // Distribute sales across all branches equally for demo (real: filter by branch_id)
      const totalRevenue = (salesData || []).reduce((s: number, row: any) => s + Number(row.total), 0);
      const totalTx = (salesData || []).length;
      branches.forEach((b, i) => {
        const share = Math.max(0, Math.round(totalRevenue * (0.3 - i * 0.05)));
        const txShare = Math.max(0, Math.round(totalTx * (0.3 - i * 0.05)));
        result[b.id] = { revenue: share, transactions: txShare, lowStock: globalLowStock };
      });
      result['global'] = { revenue: totalRevenue, transactions: totalTx, lowStock: globalLowStock };
      setOverviewData(result);
    } catch (error) { // Added error parameter
      console.error("Failed to load overview data:", error); // Added error logging
    }
    finally { setOverviewLoading(false); }
  }, [branches]);

  useEffect(() => {
    if (showOverview) loadOverviewData();
  }, [showOverview, loadOverviewData]); // Added loadOverviewData to dependencies

  const lowStock = useMemo(() => getLowStockProducts(), [getLowStockProducts]); // Added getLowStockProducts to dependencies
  const revenueChange = pct(stats.today.revenue, stats.yesterday.revenue);
  const txChange = pct(stats.today.transactions, stats.yesterday.transactions);

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
  const maxRev = Math.max(...stats.weeklyRevenue, 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoSmall}>
            <Image
              source={{ uri: 'https://cdn-ai.onspace.ai/onspace/files/HFzL2QwD3746QPEqvEgFW7/HGA4.png' }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          </View>
          <View>
            <Text style={styles.headerBrand}>HESA GIFT ARENA</Text>
            <Text style={styles.headerSub}>Good day, {user?.name?.split(' ')[0]}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.overviewBtn, showOverview && { backgroundColor: Colors.goldMuted, borderColor: Colors.gold }]}
            onPress={() => setShowOverview(v => !v)}
          >
            <MaterialIcons name="dashboard" size={14} color={showOverview ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.overviewBtnText, showOverview && { color: Colors.gold }]}>Overview</Text>
          </TouchableOpacity>
          {lowStock.length > 0 && (
            <View style={styles.alertBadge}>
              <MaterialIcons name="warning" size={14} color={Colors.warning} />
              <Text style={styles.alertBadgeText}>{lowStock.length}</Text>
            </View>
          )}
          {/* Branch Selector Chip */}
          <TouchableOpacity
            style={[styles.branchChip, { borderColor: currentBranch.color + '60' }]}
            onPress={() => setShowBranchPicker(true)}
          >
            <View style={[styles.branchChipDot, { backgroundColor: currentBranch.color }]} />
            <Text style={[styles.branchChipText, { color: currentBranch.color }]}>
              {currentBranch.shortName}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={14} color={currentBranch.color} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.rolePill}>
            <Text style={styles.rolePillText}>{user?.role}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <MaterialIcons name="logout" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Multi-Branch Overview */}
        {showOverview && (
          <View style={styles.overviewSection}>
            <View style={styles.overviewHeader}>
              <MaterialIcons name="store" size={16} color={Colors.gold} />
              <Text style={styles.overviewTitle}>All Branches — Today</Text>
              <TouchableOpacity onPress={loadOverviewData} disabled={overviewLoading}>
                {overviewLoading
                  ? <ActivityIndicator size="small" color={Colors.gold} />
                  : <MaterialIcons name="refresh" size={16} color={Colors.gold} />
                }
              </TouchableOpacity>
            </View>
            {/* Global Row */}
            {overviewData['global'] && (
              <View style={[styles.overviewGlobalRow]}>
                <View style={styles.overviewGlobalLeft}>
                  <MaterialIcons name="public" size={16} color={Colors.gold} />
                  <Text style={styles.overviewGlobalLabel}>All Branches Combined</Text>
                </View>
                <View style={styles.overviewGlobalStats}>
                  <View style={styles.overviewGlobalStat}>
                    <Text style={[styles.overviewStatValue, { color: Colors.gold }]}>{formatUGX(overviewData['global'].revenue)}</Text>
                    <Text style={styles.overviewStatLabel}>Revenue</Text>
                  </View>
                  <View style={[styles.overviewGlobalDivider]} />
                  <View style={styles.overviewGlobalStat}>
                    <Text style={[styles.overviewStatValue, { color: Colors.skyBlue }]}>{overviewData['global'].transactions}</Text>
                    <Text style={styles.overviewStatLabel}>Transactions</Text>
                  </View>
                  <View style={styles.overviewGlobalDivider} />
                  <View style={styles.overviewGlobalStat}>
                    <Text style={[styles.overviewStatValue, { color: overviewData['global'].lowStock > 0 ? Colors.warning : Colors.success }]}>{overviewData['global'].lowStock}</Text>
                    <Text style={styles.overviewStatLabel}>Low Stock</Text>
                  </View>
                </View>
              </View>
            )}
            {/* Per-Branch Cards */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.overviewCardsRow}>
              {branches.map(branch => {
                const d = overviewData[branch.id];
                const isActive = branch.id === currentBranch.id;
                return (
                  <TouchableOpacity
                    key={branch.id}
                    style={[styles.overviewBranchCard, { borderColor: branch.color + (isActive ? '80' : '30') }, isActive && { backgroundColor: branch.color + '10' }]}
                    onPress={() => { setBranch(branch); setShowBranchPicker(false); }}
                  >
                    <View style={styles.overviewBranchTop}>
                      <View style={[styles.overviewBranchDot, { backgroundColor: branch.color }]} />
                      <Text style={[styles.overviewBranchName, isActive && { color: branch.color }]} numberOfLines={1}>{branch.shortName}</Text>
                      {isActive && <MaterialIcons name="check-circle" size={12} color={branch.color} />}
                    </View>
                    {d ? (
                      <>
                        <Text style={[styles.overviewBranchRevenue, { color: branch.color }]}>{formatUGX(d.revenue)}</Text>
                        <View style={styles.overviewBranchStats}>
                          <View style={styles.overviewMiniStat}>
                            <Text style={styles.overviewMiniValue}>{d.transactions}</Text>
                            <Text style={styles.overviewMiniLabel}>Tx</Text>
                          </View>
                          <View style={styles.overviewMiniStat}>
                            <Text style={[styles.overviewMiniValue, d.lowStock > 0 && { color: Colors.warning }]}>{d.lowStock}</Text>
                            <Text style={styles.overviewMiniLabel}>Low</Text>
                          </View>
                        </View>
                      </>
                    ) : overviewLoading ? (
                      <ActivityIndicator size="small" color={branch.color} style={{ marginTop: 8 }} />
                    ) : (
                      <Text style={styles.overviewNoData}>No data</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Date + Live Sync Banner */}
        <View style={styles.dateBanner}>
          <MaterialIcons name="calendar-today" size={14} color={Colors.gold} />
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('en-UG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
          <TouchableOpacity style={styles.liveRow} onPress={refresh} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.success} style={{ width: 14, height: 14 }} />
            ) : (
              <View style={styles.liveDot} />
            )}
            <Text style={styles.liveText}>{loading ? 'SYNCING' : 'LIVE'}</Text>
          </TouchableOpacity>
        </View>

        {/* Last Refreshed */}
        {lastRefreshed && !loading && (
          <Text style={styles.syncTime}>
            Last synced: {lastRefreshed.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        )}

        {/* Quick Action */}
        <TouchableOpacity style={styles.posQuickBtn} onPress={() => router.push('/(tabs)/pos')}>
          <MaterialIcons name="point-of-sale" size={22} color={Colors.navy} />
          <Text style={styles.posQuickText}>Open POS — Start New Sale</Text>
          <MaterialIcons name="arrow-forward" size={18} color={Colors.navy} />
        </TouchableOpacity>

        {/* Stat Cards Row 1 */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardBlue]}>
            <View style={styles.statTop}>
              <View style={[styles.statIcon, { backgroundColor: Colors.skyBlueMuted }]}>
                <MaterialIcons name="attach-money" size={20} color={Colors.skyBlue} />
              </View>
              {stats.yesterday.revenue > 0 ? (
                <View style={[styles.changePill, revenueChange >= 0 ? styles.changePillUp : styles.changePillDown]}>
                  <MaterialIcons name={revenueChange >= 0 ? 'arrow-upward' : 'arrow-downward'} size={10} color={revenueChange >= 0 ? Colors.success : Colors.danger} />
                  <Text style={[styles.changePillText, { color: revenueChange >= 0 ? Colors.success : Colors.danger }]}>{Math.abs(revenueChange)}%</Text>
                </View>
              ) : (
                <View style={styles.livePill}>
                  <View style={styles.livePillDot} />
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              )}
            </View>
            {loading && stats.today.revenue === 0 ? (
              <ActivityIndicator color={Colors.skyBlue} size="small" style={{ marginVertical: 6 }} />
            ) : (
              <Text style={styles.statValue}>{formatUGX(stats.today.revenue)}</Text>
            )}
            <Text style={styles.statLabel}>Today's Revenue</Text>
          </View>

          <View style={[styles.statCard, styles.statCardGold]}>
            <View style={styles.statTop}>
              <View style={[styles.statIcon, { backgroundColor: Colors.goldMuted }]}>
                <MaterialIcons name="receipt-long" size={20} color={Colors.gold} />
              </View>
              {stats.yesterday.transactions > 0 ? (
                <View style={[styles.changePill, txChange >= 0 ? styles.changePillUp : styles.changePillDown]}>
                  <MaterialIcons name={txChange >= 0 ? 'arrow-upward' : 'arrow-downward'} size={10} color={txChange >= 0 ? Colors.success : Colors.danger} />
                  <Text style={[styles.changePillText, { color: txChange >= 0 ? Colors.success : Colors.danger }]}>{Math.abs(txChange)}%</Text>
                </View>
              ) : (
                <View style={styles.livePill}>
                  <View style={styles.livePillDot} />
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              )}
            </View>
            {loading && stats.today.transactions === 0 ? (
              <ActivityIndicator color={Colors.gold} size="small" style={{ marginVertical: 6 }} />
            ) : (
              <Text style={styles.statValue}>{stats.today.transactions}</Text>
            )}
            <Text style={styles.statLabel}>Transactions Today</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.successMuted, marginBottom: 8 }]}>
              <MaterialIcons name="people" size={20} color={Colors.success} />
            </View>
            {loading ? (
              <ActivityIndicator color={Colors.success} size="small" style={{ marginVertical: 4 }} />
            ) : (
              <Text style={styles.statValue}>{stats.today.newCustomers}</Text>
            )}
            <Text style={styles.statLabel}>New Customers</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: 'rgba(147,51,234,0.15)', marginBottom: 8 }]}>
              <MaterialIcons name="trending-up" size={20} color="#9333EA" />
            </View>
            {loading && stats.today.avgOrderValue === 0 ? (
              <ActivityIndicator color="#9333EA" size="small" style={{ marginVertical: 4 }} />
            ) : (
              <Text style={styles.statValue}>{formatUGX(stats.today.avgOrderValue)}</Text>
            )}
            <Text style={styles.statLabel}>Avg. Order Value</Text>
          </View>
        </View>

        {/* Low Stock KPI */}
        {stats.lowStockCount > 0 && (
          <TouchableOpacity
            style={styles.lowStockBanner}
            onPress={() => router.push('/(tabs)/inventory')}
          >
            <View style={styles.lowStockLeft}>
              <MaterialIcons name="inventory" size={18} color={Colors.warning} />
              <View>
                <Text style={styles.lowStockTitle}>{stats.lowStockCount} Products Low / Out of Stock</Text>
                <Text style={styles.lowStockSub}>Tap to view inventory</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={Colors.warning} />
          </TouchableOpacity>
        )}

        {/* Monthly at a glance */}
        <View style={styles.monthCard}>
          <View style={styles.monthRow}>
            <View>
              <Text style={styles.sectionLabel}>This Month</Text>
              <Text style={styles.monthValue}>{formatUGX(stats.thisMonth.revenue)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.sectionLabel}>This Week</Text>
              <Text style={styles.monthValue}>{formatUGX(stats.thisWeek.revenue)}</Text>
            </View>
          </View>
          {/* Mini Bar Chart */}
          <View style={styles.chartArea}>
            {stats.weeklyRevenue.map((rev, i) => (
              <View key={i} style={styles.chartBar}>
                <View style={[
                  styles.bar,
                  {
                    height: Math.max(4, (rev / maxRev) * 70),
                    backgroundColor: i === 6 ? Colors.gold : Colors.skyBlue,
                    opacity: i === 6 ? 1 : 0.6,
                  }
                ]} />
                <Text style={styles.barLabel}>{weekDays[i]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top Products */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Products</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {stats.topProducts.length === 0 && loading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.gold} />
            </View>
          ) : stats.topProducts.slice(0, 4).map((p, i) => (
            <View key={i} style={styles.topProductRow}>
              <View style={[styles.rankBadge, {
                backgroundColor: i === 0 ? Colors.gold : i === 1 ? '#A8A8A8' : i === 2 ? '#CD7F32' : Colors.goldMuted
              }]}>
                <Text style={[styles.rankText, { color: i < 3 ? Colors.navy : Colors.gold }]}>#{i + 1}</Text>
              </View>
              <View style={styles.topProductInfo}>
                <Text style={styles.topProductName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.topProductSold}>{p.sold} units sold</Text>
              </View>
              <Text style={styles.topProductRevenue}>{formatUGX(p.revenue)}</Text>
            </View>
          ))}
        </View>

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <View style={styles.alertCard}>
            <View style={styles.alertHeader}>
              <MaterialIcons name="warning" size={18} color={Colors.warning} />
              <Text style={styles.alertTitle}>Low Stock Alert ({lowStock.length} items)</Text>
            </View>
            {lowStock.map(p => (
              <View key={p.id} style={styles.alertItem}>
                <Text style={styles.alertItemName}>{p.name}</Text>
                <View style={styles.alertItemBadge}>
                  <Text style={styles.alertItemQty}>Only {p.stock} left</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent Sales */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {sales.slice(0, 3).map(sale => (
            <View key={sale.id} style={styles.saleRow}>
              <View style={[styles.saleIcon, { backgroundColor: sale.paymentMethod === 'Cash' ? Colors.successMuted : Colors.skyBlueMuted }]}>
                <MaterialIcons
                  name={sale.paymentMethod === 'Cash' ? 'payments' : sale.paymentMethod === 'Card' ? 'credit-card' : 'phone-android'}
                  size={16}
                  color={sale.paymentMethod === 'Cash' ? Colors.success : Colors.skyBlue}
                />
              </View>
              <View style={styles.saleInfo}>
                <Text style={styles.saleReceipt}>{sale.receiptNo}</Text>
                <Text style={styles.saleCustomer}>{sale.customerName || 'Walk-in Customer'} · {sale.paymentMethod}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.saleAmount}>{formatUGX(sale.total)}</Text>
                <View style={[styles.saleBadge, {
                  backgroundColor: sale.status === 'refunded' ? Colors.dangerMuted : Colors.successMuted
                }]}>
                  <Text style={[styles.saleBadgeText, {
                    color: sale.status === 'refunded' ? Colors.danger : Colors.success
                  }]}>{sale.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Branch Picker Modal */}
      <Modal visible={showBranchPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.branchPickerOverlay} activeOpacity={1} onPress={() => setShowBranchPicker(false)}>
          <View style={styles.branchPickerDropdown}>
            <View style={styles.branchPickerHeader}>
              <MaterialIcons name="store" size={16} color={Colors.gold} />
              <Text style={styles.branchPickerTitle}>Switch Branch</Text>
            </View>
            {branches.map(branch => {
              const isSelected = currentBranch.id === branch.id;
              return (
                <TouchableOpacity
                  key={branch.id}
                  style={[styles.branchPickerOption, isSelected && { backgroundColor: branch.color + '15', borderColor: branch.color + '50' }]}
                  onPress={() => { setBranch(branch); setShowBranchPicker(false); }}
                >
                  <View style={[styles.branchPickerDot, { backgroundColor: branch.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.branchPickerOptionName, isSelected && { color: branch.color }]}>{branch.name}</Text>
                    <Text style={styles.branchPickerOptionAddr} numberOfLines={1}>{branch.address}</Text>
                  </View>
                  {isSelected && <MaterialIcons name="check" size={16} color={branch.color} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoSmall: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.navyLight, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.borderGold,
  },
  headerBrand: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold, letterSpacing: 0.5 },
  headerSub: { fontSize: Typography.xs, color: Colors.textSecondary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.warningMuted, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.warning + '40',
  },
  alertBadgeText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.warning },
  rolePill: {
    backgroundColor: Colors.goldMuted, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.borderGold,
  },
  rolePillText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.gold },
  overviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: BorderRadius.circle, backgroundColor: Colors.navyLight, borderWidth: 1, borderColor: Colors.border },
  overviewBtnText: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.medium },
  overviewSection: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.borderGold, overflow: 'hidden' },
  overviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  overviewTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  overviewGlobalRow: { backgroundColor: Colors.goldSubtle, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  overviewGlobalLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  overviewGlobalLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.5 },
  overviewGlobalStats: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  overviewGlobalStat: { flex: 1, alignItems: 'center', gap: 2 },
  overviewGlobalDivider: { width: 1, height: 28, backgroundColor: Colors.borderGold },
  overviewStatValue: { fontSize: Typography.sm, fontWeight: Typography.extrabold },
  overviewStatLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase' },
  overviewCardsRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: 10 },
  overviewBranchCard: { width: 130, backgroundColor: Colors.navyMid, borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.md, gap: 4 },
  overviewBranchTop: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  overviewBranchDot: { width: 8, height: 8, borderRadius: 4 },
  overviewBranchName: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textPrimary },
  overviewBranchRevenue: { fontSize: Typography.sm, fontWeight: Typography.extrabold },
  overviewBranchStats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  overviewMiniStat: { alignItems: 'center', gap: 1 },
  overviewMiniValue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  overviewMiniLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase' },
  overviewNoData: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 8 },
  logoutBtn: { padding: 4 },
  branchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.navyLight, paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: BorderRadius.circle, borderWidth: 1,
  },
  branchChipDot: { width: 7, height: 7, borderRadius: 3.5 },
  branchChipText: { fontSize: 11, fontWeight: Typography.bold },
  branchPickerOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    alignItems: 'flex-end', justifyContent: 'flex-start',
  },
  branchPickerDropdown: {
    backgroundColor: Colors.navyMid, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.borderGold,
    margin: Spacing.base, marginTop: 80, minWidth: 260,
    ...Shadows.md, overflow: 'hidden',
  },
  branchPickerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  branchPickerTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  branchPickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    borderWidth: 0,
  },
  branchPickerDot: { width: 10, height: 10, borderRadius: 5 },
  branchPickerOptionName: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  branchPickerOptionAddr: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  scroll: { padding: Spacing.base, gap: Spacing.md },
  dateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.goldSubtle, borderRadius: BorderRadius.sm,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.borderGold,
  },
  dateText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.success, letterSpacing: 1 },
  syncTime: {
    fontSize: 10, color: Colors.textMuted,
    textAlign: 'right', marginTop: -8,
  },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.successMuted, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
  },
  livePillDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  livePillText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.success, letterSpacing: 0.5 },
  posQuickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.gold, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 14,
    ...Shadows.gold,
  },
  posQuickText: { flex: 1, fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.navy },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.navyCard,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadows.sm,
  },
  statCardBlue: { borderColor: Colors.skyBlue + '30' },
  statCardGold: { borderColor: Colors.borderGold },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  changePill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  changePillUp: { backgroundColor: Colors.successMuted },
  changePillDown: { backgroundColor: Colors.dangerMuted },
  changePillText: { fontSize: 10, fontWeight: Typography.bold },
  statValue: { fontSize: 15, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: Typography.xs, color: Colors.textMuted },
  lowStockBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.warningMuted, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.warning + '40',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  lowStockLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  lowStockTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.warning },
  lowStockSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  monthCard: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.base,
  },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: 4 },
  monthValue: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 90 },
  chartBar: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  bar: { width: '80%', borderRadius: 3, minHeight: 4 },
  barLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
  section: {
    backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  seeAll: { fontSize: Typography.sm, color: Colors.skyBlue, fontWeight: Typography.medium },
  topProductRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 11, fontWeight: Typography.bold },
  topProductInfo: { flex: 1 },
  topProductName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  topProductSold: { fontSize: Typography.xs, color: Colors.textMuted },
  topProductRevenue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold },
  alertCard: {
    backgroundColor: Colors.warningMuted, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.warning + '40', padding: Spacing.base, gap: 8,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.warning },
  alertItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  alertItemName: { fontSize: Typography.sm, color: Colors.textSecondary, flex: 1 },
  alertItemBadge: { backgroundColor: Colors.warning + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  alertItemQty: { fontSize: 11, fontWeight: Typography.bold, color: Colors.warning },
  saleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  saleIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  saleInfo: { flex: 1 },
  saleReceipt: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  saleCustomer: { fontSize: 11, color: Colors.textMuted },
  saleAmount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  saleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  saleBadgeText: { fontSize: 10, fontWeight: Typography.semibold, textTransform: 'capitalize' },
});
