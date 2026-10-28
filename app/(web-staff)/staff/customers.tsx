import { BusinessWebCustomers } from '@/components/business-web/BusinessWebCustomers';
import { StaffWebFrame } from '@/components/pwa-ui/StaffWebFrame';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function StaffCustomersScreen() {
  const { activeBusinessId } = useActiveBusiness();
  return (
    <StaffWebFrame>
      {activeBusinessId ? (
        <BusinessWebCustomers
          key={String(activeBusinessId)}
          activeBusinessId={activeBusinessId}
        />
      ) : null}
    </StaffWebFrame>
  );
}
