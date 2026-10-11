import { useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { PwaEmptyState } from '@/components/pwa-ui/PwaEmptyState';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, ltrIslandText, rtlBaseText, selfStart } from '@/lib/rtl';

const LIFECYCLE_LABEL: Record<string, string> = {
  active: 'פעיל',
  draft: 'טיוטה',
  archived: 'בארכיון',
  inactive: 'טיוטה',
};

type ClubSegment = 'cards' | 'campaigns' | 'friends';

export function BusinessWebLoyalty({
  activeBusinessId,
}: {
  activeBusinessId: Id<'businesses'>;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { activeBusiness } = useActiveBusiness();
  const canEdit = activeBusiness?.capabilities?.edit_loyalty_cards === true;
  const [segment, setSegment] = useState<ClubSegment>('cards');
  const data = useQuery(api.loyaltyPrograms.listManagementByBusiness, {
    businessId: activeBusinessId,
  });
  const campaigns = useQuery(api.campaigns.listManagementCampaignsByBusiness, {
    businessId: activeBusinessId,
  });
  const programs = data ?? [];
  const activePrograms = programs.filter(
    (program) => program.lifecycle === 'active'
  );
  const totalMembers = programs.reduce(
    (sum, program) => sum + Number(program.metrics?.activeMembers ?? 0),
    0
  );

  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" aria-level={1} style={styles.pageTitle}>
        מועדון
      </Text>
      <View style={styles.segment}>
        {(
          [
            ['cards', 'כרטיסיות'],
            ['campaigns', 'קמפיינים'],
            ['friends', 'חברים'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === key }}
            key={key}
            onPress={() => setSegment(key)}
            style={[
              styles.segmentButton,
              segment === key ? styles.segmentOn : null,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                segment === key ? styles.segmentLabelOn : null,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {segment === 'cards' ? (
        <View style={styles.stack}>
          <View
            style={[styles.summaryRow, wide ? styles.summaryRowWide : null]}
          >
            <Summary label="פעילות" value={activePrograms.length} />
            <Summary label="חברים" value={totalMembers} />
            <Summary label="כל הכרטיסיות" value={programs.length} />
          </View>
          {canEdit ? (
            <PwaButton
              fullWidth={!wide}
              label="כרטיסייה חדשה"
              onPress={() => router.push('/business/cards/new' as Href)}
            />
          ) : null}
          {data === undefined ? (
            <Text style={styles.loading}>טוענים כרטיסיות</Text>
          ) : programs.length === 0 ? (
            <PwaEmptyState
              action={
                canEdit ? (
                  <PwaButton
                    label="כרטיסייה חדשה"
                    onPress={() => router.push('/business/cards/new' as Href)}
                  />
                ) : null
              }
              body="כרטיסייה אחת מספיקה כדי להתחיל לסרוק."
              title="עדיין אין כרטיסיות"
            />
          ) : (
            <View style={[styles.cards, wide ? styles.cardsWide : null]}>
              {programs.map((program) => (
                <View
                  key={String(program.loyaltyProgramId)}
                  style={styles.programCard}
                >
                  <View style={styles.programTop}>
                    <View style={styles.programCopy}>
                      <Text style={styles.programTitle}>{program.title}</Text>
                      <Text style={styles.rewardName}>
                        {program.rewardName}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.lifecycle,
                        program.lifecycle === 'active'
                          ? styles.lifecycleLive
                          : null,
                        program.lifecycle === 'draft'
                          ? styles.lifecycleDraft
                          : null,
                        program.lifecycle === 'archived'
                          ? styles.lifecycleArchived
                          : null,
                      ]}
                    >
                      {LIFECYCLE_LABEL[program.lifecycle] ?? program.lifecycle}
                    </Text>
                  </View>
                  <Text style={styles.count}>
                    <Text style={styles.num}>
                      {program.metrics.activeMembers}
                    </Text>
                    {' חברים · '}
                    <Text style={styles.num}>{program.metrics.stamps7d}</Text>
                    {' חותמות ב־7 ימים'}
                  </Text>
                  {canEdit ? (
                    <PwaButton
                      fullWidth={true}
                      label="ניהול הכרטיסייה"
                      onPress={() =>
                        router.push({
                          pathname: '/business/cards/[programId]' as Href,
                          params: {
                            programId: String(program.loyaltyProgramId),
                            businessId: String(activeBusinessId),
                          },
                        } as Href)
                      }
                      variant="secondary"
                    />
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {segment === 'campaigns' ? (
        <View style={styles.stack}>
          <PwaButton
            fullWidth={!wide}
            label="קמפיין חדש"
            onPress={() => router.push('/business/campaign/new' as Href)}
          />
          {campaigns === undefined ? (
            <Text style={styles.loading}>טוענים קמפיינים</Text>
          ) : campaigns.length === 0 ? (
            <PwaEmptyState
              body="אפשר להתחיל מברכה, יום הולדת או מבצע."
              title="עדיין אין קמפיינים"
            />
          ) : (
            campaigns.map((campaign) => (
              <Pressable
                accessibilityRole="button"
                key={String(campaign.campaignId)}
                onPress={() =>
                  router.push({
                    pathname: '/business/campaign/[campaignId]' as Href,
                    params: { campaignId: String(campaign.campaignId) },
                  } as Href)
                }
                style={styles.row}
              >
                <View style={styles.programCopy}>
                  <Text style={styles.programTitle}>
                    {campaign.messageTitle || campaign.type}
                  </Text>
                  <Text style={styles.rewardName}>{campaign.type}</Text>
                </View>
                <Text
                  style={[
                    styles.lifecycle,
                    campaign.lifecycle === 'active'
                      ? styles.lifecycleLive
                      : null,
                  ]}
                >
                  {LIFECYCLE_LABEL[campaign.lifecycle] ?? campaign.lifecycle}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {segment === 'friends' ? (
        <PwaEmptyState
          action={
            <PwaButton
              label="הגדרת הטבת חברים"
              onPress={() => router.push('/business/referrals' as Href)}
              variant="secondary"
            />
          }
          body="זו הגדרה נפרדת מקמפיין. ההטבה נרשמת אחרי החותמת הראשונה של החבר."
          title="הטבת חברים"
        />
      ) : null}
    </View>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 16 },
  pageTitle: {
    ...TOKENS.typography.pageTitle,
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
  },
  segment: {
    flexDirection: flexDirection.row,
    gap: 4,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.elevatedSurface,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: TOKENS.colors.primarySubtle },
  segmentLabel: {
    color: TOKENS.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  segmentLabelOn: { color: TOKENS.colors.primary, fontWeight: '600' },
  stack: { gap: 12 },
  summaryRow: { flexDirection: flexDirection.row, gap: 8 },
  summaryRowWide: { maxWidth: 640 },
  summary: {
    flex: 1,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  summaryLabel: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
  },
  summaryValue: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  loading: { ...rtlBaseText, color: TOKENS.colors.textSecondary },
  cards: { gap: 12 },
  cardsWide: { flexDirection: flexDirection.row, flexWrap: 'wrap' },
  programCard: {
    flexGrow: 1,
    flexBasis: 280,
    gap: 12,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: 16,
  },
  programTop: {
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    gap: 12,
  },
  programCopy: { flex: 1, gap: 2 },
  programTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  rewardName: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 14,
  },
  count: { ...rtlBaseText, color: TOKENS.colors.textSecondary, fontSize: 13 },
  num: ltrIslandText,
  lifecycle: {
    alignSelf: selfStart,
    borderRadius: 999,
    backgroundColor: TOKENS.colors.subtleSurface,
    color: TOKENS.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lifecycleLive: {
    backgroundColor: TOKENS.colors.successSubtle,
    color: TOKENS.colors.success,
  },
  lifecycleDraft: {
    backgroundColor: TOKENS.colors.warningSubtle,
    color: TOKENS.colors.warning,
  },
  lifecycleArchived: {
    backgroundColor: TOKENS.colors.subtleSurface,
    color: TOKENS.colors.textMuted,
  },
  row: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
});
