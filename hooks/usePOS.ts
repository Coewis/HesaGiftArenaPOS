import { useContext } from 'react';
import { POSContext } from '@/contexts/POSContext';

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) throw new Error('usePOS must be used within POSProvider');
  return context;
}
