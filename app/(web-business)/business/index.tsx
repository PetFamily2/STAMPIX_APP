import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { ltrIslandText, selfStart } from '@/lib/rtl';

const TEXT = {
  title: 'StampAix Business',
  userIdLabel: 'Technical proof · userId',
  businesses: 'עסקים',
  emptyBusinesses: 'אין שיוך לעסק',
  activeBusiness: 'עסק פעיל',
  noActiveBusiness: 'אין עסק פעיל',
  role: 'תפקיד',
  businessId: 'businessId',
  select: 'בחירה',
  selecting: 'בוחרים',
  current: 'נבחר',
  selectFailed: 'לא הצלחנו לבחור את העסק. נסו שוב.',
  logout: 'התנתקות',
  loggingOut: 'מתנתקים',
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

export default function BusinessWebProofScreen() {
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
  const userId = profile?._id ? String(profile._id) : '';
  const showEmail = Boolean(email) && email !== displayName;

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
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{TEXT.title}</Text>
        {displayName ? (
          <Text style={styles.identity}>{displayName}</Text>
        ) : null}
        {showEmail ? (
          <Text style={[styles.email, ltrIslandText]}>{email}</Text>
        ) : null}

        <Text style={[styles.proofLabel, ltrIslandText]}>
          {TEXT.userIdLabel}
        </Text>
        <Text selectable={true} style={[styles.proofValue, ltrIslandText]}>
          {userId || '—'}
        </Text>

        <Text style={styles.section}>{TEXT.activeBusiness}</Text>
        <Text style={styles.body}>
          {activeBusiness
            ? `${activeBusiness.name} · ${activeBusiness.staffRole}`
            : TEXT.noActiveBusiness}
        </Text>
        {activeBusiness ? (
          <Text selectable={true} style={styles.meta}>
            {TEXT.businessId}: {String(activeBusiness.businessId)}
          </Text>
        ) : null}

        <Text style={styles.section}>{TEXT.businesses}</Text>
        {businesses.length === 0 ? (
          <Text style={styles.body}>{TEXT.emptyBusinesses}</Text>
        ) : (
          businesses.map((business) => {
            const isActive = business.businessId === activeBusinessId;
            return (
              <View key={String(business.businessId)} style={styles.card}>
                <Text style={styles.businessName}>{business.name}</Text>
                <Text style={styles.meta}>
                  {TEXT.role}: {business.staffRole}
                </Text>
                <Text selectable={true} style={styles.meta}>
                  {TEXT.businessId}: {String(business.businessId)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isActive ? TEXT.current : TEXT.select}
                  accessibilityState={{
                    disabled: isActive || isSwitchingBusiness,
                  }}
                  disabled={isActive || isSwitchingBusiness}
                  onPress={() => {
                    void handleSelect(business.businessId);
                  }}
                  style={[
                    styles.selectButton,
                    isActive ? styles.selectButtonCurrent : null,
                  ]}
                >
                  <Text style={styles.selectButtonText}>
                    {isActive
                      ? TEXT.current
                      : isSwitchingBusiness
                        ? TEXT.selecting
                        : TEXT.select}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}

        {selectError ? <Text style={styles.error}>{selectError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={TEXT.logout}
          accessibilityState={{ disabled: isSigningOut }}
          disabled={isSigningOut}
          onPress={() => {
            void handleLogout();
          }}
          style={styles.logoutButton}
        >
          <Text style={styles.logoutText}>
            {isSigningOut ? TEXT.loggingOut : TEXT.logout}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  identity: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  email: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  proofLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
  },
  proofValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78350f',
  },
  section: {
    marginTop: 18,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 4,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  meta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectButton: {
    marginTop: 8,
    alignSelf: selfStart,
    borderRadius: 999,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectButtonCurrent: {
    backgroundColor: '#047857',
  },
  selectButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  error: {
    marginTop: 8,
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logoutButton: {
    marginTop: 24,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  logoutText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
});
