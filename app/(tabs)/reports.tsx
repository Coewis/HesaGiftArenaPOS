import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BarChart, PieChart, LineChart } from 'react-native-chart-kit';
import { usePOS } from '@/hooks/usePOS';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/hooks/useBranch';
import { useAlert } from '@/template';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { DASHBOARD_STATS } from '@/constants/mockData';
import { SaleRecord } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH >= 1024;
const isTablet = SCREEN_WIDTH >= 768;
const CHART_W = isDesktop ? Math.min(520, SCREEN_WIDTH * 0.45) : isTablet ? SCREEN_WIDTH - 64 : SCREEN_WIDTH - 48;

const formatUGX = (n: number) => `UGX ${n.toLocaleString()}`;
type Period = 'today' | 'week' | 'month';

const CHART_CONFIG = {
  backgroundColor: Colors.navyCard,
  backgroundGradientFrom: Colors.navyCard,
  backgroundGradientTo: Colors.navyMid,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(56, 182, 255, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(180, 200, 220, ${opacity})`,
  style: { borderRadius: 12 },
  propsForDots: { r: '4', strokeWidth: '2', stroke: Colors.skyBlue },
  propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.05)' },
};

const CASHIER_STATS = [
  { id: 'user_cashier', name: 'Ruth Namukasa', role: 'Cashier', sales: 11, revenue: 756000, avgOrder: 68727, transactions: 11 },
  { id: 'user_manager', name: 'John Sserwanga', role: 'Manager', sales: 7, revenue: 489000, avgOrder: 69857, transactions: 7 },
];

const REFUND_METHODS = [
  { key: 'Cash', label: 'Cash Refund', color: Colors.success },
  { key: 'MTN MoMo', label: 'MTN MoMo', color: Colors.mtnDark },
  { key: 'Airtel Money', label: 'Airtel Money', color: Colors.airtel },
  { key: 'Original Method', label: 'Original Method', color: Colors.skyBlue },
];

// Payment method breakdown for pie chart
const PAYMENT_PIE_DATA = [
  { name: 'Cash', population: 38, color: Colors.success, legendFontColor: Colors.textSecondary, legendFontSize: 11 },
  { name: 'MTN MoMo', population: 32, color: '#FFCC00', legendFontColor: Colors.textSecondary, legendFontSize: 11 },
  { name: 'Airtel', population: 18, color: Colors.airtel, legendFontColor: Colors.textSecondary, legendFontSize: 11 },
  { name: 'Card', population: 12, color: Colors.skyBlue, legendFontColor: Colors.textSecondary, legendFontSize: 11 },
];

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { sales, products, addRefund } = usePOS();
  const { user } = useAuth();
  const { currentBranch, setBranch, branches } = useBranch();
  const { showAlert } = useAlert();
  const [period, setPeriod] = useState<Period>('today');
  const [showBranchFilter, setShowBranchFilter] = useState(false);
  const [showEODModal, setShowEODModal] = useState(false);
  const [generatingEOD, setGeneratingEOD] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'bar' | 'line' | 'pie'>('bar');

  // Refund state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundSale, setRefundSale] = useState<SaleRecord | null>(null);
  const [refundItems, setRefundItems] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState('Original Method');
  const [refundReason, setRefundReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);

  const stats = useMemo(() => {
    if (period === 'today') return { revenue: DASHBOARD_STATS.today.revenue, transactions: DASHBOARD_STATS.today.transactions, avg: DASHBOARD_STATS.today.avgOrderValue };
    if (period === 'week') return { revenue: DASHBOARD_STATS.thisWeek.revenue, transactions: DASHBOARD_STATS.thisWeek.transactions, avg: Math.round(DASHBOARD_STATS.thisWeek.revenue / DASHBOARD_STATS.thisWeek.transactions) };
    return { revenue: DASHBOARD_STATS.thisMonth.revenue, transactions: DASHBOARD_STATS.thisMonth.transactions, avg: Math.round(DASHBOARD_STATS.thisMonth.revenue / DASHBOARD_STATS.thisMonth.transactions) };
  }, [period]);

  const paymentBreakdown = [
    { method: 'Cash', pct: 38, amount: Math.round(stats.revenue * 0.38), color: Colors.success },
    { method: 'MTN MoMo', pct: 32, amount: Math.round(stats.revenue * 0.32), color: '#FFCC00' },
    { method: 'Airtel Money', pct: 18, amount: Math.round(stats.revenue * 0.18), color: Colors.airtel },
    { method: 'Card', pct: 12, amount: Math.round(stats.revenue * 0.12), color: Colors.skyBlue },
  ];

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyRevInMillions = DASHBOARD_STATS.weeklyRevenue.map(v => parseFloat((v / 1000000).toFixed(2)));

  // Bar chart data - daily revenue (in millions UGX)
  const barChartData = {
    labels: weekDays,
    datasets: [{
      data: weeklyRevInMillions,
      colors: DASHBOARD_STATS.weeklyRevenue.map((_, i) =>
        i === DASHBOARD_STATS.weeklyRevenue.length - 1
          ? () => Colors.gold
          : () => Colors.skyBlue + 'cc'
      ),
    }],
  };

  // Line chart data - 7-day trend
  const lineChartData = {
    labels: weekDays,
    datasets: [{
      data: weeklyRevInMillions,
      color: (opacity = 1) => `rgba(212,175,55,${opacity})`,
      strokeWidth: 2.5,
    }],
  };

  // Top 5 products bar data (units sold)
  const topProductsBarData = {
    labels: DASHBOARD_STATS.topProducts.slice(0, 5).map(p => p.name.split(' ').slice(0, 2).join(' ')),
    datasets: [{ data: DASHBOARD_STATS.topProducts.slice(0, 5).map(p => p.sold) }],
  };

  const openRefundModal = (sale: SaleRecord) => {
    setRefundSale(sale);
    const initial: Record<string, number> = {};
    sale.items.forEach(i => { initial[i.productId] = i.qty; });
    setRefundItems(initial);
    setRefundMethod(sale.paymentMethod === 'Split' ? 'Cash' : sale.paymentMethod);
    setRefundReason('');
    setShowRefundModal(true);
  };

  const refundTotal = useMemo(() => {
    if (!refundSale) return 0;
    return refundSale.items.reduce((sum, item) => {
      const qty = refundItems[item.productId] || 0;
      return sum + item.price * qty;
    }, 0);
  }, [refundSale, refundItems]);

  const handleProcessRefund = async () => {
    if (!refundSale) return;
    if (!refundReason.trim()) { showAlert('Reason Required', 'Please provide a reason for the refund.'); return; }
    if (refundTotal <= 0) { showAlert('No Items Selected', 'Select at least one item to refund.'); return; }
    setProcessingRefund(true);
    try {
      const itemsToRefund = refundSale.items
        .filter(i => (refundItems[i.productId] || 0) > 0)
        .map(i => ({ productId: i.productId, name: i.name, qty: refundItems[i.productId], price: i.price, total: i.price * refundItems[i.productId] }));
      const refundReceiptNo = await addRefund({ originalSaleId: refundSale.id, cashier: user?.name || 'Manager', items: itemsToRefund, refundMethod, totalRefunded: refundTotal, reason: refundReason });
      setShowRefundModal(false);
      showAlert('Refund Processed', `${formatUGX(refundTotal)} refunded via ${refundMethod}. Ref: ${refundReceiptNo}`);
    } catch { showAlert('Error', 'Could not process refund. Please try again.'); }
    finally { setProcessingRefund(false); }
  };

  const buildEODHTML = () => {
    const today = new Date().toLocaleDateString('en-UG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#1a1a1a;}
    .header{text-align:center;border-bottom:3px solid #D4AF37;padding-bottom:16px;margin-bottom:24px;}
    .brand{font-size:26px;font-weight:900;color:#B8922E;letter-spacing:2px;}
    .section{margin-bottom:24px;}.section-title{font-size:14px;font-weight:800;color:#B8922E;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #E8D5A0;padding-bottom:6px;margin-bottom:12px;}
    .kpi-grid{display:flex;flex-wrap:wrap;gap:12px;}.kpi-box{flex:1;min-width:140px;background:#f8f5ee;border:1px solid #E8D5A0;border-radius:8px;padding:14px;}
    .kpi-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;}.kpi-value{font-size:20px;font-weight:900;color:#B8922E;margin-top:4px;}
    table{width:100%;border-collapse:collapse;font-size:13px;}th{background:#0A1628;color:#D4AF37;padding:10px 12px;text-align:left;font-weight:700;}td{padding:9px 12px;border-bottom:1px solid #f0f0f0;}.highlight{font-weight:bold;color:#B8922E;}
    .footer{text-align:center;font-size:11px;color:#aaa;margin-top:24px;padding-top:12px;border-top:1px dashed #ddd;}</style></head>
    <body><div class="header"><div class="brand">HESA GIFT ARENA</div><div style="font-size:18px;font-weight:bold;color:#0A1628;margin-top:12px;">END-OF-DAY CLOSING REPORT</div><div style="font-size:13px;color:#555;margin-top:4px;">${today}</div><div style="font-size:11px;color:#999;">Generated: ${new Date().toLocaleString('en-UG')} · By: ${user?.name || 'Manager'}</div></div>
    <div class="section"><div class="section-title">Daily Summary</div><div class="kpi-grid">
    <div class="kpi-box"><div class="kpi-label">Total Revenue</div><div class="kpi-value">UGX ${DASHBOARD_STATS.today.revenue.toLocaleString()}</div></div>
    <div class="kpi-box"><div class="kpi-label">Transactions</div><div class="kpi-value">${DASHBOARD_STATS.today.transactions}</div></div>
    <div class="kpi-box"><div class="kpi-label">Avg Order</div><div class="kpi-value">UGX ${DASHBOARD_STATS.today.avgOrderValue.toLocaleString()}</div></div>
    <div class="kpi-box"><div class="kpi-label">New Customers</div><div class="kpi-value">${DASHBOARD_STATS.today.newCustomers}</div></div></div></div>
    <div class="section"><div class="section-title">Payment Breakdown</div><table><tr><th>Method</th><th>Amount</th><th>Share</th></tr>
    ${paymentBreakdown.map(p => `<tr><td>${p.method}</td><td class="highlight">UGX ${p.amount.toLocaleString()}</td><td>${p.pct}%</td></tr>`).join('')}</table></div>
    <div class="section"><div class="section-title">Top Products</div><table><tr><th>#</th><th>Product</th><th>Units</th><th>Revenue</th></tr>
    ${DASHBOARD_STATS.topProducts.slice(0, 5).map((p, i) => `<tr><td><strong>${i + 1}</strong></td><td>${p.name}</td><td>${p.sold}</td><td class="highlight">UGX ${p.revenue.toLocaleString()}</td></tr>`).join('')}</table></div>
    <div class="footer"><strong>HESA GIFT ARENA POS System</strong> · End of Day Report · ${today}<br/>This document is confidential. For internal use only.</div>
    </body></html>`;
  };

  const handlePrintEOD = async () => {
    try { setGeneratingEOD(true); await Print.printAsync({ html: buildEODHTML() }); }
    catch { showAlert('Print Error', 'Could not print report.'); }
    finally { setGeneratingEOD(false); }
  };

  const handleShareEOD = async () => {
    try {
      setGeneratingEOD(true);
      const { uri } = await Print.printToFileAsync({ html: buildEODHTML() });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `EOD Report - ${new Date().toLocaleDateString('en-UG')}` });
    } catch { showAlert('Share Error', 'Could not generate the report.'); }
    finally { setGeneratingEOD(false); }
  };

  const renderCharts = () => (
    <View style={styles.chartCard}>
      <View style={styles.chartCardHeader}>
        <Text style={styles.sectionTitle}>Revenue Analytics</Text>
        <View style={styles.chartTabRow}>
          {([
            { key: 'bar', icon: 'bar-chart', label: 'Bar' },
            { key: 'line', icon: 'show-chart', label: 'Trend' },
            { key: 'pie', icon: 'pie-chart', label: 'Split' },
          ] as { key: 'bar' | 'line' | 'pie'; icon: string; label: string }[]).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.chartTabBtn, activeChartTab === t.key && styles.chartTabBtnActive]}
              onPress={() => setActiveChartTab(t.key)}
            >
              <MaterialIcons name={t.icon as any} size={14} color={activeChartTab === t.key ? Colors.navy : Colors.textMuted} />
              <Text style={[styles.chartTabText, activeChartTab === t.key && { color: Colors.navy, fontWeight: Typography.bold }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeChartTab === 'bar' && (
        <View>
          <Text style={styles.chartSubtitle}>Weekly Revenue (millions UGX)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={barChartData}
              width={Math.max(CHART_W, weekDays.length * 60)}
              height={200}
              chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(56,182,255,${opacity})`, barPercentage: 0.65 }}
              style={styles.chartStyle}
              yAxisLabel=""
              yAxisSuffix="M"
              showValuesOnTopOfBars
              withCustomBarColorFromData={false}
              flatColor
            />
          </ScrollView>
        </View>
      )}

      {activeChartTab === 'line' && (
        <View>
          <Text style={styles.chartSubtitle}>7-Day Revenue Trend (millions UGX)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={lineChartData}
              width={Math.max(CHART_W, weekDays.length * 60)}
              height={200}
              chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(212,175,55,${opacity})` }}
              style={styles.chartStyle}
              bezier
              yAxisLabel=""
              yAxisSuffix="M"
            />
          </ScrollView>
        </View>
      )}

      {activeChartTab === 'pie' && (
        <View>
          <Text style={styles.chartSubtitle}>Payment Method Distribution</Text>
          <View style={styles.pieWrap}>
            <PieChart
              data={PAYMENT_PIE_DATA}
              width={CHART_W}
              height={180}
              chartConfig={CHART_CONFIG}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="10"
              absolute={false}
              hasLegend={true}
            />
          </View>
        </View>
      )}
    </View>
  );

  const renderTopProductsChart = () => (
    <View style={styles.chartCard}>
      <Text style={styles.sectionTitle}>Top 5 Products — Units Sold</Text>
      <Text style={styles.chartSubtitle}>Units sold this period</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          data={topProductsBarData}
          width={Math.max(CHART_W, 5 * 90)}
          height={190}
          chartConfig={{ ...CHART_CONFIG, color: (opacity = 1) => `rgba(212,175,55,${opacity})`, barPercentage: 0.55 }}
          style={styles.chartStyle}
          yAxisLabel=""
          yAxisSuffix=" u"
          showValuesOnTopOfBars
          verticalLabelRotation={15}
          withCustomBarColorFromData={false}
          flatColor
        />
      </ScrollView>
    </View>
  );

  const renderDesktopLayout = () => (
    <View style={styles.desktopGrid}>
      {/* Left column */}
      <View style={styles.desktopCol}>
        {renderCharts()}
        {/* Payment table */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Payment Breakdown</Text>
          {paymentBreakdown.map(pm => (
            <View key={pm.method} style={styles.pmRow}>
              <View style={styles.pmLeft}><View style={[styles.pmDot, { backgroundColor: pm.color }]} /><Text style={styles.pmLabel}>{pm.method}</Text></View>
              <View style={styles.pmBarWrap}><View style={[styles.pmBarFill, { width: `${pm.pct}%` as any, backgroundColor: pm.color + '60' }]} /></View>
              <View style={styles.pmRight}><Text style={[styles.pmPct, { color: pm.color }]}>{pm.pct}%</Text><Text style={styles.pmAmt}>{formatUGX(pm.amount)}</Text></View>
            </View>
          ))}
        </View>
      </View>
      {/* Right column */}
      <View style={styles.desktopCol}>
        {renderTopProductsChart()}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top Products</Text>
          {DASHBOARD_STATS.topProducts.map((p, i) => (
            <View key={i} style={styles.topRow}>
              <View style={[styles.topRank, { backgroundColor: i === 0 ? Colors.gold : i === 1 ? '#A8A8A8' : i === 2 ? '#CD7F32' : Colors.navyLight }]}>
                <Text style={[styles.topRankText, { color: i < 3 ? Colors.navy : Colors.textMuted }]}>#{i + 1}</Text>
              </View>
              <View style={styles.topInfo}><Text style={styles.topName} numberOfLines={1}>{p.name}</Text><Text style={styles.topSold}>{p.sold} units</Text></View>
              <Text style={styles.topRevenue}>{formatUGX(p.revenue)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Cashier Performance</Text>
          {CASHIER_STATS.map((c, i) => (
            <View key={i} style={styles.cashierRow}>
              <View style={styles.cashierAvatar}><Text style={styles.cashierAvatarText}>{c.name.split(' ').map(n => n[0]).join('')}</Text></View>
              <View style={styles.cashierInfo}><Text style={styles.cashierName}>{c.name}</Text><Text style={styles.cashierRole}>{c.role}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={styles.cashierRevenue}>{formatUGX(c.revenue)}</Text><Text style={styles.cashierSales}>{c.sales} sales</Text></View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Reports & Analytics</Text>
          <Text style={styles.headerSub}>Business performance · {currentBranch.name}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.branchFilterBtn, { borderColor: currentBranch.color + '60', backgroundColor: currentBranch.color + '15' }]}
            onPress={() => setShowBranchFilter(!showBranchFilter)}
          >
            <View style={[styles.branchFilterDot, { backgroundColor: currentBranch.color }]} />
            <Text style={[styles.branchFilterText, { color: currentBranch.color }]}>{currentBranch.shortName}</Text>
            <MaterialIcons name={showBranchFilter ? 'arrow-drop-up' : 'arrow-drop-down'} size={16} color={currentBranch.color} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.eodBtn} onPress={() => setShowEODModal(true)}>
            <MaterialIcons name="summarize" size={15} color={Colors.gold} />
            <Text style={styles.eodBtnText}>Close Day</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showBranchFilter && (
        <View style={styles.branchDropdown}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {branches.map(branch => {
              const isActive = currentBranch.id === branch.id;
              return (
                <TouchableOpacity key={branch.id} style={[styles.branchDropdownChip, isActive && { backgroundColor: branch.color + '20', borderColor: branch.color }]} onPress={() => { setBranch(branch); setShowBranchFilter(false); }}>
                  <View style={[styles.branchDropdownDot, { backgroundColor: branch.color }]} />
                  <Text style={[styles.branchDropdownChipText, isActive && { color: branch.color, fontWeight: Typography.bold }]}>{branch.name}</Text>
                  {isActive && <MaterialIcons name="check" size={12} color={branch.color} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, isDesktop && { maxWidth: 1200, alignSelf: 'center', width: '100%' }]}>
        {/* Period Toggle */}
        <View style={styles.periodToggle}>
          {([{ key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }] as { key: Period; label: string }[]).map(p => (
            <TouchableOpacity key={p.key} style={[styles.periodBtn, period === p.key && styles.periodBtnActive]} onPress={() => setPeriod(p.key)}>
              <Text style={[styles.periodBtnText, period === p.key && styles.periodBtnTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI Cards */}
        <View style={styles.kpiRow}>
          {[
            { label: 'Total Revenue', value: formatUGX(stats.revenue), icon: 'attach-money', color: Colors.gold, bg: Colors.goldMuted },
            { label: 'Transactions', value: String(stats.transactions), icon: 'receipt-long', color: Colors.skyBlue, bg: Colors.skyBlueMuted },
            { label: 'Avg Order Value', value: formatUGX(stats.avg), icon: 'trending-up', color: Colors.success, bg: Colors.successMuted },
          ].map(k => (
            <View key={k.label} style={[styles.kpiCard, { borderColor: k.color + '30' }]}>
              <View style={[styles.kpiIcon, { backgroundColor: k.bg }]}><MaterialIcons name={k.icon as any} size={20} color={k.color} /></View>
              <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Desktop: 2-column layout, Mobile: single column */}
        {isDesktop ? renderDesktopLayout() : (
          <>
            {renderCharts()}
            {renderTopProductsChart()}

            {/* Payment breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Payment Breakdown</Text>
              {paymentBreakdown.map(pm => (
                <View key={pm.method} style={styles.pmRow}>
                  <View style={styles.pmLeft}><View style={[styles.pmDot, { backgroundColor: pm.color }]} /><Text style={styles.pmLabel}>{pm.method}</Text></View>
                  <View style={styles.pmBarWrap}><View style={[styles.pmBarFill, { width: `${pm.pct}%` as any, backgroundColor: pm.color + '60' }]} /></View>
                  <View style={styles.pmRight}><Text style={[styles.pmPct, { color: pm.color }]}>{pm.pct}%</Text><Text style={styles.pmAmt}>{formatUGX(pm.amount)}</Text></View>
                </View>
              ))}
            </View>

            {/* Top Products */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Top Selling Products</Text>
              {DASHBOARD_STATS.topProducts.map((p, i) => (
                <View key={i} style={styles.topRow}>
                  <View style={[styles.topRank, { backgroundColor: i === 0 ? Colors.gold : i === 1 ? '#A8A8A8' : i === 2 ? '#CD7F32' : Colors.navyLight }]}>
                    <Text style={[styles.topRankText, { color: i < 3 ? Colors.navy : Colors.textMuted }]}>#{i + 1}</Text>
                  </View>
                  <View style={styles.topInfo}><Text style={styles.topName} numberOfLines={1}>{p.name}</Text><Text style={styles.topSold}>{p.sold} units sold</Text></View>
                  <Text style={styles.topRevenue}>{formatUGX(p.revenue)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Recent Transactions */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {sales.slice(0, isDesktop ? 15 : 10).map(sale => {
            const isRefunded = sale.status === 'refunded';
            const isCompleted = sale.status === 'completed';
            return (
              <View key={sale.id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: isRefunded ? Colors.dangerMuted : sale.paymentMethod === 'Cash' ? Colors.successMuted : sale.paymentMethod === 'Split' ? Colors.goldMuted : Colors.skyBlueMuted }]}>
                  <MaterialIcons name={isRefunded ? 'undo' : sale.paymentMethod === 'Cash' ? 'payments' : sale.paymentMethod === 'Card' ? 'credit-card' : sale.paymentMethod === 'Split' ? 'call-split' : 'phone-android'} size={16} color={isRefunded ? Colors.danger : sale.paymentMethod === 'Cash' ? Colors.success : sale.paymentMethod === 'MTN MoMo' ? '#FFCC00' : sale.paymentMethod === 'Split' ? Colors.gold : Colors.skyBlue} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txReceipt}>{sale.receiptNo}</Text>
                  <Text style={styles.txCustomer}>{sale.customerName || 'Walk-in'} · {sale.cashier}</Text>
                  <Text style={styles.txTime}>{new Date(sale.timestamp).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.txAmount}>{formatUGX(sale.total)}</Text>
                  <View style={[styles.txStatus, { backgroundColor: isRefunded ? Colors.dangerMuted : Colors.successMuted }]}>
                    <Text style={[styles.txStatusText, { color: isRefunded ? Colors.danger : Colors.success }]}>{sale.status}</Text>
                  </View>
                  {isCompleted && (
                    <TouchableOpacity style={styles.refundBtn} onPress={() => openRefundModal(sale)}>
                      <MaterialIcons name="undo" size={11} color={Colors.warning} />
                      <Text style={styles.refundBtnText}>Refund</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {!isDesktop && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Cashier Performance</Text>
            {CASHIER_STATS.map((c, i) => (
              <View key={i} style={styles.cashierRow}>
                <View style={styles.cashierAvatar}><Text style={styles.cashierAvatarText}>{c.name.split(' ').map(n => n[0]).join('')}</Text></View>
                <View style={styles.cashierInfo}><Text style={styles.cashierName}>{c.name}</Text><Text style={styles.cashierRole}>{c.role}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.cashierRevenue}>{formatUGX(c.revenue)}</Text><Text style={styles.cashierSales}>{c.sales} sales</Text></View>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.eodBanner} onPress={() => setShowEODModal(true)}>
          <View style={styles.eodBannerLeft}><MaterialIcons name="summarize" size={24} color={Colors.gold} /><View><Text style={styles.eodBannerTitle}>End-of-Day Report</Text><Text style={styles.eodBannerSub}>Generate, print or share today's closing summary</Text></View></View>
          <MaterialIcons name="chevron-right" size={22} color={Colors.gold} />
        </TouchableOpacity>
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* REFUND MODAL */}
      <Modal visible={showRefundModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.refundModal}>
            <View style={styles.refundHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="undo" size={20} color={Colors.warning} />
                <Text style={[styles.modalTitle, { color: Colors.warning }]}>Process Refund</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRefundModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            {refundSale && (
              <ScrollView contentContainerStyle={styles.refundBody} showsVerticalScrollIndicator={false}>
                <View style={styles.refundSaleInfo}>
                  <Text style={styles.refundReceiptNo}>{refundSale.receiptNo}</Text>
                  <Text style={styles.refundMeta}>{new Date(refundSale.timestamp).toLocaleString('en-UG')} · {refundSale.cashier}</Text>
                </View>
                <Text style={styles.refundSectionLabel}>Items to Refund</Text>
                {refundSale.items.map(item => (
                  <View key={item.productId} style={styles.refundItemRow}>
                    <View style={styles.refundItemInfo}><Text style={styles.refundItemName} numberOfLines={1}>{item.name}</Text><Text style={styles.refundItemMeta}>{formatUGX(item.price)} × {item.qty}</Text></View>
                    <View style={styles.refundQtyControl}>
                      <TouchableOpacity style={styles.refundQtyBtn} onPress={() => setRefundItems(prev => ({ ...prev, [item.productId]: Math.max(0, (prev[item.productId] || 0) - 1) }))}><MaterialIcons name="remove" size={14} color={Colors.danger} /></TouchableOpacity>
                      <Text style={styles.refundQtyText}>{refundItems[item.productId] || 0}</Text>
                      <TouchableOpacity style={styles.refundQtyBtn} onPress={() => setRefundItems(prev => ({ ...prev, [item.productId]: Math.min(item.qty, (prev[item.productId] || 0) + 1) }))}><MaterialIcons name="add" size={14} color={Colors.success} /></TouchableOpacity>
                    </View>
                    <Text style={styles.refundItemTotal}>{formatUGX(item.price * (refundItems[item.productId] || 0))}</Text>
                  </View>
                ))}
                <View style={styles.refundTotalRow}><Text style={styles.refundTotalLabel}>Refund Total</Text><Text style={styles.refundTotalValue}>{formatUGX(refundTotal)}</Text></View>
                <Text style={styles.refundSectionLabel}>Refund Method</Text>
                <View style={styles.refundMethodRow}>
                  {REFUND_METHODS.map(m => (
                    <TouchableOpacity key={m.key} style={[styles.refundMethodChip, refundMethod === m.key && { backgroundColor: m.color + '20', borderColor: m.color }]} onPress={() => setRefundMethod(m.key)}>
                      <Text style={[styles.refundMethodChipText, refundMethod === m.key && { color: m.color, fontWeight: Typography.bold }]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.refundSectionLabel}>Reason *</Text>
                <TextInput style={[styles.refundInput, { height: 72, textAlignVertical: 'top' }]} placeholder="Reason for this refund..." placeholderTextColor={Colors.textMuted} value={refundReason} onChangeText={setRefundReason} multiline />
                <View style={styles.refundWarning}><MaterialIcons name="info" size={14} color={Colors.warning} /><Text style={styles.refundWarningText}>Stock will be automatically restored for refunded items.</Text></View>
              </ScrollView>
            )}
            <View style={styles.refundFooter}>
              <TouchableOpacity style={styles.refundCancelBtn} onPress={() => setShowRefundModal(false)}><Text style={styles.refundCancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.refundConfirmBtn, (processingRefund || refundTotal === 0) && { opacity: 0.6 }]} onPress={handleProcessRefund} disabled={processingRefund || refundTotal === 0}>
                {processingRefund ? <ActivityIndicator color={Colors.textPrimary} size="small" /> : <><MaterialIcons name="undo" size={16} color={Colors.textPrimary} /><Text style={styles.refundConfirmBtnText}>Process {formatUGX(refundTotal)}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* EOD MODAL */}
      <Modal visible={showEODModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.eodModal}>
            <View style={styles.eodModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><MaterialIcons name="summarize" size={22} color={Colors.gold} /><Text style={styles.eodModalTitle}>End-of-Day Report</Text></View>
              <TouchableOpacity onPress={() => setShowEODModal(false)}><MaterialIcons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.eodModalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.eodKpiGrid}>
                {[
                  { label: 'Total Revenue', value: formatUGX(DASHBOARD_STATS.today.revenue), color: Colors.gold },
                  { label: 'Transactions', value: String(DASHBOARD_STATS.today.transactions), color: Colors.skyBlue },
                  { label: 'Avg Order', value: formatUGX(DASHBOARD_STATS.today.avgOrderValue), color: Colors.success },
                  { label: 'New Customers', value: String(DASHBOARD_STATS.today.newCustomers), color: '#9B59B6' },
                ].map(k => (
                  <View key={k.label} style={styles.eodKpiCard}><Text style={[styles.eodKpiValue, { color: k.color }]}>{k.value}</Text><Text style={styles.eodKpiLabel}>{k.label}</Text></View>
                ))}
              </View>
              <Text style={styles.eodSectionLabel}>Top 3 Products</Text>
              {DASHBOARD_STATS.topProducts.slice(0, 3).map((p, i) => (
                <View key={i} style={styles.eodProductRow}>
                  <View style={[styles.eodRankBadge, { backgroundColor: i === 0 ? Colors.gold : i === 1 ? '#A8A8A8' : '#CD7F32' }]}><Text style={styles.eodRankText}>#{i + 1}</Text></View>
                  <Text style={styles.eodProductName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.eodProductRev}>{formatUGX(p.revenue)}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.eodActions}>
              <TouchableOpacity style={[styles.eodActionBtn, { backgroundColor: Colors.skyBlueMuted, borderColor: Colors.skyBlue + '40' }]} onPress={handlePrintEOD} disabled={generatingEOD}>
                <MaterialIcons name="print" size={18} color={Colors.skyBlue} />
                <Text style={[styles.eodActionText, { color: Colors.skyBlue }]}>Print</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.eodActionBtn, { backgroundColor: Colors.gold, borderColor: Colors.gold }]} onPress={handleShareEOD} disabled={generatingEOD}>
                <MaterialIcons name="share" size={18} color={Colors.navy} />
                <Text style={[styles.eodActionText, { color: Colors.navy }]}>Share PDF</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderGold },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  eodBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.goldMuted, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderGold },
  eodBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  branchFilterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 8, borderRadius: BorderRadius.md, borderWidth: 1 },
  branchFilterDot: { width: 7, height: 7, borderRadius: 3.5 },
  branchFilterText: { fontSize: Typography.sm, fontWeight: Typography.semibold },
  branchDropdown: { backgroundColor: Colors.navyCard, borderBottomWidth: 1, borderBottomColor: Colors.borderGold, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  branchDropdownChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.circle, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.navyLight },
  branchDropdownDot: { width: 8, height: 8, borderRadius: 4 },
  branchDropdownChipText: { fontSize: Typography.xs, color: Colors.textSecondary },
  scroll: { padding: Spacing.base, gap: Spacing.md },
  // Desktop
  desktopGrid: { flexDirection: 'row', gap: 16 },
  desktopCol: { flex: 1, gap: 16 },
  periodToggle: { flexDirection: 'row', backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, padding: 4, borderWidth: 1, borderColor: Colors.border },
  periodBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: BorderRadius.md },
  periodBtnActive: { backgroundColor: Colors.gold },
  periodBtnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  periodBtnTextActive: { color: Colors.navy, fontWeight: Typography.bold },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 6, borderWidth: 1, alignItems: 'center', ...Shadows.sm },
  kpiIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 13, fontWeight: Typography.extrabold, textAlign: 'center' },
  kpiLabel: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  // Charts
  chartCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.base, gap: Spacing.sm, ...Shadows.sm },
  chartCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chartTabRow: { flexDirection: 'row', backgroundColor: Colors.navyLight, borderRadius: BorderRadius.md, padding: 3, gap: 3 },
  chartTabBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.sm },
  chartTabBtnActive: { backgroundColor: Colors.gold },
  chartTabText: { fontSize: 11, color: Colors.textMuted },
  chartSubtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: 4 },
  chartStyle: { borderRadius: 12, marginTop: 4 },
  pieWrap: { alignItems: 'center' },
  sectionCard: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadows.sm },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary, paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pmLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 110 },
  pmDot: { width: 8, height: 8, borderRadius: 4 },
  pmLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  pmBarWrap: { flex: 1, height: 8, backgroundColor: Colors.navyLight, borderRadius: 4, overflow: 'hidden' },
  pmBarFill: { height: '100%', borderRadius: 4 },
  pmRight: { width: 90, alignItems: 'flex-end' },
  pmPct: { fontSize: Typography.sm, fontWeight: Typography.bold },
  pmAmt: { fontSize: 10, color: Colors.textMuted },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  topRank: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  topRankText: { fontSize: 11, fontWeight: Typography.extrabold },
  topInfo: { flex: 1 },
  topName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  topSold: { fontSize: Typography.xs, color: Colors.textMuted },
  topRevenue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txReceipt: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textPrimary },
  txCustomer: { fontSize: 11, color: Colors.textMuted },
  txTime: { fontSize: 10, color: Colors.textMuted },
  txAmount: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  txStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  txStatusText: { fontSize: 10, fontWeight: Typography.semibold, textTransform: 'capitalize' },
  refundBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningMuted, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: Colors.warning + '30' },
  refundBtnText: { fontSize: 10, color: Colors.warning, fontWeight: Typography.bold },
  cashierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.base, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  cashierAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.goldMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.borderGold },
  cashierAvatarText: { fontSize: 13, fontWeight: Typography.extrabold, color: Colors.gold },
  cashierInfo: { flex: 1 },
  cashierName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cashierRole: { fontSize: Typography.xs, color: Colors.textMuted },
  cashierRevenue: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  cashierSales: { fontSize: Typography.xs, color: Colors.textMuted },
  eodBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.navyCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.borderGold, padding: Spacing.base, ...Shadows.gold },
  eodBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  eodBannerTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gold },
  eodBannerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  refundModal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '88%', borderTopWidth: 2, borderColor: Colors.warning + '60' },
  refundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  refundBody: { padding: Spacing.xl, gap: Spacing.md },
  refundSaleInfo: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, gap: 3, borderWidth: 1, borderColor: Colors.border },
  refundReceiptNo: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.skyBlue },
  refundMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  refundSectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  refundItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  refundItemInfo: { flex: 1 },
  refundItemName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  refundItemMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  refundQtyControl: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.navyCard, borderRadius: BorderRadius.sm, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  refundQtyBtn: { padding: 2 },
  refundQtyText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, minWidth: 20, textAlign: 'center' },
  refundItemTotal: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold, minWidth: 80, textAlign: 'right' },
  refundTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 2, borderTopColor: Colors.warning + '40', marginTop: 4 },
  refundTotalLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  refundTotalValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.warning },
  refundMethodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  refundMethodChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.navyCard, borderWidth: 1, borderColor: Colors.border },
  refundMethodChipText: { fontSize: 12, color: Colors.textMuted },
  refundInput: { backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: Typography.base, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  refundWarning: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warningMuted, borderRadius: BorderRadius.sm, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '30' },
  refundWarningText: { flex: 1, fontSize: Typography.xs, color: Colors.warning },
  refundFooter: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  refundCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  refundCancelBtnText: { color: Colors.textMuted, fontWeight: Typography.semibold },
  refundConfirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, backgroundColor: Colors.warning },
  refundConfirmBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  eodModal: { backgroundColor: Colors.navyMid, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, maxHeight: '90%', borderTopWidth: 2, borderColor: Colors.borderGold },
  eodModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  eodModalTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.gold },
  eodModalBody: { padding: Spacing.xl, gap: Spacing.md },
  eodSectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  eodKpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  eodKpiCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.navyCard, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 4 },
  eodKpiValue: { fontSize: Typography.lg, fontWeight: Typography.extrabold },
  eodKpiLabel: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  eodProductRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  eodRankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  eodRankText: { fontSize: 11, fontWeight: Typography.extrabold, color: Colors.navy },
  eodProductName: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary },
  eodProductRev: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  eodActions: { flexDirection: 'row', gap: 12, padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Colors.divider },
  eodActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.md, borderWidth: 1 },
  eodActionText: { fontSize: Typography.base, fontWeight: Typography.bold },
});
