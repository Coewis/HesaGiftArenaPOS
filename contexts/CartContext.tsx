import React, { createContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { CartItem, Product, Customer, PaymentMethod, SaleRecord, SplitPayment } from '@/types';

interface CartContextType {
  items: CartItem[];
  customer: Customer | null;
  discount: number;
  pointsRedeemed: number;            // loyalty points being redeemed this transaction
  pointsDiscount: number;            // UGX discount from loyalty points
  paymentMethod: PaymentMethod;
  splitPayment: SplitPayment;
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  setItemDiscount: (productId: string, discount: number) => void;
  setCustomer: (customer: Customer | null) => void;
  setDiscount: (discount: number) => void;
  setPointsToRedeem: (points: number) => void;  // set loyalty points to redeem
  setPaymentMethod: (method: PaymentMethod) => void;
  setSplitPayment: (split: SplitPayment) => void;
  clearCart: () => void;
  subtotal: number;
  totalDiscount: number;
  total: number;
  itemCount: number;
  completedSale: SaleRecord | null;
  setCompletedSale: (sale: SaleRecord | null) => void;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

const DEFAULT_SPLIT: SplitPayment = {
  method1: 'Cash',
  amount1: 0,
  method2: 'MTN MoMo',
  amount2: 0,
};

// Loyalty conversion: 100 points = UGX 500 discount
export const POINTS_PER_UNIT = 100;
export const DISCOUNT_PER_UNIT = 500;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState(0);
  const [pointsRedeemed, setPointsRedeemed] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [splitPayment, setSplitPayment] = useState<SplitPayment>(DEFAULT_SPLIT);
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);

  // When customer changes, reset points redemption
  const setCustomer = useCallback((c: Customer | null) => {
    setCustomerState(c);
    setPointsRedeemed(0);
  }, []);

  const setPointsToRedeem = useCallback((points: number) => {
    setPointsRedeemed(points);
  }, []);

  const addItem = useCallback((product: Product) => {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.unitPrice }
            : i
        );
      }
      return [...prev, { product, qty: 1, unitPrice: product.price, total: product.price, discount: 0 }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems(prev => prev.filter(i => i.product.id !== productId));
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty < 1) return;
    setItems(prev =>
      prev.map(i =>
        i.product.id === productId
          ? { ...i, qty, total: qty * i.unitPrice - i.discount }
          : i
      )
    );
  }, []);

  const setItemDiscount = useCallback((productId: string, disc: number) => {
    setItems(prev =>
      prev.map(i =>
        i.product.id === productId
          ? { ...i, discount: disc, total: i.qty * i.unitPrice - disc }
          : i
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setCustomerState(null);
    setDiscount(0);
    setPointsRedeemed(0);
    setPaymentMethod('Cash');
    setSplitPayment(DEFAULT_SPLIT);
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0), [items]);
  const itemDiscount = useMemo(() => items.reduce((sum, i) => sum + i.discount, 0), [items]);

  // Points discount: each 100 pts = UGX 500
  const pointsDiscount = useMemo(() => {
    const units = Math.floor(pointsRedeemed / POINTS_PER_UNIT);
    return units * DISCOUNT_PER_UNIT;
  }, [pointsRedeemed]);

  const totalDiscount = useMemo(() => itemDiscount + discount + pointsDiscount, [itemDiscount, discount, pointsDiscount]);
  const total = useMemo(() => Math.max(0, subtotal - totalDiscount), [subtotal, totalDiscount]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items]);

  return (
    <CartContext.Provider value={{
      items, customer, discount, pointsRedeemed, pointsDiscount,
      paymentMethod, splitPayment,
      addItem, removeItem, updateQty, setItemDiscount,
      setCustomer, setDiscount, setPointsToRedeem,
      setPaymentMethod, setSplitPayment, clearCart,
      subtotal, totalDiscount, total, itemCount,
      completedSale, setCompletedSale,
    }}>
      {children}
    </CartContext.Provider>
  );
}
