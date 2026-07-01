// HESA GIFT ARENA - Live Dashboard Data Service
import { getSupabaseClient } from '@/template';

export interface LiveDashboardStats {
  today: {
    revenue: number;
    transactions: number;
    newCustomers: number;
    avgOrderValue: number;
  };
  yesterday: {
    revenue: number;
    transactions: number;
  };
  thisWeek: {
    revenue: number;
    transactions: number;
  };
  thisMonth: {
    revenue: number;
    transactions: number;
  };
  weeklyRevenue: number[];
  lowStockCount: number;
  topProducts: { name: string; sold: number; revenue: number }[];
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function yesterdayRange() {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function weekRange() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function dayRangeFor(daysAgo: number) {
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function fetchLiveDashboardStats(): Promise<LiveDashboardStats> {
  const db = getSupabaseClient();
  const todayR = todayRange();
  const yestR = yesterdayRange();
  const weekR = weekRange();
  const monthR = monthRange();

  const [
    todaySalesRes,
    yestSalesRes,
    weekSalesRes,
    monthSalesRes,
    todayCustomersRes,
    lowStockRes,
    saleItemsRes,
  ] = await Promise.allSettled([
    // Today's sales
    db.from('pos_sales')
      .select('total, created_at')
      .gte('timestamp', todayR.start)
      .lte('timestamp', todayR.end)
      .eq('status', 'completed'),

    // Yesterday's sales
    db.from('pos_sales')
      .select('total')
      .gte('timestamp', yestR.start)
      .lte('timestamp', yestR.end)
      .eq('status', 'completed'),

    // This week's sales
    db.from('pos_sales')
      .select('total, timestamp')
      .gte('timestamp', weekR.start)
      .lte('timestamp', weekR.end)
      .eq('status', 'completed'),

    // This month's sales
    db.from('pos_sales')
      .select('total')
      .gte('timestamp', monthR.start)
      .lte('timestamp', monthR.end)
      .eq('status', 'completed'),

    // New customers today
    db.from('pos_customers')
      .select('id')
      .gte('created_at', todayR.start)
      .lte('created_at', todayR.end),

    // Low stock products
    db.from('pos_products')
      .select('id, stock, min_stock')
      .eq('status', 'active')
      .filter('stock', 'lte', 'min_stock'),

    // Sale items for top products (this week)
    db.from('pos_sale_items')
      .select('name, qty, total, sale_id'),
  ]);

  // Today stats
  const todaySales = todaySalesRes.status === 'fulfilled' ? (todaySalesRes.value.data || []) : [];
  const todayRevenue = todaySales.reduce((s: number, r: any) => s + Number(r.total), 0);
  const todayTx = todaySales.length;
  const todayAvg = todayTx > 0 ? Math.round(todayRevenue / todayTx) : 0;

  // Yesterday stats
  const yestSales = yestSalesRes.status === 'fulfilled' ? (yestSalesRes.value.data || []) : [];
  const yestRevenue = yestSales.reduce((s: number, r: any) => s + Number(r.total), 0);
  const yestTx = yestSales.length;

  // New customers
  const newCustomers = todayCustomersRes.status === 'fulfilled'
    ? (todayCustomersRes.value.data || []).length : 0;

  // Week revenue total
  const weekSales = weekSalesRes.status === 'fulfilled' ? (weekSalesRes.value.data || []) : [];
  const weekRevenue = weekSales.reduce((s: number, r: any) => s + Number(r.total), 0);
  const weekTx = weekSales.length;

  // Month revenue
  const monthSales = monthSalesRes.status === 'fulfilled' ? (monthSalesRes.value.data || []) : [];
  const monthRevenue = monthSales.reduce((s: number, r: any) => s + Number(r.total), 0);
  const monthTx = monthSales.length;

  // Low stock count
  let lowStockCount = 0;
  if (lowStockRes.status === 'fulfilled') {
    const rows = lowStockRes.value.data || [];
    lowStockCount = rows.filter((r: any) => Number(r.stock) <= Number(r.min_stock)).length;
  }

  // Weekly revenue chart (last 7 days)
  const weeklyRevenue: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const range = dayRangeFor(i);
    const dayTotal = weekSales
      .filter((s: any) => s.timestamp >= range.start && s.timestamp <= range.end)
      .reduce((sum: number, s: any) => sum + Number(s.total), 0);
    weeklyRevenue.push(dayTotal);
  }

  // Top products from sale items
  const itemsData = saleItemsRes.status === 'fulfilled' ? (saleItemsRes.value.data || []) : [];
  const productMap: Record<string, { sold: number; revenue: number }> = {};
  itemsData.forEach((item: any) => {
    if (!productMap[item.name]) productMap[item.name] = { sold: 0, revenue: 0 };
    productMap[item.name].sold += Number(item.qty);
    productMap[item.name].revenue += Number(item.total);
  });
  const topProducts = Object.entries(productMap)
    .map(([name, v]) => ({ name, sold: v.sold, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    today: { revenue: todayRevenue, transactions: todayTx, newCustomers, avgOrderValue: todayAvg },
    yesterday: { revenue: yestRevenue, transactions: yestTx },
    thisWeek: { revenue: weekRevenue, transactions: weekTx },
    thisMonth: { revenue: monthRevenue, transactions: monthTx },
    weeklyRevenue: weeklyRevenue.length === 7 ? weeklyRevenue : [0, 0, 0, 0, 0, 0, 0],
    lowStockCount,
    topProducts,
  };
}
