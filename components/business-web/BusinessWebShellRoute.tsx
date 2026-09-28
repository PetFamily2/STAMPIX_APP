import { useAuthActions } from '@convex-dev/auth/react';
import { usePathname, useRouter } from 'expo-router';
import { type ReactNode, useRef, useState } from 'react';
import { BusinessWebConfirmDialog } from '@/components/business-web/BusinessWebDialog';
import {
  BusinessWebRouteProvider,
  useBusinessWebNavigationGuardState,
} from '@/components/business-web/BusinessWebRouteContext';
import { BusinessWebShell } from '@/components/business-web/BusinessWebShell';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

const TEXT = {
  selectFailed: 'לא הצלחנו לבחור את העסק. נסו שוב.',
  unsavedTitle: 'יש שינויים שלא נשמרו',
  unsavedDescription:
    'מעבר לעמוד אחר ימחק את השינויים המקומיים שעדיין לא נשמרו.',
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
  return name || input.email?.trim() || '';
}

export function BusinessWebShellRoute({ children }: { children: ReactNode }) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const pathname = usePathname();
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
  const { guard, handleGuardChange } = useBusinessWebNavigationGuardState();
  const pendingActionRef = useRef<(() => void) | null>(null);
  const [selectError, setSelectError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

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

  const requestGuardedAction = (action: () => void) => {
    if (guard?.isDirty) {
      pendingActionRef.current = action;
      setShowDiscardDialog(true);
      return;
    }
    action();
  };

  const handleSelect = (businessId: Id<'businesses'>) => {
    if (isSwitchingBusiness || businessId === activeBusinessId) {
      return;
    }
    requestGuardedAction(() => {
      setSelectError('');
      void setActiveBusinessId(businessId).catch(() => {
        setSelectError(TEXT.selectFailed);
      });
    });
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
    <BusinessWebRouteProvider onGuardChange={handleGuardChange}>
      <BusinessWebShell
        activeBusiness={activeBusiness}
        activeBusinessId={activeBusinessId}
        businesses={businesses}
        currentPathname={pathname}
        displayName={displayName}
        email={email}
        isSigningOut={isSigningOut}
        isSwitchingBusiness={isSwitchingBusiness}
        onLogout={() => {
          requestGuardedAction(() => {
            void handleLogout();
          });
        }}
        onNavigate={(href) => {
          if (href === pathname) {
            return;
          }
          requestGuardedAction(() => router.push(href));
        }}
        onSelectBusiness={handleSelect}
        selectError={selectError}
      >
        {children}
      </BusinessWebShell>
      <BusinessWebConfirmDialog
        confirmLabel="יציאה ללא שמירה"
        description={TEXT.unsavedDescription}
        onCancel={() => {
          pendingActionRef.current = null;
          setShowDiscardDialog(false);
        }}
        onConfirm={() => {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          setShowDiscardDialog(false);
          guard?.onDiscard?.();
          action?.();
        }}
        title={TEXT.unsavedTitle}
        visible={showDiscardDialog}
      />
    </BusinessWebRouteProvider>
  );
}
