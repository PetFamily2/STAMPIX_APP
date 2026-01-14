export type CustomerMembershipView = {
  membershipId: string;
  userId: string;
  businessId: string;
  programId: string;
  businessName: string;
  businessLogoUrl: string | null;
  programTitle: string;
  rewardName: string;
  stampIcon: string;
  currentStamps: number;
  maxStamps: number;
  lastStampAt: number;
  canRedeem: boolean;
};




