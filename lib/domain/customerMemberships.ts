import { isValidLoyaltyTarget } from '../loyalty/targetValidity';

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
  programLifecycle: 'active' | 'archived';
  currentStamps: number;
  maxStamps: number;
  lastStampAt: number;
  canRedeem: boolean;
};

export function isReadyLoyaltyMembership(
  membership: Pick<
    CustomerMembershipView,
    'programLifecycle' | 'maxStamps' | 'canRedeem'
  >
) {
  return (
    membership.programLifecycle === 'active' &&
    isValidLoyaltyTarget(membership.maxStamps) &&
    membership.canRedeem
  );
}
