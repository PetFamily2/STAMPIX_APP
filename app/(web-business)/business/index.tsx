import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';

import {
  BusinessWebDashboard,
  BusinessWebNoBusiness,
} from '@/components/business-web/BusinessWebDashboard';
import { BusinessWebShell } from '@/components/business-web/BusinessWebShell';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

const TEXT = {
  selectFailed: 'לא הצלחנו לבחור את העסק. נסו שוב.',
};

function readDisplayName(input: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const fullName = input.fullName?.trim();
  if (fullName && fullName.toLowerCase() !== 'user') {
    return fullName;
  }

  const name = [input.firstName, input.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
  if (name) {
    return name;
  }

  return input.email?.trim() || '';
}

export default function BusinessWebDashboardScreen() {
  const { signOut } = useAuthActions();
  const { user, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const {
    businesses,
    activeBusiness,
    activeBusinessId,
    isLoading: isBusinessLoading,
    isSwitchingBusiness,
    setActiveBusinessId,
  } = useActiveBusiness();
  const [selectError, setSelectError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (isUserLoading || isBusinessLoading || sessionContext === undefined) {
    return <FullScreenLoading />;
  }

  const profile = user ?? sessionContext?.user ?? null;
  const displayName = profile
    ? readDisplayName({
        fullName: profile.fullName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
      })
    : '';
  const email = profile?.email?.trim() ?? '';

  const handleSelect = async (businessId: Id<'businesses'>) => {
    if (isSwitchingBusiness || businessId === activeBusinessId) {
      return;
    }

    setSelectError('');
    try {
      await setActiveBusinessId(businessId);
    } catch {
      setSelectError(TEXT.selectFailed);
    }
  };

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <BusinessWebShell
      activeBusiness={activeBusiness}
      activeBusinessId={activeBusinessId}
      businesses={businesses}
      displayName={displayName}
      email={email}
      isSigningOut={isSigningOut}
      isSwitchingBusiness={isSwitchingBusiness}
      onLogout={() => {
        void handleLogout();
      }}
      onSelectBusiness={(businessId) => {
        void handleSelect(businessId);
      }}
      selectError={selectError}
    >
      {activeBusinessId && activeBusiness ? (
        <BusinessWebDashboard
          key={String(activeBusinessId)}
          activeBusinessId={activeBusinessId}
          businessName={activeBusiness.name}
        />
      ) : (
        <BusinessWebNoBusiness />
      )}
    </BusinessWebShell>
  );
}
