import { normalizeStampShape } from '@/constants/stampOptions';
import type { LoyaltyProgramLifecycle } from '@/lib/loyalty/cardPresentation';
import LoyaltyCard from './LoyaltyCard';

export function LoyaltyCardCompact({
  title,
  rewardName,
  businessName,
  businessLogoUrl,
  programImageUrl,
  maxStamps,
  cardThemeId,
  stampIcon,
  stampShape,
  lifecycle,
  onPress,
}: {
  title: string;
  rewardName: string;
  businessName: string;
  businessLogoUrl?: string | null;
  programImageUrl?: string | null;
  maxStamps: number;
  cardThemeId?: string | null;
  stampIcon?: string;
  stampShape?: string | null;
  lifecycle: LoyaltyProgramLifecycle;
  onPress: () => void;
}) {
  return (
    <LoyaltyCard
      variant="management"
      compactManagement={true}
      businessName={businessName}
      businessLogoUrl={businessLogoUrl}
      programTitle={title}
      rewardName={rewardName}
      programImageUrl={programImageUrl}
      maxStamps={maxStamps}
      progress={{ kind: 'none' }}
      lifecycle={lifecycle}
      cardThemeId={cardThemeId}
      stampIcon={stampIcon}
      stampShape={normalizeStampShape(stampShape)}
      onPress={onPress}
    />
  );
}
