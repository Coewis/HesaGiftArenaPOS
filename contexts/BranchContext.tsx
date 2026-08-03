import React, { createContext, useState, useCallback, ReactNode } from 'react';

export interface Branch {
  id: string;
  name: string;
  shortName: string;
  address: string;
  phone: string;
  color: string;
  icon: string;
}

export const STORE_CONTACT = {
  phone: '0748152333',
  email: 'hesagiftarena@protonmail.com',
  website: 'hesagiftarena.lovable.app',
};

export const BRANCHES: Branch[] = [
  {
    id: 'branch_main',
    name: 'Main Branch',
    shortName: 'Main',
    address: 'Plot 14, Kampala Road, Kampala',
    phone: '0748152333',
    color: '#38B6FF',
    icon: 'store',
  },
  {
    id: 'branch_kasese',
    name: 'Kasese Branch',
    shortName: 'Kasese',
    address: 'Kasese Town, Western Uganda',
    phone: '0748152333',
    color: '#22C55E',
    icon: 'storefront',
  },
  {
    id: 'branch_fortportal',
    name: 'Fort Portal Branch',
    shortName: 'Fort Portal',
    address: 'Fort Portal City, Kabarole',
    phone: '0748152333',
    color: '#F59E0B',
    icon: 'local-florist',
  },
  {
    id: 'branch_mukono',
    name: 'Mukono Branch',
    shortName: 'Mukono',
    address: 'Mukono Town, Mukono District',
    phone: '0748152333',
    color: '#E67E22',
    icon: 'location-city',
  },
  {
    id: 'branch_ibanda',
    name: 'Ibanda Branch',
    shortName: 'Ibanda',
    address: 'Ibanda Town, Ibanda District',
    phone: '0748152333',
    color: '#9B59B6',
    icon: 'business',
  },
];

interface BranchContextType {
  currentBranch: Branch;
  setBranch: (branch: Branch) => void;
  branches: Branch[];
}

export const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [currentBranch, setCurrentBranch] = useState<Branch>(BRANCHES[0]);

  const setBranch = useCallback((branch: Branch) => {
    setCurrentBranch(branch);
  }, []);

  return (
    <BranchContext.Provider value={{ currentBranch, setBranch, branches: BRANCHES }}>
      {children}
    </BranchContext.Provider>
  );
}
