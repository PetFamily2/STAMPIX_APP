import { BusinessWebAnalytics } from '@/components/business-web/BusinessWebAnalytics';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebAnalyticsScreen() {
  const { activeBusinessId } = useActiveBusiness();

  return activeBusinessId ? (
    <BusinessWebAnalytics
      key={String(activeBusinessId)}
      activeBusinessId={activeBusinessId}
    />
  ) : null;
}
