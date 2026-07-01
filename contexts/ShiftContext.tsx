import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { Shift } from '@/types';
import { getSupabaseClient } from '@/template';

interface ShiftContextType {
  activeShift: Shift | null;
  shifts: Shift[];
  openShift: (cashierId: string, cashierName: string, branchId: string, branchName: string, floatAmount: number) => Promise<Shift>;
  closeShift: (cashCount: number, notes?: string, totalSales?: number, totalTransactions?: number) => Promise<Shift>;
  recordSaleInShift: (saleTotal: number) => void;
}

export const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const openShift = useCallback(async (
    cashierId: string, cashierName: string,
    branchId: string, branchName: string,
    floatAmount: number
  ): Promise<Shift> => {
    const shift: Shift = {
      id: `shift_${Date.now()}`,
      cashierId, cashierName, branchId, branchName,
      floatAmount, openingTime: new Date().toISOString(),
      totalSales: 0, totalTransactions: 0,
      status: 'open',
    };
    setActiveShift(shift);
    setShifts(prev => [shift, ...prev]);

    try {
      const db = getSupabaseClient();
      await db.from('pos_shifts').insert({
        id: shift.id, cashier_id: shift.cashierId, cashier_name: shift.cashierName,
        branch_id: shift.branchId, branch_name: shift.branchName,
        float_amount: shift.floatAmount, opening_time: shift.openingTime,
        total_sales: 0, total_transactions: 0, status: 'open',
      });
    } catch {}

    return shift;
  }, []);

  const closeShift = useCallback(async (
    cashCount: number, notes?: string,
    totalSales?: number, totalTransactions?: number
  ): Promise<Shift> => {
    if (!activeShift) throw new Error('No active shift');

    const finalSales = totalSales ?? activeShift.totalSales;
    const finalTx = totalTransactions ?? activeShift.totalTransactions;
    const cashSalesEstimate = finalSales * 0.38; // ~38% cash based on typical split
    const expectedCash = activeShift.floatAmount + cashSalesEstimate;
    const variance = cashCount - expectedCash;

    const closed: Shift = {
      ...activeShift,
      closingTime: new Date().toISOString(),
      cashCount, expectedCash, variance,
      totalSales: finalSales,
      totalTransactions: finalTx,
      status: 'closed', notes,
    };

    setActiveShift(null);
    setShifts(prev => prev.map(s => s.id === activeShift.id ? closed : s));

    try {
      const db = getSupabaseClient();
      await db.from('pos_shifts').update({
        closing_time: closed.closingTime,
        cash_count: cashCount,
        expected_cash: expectedCash,
        variance,
        total_sales: finalSales,
        total_transactions: finalTx,
        status: 'closed',
        notes: notes || null,
      }).eq('id', activeShift.id);
    } catch {}

    return closed;
  }, [activeShift]);

  const recordSaleInShift = useCallback((saleTotal: number) => {
    if (!activeShift) return;
    const updated = {
      ...activeShift,
      totalSales: activeShift.totalSales + saleTotal,
      totalTransactions: activeShift.totalTransactions + 1,
    };
    setActiveShift(updated);
    setShifts(prev => prev.map(s => s.id === activeShift.id ? updated : s));
  }, [activeShift]);

  return (
    <ShiftContext.Provider value={{ activeShift, shifts, openShift, closeShift, recordSaleInShift }}>
      {children}
    </ShiftContext.Provider>
  );
}
