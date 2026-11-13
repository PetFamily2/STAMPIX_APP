import { BusinessWebLoyalty } from '@/components/business-web/BusinessWebLoyalty';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebLoyaltyScreen() {
  const { activeBusinessId } = useActiveBusiness();

  return activeBusinessId ? (
    <BusinessWebLoyalty
      key={String(activeBusinessId)}
      activeBusinessId={activeBusinessId}
    />
  ) : null;
}
