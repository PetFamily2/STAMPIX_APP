import { useConvexAuth, useQuery } from 'convex/react';
import { type Href, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LoyaltyCardClassic,
  LoyaltyCardClassicSkeleton,
} from '@/components/loyalty/LoyaltyCardClassic';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { PwaEmptyState } from '@/components/pwa-ui/PwaEmptyState';
import { AppText as Text } from '@/components/ui/AppText';
import { normalizeStampShape } from '@/constants/stampOptions';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { isVisibleWalletPreviewRedeemable } from '@/lib/customer/rewardReadyCta';
import {
  consumePendingJoin,
  savePendingJoin,
} from '@/lib/deeplink/pendingJoin';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  CUSTOMER_ROUTES,
  customerBusinessRoute,
  resolveWalletPreviewCardRoute,
} from '@/lib/navigation/customerRoutes';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

type WalletBusiness = {
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  joinedProgramCount: number;
  redeemableCount: number;
  previewMembershipId: string | null;
  previewProgramTitle: string | null;
  previewRewardName: string | null;
  previewProgramImageUrl: string | null;
  previewCardThemeId: string | null;
  previewMaxStamps: number | null;
  previewCurrentStamps: number | null;
  previewStampShape: string | null;
  previewStampIcon: string | null;
  previewProgramLifecycle: 'active' | 'archived';
};

export default function WalletWebScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { isAuthenticated } = useConvexAuth();
  const sessionContext = useSessionContext();
  const pendingJoinChecked = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || pendingJoinChecked.current) {
      return;
    }
    pendingJoinChecked.current = true;
    void (async () => {
      const pending = await consumePendingJoin();
      if (pending?.biz || pending?.ref || pending?.bref) {
        await savePendingJoin(pending);
        router.push({
          pathname: CUSTOMER_ROUTES.join,
          params: {
            biz: pending.biz,
            ref: pending.ref,
            bref: pending.bref,
            src: pending.src,
            camp: pending.camp,
          },
        });
      }
    })();
  }, [isAuthenticated]);

  const businessesQuery = useQuery(
    api.memberships.byCustomerBusinesses,
    isAuthenticated ? {} : 'skip'
  );
  const inbox = useQuery(
    api.campaigns.listInboxForCustomer,
    isAuthenticated ? {} : 'skip'
  );
  const businesses = (businessesQuery ?? []) as WalletBusiness[];
  const readyIds = new Set(
    businesses
      .filter((business) =>
        isVisibleWalletPreviewRedeemable({
          previewProgramLifecycle: business.previewProgramLifecycle,
          previewCurrentStamps: business.previewCurrentStamps,
          previewMaxStamps: business.previewMaxStamps,
          previewCardRoute: resolveWalletPreviewCardRoute(
            business.previewMembershipId
          ),
        })
      )
      .map((business) => String(business.businessId))
  );
  const ready = businesses.filter((business) =>
    readyIds.has(String(business.businessId))
  );
  const rest = businesses.filter(
    (business) => !readyIds.has(String(business.businessId))
  );
  const isLoading = isAuthenticated && businessesQuery === undefined;
  const pendingInvite = sessionContext?.pendingInvites?.[0] ?? null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        wide ? styles.pageWide : null,
        { paddingTop: insets.top + 12, paddingBottom: 96 },
      ]}
      style={styles.scroll}
    >
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>
        הארנק
      </Text>

      {pendingInvite ? (
        <PwaEmptyState
          action={
            <PwaButton
              label="לצפייה ואישור"
              onPress={() => router.push(CUSTOMER_ROUTES.acceptInvite)}
            />
          }
          body={`${pendingInvite.businessName} מזמין אתכם לצוות.`}
          title="יש הזמנה ממתינה"
        />
      ) : null}

      {isLoading ? <LoyaltyCardClassicSkeleton /> : null}

      {!isLoading && businesses.length === 0 ? (
        <PwaEmptyState
          action={
            <PwaButton
              label="הצטרפות עם QR"
              onPress={() => router.push(CUSTOMER_ROUTES.join)}
            />
          }
          body="כאן יופיעו הכרטיסיות אחרי ההצטרפות לעסק."
          title="הארנק עדיין ריק"
        />
      ) : null}

      {ready.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>מוכן למימוש</Text>
          <View style={[styles.grid, wide ? styles.gridWide : null]}>
            {ready.map((business) => (
              <CardBlock
                business={business}
                key={String(business.businessId)}
                ready={true}
                wide={wide}
              />
            ))}
          </View>
        </View>
      ) : null}

      {rest.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הכרטיסיות שלי</Text>
          <View style={[styles.grid, wide ? styles.gridWide : null]}>
            {rest.map((business) => (
              <CardBlock
                business={business}
                key={`all-${String(business.businessId)}`}
                wide={wide}
              />
            ))}
          </View>
        </View>
      ) : null}

      {inbox && inbox.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הודעות</Text>
          {inbox.slice(0, 3).map((item) => (
            <View key={String(item.messageId)} style={styles.message}>
              <Text style={styles.messageTitle}>{item.businessName}</Text>
              <Text style={styles.messageBody}>{item.title}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <PwaButton
        label="הזמנת חברים"
        onPress={() => router.push(CUSTOMER_ROUTES.referrals)}
        variant="quiet"
      />
    </ScrollView>
  );
}

function CardBlock({
  business,
  ready = false,
  wide,
}: {
  business: WalletBusiness;
  ready?: boolean;
  wide: boolean;
}) {
  const cardRoute = resolveWalletPreviewCardRoute(business.previewMembershipId);
  return (
    <View style={[styles.card, wide ? styles.cardWide : null]}>
      <LoyaltyCardClassic
        businessLogoUrl={business.businessLogoUrl}
        businessName={business.businessName || 'עסק'}
        cardThemeId={business.previewCardThemeId}
        lifecycle={business.previewProgramLifecycle}
        maxStamps={Math.max(1, Number(business.previewMaxStamps ?? 1))}
        onPress={cardRoute ? () => router.push(cardRoute as Href) : undefined}
        programTitle={business.previewProgramTitle ?? 'כרטיסייה'}
        progress={{
          kind: 'actual',
          currentStamps: Number(business.previewCurrentStamps ?? 0),
        }}
        rewardName={business.previewRewardName ?? 'הטבה'}
        stampIcon={business.previewStampIcon ?? 'star'}
        stampShape={normalizeStampShape(business.previewStampShape)}
        variant="wallet"
      />
      {ready && cardRoute ? (
        <PwaButton
          fullWidth={true}
          label="הצג למימוש"
          onPress={() => router.push(CUSTOMER_ROUTES.showQr as Href)}
        />
      ) : (
        <PwaButton
          fullWidth={true}
          accessibilityLabel={`לעמוד העסק: ${business.businessName || 'עסק'}`}
          label="לעמוד העסק"
          onPress={() =>
            router.push(
              customerBusinessRoute(String(business.businessId)) as Href
            )
          }
          variant="quiet"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: TOKENS.colors.pageBackground },
  page: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 20,
  },
  pageWide: { paddingHorizontal: 28 },
  title: {
    ...rtlBaseText,
    ...TOKENS.typography.pageTitle,
    color: TOKENS.colors.textPrimary,
  },
  section: { gap: 12 },
  sectionTitle: {
    ...rtlBaseText,
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
  },
  grid: { gap: 16 },
  gridWide: { flexDirection: flexDirection.row, flexWrap: 'wrap' },
  // A column's flex basis controls height; reserve it for the wide row grid.
  card: { minWidth: 0, gap: 8 },
  cardWide: { flexGrow: 1, flexBasis: 300 },
  message: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  messageTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  messageBody: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 14,
  },
});
