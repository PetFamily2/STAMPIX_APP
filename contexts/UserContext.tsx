import { useQuery } from 'convex/react';
import { createContext, useContext } from 'react';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';

type UserDocument = Doc<'users'> | null;

export type SessionContext = {
  user: {
    _id: import('@/convex/_generated/dataModel').Id<'users'>;
    email?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    avatarUrl?: string;
    preferredMode?: 'customer' | 'business' | 'staff';
    userType?: 'free' | 'paid';
    subscriptionPlan?: 'free' | 'pro' | 'unlimited';
    subscriptionStatus?: 'active' | 'inactive' | 'cancelled';
    needsNameCapture?: boolean;
    postAuthOnboardingRequired?: boolean;
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
  }>;
  defaultMode: 'customer' | 'business' | 'staff';
  preferredMode: 'customer' | 'business' | 'staff' | null;
};

type UserContextValue = {
  user: UserDocument;
  sessionContext: SessionContext | null | undefined;
  isLoading: boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const userResult = useQuery(api.users.getCurrentUser) as
    | Doc<'users'>
    | null
    | undefined;
  const sessionResult = useQuery(api.users.getSessionContext);

  const isLoading = userResult === undefined;

  return (
    <UserContext.Provider
      value={{
        user: userResult ?? null,
        sessionContext: sessionResult,
        isLoading,
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
