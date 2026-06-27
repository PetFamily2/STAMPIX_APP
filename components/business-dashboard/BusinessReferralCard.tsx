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
import {
  alignItems,
  flexDirection,
  justifyContent,
  rtlBaseView,
  tw,
} from '@/lib/rtl';

function formatMonthsLabel(value: number) {
  return value === 1 ? 'חודש אחד' : `${value} חודשים`;
}

function buildStatusLine(
  pendingInvitesCount: number,
  activeReferralsCount: number
) {
  const parts: string[] = [];

  if (pendingInvitesCount > 0) {
    parts.push(
      pendingInvitesCount === 1
        ? 'הזמנה אחת ממתינה'
        : `${pendingInvitesCount} הזמנות ממתינות`
    );
  }

  if (activeReferralsCount > 0) {
    parts.push(
      activeReferralsCount === 1
        ? 'עסק פעיל אחד'
        : `${activeReferralsCount} עסקים פעילים`
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
    ? 'הגעתם למקסימום הצבירה'
    : statusLine ||
      (pendingInvitesCount === 0 && activeReferralsCount === 0
        ? 'שלחו הזמנה ראשונה וקבלו חודש מתנה אחרי שהעסק יצטרף.'
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
            <View style={styles.titleRow}>
              <Text style={styles.titleEmoji}>{'\u{1F4BC}'}</Text>
              <Text className={tw.textStart} style={styles.title}>
                {'מכירים בעל עסק?'}
              </Text>
            </View>
          </View>

          <Text className={tw.textStart} style={styles.description}>
            {
              'הזמינו אותו ל-\u200EStampAix\u200E וקבלו חודשי שימוש במתנה אחרי שיצטרף למסלול בתשלום.'
            }
          </Text>
          <View style={styles.ctaRow}>
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
                    <Text style={styles.primaryButtonText}>{'שתף הזמנה'}</Text>
                  </View>
                )}
              </Animated.View>
            </Pressable>
          </View>
          <Text className={tw.textStart} style={styles.progressText}>
            {`עד כה הרווחתם: ${formatMonthsLabel(earnedMonths)}${
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
            {'איך זה עובד?'}
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
              {'איך זה עובד?'}
            </Text>

            <View style={styles.stepList}>
              <Text className={tw.textStart} style={styles.stepText}>
                {'1. שתפו את הקישור עם בעל עסק'}
              </Text>
              <Text className={tw.textStart} style={styles.stepText}>
                {'2. העסק נרשם ל-\u200EStampAix\u200E'}
              </Text>
              <Text className={tw.textStart} style={styles.stepText}>
                {'3. אחרי 30 יום מנוי פעיל תקבלו תגמול'}
              </Text>
            </View>

            <View style={styles.rewardsBox}>
              <Text className={tw.textStart} style={styles.rewardsTitle}>
                {'תגמול'}
              </Text>
              <Text className={tw.textStart} style={styles.rewardsText}>
                {'מנוי חודשי \u200E\u2192\u200E חודש חינם'}
              </Text>
              <Text className={tw.textStart} style={styles.rewardsText}>
                {'מנוי שנתי \u200E\u2192\u200E 2 חודשים חינם'}
              </Text>
              <Text className={tw.textStart} style={styles.limitText}>
                {'אפשר לצבור עד 24 חודשים.'}
              </Text>
            </View>

            <Pressable
              onPress={() => setIsHowItWorksVisible(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>{'סגור'}</Text>
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
    ...rtlBaseView,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  textBlock: {
    gap: 6,
    alignItems: 'stretch',
  },
  topRow: {
    alignItems: alignItems.start,
    gap: 2,
    ...rtlBaseView,
  },
  titleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    ...rtlBaseView,
  },
  titleEmoji: {
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'right',
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
  ctaRow: {
    alignItems: alignItems.start,
    marginTop: 2,
  },
  primaryButtonTouchable: {
    alignSelf: 'flex-start',
    width: 'auto',
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
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...rtlBaseView,
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
    textAlign: 'right',
    writingDirection: 'rtl',
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
    justifyContent: justifyContent.end,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
    ...rtlBaseView,
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
