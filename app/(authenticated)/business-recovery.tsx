import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { getBusinessOnboardingEntryRoute } from '@/lib/onboarding/businessOnboardingFlow';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

const TEXT = {
  title: 'עסקים סגורים',
  subtitle: 'ניתן לשחזר עסק ולחזור בדיוק למצב שבו נסגר.',
  empty: 'אין עסקים סגורים לשחזור',
  closedDateUnavailable: 'תאריך הסגירה אינו זמין',
  restore: 'שחזור העסק',
  restoreTitle: 'לשחזר את העסק?',
  restoreBody:
    'העסק יחזור לפעילות עם הלקוחות, הכרטיסיות, הניקובים, העובדים וההיסטוריה שנשמרו לפני הסגירה.',
  cancel: 'ביטול',
  restoring: 'משחזרים את העסק...',
  restoreFailed: 'לא הצלחנו לשחזר את העסק. נסו שוב.',
  permanentDelete: 'מחיקה לצמיתות',
  permanentDeleteHint:
    'מחיקה בלתי הפיכה של העסק ושל נתוני מועדון הלקוחות שלו.',
  deletionSectionTitle: 'עסקים בתהליך מחיקה',
  deletionInProgress: 'מחיקת העסק מתבצעת ברקע.',
  deletionFailed: 'מחיקת העסק נכשלה. ניתן להיכנס ולנסות שוב.',
  showDeletionStatus: 'הצגת מצב המחיקה',
  errorTitle: 'שגיאה',
  newBusiness: 'פתיחת עסק חדש',
  newBusinessSupport:
    'העסק הסגור יישאר שמור ותוכלו לשחזר אותו גם בהמשך.',
};

function formatClosedDate(timestamp: number | null) {
  if (timestamp == null) {
    return TEXT.closedDateUnavailable;
  }

  return `נסגר בתאריך ${new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp))}`;
}

export default function BusinessRecoveryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionContext = useSessionContext();
  const { appMode, setAppMode } = useAppMode();
  const { businesses, activeBusinessId } = useActiveBusiness();
  const closedBusinesses = useQuery(api.business.listMyClosedBusinesses);
  const permanentDeletionBusinesses = useQuery(
    api.businessDeletion.listMyBusinessesForPermanentDeletion
  );
  const restoreBusinessAccount = useMutation(
    api.business.restoreBusinessAccount
  );
  const setActiveBusiness = useMutation(api.users.setActiveBusiness);
  const setActiveMode = useMutation(api.users.setActiveMode);
  const [restoringBusinessId, setRestoringBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const [pendingRestoredBusinessId, setPendingRestoredBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const onboardingRoute = getBusinessOnboardingEntryRoute(
    sessionContext?.user.businessOnboardedAt != null
  );
  const deletingBusinesses =
    permanentDeletionBusinesses?.filter((business) => {
      const status = business.permanentDeletionJobStatus;
      return status === 'queued' || status === 'running' || status === 'failed';
    }) ?? [];

  useEffect(() => {
    if (
      !pendingRestoredBusinessId ||
      appMode !== 'business' ||
      activeBusinessId !== pendingRestoredBusinessId ||
      !businesses.some(
        (business) => business.businessId === pendingRestoredBusinessId
      )
    ) {
      return;
    }

    setPendingRestoredBusinessId(null);
    setRestoringBusinessId(null);
    router.replace('/(authenticated)/(business)/dashboard');
  }, [
    activeBusinessId,
    appMode,
    businesses,
    pendingRestoredBusinessId,
    router,
  ]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(authenticated)/(customer)/wallet');
  };

  const handleRestore = (
    businessId: Id<'businesses'>,
    businessName: string
  ) => {
    if (restoringBusinessId) {
      return;
    }

    Alert.alert(TEXT.restoreTitle, TEXT.restoreBody, [
      { text: TEXT.cancel, style: 'cancel' },
      {
        text: TEXT.restore,
        onPress: async () => {
          if (restoringBusinessId) {
            return;
          }

          setRestoringBusinessId(businessId);
          try {
            const restored = await restoreBusinessAccount({ businessId });
            setPendingRestoredBusinessId(restored.businessId);
            await setActiveBusiness({ businessId: restored.businessId });
            await setActiveMode({ mode: 'business' });
            await setAppMode('business');
          } catch {
            setPendingRestoredBusinessId(null);
            setRestoringBusinessId(null);
            Alert.alert(
              TEXT.errorTitle,
              `${TEXT.restoreFailed} (${businessName})`
            );
          }
        },
      },
    ]);
  };

  const openPermanentDeletion = (businessId: Id<'businesses'>) => {
    router.push(
      `/(authenticated)/business-permanent-deletion?businessId=${encodeURIComponent(
        String(businessId)
      )}` as Href
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (insets.bottom || 0) + 28 },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title={TEXT.title}
            subtitle={TEXT.subtitle}
            titleAccessory={<BackButton onPress={goBack} />}
          />
        </StickyScrollHeader>

        {pendingRestoredBusinessId ? (
          <View style={styles.transitionCard}>
            <ActivityIndicator color="#2F6BFF" />
            <Text style={styles.transitionText}>{TEXT.restoring}</Text>
          </View>
        ) : closedBusinesses === undefined ||
          permanentDeletionBusinesses === undefined ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : closedBusinesses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="archive-outline" size={28} color="#64748B" />
            <Text style={styles.emptyText}>{TEXT.empty}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {closedBusinesses.map((business) => {
              const isRestoring = restoringBusinessId === business.businessId;
              const closedAt = business.lastClosedAt ?? business.closedAt;

              return (
                <View key={String(business.businessId)} style={styles.card}>
                  <View style={styles.cardHeader}>
                    {business.logoUrl ? (
                      <Image
                        source={{ uri: business.logoUrl }}
                        style={styles.logo}
                        resizeMode="cover"
                        accessibilityLabel={`לוגו של ${business.name}`}
                      />
                    ) : (
                      <View style={styles.logoFallback}>
                        <Ionicons
                          name="storefront-outline"
                          size={22}
                          color="#315FD6"
                        />
                      </View>
                    )}
                    <View style={styles.cardText}>
                      <Text style={styles.businessName}>{business.name}</Text>
                      <Text style={styles.closedDate}>
                        {formatClosedDate(closedAt)}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() =>
                      handleRestore(business.businessId, business.name)
                    }
                    disabled={Boolean(restoringBusinessId)}
                    accessibilityRole="button"
                    accessibilityLabel={`שחזור העסק ${business.name}`}
                    style={({ pressed }) => [
                      styles.restoreButton,
                      pressed ? styles.pressed : null,
                      restoringBusinessId ? styles.disabled : null,
                    ]}
                  >
                    {isRestoring ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.restoreButtonText}>
                        {TEXT.restore}
                      </Text>
                    )}
                  </Pressable>

                  <View style={styles.permanentDeleteArea}>
                    <Text style={styles.permanentDeleteHint}>
                      {TEXT.permanentDeleteHint}
                    </Text>
                    <Pressable
                      onPress={() =>
                        openPermanentDeletion(business.businessId)
                      }
                      disabled={Boolean(restoringBusinessId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${TEXT.permanentDelete}: ${business.name}`}
                      accessibilityHint={TEXT.permanentDeleteHint}
                      style={({ pressed }) => [
                        styles.permanentDeleteButton,
                        pressed ? styles.pressed : null,
                        restoringBusinessId ? styles.disabled : null,
                      ]}
                    >
                      <Text style={styles.permanentDeleteButtonText}>
                        {TEXT.permanentDelete}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {deletingBusinesses.length > 0 ? (
          <View style={styles.deletionSection}>
            <Text style={styles.deletionSectionTitle}>
              {TEXT.deletionSectionTitle}
            </Text>
            {deletingBusinesses.map((business) => {
              const failed = business.permanentDeletionJobStatus === 'failed';
              return (
                <View
                  key={`deleting-${String(business.businessId)}`}
                  style={styles.deletionCard}
                >
                  <View style={styles.deletionCardHeader}>
                    <Ionicons
                      name={failed ? 'alert-circle-outline' : 'time-outline'}
                      size={24}
                      color="#B42318"
                    />
                    <View style={styles.cardText}>
                      <Text style={styles.businessName}>{business.name}</Text>
                      <Text style={styles.deletionStateText}>
                        {failed
                          ? TEXT.deletionFailed
                          : TEXT.deletionInProgress}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => openPermanentDeletion(business.businessId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${TEXT.showDeletionStatus}: ${business.name}`}
                    style={({ pressed }) => [
                      styles.deletionStatusButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.deletionStatusButtonText}>
                      {TEXT.showDeletionStatus}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.newBusinessCard}>
          <Text style={styles.newBusinessSupport}>
            {TEXT.newBusinessSupport}
          </Text>
          <Pressable
            onPress={() => router.push(onboardingRoute as Href)}
            disabled={Boolean(restoringBusinessId)}
            accessibilityRole="button"
            accessibilityLabel={TEXT.newBusiness}
            style={({ pressed }) => [
              styles.newBusinessButton,
              pressed ? styles.pressed : null,
              restoringBusinessId ? styles.disabled : null,
            ]}
          >
            <Text style={styles.newBusinessButtonText}>{TEXT.newBusiness}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  loadingRow: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transitionCard: {
    minHeight: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C8D8FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  transitionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyCard: {
    minHeight: 128,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D7E1F3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D7E1F3',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 14,
  },
  cardHeader: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EEF3FF',
  },
  logoFallback: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 4,
  },
  businessName: {
    width: '100%',
    fontSize: 17,
    fontWeight: '900',
    color: '#172033',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  closedDate: {
    width: '100%',
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  restoreButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  permanentDeleteArea: {
    borderTopWidth: 1,
    borderTopColor: '#F3D3D3',
    paddingTop: 12,
    gap: 9,
  },
  permanentDeleteHint: {
    color: '#7F1D1D',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  permanentDeleteButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B42318',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  permanentDeleteButtonText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  deletionSection: {
    gap: 10,
  },
  deletionSectionTitle: {
    color: '#7F1D1D',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  deletionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0CACA',
    backgroundColor: '#FFF7F7',
    padding: 16,
    gap: 12,
  },
  deletionCardHeader: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  deletionStateText: {
    width: '100%',
    color: '#7F1D1D',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  deletionStatusButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#B42318',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  deletionStatusButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  newBusinessCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D7E1F3',
    backgroundColor: '#F8FAFF',
    padding: 16,
    gap: 12,
  },
  newBusinessSupport: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#52637A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  newBusinessButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#9DB6FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  newBusinessButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.6,
  },
});
