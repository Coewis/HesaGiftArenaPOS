// Offline Queue Service - AsyncStorage-backed pending operations sync
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/template';

export interface QueuedOperation {
  id: string;
  operation: 'insert' | 'update' | 'upsert';
  tableName: string;
  payload: any;
  createdAt: string;
  retries: number;
}

const QUEUE_KEY = 'hga_offline_queue';
const MAX_RETRIES = 3;

export const loadQueue = async (): Promise<QueuedOperation[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

export const saveQueue = async (queue: QueuedOperation[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
};

export const enqueue = async (op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retries'>): Promise<void> => {
  const queue = await loadQueue();
  queue.push({ ...op, id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString(), retries: 0 });
  await saveQueue(queue);
};

export const flushQueue = async (): Promise<{ synced: number; failed: number }> => {
  const queue = await loadQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const db = getSupabaseClient();
  let synced = 0;
  let failed = 0;
  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      let err: any = null;
      if (op.operation === 'insert') {
        const r = await db.from(op.tableName).insert(op.payload);
        err = r.error;
      } else if (op.operation === 'upsert') {
        const r = await db.from(op.tableName).upsert(op.payload);
        err = r.error;
      } else if (op.operation === 'update') {
        const { id, ...rest } = op.payload;
        const r = await db.from(op.tableName).update(rest).eq('id', id);
        err = r.error;
      }

      if (err) {
        if (op.retries < MAX_RETRIES) {
          remaining.push({ ...op, retries: op.retries + 1 });
        }
        failed++;
      } else {
        synced++;
      }
    } catch {
      if (op.retries < MAX_RETRIES) remaining.push({ ...op, retries: op.retries + 1 });
      failed++;
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
};

export const getQueueSize = async (): Promise<number> => {
  const queue = await loadQueue();
  return queue.length;
};

export const clearQueue = async (): Promise<void> => {
  await AsyncStorage.removeItem(QUEUE_KEY);
};

// Cache recently viewed/used data
const CACHE_PRODUCTS_KEY = 'hga_cache_products';
const CACHE_CUSTOMERS_KEY = 'hga_cache_customers';
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours

export const cacheProducts = async (products: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(CACHE_PRODUCTS_KEY, JSON.stringify({ data: products, ts: Date.now() }));
  } catch {}
};

export const getCachedProducts = async (): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PRODUCTS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

export const cacheCustomers = async (customers: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(CACHE_CUSTOMERS_KEY, JSON.stringify({ data: customers, ts: Date.now() }));
  } catch {}
};

export const getCachedCustomers = async (): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_CUSTOMERS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};
