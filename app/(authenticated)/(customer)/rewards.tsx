import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';

const TEXT = {
  title: '\u05d4\u05d8\u05d1\u05d5\u05ea',
  subtitle:
    '\u05db\u05d0\u05df \u05ea\u05e8\u05d0\u05d5 \u05d4\u05d8\u05d1\u05d5\u05ea \u05d6\u05de\u05d9\u05e0\u05d5\u05ea \u05dc\u05de\u05d9\u05de\u05d5\u05e9',
  emptyTitle:
    '\u05e2\u05d3\u05d9\u05d9\u05df \u05d0\u05d9\u05df \u05d4\u05d8\u05d1\u05d5\u05ea \u05d6\u05de\u05d9\u05e0\u05d5\u05ea',
  emptySubtitle:
    '\u05db\u05e9\u05ea\u05e9\u05dc\u05d9\u05de\u05d5 \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d4 \u05d5\u05ea\u05d2\u05d9\u05e2\u05d5 \u05dc\u05d9\u05e2\u05d3, \u05d4\u05d4\u05d8\u05d1\u05d4 \u05ea\u05d5\u05e4\u05d9\u05e2 \u05db\u05d0\u05df \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea.',
};

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  // Demo placeholder until rewards are loaded from Convex.
  const rewards: Array<{ id: string; title: string; subtitle: string }> = [];

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <BusinessScreenHeader title={TEXT.title} subtitle={TEXT.subtitle} />
        </View>

        {rewards.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{TEXT.emptySubtitle}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  emptyCard: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E9FF',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'right',
  },
});
