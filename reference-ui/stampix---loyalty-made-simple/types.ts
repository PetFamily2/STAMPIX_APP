
export type UserRole = 'customer' | 'merchant' | null;
export type MerchantTier = 'starter' | 'pro' | 'unlimited' | null;

export interface LoyaltyCard {
  id: string;
  businessName: string;
  logo: string;
  currentStamps: number;
  maxStamps: number;
  reward: string;
  lastVisit?: string;
  color: string;
  isLocked?: boolean;
}

export interface BusinessStats {
  todayPunches: number;
  newCustomers: number;
  rewardsRedeemed: number;
  weeklyPunches: number[];
  activeCustomers: number;
  retentionRate: number;
}

export interface CustomerActivity {
  id: string;
  name: string;
  totalPunches: number;
  lastVisit: string;
  isVip: boolean;
}

export interface Activity {
  id: string;
  customerName: string;
  type: 'punch' | 'reward';
  time: string;
  avatar?: string;
}

export interface MerchantStatus {
  id: string;
  name: string;
  category: string;
  revenue: string;
  status: 'active' | 'stuck' | 'pending';
  logo: string;
  customers: number;
  punches: number;
  tier: 'Starter' | 'Pro' | 'Unlimited';
  lastBillDate: string;
  registrationDate: string;
  credits: number;
  toolUsage: {
    aiVideos: number;
    marketingMessages: number;
    scansPerMonth: number;
  };
  ownerEmail: string;
  notes: string;
}
