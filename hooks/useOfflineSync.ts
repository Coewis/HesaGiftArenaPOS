// Offline Sync Hook - monitors connectivity and auto-syncs pending queue
import { useState, useEffect, useRef, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { flushQueue, getQueueSize } from '@/services/offlineQueue';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'sync_error';

interface OfflineSyncState {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncTime: string | null;
  manualSync: () => Promise<void>;
}

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const syncInProgress = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await getQueueSize();
    setPendingCount(count);
  }, []);

  const doSync = useCallback(async () => {
    if (syncInProgress.current) return;
    const count = await getQueueSize();
    if (count === 0) {
      setSyncStatus('online');
      return;
    }

    syncInProgress.current = true;
    setSyncStatus('syncing');
    try {
      const { synced, failed } = await flushQueue();
      await refreshPendingCount();
      const remaining = await getQueueSize();
      setSyncStatus(remaining > 0 ? 'sync_error' : 'online');
      setLastSyncTime(new Date().toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setSyncStatus('sync_error');
    } finally {
      syncInProgress.current = false;
    }
  }, [refreshPendingCount]);

  const manualSync = useCallback(async () => {
    if (!isOnline) return;
    await doSync();
  }, [isOnline, doSync]);

  useEffect(() => {
    refreshPendingCount();

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      if (online) {
        // Back online — auto sync after small delay
        setTimeout(() => doSync(), 2000);
        setSyncStatus('online');
      } else {
        setSyncStatus('offline');
      }
    });

    // Initial connectivity check
    NetInfo.fetch().then((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (!online) setSyncStatus('offline');
    });

    // Poll pending count every 30s
    const interval = setInterval(refreshPendingCount, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [doSync, refreshPendingCount]);

  return { isOnline, syncStatus, pendingCount, lastSyncTime, manualSync };
}
