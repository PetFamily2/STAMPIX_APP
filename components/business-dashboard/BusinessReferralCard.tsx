import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

function formatMonthsLabel(value: number) {
  return value === 1
    ? '\u05d7\u05d5\u05d3\u05e9 \u05d0\u05d7\u05d3'
    : `${value} \u05d7\u05d5\u05d3\u05e9\u05d9\u05dd`;
}

function buildStatusLine(
  pendingInvitesCount: number,
  activeReferralsCount: number
) {
  const parts: string[] = [];

  if (pendingInvitesCount > 0) {
    parts.push(
      pendingInvitesCount === 1
        ? '\u05d4\u05d6\u05de\u05e0\u05d4 \u05d0\u05d7\u05ea \u05de\u05de\u05ea\u05d9\u05e0\u05d4'
        : `${pendingInvitesCount} \u05d4\u05d6\u05de\u05e0\u05d5\u05ea \u05de\u05de\u05ea\u05d9\u05e0\u05d5\u05ea`
    );
  }

  if (activeReferralsCount > 0) {
    parts.push(
      activeReferralsCount === 1
        ? '\u05e2\u05e1\u05e7 \u05e4\u05e2\u05d9\u05dc \u05d0\u05d7\u05d3'
        : `${activeReferralsCount} \u05e2\u05e1\u05e7\u05d9\u05dd \u05e4\u05e2\u05d9\u05dc\u05d9\u05dd`
    );
  }

  return parts.join(' \u2022 ');
}

export function BusinessReferralCard({
  layoutMode,
  totalFreeMonthsEarned,
  pendingInvitesCount = 0,
  activeReferralsCount = 0,
  isShareLoading = false,
  shareDisabled = false,
  onPressShare,
}: {
  layoutMode: DashboardLayoutMode;
  totalFreeMonthsEarned: number;
  pendingInvitesCount?: number;
  activeReferralsCount?: number;
  isShareLoading?: boolean;
  shareDisabled?: boolean;
  onPressShare: () => void;
}) {
  const layout = getDashboardLayout(layoutMode);
  const [isHowItWorksVisible, setIsHowItWorksVisible] = useState(false);
  const ctaScale = useRef(new Animated.Value(1)).current;
  const earnedMonths = Math.max(0, Math.min(24, totalFreeMonthsEarned));
  const isMaxReached = earnedMonths >= 24;
  const hasEarnedRewards = earnedMonths > 0;
  const statusLine = useMemo(
    () => buildStatusLine(pendingInvitesCount, activeReferralsCount),
    [activeReferralsCount, pendingInvitesCount]
  );

  const helperText = isMaxReached
    ? '\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05e7\u05e1\u05d9\u05de\u05d5\u05dd \u05d4\u05e6\u05d1\u05d9\u05e8\u05d4'
    : statusLine ||
      (pendingInvitesCount === 0 && activeReferralsCount === 0
        ? '\u05e9\u05dc\u05d7\u05d5 \u05d4\u05d6\u05de\u05e0\u05d4 \u05e8\u05d0\u05e9\u05d5\u05e0\u05d4 \u05d5\u05e7\u05d1\u05dc\u05d5 \u05d7\u05d5\u05d3\u05e9 \u05de\u05ea\u05e0\u05d4 \u05d0\u05d7\u05e8\u05d9 \u05e9\u05d4\u05e2\u05e1\u05e7 \u05d9\u05e6\u05d8\u05e8\u05e3.'
        : '');

  useEffect(() => {
    if (shareDisabled || isShareLoading) {
      ctaScale.stopAnimation();
      ctaScale.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaScale, {
          toValue: 1.08,
          duration: 620,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ctaScale, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => {
      pulse.stop();
      ctaScale.stopAnimation();
      ctaScale.setValue(1);
    };
  }, [ctaScale, isShareLoading, shareDisabled]);

  return (
    <>
      <View style={[styles.card, { borderRadius: layout.cardRadius }]}>
        <View style={styles.textBlock}>
          <View style={styles.topRow}>
            <Text className={tw.textStart} style={styles.title}>
              {'\u{1F4BC} \u05de\u05db\u05d9\u05e8\u05d9\u05dd \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7?'}
            </Text>

            <Pressable
              onPress={onPressShare}
              disabled={shareDisabled || isShareLoading}
              style={styles.primaryButtonTouchable}
            >
              <Animated.View
                style={[
                  styles.primaryButtonSurface,
                  shareDisabled || isShareLoading
                    ? styles.primaryButtonSurfaceDisabled
                    : null,
                  { transform: [{ scale: ctaScale }] },
                ]}
              >
                {isShareLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <View style={styles.primaryButtonIconWrap}>
                      <Ionicons
                        name="share-social-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                    </View>
                    <Text style={styles.primaryButtonText}>
                      {'\u05e9\u05ea\u05e3 \u05d4\u05d6\u05de\u05e0\u05d4'}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </Pressable>
          </View>

          <Text className={tw.textStart} style={styles.description}>
            {'\u05d4\u05d6\u05de\u05d9\u05e0\u05d5 \u05d0\u05d5\u05ea\u05d5 \u05dc-StampAix \u05d5\u05e7\u05d1\u05dc\u05d5 \u05d7\u05d5\u05d3\u05e9\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9 \u05d1\u05de\u05ea\u05e0\u05d4 \u05d0\u05d7\u05e8\u05d9 \u05e9\u05d9\u05e6\u05d8\u05e8\u05e3 \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05d1\u05ea\u05e9\u05dc\u05d5\u05dd.'}
          </Text>
          <Text className={tw.textStart} style={styles.progressText}>
            {`\u05e2\u05d3 \u05db\u05d4 \u05d4\u05e8\u05d5\u05d5\u05d7\u05ea\u05dd: ${formatMonthsLabel(earnedMonths)}${
              hasEarnedRewards ? ' \u{1F389}' : ''
            }`}
          </Text>
          {helperText ? (
            <Text className={tw.textStart} style={styles.helperText}>
              {helperText}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => setIsHowItWorksVisible(true)}
          style={styles.secondaryLink}
        >
          <Text className={tw.textStart} style={styles.secondaryLinkText}>
            {'\u05d0\u05d9\u05da \u05d6\u05d4 \u05e2\u05d5\u05d1\u05d3?'}
          </Text>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isHowItWorksVisible}
        onRequestClose={() => setIsHowItWorksVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsHowItWorksVisible(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text className={tw.textStart} style={styles.sheetTitle}>
              {'\u05d0\u05d9\u05da \u05d6\u05d4 \u05e2\u05d5\u05d1\u05d3?'}
            </Text>

            <View style={styles.stepList}>
              <Text className={tw.textStart} style={styles.stepText}>
                {'1. \u05e9\u05ea\u05e4\u05d5 \u05d0\u05ea \u05d4\u05e7\u05d9\u05e9\u05d5\u05e8 \u05e2\u05dd \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7'}
              </Text>
              <Text className={tw.textStart} style={styles.stepText}>
                {'2. \u05d4\u05e2\u05e1\u05e7 \u05e0\u05e8\u05e9\u05dd \u05dc-StampAix'}
              </Text>
              <Text className={tw.textStart} style={styles.stepText}>
                {'3. \u05d0\u05d7\u05e8\u05d9 30 \u05d9\u05d5\u05dd \u05de\u05e0\u05d5\u05d9 \u05e4\u05e2\u05d9\u05dc \u05ea\u05e7\u05d1\u05dc\u05d5 \u05ea\u05d2\u05de\u05d5\u05dc'}
              </Text>
            </View>

            <View style={styles.rewardsBox}>
              <Text className={tw.textStart} style={styles.rewardsTitle}>
                {'\u05ea\u05d2\u05de\u05d5\u05dc'}
              </Text>
              <Text className={tw.textStart} style={styles.rewardsText}>
                {'\u05de\u05e0\u05d5\u05d9 \u05d7\u05d5\u05d3\u05e9\u05d9 \u2192 \u05d7\u05d5\u05d3\u05e9 \u05d7\u05d9\u05e0\u05dd'}
              </Text>
              <Text className={tw.textStart} style={styles.rewardsText}>
                {'\u05de\u05e0\u05d5\u05d9 \u05e9\u05e0\u05ea\u05d9 \u2192 2 \u05d7\u05d5\u05d3\u05e9\u05d9\u05dd \u05d7\u05d9\u05e0\u05dd'}
              </Text>
              <Text className={tw.textStart} style={styles.limitText}>
                {'\u05d0\u05e4\u05e9\u05e8 \u05dc\u05e6\u05d1\u05d5\u05e8 \u05e2\u05d3 24 \u05d7\u05d5\u05d3\u05e9\u05d9\u05dd.'}
              </Text>
            </View>

            <Pressable
              onPress={() => setIsHowItWorksVisible(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>
                {'\u05e1\u05d2\u05d5\u05e8'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: DASHBOARD_TOKENS.colors.border,
    overflow: 'visible',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  textBlock: {
    gap: 6,
    alignItems: 'stretch',
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  progressText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
    fontVariant: ['tabular-nums'],
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  primaryButtonTouchable: {
    alignSelf: 'auto',
    width: 'auto',
    marginRight: 0,
    marginLeft: 12,
  },
  primaryButtonSurface: {
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryButtonSurfaceDisabled: {
    backgroundColor: '#93C5FD',
  },
  primaryButtonContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  primaryButtonIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  primaryButtonText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryLink: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
  secondaryLinkText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.brandBlue,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stepList: {
    gap: 8,
  },
  stepText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rewardsBox: {
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  rewardsTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rewardsText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  limitText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  closeButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
  },
  closeButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.brandBlue,
  },
});
