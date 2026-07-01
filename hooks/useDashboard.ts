import { useState, useEffect, useCallback } from 'react';
import { fetchLiveDashboardStats, LiveDashboardStats } from '@/services/dashboardService';
import { DASHBOARD_STATS } from '@/constants/mockData';

// Fallback static stats from mock data
const FALLBACK: LiveDashboardStats = {
  today: {
    revenue: DASHBOARD_STATS.today.revenue,
    transactions: DASHBOARD_STATS.today.transactions,
    newCustomers: DASHBOARD_STATS.today.newCustomers,
    avgOrderValue: DASHBOARD_STATS.today.avgOrderValue,
  },
  yesterday: {
    revenue: DASHBOARD_STATS.yesterday.revenue,
    transactions: DASHBOARD_STATS.yesterday.transactions,
  },
  thisWeek: {
    revenue: DASHBOARD_STATS.thisWeek.revenue,
    transactions: DASHBOARD_STATS.thisWeek.transactions,
  },
  thisMonth: {
    revenue: DASHBOARD_STATS.thisMonth.revenue,
    transactions: DASHBOARD_STATS.thisMonth.transactions,
  },
  weeklyRevenue: DASHBOARD_STATS.weeklyRevenue,
  lowStockCount: 0,
  topProducts: DASHBOARD_STATS.topProducts,
};

export function useDashboard() {
  const [stats, setStats] = useState<LiveDashboardStats>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const live = await fetchLiveDashboardStats();
      // Merge: use live numbers where available, fallback for zeros in fresh DB
      setStats(prev => ({
        today: {
          revenue: live.today.revenue > 0 ? live.today.revenue : (prev.today.revenue || FALLBACK.today.revenue),
          transactions: live.today.transactions > 0 ? live.today.transactions : (prev.today.transactions || FALLBACK.today.transactions),
          newCustomers: live.today.newCustomers,
          avgOrderValue: live.today.avgOrderValue > 0 ? live.today.avgOrderValue : FALLBACK.today.avgOrderValue,
        },
        yesterday: live.yesterday.revenue > 0 ? live.yesterday : FALLBACK.yesterday,
        thisWeek: live.thisWeek.revenue > 0 ? live.thisWeek : FALLBACK.thisWeek,
        thisMonth: live.thisMonth.revenue > 0 ? live.thisMonth : FALLBACK.thisMonth,
        weeklyRevenue: live.weeklyRevenue.some(v => v > 0) ? live.weeklyRevenue : FALLBACK.weeklyRevenue,
        lowStockCount: live.lowStockCount,
        topProducts: live.topProducts.length > 0 ? live.topProducts : FALLBACK.topProducts,
      }));
      setLastRefreshed(new Date());
    } catch {
      // Keep current stats on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Auto-refresh every 90 seconds
    const interval = setInterval(refresh, 90000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { stats, loading, lastRefreshed, refresh };
}
