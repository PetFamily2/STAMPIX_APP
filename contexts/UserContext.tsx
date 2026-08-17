import { useQuery } from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import {
  resolveFreshUserIdAfterDeletedUserSuppression,
  shouldSuppressDeletedUserPresentation,
} from '@/lib/accountDeletionContextSafety';

type UserDocument = Doc<'users'> | null;

export type SessionContext = {
  user: {
    _id: import('@/convex/_generated/dataModel').Id<'users'>;
    email?: string;
    phone?: string;
    marketingOptIn?: boolean;
    marketingOptInAt?: number;
    birthdayMonth?: number;
    birthdayDay?: number;
    anniversaryMonth?: number;
    anniversaryDay?: number;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    avatarUrl?: string;
    customerOnboardedAt?: number;
    businessOnboardedAt?: number;
    activeMode?: 'customer' | 'business';
    userType?: 'free' | 'paid';
    subscriptionPlan?: 'starter' | 'pro' | 'premium';
    subscriptionStatus?: 'active' | 'inactive' | 'cancelled';
    isActive: boolean;
  };
  isAdmin: boolean;
  roles: {
    owner: boolean;
    manager: boolean;
    staff: boolean;
    customer: boolean;
  };
  businesses: Array<{
    id: import('@/convex/_generated/dataModel').Id<'businesses'>;
    name: string;
    staffRole: 'owner' | 'manager' | 'staff';
  }>;
  pendingInvites: Array<{
    inviteId: import('@/convex/_generated/dataModel').Id<'staffInvites'>;
    businessId: import('@/convex/_generated/dataModel').Id<'businesses'>;
    businessName: string;
    inviteCode: string;
    targetRole?: 'manager' | 'staff';
  }>;
  activeMode: 'customer' | 'business';
  activeBusinessId:
    | import('@/convex/_generated/dataModel').Id<'businesses'>
    | null;
};

type UserContextValue = {
  user: UserDocument;
  sessionContext: SessionContext | null | undefined;
  isLoading: boolean;
  resetSessionState: () => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const userResult = useQuery(api.users.getCurrentUser) as
    | Doc<'users'>
    | null
    | undefined;
  const sessionResult = useQuery(api.users.getSessionContext);
  const [isAccountStateReset, setIsAccountStateReset] = useState(false);
  const deletedUserIdRef = useRef<Id<'users'> | null>(null);
  const lastAuthenticatedUserIdRef = useRef<Id<'users'> | null>(null);
  const userResultId = userResult?._id ?? null;
  const sessionResultId = sessionResult?.user._id ?? null;
  const currentUserId = userResultId ?? sessionResultId;
  const deletedUserIsPresent = shouldSuppressDeletedUserPresentation(
    userResultId,
    sessionResultId,
    deletedUserIdRef.current
  );
  const shouldSuppressAccountPresentation =
    isAccountStateReset || deletedUserIsPresent;

  useEffect(() => {
    if (!shouldSuppressAccountPresentation && currentUserId) {
      lastAuthenticatedUserIdRef.current = currentUserId;
    }
  }, [currentUserId, shouldSuppressAccountPresentation]);

  useEffect(() => {
    if (!isAccountStateReset) {
      return;
    }
    const freshUserId = resolveFreshUserIdAfterDeletedUserSuppression(
      userResultId,
      sessionResultId,
      deletedUserIdRef.current
    );
    if (!freshUserId) {
      return;
    }

    lastAuthenticatedUserIdRef.current = freshUserId;
    setIsAccountStateReset(false);
  }, [isAccountStateReset, sessionResultId, userResultId]);

  const resetSessionState = useCallback(() => {
    deletedUserIdRef.current =
      currentUserId ?? lastAuthenticatedUserIdRef.current;
    setIsAccountStateReset(true);
  }, [currentUserId]);

  const isLoading = shouldSuppressAccountPresentation
    ? false
    : userResult === undefined;

  return (
    <UserContext.Provider
      value={{
        user: shouldSuppressAccountPresentation ? null : (userResult ?? null),
        sessionContext: shouldSuppressAccountPresentation
          ? null
          : sessionResult,
        isLoading,
        resetSessionState,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within UserProvider');
  }
  return ctx;
}

export function useSessionContext() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within UserProvider');
  }
  return ctx.sessionContext;
}
