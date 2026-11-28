import { useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { Component, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { BusinessWebDialog } from '@/components/business-web/BusinessWebDialog';
import { LoyaltyCardClassic } from '@/components/loyalty/LoyaltyCardClassic';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { AppText as Text } from '@/components/ui/AppText';
import { normalizeStampShape } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { webCustomerStateLabel } from '@/lib/customers/webCustomerGuidance';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { rtlBaseText } from '@/lib/rtl';

type Props = {
  businessId: Id<'businesses'>;
  customerUserId: Id<'users'>;
  onClose: () => void;
};

export function BusinessWebCustomerDetails(props: Props) {
  return (
    <Modal transparent={true} visible={true} onRequestClose={props.onClose}>
      <View style={styles.modal}>
        <BusinessWebDialog
          title="כרטיס לקוח"
          visible={true}
          onDismiss={props.onClose}
          maxWidth={680}
        >
          <DetailsErrorBoundary>
            <CustomerDetailsContent {...props} />
          </DetailsErrorBoundary>
        </BusinessWebDialog>
      </View>
    </Modal>
  );
}

function CustomerDetailsContent({
  businessId,
  customerUserId,
  onClose,
}: Props) {
  const router = useRouter();
  const card = useQuery(api.customerCards.getBusinessCustomerCard, {
    businessId,
    customerUserId,
    limit: 30,
  });
  const { activeBusiness } = useActiveBusiness();
  const business =
    String(activeBusiness?.businessId) === String(businessId)
      ? activeBusiness
      : null;
  const canAccessCampaigns = business?.capabilities?.access_campaigns === true;
  const campaigns = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
    canAccessCampaigns && card?.summary.customerState === 'NEEDS_WINBACK'
      ? { businessId, deferLargeStats: true }
      : 'skip'
  );
  if (card === undefined) {
    return (
      <Text style={styles.body} role="status">
        טוענים את כרטיס הלקוח…
      </Text>
    );
  }
  if (card === null) {
    return (
      <Text style={styles.body} role="status">
        לא נמצאה כרטיסייה פעילה של הלקוח בעסק הזה.
      </Text>
    );
  }
  const existingWinback = (campaigns ?? []).filter(
    (campaign) => campaign.type === 'winback' && campaign.lifecycle !== 'archived'
  );
  const directCampaign =
    existingWinback.length === 1 && business?.capabilities?.edit_campaigns
      ? existingWinback[0]
      : null;
  const canOpenWinback =
    canAccessCampaigns &&
    (directCampaign || business?.capabilities?.create_campaigns === true);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          {card.customer.name}
        </Text>
        <Text style={styles.body}>
          ביקור אחרון:{' '}
          {new Date(card.summary.lastVisitAt).toLocaleDateString('he-IL')} ·{' '}
          {card.summary.visitCount} ביקורים
        </Text>
      </View>
      <View style={styles.guidance}>
        <Text style={styles.title}>
          {webCustomerStateLabel(card.summary.customerState)}
        </Text>
        {card.summary.customerState === 'NEEDS_WINBACK' &&
        canOpenWinback ? (
          <PwaButton
            label={directCampaign ? 'פתיחת קמפיין החזרה' : 'קמפיין החזרת לקוחות'}
            disabled={campaigns === undefined}
            onPress={() => {
              onClose();
              router.push({
                pathname: '/business/campaign/[campaignId]',
                params: {
                  campaignId: directCampaign
                    ? String(directCampaign.campaignId)
                    : 'new',
                  ...(directCampaign ? {} : { template: 'winback' }),
                  businessId: String(businessId),
                },
              } as Href);
            }}
          />
        ) : null}
        {card.summary.customerState === 'NEEDS_WINBACK' &&
        canOpenWinback ? (
          <Text style={styles.caption}>
            קמפיין לקבוצת לקוחות · שליחה רק לאחר אישור
          </Text>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          כרטיסיות הלקוח
        </Text>
        {card.programs.map((program) => (
          <View key={String(program.membershipId)} style={styles.program}>
            {program.targetIsValid ? (
              <LoyaltyCardClassic
                businessName={business?.name ?? 'העסק'}
                businessLogoUrl={business?.logoUrl ?? null}
                cardThemeId={program.cardThemeId}
                lifecycle={program.programLifecycle}
                programTitle={program.programTitle}
                rewardName={program.rewardName}
                maxStamps={program.maxStamps}
                progress={{
                  kind: 'actual',
                  currentStamps: program.currentStamps,
                }}
                stampShape={normalizeStampShape(program.stampShape)}
                stampIcon={program.stampIcon}
                variant="wallet"
              />
            ) : (
              <Text style={styles.title}>{program.programTitle}</Text>
            )}
            <Text style={styles.body}>
              {program.targetIsValid
                ? `${program.currentStamps} מתוך ${program.maxStamps} חותמות`
                : 'יעד הכרטיסייה אינו זמין'}
              {program.canRedeem ? ' · זכאי להטבה' : ''}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          פעילות אחרונה
        </Text>
        <Text style={styles.caption}>
          עד 30 פעולות אחרונות. הצפייה אינה משנה חותמות או מימושים.
        </Text>
        {card.timeline.map((item) => (
          <View key={item.id} style={styles.event}>
            <Text style={styles.body}>
              {item.detail}
              {item.isReversed ? ' · בוטל' : ''}
            </Text>
            <Text style={styles.caption}>
              {item.programTitle} ·{' '}
              {new Date(item.createdAt).toLocaleString('he-IL')}
            </Text>
          </View>
        ))}
        {card.timeline.length === 0 ? (
          <Text style={styles.body}>עדיין אין פעילות להצגה.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

class DetailsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <View style={styles.section}>
        <Text role="alert" style={styles.body}>
          לא הצלחנו לטעון את פרטי הלקוח. בדקו חיבור והרשאה לעסק ונסו שוב.
        </Text>
        <PwaButton
          label="לנסות שוב"
          variant="secondary"
          onPress={() => this.setState({ failed: false })}
        />
      </View>
    ) : (
      this.props.children
    );
  }
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  scroll: { flexShrink: 1 },
  content: { gap: TOKENS.space.md },
  section: { gap: TOKENS.space.sm },
  title: {
    ...rtlBaseText,
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
  },
  body: {
    ...rtlBaseText,
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
  },
  caption: {
    ...rtlBaseText,
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
  },
  guidance: {
    gap: TOKENS.space.sm,
    padding: TOKENS.space.sm,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  program: { gap: TOKENS.space.sm },
  event: {
    gap: TOKENS.space.xs,
    paddingVertical: TOKENS.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
});
