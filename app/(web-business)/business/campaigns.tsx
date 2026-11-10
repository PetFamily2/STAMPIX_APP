import { BusinessWebCampaigns } from '@/components/business-web/BusinessWebCampaigns';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
export default function Campaigns() {
  const { activeBusinessId } = useActiveBusiness();
  return activeBusinessId ? (
    <BusinessWebCampaigns
      key={String(activeBusinessId)}
      businessId={activeBusinessId}
    />
  ) : null;
}
