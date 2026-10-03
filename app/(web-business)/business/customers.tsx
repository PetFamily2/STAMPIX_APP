import { BusinessWebCustomers } from '@/components/business-web/BusinessWebCustomers';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebCustomersScreen() {
  const { activeBusinessId } = useActiveBusiness();

  return activeBusinessId ? (
    <BusinessWebCustomers
      key={String(activeBusinessId)}
      activeBusinessId={activeBusinessId}
    />
  ) : null;
}
