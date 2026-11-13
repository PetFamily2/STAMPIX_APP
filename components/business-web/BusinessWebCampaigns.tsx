import { useMutation, useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { PwaEmptyState } from '@/components/pwa-ui/PwaEmptyState';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveCampaignManagementVisualMeta } from '@/lib/campaigns/managementPresentation';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

type Filter = 'active' | 'inactive' | 'archived';
const FILTERS = [
  ['active', 'פעילים'],
  ['inactive', 'טיוטות ולא פעילים'],
  ['archived', 'בארכיון'],
] as const;

export function BusinessWebCampaigns({
  businessId,
}: {
  businessId: Id<'businesses'>;
}) {
  const router = useRouter();
  const { activeBusiness } = useActiveBusiness();
  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities,
        activeBusiness.staffRole
      )
    : null;
  const canView = capabilities?.access_campaigns === true;
  const campaigns = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
    canView ? { businessId } : 'skip'
  );
  const referrals = useQuery(
    api.referrals.getReferralConfig,
    capabilities?.view_settings ? { businessId } : 'skip'
  );
  const { limitStatus, isLoading } = useEntitlements(
    capabilities?.view_usage_quota ? businessId : null
  );
  const restore = useMutation(api.campaigns.restoreManagementCampaign);
  const [filter, setFilter] = useState<Filter>('active');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const rows = campaigns ?? [];
  const hasReferral = (referrals?.configVersion ?? 0) > 0;
  const referralLifecycle = referrals?.isEnabled ? 'active' : 'inactive';
  const visibleRows = rows.filter((row) => row.lifecycle === filter);
  const quota = limitStatus('maxCampaigns');

  const restoreCampaign = async (campaignId: Id<'campaigns'>) => {
    if (busy || !capabilities?.edit_campaigns) {
      return;
    }
    setBusy(String(campaignId));
    setError('');
    try {
      await restore({ businessId, campaignId });
    } catch (cause) {
      const entitlement = getEntitlementError(cause);
      setError(
        entitlement
          ? entitlementErrorToHebrewMessage(entitlement)
          : 'לא הצלחנו לשחזר את הקמפיין. נסו שוב.'
      );
    } finally {
      setBusy(null);
    }
  };

  if (!canView) {
    return (
      <PwaEmptyState
        title="אין הרשאה לצפייה בקמפיינים"
        body="אפשר לפנות לבעל העסק לעדכון ההרשאה."
      />
    );
  }

  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>
        קמפיינים
      </Text>
      <Text style={styles.body}>
        הודעות והטבות שמחזירות את הלקוחות לביקור הבא.
      </Text>
      <View style={styles.actions}>
        {capabilities?.create_campaigns ? (
          <PwaButton
            label="קמפיין חדש"
            onPress={() => router.push('/business/campaign/new' as Href)}
          />
        ) : null}
        {capabilities?.view_settings ? (
          <PwaButton
            label="חבר מביא חבר"
            variant="secondary"
            onPress={() => router.push('/business/customer-referrals')}
          />
        ) : null}
      </View>
      {capabilities?.view_usage_quota && !isLoading ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            קמפיינים פעילים: {quota.currentValue} מתוך {quota.limitValue}
          </Text>
          <Text style={styles.body}>
            טיוטות נשמרות ללא שליחה. המכסה נבדקת בעת הפעלת קמפיין.
          </Text>
        </View>
      ) : null}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="סינון קמפיינים"
        style={styles.tabs}
      >
        {FILTERS.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: key === filter }}
            onPress={() => setFilter(key)}
            style={[styles.tab, key === filter && styles.tabSelected]}
          >
            <Text
              style={[styles.tabText, key === filter && styles.tabTextSelected]}
            >
              {label} (
              {rows.filter((row) => row.lifecycle === key).length +
                (hasReferral && referralLifecycle === key ? 1 : 0)}
              )
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {error && capabilities?.manage_subscription ? (
        <PwaButton
          label="לבדיקת המנוי והמכסה"
          variant="secondary"
          onPress={() => router.push('/business/billing')}
        />
      ) : null}
      {campaigns === undefined ? (
        <Text style={styles.body}>טוענים קמפיינים…</Text>
      ) : (
        <View style={styles.list}>
          {hasReferral && referralLifecycle === filter ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="פתיחת חבר מביא חבר"
              style={[styles.card, filter === 'active' && styles.activeCard]}
              onPress={() => router.push('/business/customer-referrals')}
            >
              <Text style={styles.cardTitle}>חבר מביא חבר</Text>
              <Text style={styles.body}>הטבה ללקוחות שמזמינים חברים לעסק</Text>
              <Text style={filter === 'active' ? styles.live : styles.body}>
                {filter === 'active' ? 'פעיל' : 'לא פעיל'}
              </Text>
            </Pressable>
          ) : null}
          {visibleRows.map((campaign) => (
            <View
              key={String(campaign.campaignId)}
              style={[styles.card, filter === 'active' && styles.activeCard]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`פתיחת הקמפיין ${campaign.title}`}
                onPress={() =>
                  router.push({
                    pathname: '/business/campaign/[campaignId]',
                    params: {
                      campaignId: String(campaign.campaignId),
                      businessId: String(businessId),
                    },
                  } as Href)
                }
              >
                <Text style={styles.cardTitle}>
                  {campaign.title ||
                    resolveCampaignManagementVisualMeta(campaign.type).label}
                </Text>
                <Text style={styles.body}>
                  {resolveCampaignManagementVisualMeta(campaign.type).label}
                </Text>
                <Text style={styles.body}>
                  {campaign.scheduleMode === 'one_time' &&
                  campaign.scheduledForAt
                    ? `מתוזמן ל־${new Date(campaign.scheduledForAt).toLocaleString('he-IL')}`
                    : campaign.automationEnabled
                      ? 'שליחה אוטומטית'
                      : campaign.lastSentAt
                        ? `שליחה אחרונה: ${new Date(campaign.lastSentAt).toLocaleString('he-IL')}`
                        : 'טרם נשלח'}
                </Text>
                <Text style={styles.body}>
                  קהל מוערך: {campaign.estimatedAudience}
                </Text>
                <Text style={filter === 'active' ? styles.live : styles.body}>
                  {filter === 'active'
                    ? 'פעיל'
                    : filter === 'archived'
                      ? 'בארכיון'
                      : 'טיוטה / לא פעיל'}
                </Text>
              </Pressable>
              {filter === 'archived' && capabilities?.edit_campaigns ? (
                <PwaButton
                  label="שחזור כטיוטה"
                  variant="secondary"
                  loading={busy === String(campaign.campaignId)}
                  disabled={busy !== null}
                  onPress={() => void restoreCampaign(campaign.campaignId)}
                />
              ) : null}
            </View>
          ))}
          {visibleRows.length === 0 &&
          !(hasReferral && referralLifecycle === filter) ? (
            <PwaEmptyState
              title="אין קמפיינים בתצוגה הזו"
              body="אפשר לבחור תצוגה אחרת או ליצור קמפיין חדש."
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 16 },
  title: {
    ...rtlBaseText,
    ...T.typography.pageTitle,
    color: T.colors.textPrimary,
  },
  body: { ...rtlBaseText, ...T.typography.body, color: T.colors.textSecondary },
  cardTitle: {
    ...rtlBaseText,
    ...T.typography.sectionTitle,
    color: T.colors.textPrimary,
  },
  actions: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 8 },
  tabs: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    backgroundColor: T.colors.elevatedSurface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flexGrow: 1,
    minHeight: 44,
    padding: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  tabSelected: { backgroundColor: T.colors.primarySubtle },
  tabText: {
    ...rtlBaseText,
    ...T.typography.label,
    textAlign: 'center',
    color: T.colors.textSecondary,
  },
  tabTextSelected: { color: T.colors.primary },
  list: { gap: 12 },
  card: {
    backgroundColor: T.colors.elevatedSurface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  activeCard: { borderColor: T.colors.success },
  live: { ...rtlBaseText, ...T.typography.label, color: T.colors.success },
  error: { ...rtlBaseText, ...T.typography.body, color: T.colors.danger },
});
