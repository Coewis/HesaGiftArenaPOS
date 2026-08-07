// hooks/useStockMovements.ts
// Hook to fetch and subscribe to stock movements with pagination

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/template';
import type { SupabaseRealtimePayload } from '@supabase/supabase-js';

export default function useStockMovements({ pageSize = 50 } = {}) {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const subRef = useRef<any>(null);

  const loadPage = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const from = p * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase.from('stock_movements').select('id,product_id,source_type,source_id,change,qty_before,qty_after,created_by,created_at').order('created_at', { ascending: false }).range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) setHasMore(false);
      if (p === 0) setItems(data || []);
      else setItems(prev => [...prev, ...(data || [])]);
      setPage(p);
    } catch (err) {
      console.warn('loadPage error', err);
    } finally { setLoading(false); }
  }, [supabase, pageSize]);

  useEffect(() => { loadPage(0); }, [loadPage]);

  useEffect(() => {
    // Real-time subscription for new stock_movements
    subRef.current = supabase.channel('public:stock_movements').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_movements' }, (payload: SupabaseRealtimePayload<any>) => {
      const newRow = payload.new;
      setItems(prev => [newRow, ...prev]);
    }).subscribe();
    return () => { try { subRef.current && supabase.removeChannel(subRef.current); } catch {} };
  }, [supabase]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    loadPage(page + 1);
  }, [hasMore, loading, loadPage, page]);

  return { items, loading, loadMore, hasMore, reload: () => loadPage(0) };
}
