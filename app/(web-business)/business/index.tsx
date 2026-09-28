import {
  BusinessWebDashboard,
  BusinessWebNoBusiness,
} from '@/components/business-web/BusinessWebDashboard';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebDashboardScreen() {
  const { activeBusiness, activeBusinessId } = useActiveBusiness();

  return activeBusinessId && activeBusiness ? (
    <BusinessWebDashboard
      key={String(activeBusinessId)}
      activeBusinessId={activeBusinessId}
      businessName={activeBusiness.name}
    />
  ) : (
    <BusinessWebNoBusiness />
  );
}
