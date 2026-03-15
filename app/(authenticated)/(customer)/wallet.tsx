import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import { api } from '@/convex/_generated/api';
import {
  consumePendingJoin,
  savePendingJoin,
} from '@/lib/deeplink/pendingJoin';

const TEXT = {
  title: '\u05d4\u05d0\u05e8\u05e0\u05e7 \u05e9\u05dc\u05d9',
  subtitle:
    '\u05e2\u05e1\u05e7\u05d9\u05dd \u05d5\u05db\u05dc \u05d4\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05d1\u05de\u05d1\u05e0\u05d4 \u05e0\u05d5\u05d7',
  joinBusinessTitle: '\u05d4\u05e6\u05d8\u05e8\u05e3 \u05dc\u05e2\u05e1\u05e7',
  loading: '\u05d8\u05d5\u05e2\u05df \u05e2\u05e1\u05e7\u05d9\u05dd',
  noCards:
    '\u05e2\u05d3\u05d9\u05d9\u05df \u05d0\u05d9\u05df \u05e2\u05e1\u05e7\u05d9\u05dd \u05e9\u05de\u05d5\u05e8\u05d9\u05dd',
  noCardsHint:
    '\u05d0\u05e4\u05e9\u05e8 \u05dc\u05d4\u05e6\u05d8\u05e8\u05e3 \u05dc\u05e2\u05e1\u05e7 \u05d3\u05e8\u05da QR \u05d0\u05d5 \u05dc\u05d4\u05e1\u05ea\u05db\u05dc \u05d1\u05d2\u05d9\u05dc\u05d5\u05d9',
  createDemo:
    '\u05e6\u05d5\u05e8 \u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5',
  creating: '\u05d9\u05d5\u05e6\u05e8',
  demoCreated:
    '\u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5 \u05e0\u05d5\u05e6\u05e8 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4',
  demoFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d9\u05e6\u05d5\u05e8 \u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5',
  businessFallback: '\u05e2\u05e1\u05e7',
  joinedPrograms:
    '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e9\u05dc\u05d9',
  redeemReady:
    '\u05de\u05d5\u05db\u05e0\u05d5\u05ea \u05dc\u05de\u05d9\u05de\u05d5\u05e9',
  openBusiness: '\u05e4\u05ea\u05d7 \u05d0\u05ea \u05d4\u05e2\u05e1\u05e7',
};

type WalletBusiness = {
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  joinedProgramCount: number;
  redeemableCount: number;
  lastActivityAt: number;
  previewProgramTitle: string | null;
  previewRewardName: string | null;
  previewCardThemeId: string | null;
  previewMaxStamps: number | null;
  previewCurrentStamps: number | null;
};

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isAuthenticated } = useConvexAuth();
  const pendingJoinChecked = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || pendingJoinChecked.current) {
      return;
    }
    pendingJoinChecked.current = true;
    void (async () => {
      const pending = await consumePendingJoin();
      if (pending?.biz) {
        await savePendingJoin(pending);
        router.push('/(authenticated)/join');
      }
    })();
  }, [isAuthenticated]);

  const businessesQuery = useQuery(
    api.memberships.byCustomerBusinesses,
    isAuthenticated ? {} : 'skip'
  );
  const businesses = (businessesQuery ?? []) as WalletBusiness[];

  const seedMvp = useMutation(api.seed.seedMvp);
  const isLoading = isAuthenticated && businessesQuery === undefined;

  const [seedStatus, setSeedStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);

  const handleCreateDemo = async () => {
    if (seedBusy) {
      return;
    }

    try {
      setSeedBusy(true);
      setSeedStatus(null);
      await seedMvp({});
      setSeedStatus({ type: 'success', message: TEXT.demoCreated });
    } catch (error: unknown) {
      setSeedStatus({
        type: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : TEXT.demoFailed,
      });
    } finally {
      setSeedBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        alwaysBounceVertical={false}
      >
        <View style={styles.headerRow}>
          <BusinessScreenHeader title={TEXT.title} subtitle={TEXT.subtitle} />
        </View>

        <View style={styles.joinBusinessRow}>
          <Pressable
            onPress={() => router.push('/(authenticated)/join')}
            style={({ pressed }) => [
              styles.joinBusinessButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={TEXT.joinBusinessTitle}
          >
            <View style={styles.joinBusinessButtonContent}>
              <View style={styles.joinBusinessPlusCircle}>
                <View style={styles.joinBusinessPlusHorizontal} />
                <View style={styles.joinBusinessPlusVertical} />
              </View>
              <Text style={styles.joinBusinessTitle}>
                {TEXT.joinBusinessTitle}
              </Text>
            </View>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.cardContainer}>
            <Text style={styles.infoText}>{TEXT.loading}</Text>
          </View>
        ) : null}

        {!isLoading && businesses.length === 0 ? (
          <View style={styles.cardContainer}>
            <Text style={styles.emptyTitle}>{TEXT.noCards}</Text>
            <Text style={styles.infoText}>{TEXT.noCardsHint}</Text>

            <Pressable
              onPress={handleCreateDemo}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || seedBusy) && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {seedBusy ? TEXT.creating : TEXT.createDemo}
              </Text>
            </Pressable>

            {seedStatus ? (
              <Text
                style={[
                  styles.statusText,
                  seedStatus.type === 'error'
                    ? styles.statusError
                    : styles.statusSuccess,
                ]}
              >
                {seedStatus.message}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.cardList}>
          {!isLoading
            ? businesses.map((business) => {
                const businessId = String(business.businessId);
                return (
                  <Pressable
                    key={businessId}
                    style={styles.cardContainer}
                    onPress={() =>
                      router.push({
                        pathname:
                          '/(authenticated)/(customer)/business/[businessId]',
                        params: { businessId },
                      } as any)
                    }
                  >
                    <ProgramCustomerCardPreview
                      businessName={
                        business.businessName ?? TEXT.businessFallback
                      }
                      businessLogoUrl={business.businessLogoUrl}
                      title={
                        business.previewProgramTitle ?? TEXT.joinedPrograms
                      }
                      rewardName={
                        business.previewRewardName ??
                        `${TEXT.joinedPrograms}: ${business.joinedProgramCount}`
                      }
                      maxStamps={Math.max(
                        1,
                        Number(business.previewMaxStamps ?? 1)
                      )}
                      previewCurrentStamps={Number(
                        business.previewCurrentStamps ?? 0
                      )}
                      cardThemeId={business.previewCardThemeId}
                      status={
                        business.redeemableCount > 0 ? 'redeemable' : 'default'
                      }
                      variant="compact"
                    />

                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>
                        {TEXT.joinedPrograms}: {business.joinedProgramCount}
                      </Text>
                      <Text style={styles.metaText}>
                        {TEXT.redeemReady}: {business.redeemableCount}
                      </Text>
                    </View>

                    <View style={styles.openRow}>
                      <Ionicons name="chevron-back" size={14} color="#5B6475" />
                      <Text style={styles.openText}>{TEXT.openBusiness}</Text>
                    </View>
                  </Pressable>
                );
              })
            : null}
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
  scrollContainer: {
    paddingHorizontal: 20,
  },
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 0,
  },
  joinBusinessRow: {
    width: '100%',
    direction: 'ltr',
    alignItems: 'flex-start',
    marginTop: 0,
  },
  joinBusinessButton: {
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#9CC0FF',
  },
  joinBusinessButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinBusinessPlusCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBusinessPlusHorizontal: {
    position: 'absolute',
    width: 15,
    height: 3.4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  joinBusinessPlusVertical: {
    position: 'absolute',
    width: 3.4,
    height: 15,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  joinBusinessTitle: {
    color: '#1E3A8A',
    fontSize: 14,
    fontWeight: '900',
  },
  cardList: {
    marginTop: 18,
    gap: 12,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    color: '#0B1220',
  },
  infoText: {
    marginTop: 6,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'right',
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E3E9FF',
  },
  secondaryButtonText: {
    color: '#1A2B4A',
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.85,
  },
  statusText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  statusSuccess: {
    color: '#0B922A',
  },
  statusError: {
    color: '#D92D20',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaText: {
    fontSize: 12,
    color: '#5B6475',
    textAlign: 'right',
    fontWeight: '700',
  },
  openRow: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  openText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'right',
  },
});
