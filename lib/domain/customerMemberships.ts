export type CustomerMembershipView = {
  membershipId: string;
  userId: string;
  businessId: string;
  programId: string;
  businessName: string;
  businessLogoUrl: string | null;
  programImageUrl: string | null;
  programTitle: string;
  rewardName: string;
  stampIcon: string;
  stampShape: string;
  cardThemeId: string | null;
  currentStamps: number;
  maxStamps: number;
  lastStampAt: number;
  canRedeem: boolean;
};
