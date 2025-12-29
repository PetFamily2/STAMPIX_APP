import { createContext, useContext } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

type UserContextValue = {
  user: any | null;
  isLoading: boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const user = useQuery(api.users.getCurrentUser);

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading: user === undefined,
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
