// services/offlineQueueSqlite.ts
// Lightweight persistent queue backed by Expo SQLite for offline-first operations.

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'hesa_pos.db';
const db = SQLite.openDatabase(DB_NAME);

export function initQueue() {
  db.transaction(tx => {
    tx.executeSql(`CREATE TABLE IF NOT EXISTS offline_queue (id TEXT PRIMARY KEY, created_at INTEGER, topic TEXT, payload TEXT, processed INTEGER DEFAULT 0);`);
  });
}

export function enqueue(item: { id: string; topic: string; payload: any }) {
  const now = Date.now();
  db.transaction(tx => {
    tx.executeSql(`INSERT OR REPLACE INTO offline_queue (id, created_at, topic, payload, processed) VALUES (?, ?, ?, ?, 0);`, [item.id, now, item.topic, JSON.stringify(item.payload)]);
  });
}

export function listPending(callback: (rows: any[]) => void) {
  db.transaction(tx => {
    tx.executeSql(`SELECT id, created_at, topic, payload FROM offline_queue WHERE processed = 0 ORDER BY created_at ASC;`, [], (_, result) => {
      const items = [] as any[];
      for (let i = 0; i < result.rows.length; i++) items.push(result.rows.item(i));
      callback(items);
    });
  });
}

export function markProcessed(id: string) {
  db.transaction(tx => {
    tx.executeSql(`UPDATE offline_queue SET processed = 1 WHERE id = ?;`, [id]);
  });
}

export default { initQueue, enqueue, listPending, markProcessed };
