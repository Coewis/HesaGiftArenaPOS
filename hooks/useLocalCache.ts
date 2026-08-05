// hooks/useLocalCache.ts
// Simple hook to initialize a local SQLite cache for products (fast search & offline)

import { useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'hesa_pos.db';
const db = SQLite.openDatabase(DB_NAME);

export function initProductCache() {
  db.transaction(tx => {
    tx.executeSql(`CREATE TABLE IF NOT EXISTS products_cache (id TEXT PRIMARY KEY, sku TEXT, name TEXT, price REAL, quantity INTEGER, payload TEXT);`);
  });
}

export function upsertProducts(items: any[]) {
  db.transaction(tx => {
    for (const it of items) {
      tx.executeSql(`INSERT OR REPLACE INTO products_cache (id, sku, name, price, quantity, payload) VALUES (?, ?, ?, ?, ?, ?);`, [it.id, it.sku, it.name, it.price, it.quantity, JSON.stringify(it)]);
    }
  });
}

export function searchProducts(term: string, callback: (rows: any[]) => void) {
  const q = `%${term}%`;
  db.transaction(tx => {
    tx.executeSql(`SELECT id, sku, name, price, quantity, payload FROM products_cache WHERE name ILIKE ? OR sku ILIKE ? LIMIT 50;`, [q, q], (_, result) => {
      const items = [] as any[];
      for (let i = 0; i < result.rows.length; i++) items.push(result.rows.item(i));
      callback(items);
    });
  });
}

export default function useLocalCache() {
  useEffect(() => initProductCache(), []);
  return { initProductCache, upsertProducts, searchProducts };
}
