import { useContext } from 'react';
import { BranchContext } from '@/contexts/BranchContext';

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) throw new Error('useBranch must be used within BranchProvider');
  return context;
}
