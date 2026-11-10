import { useCallback, useRef } from 'react';

import {
  BusinessWebDashboard,
  BusinessWebNoBusiness,
} from '@/components/business-web/BusinessWebDashboard';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export default function BusinessWebDashboardScreen() {
  const { activeBusiness, activeBusinessId, isSwitchingBusiness } =
    useActiveBusiness();
  const interactionGuardRef = useRef({
    businessId: activeBusinessId,
    isSwitchingBusiness,
  });
  interactionGuardRef.current = {
    businessId: activeBusinessId,
    isSwitchingBusiness,
  };
  const isInteractionCurrent = useCallback(
    (businessId: string) =>
      interactionGuardRef.current.businessId === businessId &&
      interactionGuardRef.current.isSwitchingBusiness === false,
    []
  );

  return activeBusinessId && activeBusiness ? (
    <BusinessWebDashboard
      key={String(activeBusinessId)}
      activeBusinessId={activeBusinessId}
      businessName={activeBusiness.name}
      isInteractionCurrent={isInteractionCurrent}
      isSwitchingBusiness={isSwitchingBusiness}
    />
  ) : (
    <BusinessWebNoBusiness />
  );
}
