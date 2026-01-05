import { createContext, useContext } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';

type UserDocument = Doc<'users'> | null;

type UserContextValue = {
  user: UserDocument;
  isLoading: boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const userResult = useQuery(api.users.getCurrentUser) as
    | Doc<'users'>
    | null
    | undefined;

  const isLoading = userResult === undefined;

  return (
    <UserContext.Provider
      value={{
        user: userResult ?? null,
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
