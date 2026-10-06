import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import LoyaltyCard from '@/components/loyalty/LoyaltyCard';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { ActionButton } from '@/components/ui/ActionButton';
import { PaintedPressable } from '@/components/ui/PaintedPressable';
import { normalizeStampShape } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Alert } from '@/lib/alert';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  shouldRedirectAwayFromOwnCustomerCard,
  shouldWaitForOwnCustomerCardOwnership,
} from '@/lib/customer/customerCardAccess';
import {
  hasUsableCustomerScanToken,
  shouldRefreshScanTokenForReveal,
} from '@/lib/customer/rewardReadyCta';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import { CUSTOMER_ROLE, useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { safeBack } from '@/lib/navigation';
import { CUSTOMER_BACK_FALLBACKS } from '@/lib/navigation/customerRoutes';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { flexDirection, selfStart } from '@/lib/rtl';
import { Share } from '@/lib/share';
import { shareUrl } from '@/lib/shareUrl';

const TEXT = {
  backToWallet: 'חזרה לארנק',
  qrCreateFailed: 'לא הצלחנו ליצור QR',
  missingDetails: 'חסרים פרטי כרטיס',
  cardNotFoundTitle: 'לא מצאנו את הכרטיס',
  cardNotFoundSubtitle: 'נסה לחזור למסך הארנק ולבחור כרטיס מהרשימה',
  cardDetails: 'פרטי כרטיס',
  personalQr: 'קוד QR לקוח',
  personalQrSubtitle: 'הראו את הקוד בקופה. העסק בוחר את התוכנית לפעולה.',
  personalQrRedeemSubtitle: 'הציגו את הקוד בקופה. בעסק מאשרים את המימוש.',
  qrExpired: 'תוקף ה-QR פג. רעננו קוד חדש.',
  qrLoading: 'טוען QR',
  refreshCta: 'רענון QR',
  loading: 'טוען',
  cardReadyTitle: 'ההטבה מוכנה למימוש',
  cardReadySubtitle: 'אפשר לממש עכשיו בקופה או בביקור הבא',
  redeemButtonReady: 'הצג למימוש',
  archivedTitle: 'הכרטיס בארכיון',
  archivedSubtitle: 'לא ניתן לצבור חותמות או לממש הטבה בכרטיסייה הזאת',
  archivedButton: 'הכרטיס אינו זמין',
  shareInviteButton: 'הזמן חבר',
  shareViaWhatsApp: 'שיתוף ב-WhatsApp',
  copyInviteLink: 'העתק קישור',
  shareInviteError: 'לא הצלחנו ליצור קישור הזמנה',
  inviteLinkCopied: 'קישור ההזמנה מוכן לשיתוף',
};
const CUSTOMER_ACTIVITY_TITLE = 'פעילות בכרטיס';
const CUSTOMER_ACTIVITY_EMPTY = 'עדיין אין פעילות בכרטיס הזה.';

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CardDetailsScreen() {
  const { membershipId, preview, map } = useLocalSearchParams<{
    membershipId: string;
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const insets = useSafeAreaInsets();
  const { user, isLoading, isAuthorized } = useRoleGuard([CUSTOMER_ROLE]);
  const memberships = useQuery(api.memberships.byCustomer) as
    | CustomerMembershipView[]
    | undefined;

  const membership = memberships?.find(
    (entry) => entry.membershipId === membershipId
  );

  const createCustomerScanToken = useMutation(
    api.scanner.createCustomerScanToken
  );
  const getOrCreateCustomerReferralLink = useMutation(
    api.referrals.getOrCreateCustomerReferralLink
  );
  const [scanTokenPayload, setScanTokenPayload] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [isShareInviteLoading, setIsShareInviteLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollContentRef = useRef<View>(null);
  const qrSectionRef = useRef<View>(null);
  const qrSectionOffsetY = useRef(0);
  const stickyHeaderHeightRef = useRef(0);

  const membershipIdForToken = membership?.membershipId;
  const membershipActivity = useQuery(
    api.memberships.getMembershipActivity,
    membershipIdForToken
      ? {
          membershipId: membershipIdForToken as Id<'memberships'>,
          limit: 20,
        }
      : 'skip'
  );

  const refreshScanToken = useCallback(async () => {
    if (!membershipIdForToken) {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(null);
      setIsTokenLoading(false);
      return;
    }

    setIsTokenLoading(true);
    setTokenError(null);
    try {
      const result = await createCustomerScanToken({});
      setScanTokenPayload(result.scanToken);
      setTokenExpiresAt(Number(result.expiresAt));
    } catch {
      const hasValidToken = hasUsableCustomerScanToken({
        scanTokenPayload,
        tokenExpiresAt,
        now: Date.now(),
      });
      if (!hasValidToken) {
        setScanTokenPayload(null);
        setTokenExpiresAt(null);
        setTokenError(TEXT.qrCreateFailed);
      }
    } finally {
      setIsTokenLoading(false);
    }
  }, [
    createCustomerScanToken,
    membershipIdForToken,
    scanTokenPayload,
    tokenExpiresAt,
  ]);

  useEffect(() => {
    if (!membershipIdForToken || scanTokenPayload || tokenError) {
      return;
    }
    void refreshScanToken();
  }, [membershipIdForToken, refreshScanToken, scanTokenPayload, tokenError]);

  useEffect(() => {
    if (!scanTokenPayload || !tokenExpiresAt) {
      return;
    }
    const expiryDelayMs = tokenExpiresAt - Date.now();
    if (expiryDelayMs <= 0) {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(TEXT.qrExpired);
      return;
    }
    const timer = setTimeout(() => {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(TEXT.qrExpired);
    }, expiryDelayMs + 150);
    return () => {
      clearTimeout(timer);
    };
  }, [scanTokenPayload, tokenExpiresAt]);

  // Track QR presented event when scan token is ready
  useEffect(() => {
    if (scanTokenPayload && membershipId) {
      track(ANALYTICS_EVENTS.qrPresentedCustomer, {
        sourceScreen: 'card_detail',
        membershipId,
      });
    }
  }, [scanTokenPayload, membershipId]);

  const scrollQrIntoView = useCallback(() => {
    const scrollToMeasuredY = (y: number) => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - stickyHeaderHeightRef.current),
        animated: true,
      });
    };
    const target = qrSectionRef.current;
    const relativeNode = findNodeHandle(scrollContentRef.current);
    if (target && relativeNode != null) {
      target.measureLayout(
        relativeNode,
        (_x, y) => {
          scrollToMeasuredY(y);
        },
        () => {
          scrollToMeasuredY(qrSectionOffsetY.current);
        }
      );
      return;
    }
    scrollToMeasuredY(qrSectionOffsetY.current);
  }, []);

  const revealQrForRedemption = useCallback(() => {
    scrollQrIntoView();
    if (
      shouldRefreshScanTokenForReveal({
        scanTokenPayload,
        tokenExpiresAt,
        isTokenLoading,
        now: Date.now(),
      })
    ) {
      void refreshScanToken();
    }
  }, [
    isTokenLoading,
    refreshScanToken,
    scanTokenPayload,
    scrollQrIntoView,
    tokenExpiresAt,
  ]);

  const membershipOwnershipResolved = memberships !== undefined;
  const membershipBelongsToCurrentUser =
    memberships?.some((entry) => entry.membershipId === membershipId) === true;
  const customerCardAccess = {
    isPreviewMode,
    hasAuthenticatedUser: Boolean(user),
    derivedRoleIsCustomer: isAuthorized,
    membershipOwnershipResolved,
  };

  if (
    isLoading ||
    !membershipOwnershipResolved ||
    shouldWaitForOwnCustomerCardOwnership(customerCardAccess)
  ) {
    return <FullScreenLoading />;
  }

  if (!user && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  if (
    shouldRedirectAwayFromOwnCustomerCard({
      ...customerCardAccess,
      membershipBelongsToCurrentUser,
    })
  ) {
    return <Redirect href={CUSTOMER_BACK_FALLBACKS.cardDetail} />;
  }

  if (!membershipId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <Text style={styles.centerMessageText}>{TEXT.missingDetails}</Text>
          <PaintedPressable
            accessibilityRole="button"
            onPress={() => safeBack(CUSTOMER_BACK_FALLBACKS.cardDetail)}
            style={({ pressed }) => [
              styles.centerMessageAction,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.centerMessageActionText}>
              {TEXT.backToWallet}
            </Text>
          </PaintedPressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!membership) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <Text style={styles.centerMessageTitle}>
            {TEXT.cardNotFoundTitle}
          </Text>
          <Text style={styles.centerMessageText}>
            {TEXT.cardNotFoundSubtitle}
          </Text>
          <PaintedPressable
            accessibilityRole="button"
            onPress={() => safeBack(CUSTOMER_BACK_FALLBACKS.cardDetail)}
            style={({ pressed }) => [
              styles.centerMessageAction,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.centerMessageActionText}>
              {TEXT.backToWallet}
            </Text>
          </PaintedPressable>
        </View>
      </SafeAreaView>
    );
  }

  const current = Number(membership.currentStamps ?? 0);
  const goal = Math.max(1, Number(membership.maxStamps ?? 0) || 0);
  const isArchived = membership.programLifecycle === 'archived';
  const isRedeemEligible =
    !isArchived && Boolean(membership.canRedeem || current >= goal);

  const formatActivityMessage = (item: {
    actionType: string;
    businessName: string;
    programName: string;
  }) => {
    if (item.actionType === 'stamp_reverted') {
      return `בוצע תיקון בכרטיסייה שלך בעסק ${item.businessName} - חותמת בוטלה`;
    }
    if (item.actionType === 'reward_redeem_reverted') {
      return `בוצע תיקון בכרטיס שלך בעסק ${item.businessName} - מימוש בוטל`;
    }
    if (item.actionType === 'reward_redeemed') {
      return `מומשה הטבה בכרטיס ${item.programName}`;
    }
    return `נוספה חותמת בכרטיסייה ${item.programName}`;
  };

  const buildInviteMessage = (url: string) =>
    `הצטרפו אליי ל-${membership.businessName} ב-StampAix וקבלו הטבת היכרות אחרי החותמת הראשונה.\n${url}`;

  const handleShareInviteViaWhatsApp = async () => {
    if (isShareInviteLoading) {
      return;
    }
    try {
      setIsShareInviteLoading(true);
      const link = await getOrCreateCustomerReferralLink({
        businessId: membership.businessId as Id<'businesses'>,
        originProgramId: membership.programId as Id<'loyaltyPrograms'>,
        membershipId: membership.membershipId as Id<'memberships'>,
        shareSurface: 'card_screen',
      });
      const message = buildInviteMessage(shareUrl(link.url));
      const whatsappUrl = `${Platform.OS === 'web' ? 'https://wa.me/' : 'whatsapp://send'}?text=${encodeURIComponent(message)}`;
      const canOpenWhatsApp = await Linking.canOpenURL(whatsappUrl);
      if (canOpenWhatsApp) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      Alert.alert('שגיאה', TEXT.shareInviteError);
    } finally {
      setIsShareInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (isShareInviteLoading) {
      return;
    }
    try {
      setIsShareInviteLoading(true);
      const link = await getOrCreateCustomerReferralLink({
        businessId: membership.businessId as Id<'businesses'>,
        originProgramId: membership.programId as Id<'loyaltyPrograms'>,
        membershipId: membership.membershipId as Id<'memberships'>,
        shareSurface: 'card_screen',
      });

      const maybeNavigator = globalThis as {
        navigator?: {
          clipboard?: { writeText?: (value: string) => Promise<void> };
        };
      };
      if (maybeNavigator.navigator?.clipboard?.writeText) {
        await maybeNavigator.navigator.clipboard.writeText(shareUrl(link.url));
      } else {
        await Share.share({ message: shareUrl(link.url) });
        return;
      }
      Alert.alert('', TEXT.inviteLinkCopied);
    } catch {
      Alert.alert('שגיאה', TEXT.shareInviteError);
    } finally {
      setIsShareInviteLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        ref={scrollRef}
        innerViewRef={scrollContentRef as RefObject<View>}
        stickyHeaderIndices={[0]}
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingBottom: (insets.bottom || 0) + 96,
          },
        ]}
      >
        <View
          onLayout={(event) => {
            stickyHeaderHeightRef.current = event.nativeEvent.layout.height;
          }}
        >
          <StickyScrollHeader
            topPadding={(insets.top || 0) + 12}
            backgroundColor="#E9F0FF"
          >
            <View style={styles.headerRow}>
              <BusinessScreenHeader
                title={TEXT.cardDetails}
                subtitle={`${membership.businessName} \u00b7 ${membership.rewardName}`}
                titleAccessory={
                  <BackButton
                    onPress={() => safeBack(CUSTOMER_BACK_FALLBACKS.cardDetail)}
                  />
                }
              />
            </View>
          </StickyScrollHeader>
        </View>

        <View style={styles.loyaltyCardSection}>
          <LoyaltyCard
            variant="full"
            businessName={membership.businessName}
            businessLogoUrl={membership.businessLogoUrl}
            programImageUrl={membership.programImageUrl}
            programTitle={membership.programTitle}
            rewardName={membership.rewardName}
            maxStamps={goal}
            progress={{ kind: 'actual', currentStamps: current }}
            lifecycle={membership.programLifecycle}
            cardThemeId={membership.cardThemeId}
            stampIcon={membership.stampIcon}
            stampShape={normalizeStampShape(membership.stampShape)}
          />

          {isRedeemEligible || isArchived ? (
            <View
              style={[
                styles.redeemPanel,
                isRedeemEligible
                  ? styles.redeemPanelReady
                  : styles.redeemPanelPending,
              ]}
            >
              <Text
                style={[
                  styles.redeemTitle,
                  isRedeemEligible
                    ? styles.redeemTitleReady
                    : styles.redeemTitlePending,
                ]}
              >
                {isArchived ? TEXT.archivedTitle : TEXT.cardReadyTitle}
              </Text>
              <Text
                style={[
                  styles.redeemSubtitle,
                  isRedeemEligible
                    ? styles.redeemSubtitleReady
                    : styles.redeemSubtitlePending,
                ]}
              >
                {isArchived ? TEXT.archivedSubtitle : TEXT.cardReadySubtitle}
              </Text>
              <ActionButton
                label={
                  isArchived ? TEXT.archivedButton : TEXT.redeemButtonReady
                }
                onPress={revealQrForRedemption}
                disabled={!isRedeemEligible}
                fullWidth={true}
                accessibilityLabel={
                  isArchived ? TEXT.archivedButton : TEXT.redeemButtonReady
                }
                style={styles.redeemAction}
              />
            </View>
          ) : null}

          <View style={styles.inviteRow}>
            <PaintedPressable
              onPress={() => void handleShareInviteViaWhatsApp()}
              disabled={isShareInviteLoading}
              style={({ pressed }) => [
                styles.invitePrimaryButton,
                pressed ? styles.inviteButtonPressed : null,
                isShareInviteLoading ? styles.inviteButtonDisabled : null,
              ]}
            >
              <Text style={styles.invitePrimaryButtonText}>
                {isShareInviteLoading ? TEXT.loading : TEXT.shareViaWhatsApp}
              </Text>
            </PaintedPressable>
            <PaintedPressable
              onPress={() => void handleCopyInviteLink()}
              disabled={isShareInviteLoading}
              style={({ pressed }) => [
                styles.inviteSecondaryButton,
                pressed ? styles.inviteButtonPressed : null,
                isShareInviteLoading ? styles.inviteButtonDisabled : null,
              ]}
            >
              <Text style={styles.inviteSecondaryButtonText}>
                {TEXT.copyInviteLink}
              </Text>
            </PaintedPressable>
          </View>
        </View>

        <View
          ref={qrSectionRef}
          collapsable={false}
          onLayout={(event) => {
            qrSectionOffsetY.current = event.nativeEvent.layout.y;
          }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>{TEXT.personalQr}</Text>
          <Text style={styles.cardSubtitle}>
            {isRedeemEligible
              ? TEXT.personalQrRedeemSubtitle
              : TEXT.personalQrSubtitle}
          </Text>
          <View style={styles.qrFrame}>
            {scanTokenPayload ? (
              <QRCode
                value={scanTokenPayload}
                size={200}
                color="#1A2B4A"
                backgroundColor="#FFFFFF"
              />
            ) : (
              <View style={styles.qrPlaceholder}>
                {isTokenLoading ? <ActivityIndicator color="#2F6BFF" /> : null}
                <Text style={styles.qrPlaceholderText}>
                  {tokenError ? tokenError : TEXT.qrLoading}
                </Text>
              </View>
            )}
          </View>
          <PaintedPressable
            onPress={() => void refreshScanToken()}
            disabled={isTokenLoading || !membershipIdForToken}
            style={({ pressed }) => [
              styles.refreshButton,
              isTokenLoading || !membershipIdForToken
                ? styles.refreshButtonDisabled
                : null,
              pressed ? styles.refreshButtonPressed : null,
            ]}
          >
            <Text style={styles.refreshButtonText}>
              {isTokenLoading ? TEXT.qrLoading : TEXT.refreshCta}
            </Text>
          </PaintedPressable>

          {tokenError ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{tokenError}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{CUSTOMER_ACTIVITY_TITLE}</Text>
          {membershipActivity === undefined ? (
            <View style={styles.activityLoadingRow}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : membershipActivity.length === 0 ? (
            <Text style={styles.activityEmptyText}>
              {CUSTOMER_ACTIVITY_EMPTY}
            </Text>
          ) : (
            <View style={styles.activityList}>
              {membershipActivity.map((item) => (
                <View key={String(item.id)} style={styles.activityItem}>
                  <Text style={styles.activityMessage}>
                    {formatActivityMessage(item)}
                  </Text>
                  <Text style={styles.activityMeta}>
                    {item.programName} • {formatDateTime(item.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
  card: {
    borderRadius: 22,
    paddingBottom: 4,
  },
  loyaltyCardSection: {
    width: '100%',
    alignItems: 'center',
  },
  redeemAction: {
    marginTop: 2,
    width: '100%',
  },
  redeemPanel: {
    width: '100%',
    maxWidth: 600,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  redeemPanelReady: {
    backgroundColor: '#EAFBF1',
    borderColor: '#9EDDB9',
  },
  redeemPanelPending: {
    backgroundColor: '#F5F8FF',
    borderColor: '#DCE6FF',
  },
  redeemTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  redeemTitleReady: {
    color: '#0D7A3E',
  },
  redeemTitlePending: {
    color: '#1A2B4A',
  },
  redeemSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'right',
  },
  redeemSubtitleReady: {
    color: '#215E3E',
  },
  redeemSubtitlePending: {
    color: '#5B6475',
  },
  inviteRow: {
    width: '100%',
    maxWidth: 600,
    marginTop: 4,
    flexDirection: flexDirection.row,
    gap: 8,
  },
  invitePrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitePrimaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  inviteSecondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D5DEEE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteSecondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  inviteButtonPressed: {
    opacity: 0.86,
  },
  inviteButtonDisabled: {
    opacity: 0.65,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  qrFrame: {
    marginTop: 12,
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrPlaceholderText: {
    width: '100%',
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'right',
  },
  refreshButton: {
    marginTop: 10,
    alignSelf: selfStart,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshButtonPressed: {
    opacity: 0.9,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  activityLoadingRow: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityEmptyText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  activityList: {
    marginTop: 10,
    gap: 8,
  },
  activityItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E3E9FA',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  activityMessage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14253E',
    textAlign: 'right',
  },
  activityMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  errorRow: {
    marginTop: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D92D20',
    textAlign: 'right',
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerMessageTitle: {
    width: '100%',
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  centerMessageText: {
    width: '100%',
    fontSize: 13,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  centerMessageAction: {
    width: '100%',
    maxWidth: 320,
    marginTop: 8,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerMessageActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
});
