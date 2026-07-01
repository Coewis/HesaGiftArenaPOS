import { useContext } from 'react';
import { ShiftContext } from '@/contexts/ShiftContext';

export function useShift() {
  const context = useContext(ShiftContext);
  if (!context) throw new Error('useShift must be used within ShiftProvider');
  return context;
}
