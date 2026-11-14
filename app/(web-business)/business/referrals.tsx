import { BusinessWebReferrals } from '@/components/business-web/BusinessWebReferrals';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
export default function Referrals() {
  const { activeBusinessId, isSwitchingBusiness } = useActiveBusiness();
  return (
    <BusinessWebReferrals key={`${activeBusinessId}:${isSwitchingBusiness}`} />
  );
}
