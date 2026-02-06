import { Ionicons } from '@expo/vector-icons';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import {
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

import { api } from '@/convex/_generated/api';

const TEXT = {
  title: '\u05d4\u05d0\u05e8\u05e0\u05e7 \u05e9\u05dc\u05d9',
  subtitle:
    '\u05db\u05dc \u05d4\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05d1\u05de\u05e7\u05d5\u05dd \u05d0\u05d7\u05d3',
  loading:
    '\u05d8\u05d5\u05e2\u05df \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea...',
  noCards:
    '\u05e2\u05d3\u05d9\u05d9\u05df \u05d0\u05d9\u05df \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea',
  noCardsHint:
    '\u05d0\u05e4\u05e9\u05e8 \u05dc\u05d4\u05e6\u05d8\u05e8\u05e3 \u05dc\u05de\u05d5\u05e2\u05d3\u05d5\u05df \u05d3\u05e8\u05da QR \u05d0\u05d5 \u05dc\u05d9\u05e6\u05d5\u05e8 \u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5.',
  joinByQr: '\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05d3\u05e8\u05da QR',
  createDemo:
    '\u05e6\u05d5\u05e8 \u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5',
  creating: '\u05d9\u05d5\u05e6\u05e8...',
  demoCreated:
    '\u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5 \u05e0\u05d5\u05e6\u05e8 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4.',
  demoFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d9\u05e6\u05d5\u05e8 \u05db\u05e8\u05d8\u05d9\u05e1 \u05d3\u05de\u05d5.',
  rewardPrefix: '\u05d4\u05d8\u05d1\u05d4:',
  businessFallback: '\u05e2\u05e1\u05e7',
  rewardFallback: '\u05d4\u05d8\u05d1\u05d4',
};

type WalletMembership = {
  membershipId: string;
  currentStamps?: number;
  maxStamps?: number;
  businessName?: string | null;
  rewardName?: string | null;
};

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();

  const membershipsQuery = useQuery(
    api.memberships.byCustomer,
    isAuthenticated ? {} : 'skip'
  );
  const memberships = (membershipsQuery ?? []) as WalletMembership[];

  const seedMvp = useMutation(api.seed.seedMvp);
  const isLoading = isAuthenticated && membershipsQuery === undefined;

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
          { paddingTop: (insets.top || 0) + 16 },
        ]}
        alwaysBounceVertical={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.walletBadge}>
              <Ionicons name="wallet-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerLabel}>STAMPIX</Text>
              <Text style={styles.headerTitle}>{TEXT.title}</Text>
              <Text style={styles.headerSubtitle}>{TEXT.subtitle}</Text>
            </View>
            <Image
              source={require('../../../assets/images/STAMPIX_LOGO.jpeg')}
              style={styles.headerLogo}
              resizeMode="contain"
              accessibilityLabel="Stampix logo"
            />
          </View>
        </View>

        {isLoading ? (
          <View style={styles.cardContainer}>
            <Text style={styles.infoText}>{TEXT.loading}</Text>
          </View>
        ) : null}

        {!isLoading && memberships.length === 0 ? (
          <View style={styles.cardContainer}>
            <Text style={styles.emptyTitle}>{TEXT.noCards}</Text>
            <Text style={styles.infoText}>{TEXT.noCardsHint}</Text>

            <Pressable
              onPress={() => router.push('/join')}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>{TEXT.joinByQr}</Text>
            </Pressable>

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
            ? memberships.map((membership) => {
                const current = Number(membership.currentStamps ?? 0);
                const goal = Math.max(
                  1,
                  Number(membership.maxStamps ?? 0) || 0
                );
                const dots = Math.min(goal, 20);
                const membershipId = String(membership.membershipId);
                const dotIds = Array.from(
                  { length: dots },
                  (_, index) => index + 1
                );

                return (
                  <Pressable
                    key={membershipId}
                    style={styles.cardContainer}
                    onPress={() => router.push(`/card/${membershipId}`)}
                  >
                    <View style={styles.cardTopRow}>
                      <Text style={styles.progressLabel}>
                        {current}/{goal}
                      </Text>

                      <View style={styles.cardTextColumn}>
                        <Text style={styles.cardTitle}>
                          {membership.businessName ?? TEXT.businessFallback}
                        </Text>
                        <Text style={styles.cardSubtitle}>
                          {TEXT.rewardPrefix}{' '}
                          {membership.rewardName ?? TEXT.rewardFallback}
                        </Text>
                      </View>

                      <View style={styles.imagePlaceholder}>
                        <Image
                          source={require('../../../assets/images/STAMPIX_LOGO.jpeg')}
                          style={styles.cardImage}
                          resizeMode="cover"
                          accessibilityLabel="Business logo"
                        />
                      </View>
                    </View>

                    <View style={styles.stampRow}>
                      {dotIds.map((dotId) => (
                        <View
                          key={`${membershipId}-dot-${dotId}`}
                          style={[
                            styles.stampDot,
                            dotId <= current
                              ? styles.stampDotActive
                              : styles.stampDotEmpty,
                          ]}
                        />
                      ))}
                      {goal > 20 ? (
                        <Text style={styles.moreText}>+{goal - 20}</Text>
                      ) : null}
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
    paddingBottom: 120,
  },
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  header: {
    paddingVertical: 8,
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E3E9FF',
  },
  walletBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-end',
    marginHorizontal: 12,
  },
  headerLabel: {
    fontSize: 11,
    textAlign: 'right',
    letterSpacing: 1.2,
    color: '#2F6BFF',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#5B6475',
    textAlign: 'right',
    fontWeight: '600',
  },
  cardList: {
    marginTop: 8,
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
  primaryButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#2F6BFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
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
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTextColumn: {
    flex: 1,
    gap: 2,
    marginHorizontal: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2F6BFF',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  imagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#E5EEFF',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'right',
  },
  stampRow: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    gap: 8,
    flexWrap: 'wrap',
  },
  stampDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  stampDotActive: {
    backgroundColor: '#2F6BFF',
    borderColor: '#2F6BFF',
  },
  stampDotEmpty: {
    borderColor: '#E5EAF5',
    backgroundColor: '#E9EEF9',
  },
  moreText: {
    fontSize: 11,
    color: '#5B6475',
    fontWeight: '700',
  },
});
